import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from io import StringIO
from unittest.mock import patch
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .common import emit
from .runtime import ak, math, pd, requests


EASTMONEY = "https://data.eastmoney.com/cjsj/"
MOFCOM_ROOT = "https://data.mofcom.gov.cn"
MOFCOM = MOFCOM_ROOT + "/gnmy/shrzgm.shtml"
SAFE = "https://www.safe.gov.cn/safe/rmbhlzjj/index.html"
NBS = "https://www.stats.gov.cn/sj/zxfb/"
PBC = "https://www.pbc.gov.cn/diaochatongjisi/116219/"
CHINABOND = "https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/more?locale=cn_zh"
LIAONING_PMI_ARCHIVE = {
    "2025-12": "2025123117051252884",
    "2025-01": "2025020509460442589",
    "2023-12": "2024010208584839385",
    "2022-12": "2023010308263270772",
    "2021-12": "C16049C3A5AB40469E4DF4CAE720560E",
}

# The identifier, source, unit and frequency are also exposed by the API.
MONTHLY = {
    "pmi": ("macro_china_pmi", "制造业-指数", "pmi.html"),
    "cpi": ("macro_china_cpi", "全国-同比增长", "cpi.html"),
    "ppi": ("macro_china_ppi", "当月同比增长", "ppi.html"),
    "retail": ("macro_china_consumer_goods_retail", "同比增长", "xfp.html"),
}
MACRO_IDS = (*MONTHLY, "pmi-orders", "credit", "credit-stock-yoy", "cn10y", "us10y", "usdcny")


def fetch_html(url):
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.content


def month_period(value):
    match = re.fullmatch(r"(\d{4})(?:年|[-./])?(\d{1,2})(?:月份?)?", re.sub(r"\s+", "", str(value)))
    if not match:
        return None
    try:
        return date(int(match[1]), int(match[2]), 1).isoformat()[:7]
    except ValueError:
        return None


def observation(period, value, source, url, *, period_label=None, released_on=None):
    value = pd.to_numeric(value, errors="coerce")
    if not period or pd.isna(value) or not math.isfinite(value):
        return None
    return {
        "period": period,
        "periodLabel": period_label,
        "value": float(value),
        "source": source,
        "sourceUrl": url,
        "releasedOn": released_on,
    }


def monthly_observations(indicator):
    fetch, column, page = MONTHLY[indicator]
    frame = getattr(ak, fetch)()
    points = []
    for row in frame.to_dict("records"):
        period = month_period(row["月份"])
        value = row[column]
        label = None
        if indicator == "retail" and period and period.endswith("-02") and pd.isna(value):
            value = row["累计-同比增长"]
            label = f"{period[:4]} 年 1–2 月"
        point = observation(period, value, "东方财富 · AKShare", EASTMONEY + page, period_label=label)
        if point:
            points.append(point)
    return points


def daily_observations(indicator, start_date):
    if indicator == "usdcny":
        frame = ak.currency_boc_safe()
        column, source, url, divisor = "美元", "国家外汇管理局 · AKShare", SAFE, 100
    else:
        # Request overlaps on later runs so the provider can correct recent observations.
        frame = ak.bond_zh_us_rate(start_date=start_date.replace("-", "") if start_date else "19901219")
        column = "中国国债收益率10年" if indicator == "cn10y" else "美国国债收益率10年"
        source, url, divisor = "东方财富 · AKShare", EASTMONEY + "zmgzsyl.html", 1
    points = []
    for raw_date, value in frame[["日期", column]].itertuples(index=False, name=None):
        if pd.isna(raw_date) or pd.isna(value) or (indicator == "usdcny" and value <= 0):
            continue
        day = raw_date.isoformat()[:10]
        point = observation(day, value / divisor, source, url, released_on=day if indicator == "usdcny" else None)
        if point:
            points.append(point)
    return points


def china_yield_observations(start_date):
    end = date.today()
    start = max(date.fromisoformat(start_date), end - timedelta(days=364)) if start_date else end - timedelta(days=45)
    official = {}
    try:
        frame = ak.bond_china_yield(start_date=start.strftime("%Y%m%d"), end_date=end.strftime("%Y%m%d"))
        frame = frame.loc[frame["曲线名称"] == "中债国债收益率曲线", ["日期", "10年"]]
        for day, value in frame.itertuples(index=False, name=None):
            if pd.isna(day):
                continue
            stamp = day.isoformat()
            point = observation(stamp, value, "中债估值中心 · AKShare", CHINABOND, released_on=stamp)
            if point:
                official[stamp] = point
    except Exception as exc:
        print(f"ChinaBond yield curve unavailable: {type(exc).__name__}", file=sys.stderr)

    # Eastmoney backfills longer history and can bridge a stale or unavailable official feed.
    try:
        history = {point["period"]: point for point in daily_observations("cn10y", start_date)}
    except Exception:
        if not start_date or not official:
            raise
        history = {}
    history.update(official)
    return list(history.values())


def stock_growth_rows(frame):
    # Recent workbooks put months in columns and pair each balance with its published growth rate.
    for index, row in enumerate(frame.itertuples(index=False, name=None)):
        if "AFRE(stock)" not in str(row[0]):
            continue
        header = next(
            (i for i in range(index - 1, -1, -1) if any("增速" in str(cell) for cell in frame.iloc[i])),
            None,
        )
        if header is not None and header > 0:
            yield from (
                (frame.iat[header - 1, position], row[position])
                for position, cell in enumerate(frame.iloc[header]) if "增速" in str(cell)
            )
    # Some archived sheets put months in rows and the growth rate next to the AFRE stock column.
    for index in range(min(len(frame), 15)):
        cells = frame.iloc[index].tolist()
        for column, cell in enumerate(cells[:-1]):
            if "AFRE(stock)" not in str(cell):
                continue
            header = next(
                (i for i in range(max(0, index - 2), min(len(frame), index + 4))
                 if "增速" in str(frame.iat[i, column + 1])),
                None,
            )
            if header is not None:
                yield from frame.iloc[header + 1:, [0, column + 1]].itertuples(index=False, name=None)
                return


def pbc_credit_table(year, page, stock=False):
    soup = BeautifulSoup(fetch_html(page), "html.parser")
    title = "社会融资规模存量统计表" if stock else "社会融资规模增量统计表"
    table_link = next(
        a for a in soup.select("a[href$='.htm']")
        if title in a.parent.parent.get_text(" ", strip=True)
    )
    url = urljoin(page, table_link["href"])
    tables = pd.read_html(StringIO(fetch_html(url).decode("gb18030", errors="replace")))
    points = []
    for frame in tables:
        if frame.shape[1] < 2:
            continue
        if stock:
            rows = stock_growth_rows(frame)
        elif "AFRE(flow)" in frame.iloc[:10, 1].to_string(index=False):
            rows = frame.iloc[:, :2].itertuples(index=False, name=None)
        else:
            continue
        for raw_month, value in rows:
            period = month_period(raw_month)
            if period and period.startswith(f"{year}-"):
                point = observation(period, value, f"中国人民银行 · {title}", url)
                if point:
                    points.append(point)
    if not points:
        raise ValueError(f"No PBC credit observations for {year}")
    return points


def credit_observations():
    points = {}
    try:
        frame = ak.macro_china_shrzgm()
        for raw_month, value in frame[["月份", "社会融资规模增量"]].itertuples(index=False, name=None):
            point = observation(month_period(raw_month), value, "商务部数据中心 · AKShare", MOFCOM)
            if point:
                points[point["period"]] = point
    except Exception as exc:
        print(f"AKShare credit source unavailable: {type(exc).__name__}", file=sys.stderr)

    since = date.today().year - (1 if points else 5)
    for point in pbc_credit_observations(since, stock=False):
        points.setdefault(point["period"], point)
    return list(points.values())


def pbc_credit_observations(since, stock):
    points = {}
    try:
        index = PBC + "116319/index.html"
        soup = BeautifulSoup(fetch_html(index), "html.parser")
        pages = {}
        for link in soup.select("a[href]"):
            href = link["href"]
            if link.get_text(strip=True) == "社会融资规模" and href.startswith("/diaochatongjisi/116219/116319/"):
                pages[href.split("/")[4]] = urljoin(index, href)
        jobs = []
        for link in soup.select("a[href]"):
            match = re.fullmatch(r"(\d{4})年统计数据", link.get_text(strip=True))
            href = link["href"]
            if match and int(match[1]) >= since and href.rstrip("/").endswith("/index.html"):
                page = pages.get(href.split("/")[-2])
                if page and (int(match[1]), page) not in jobs:
                    jobs.append((int(match[1]), page))
        with ThreadPoolExecutor(max_workers=3) as pool:
            pending = [(year, pool.submit(pbc_credit_table, year, page, stock)) for year, page in jobs]
            for year, task in pending:
                try:
                    for point in task.result():
                        points.setdefault(point["period"], point)
                except Exception as exc:
                    print(f"PBC credit table for {year} unavailable: {type(exc).__name__}", file=sys.stderr)
    except Exception as exc:
        print(f"PBC credit index unavailable: {type(exc).__name__}", file=sys.stderr)
    return list(points.values())


def nbs_releases(page):
    releases = []
    soup = BeautifulSoup(fetch_html(page), "html.parser")
    titles = {
        "pmi": r"月(?:份)?中国采购经理指数运行情况",
        "cpi": r"月(?:份)?(?:全国)?居民消费价格(?:同比|环比)",
        "ppi": r"月(?:份)?(?:全国)?工业生产者出厂价格(?:同比|环比)",
        "retail": r"月(?:份)?社会消费品零售总额",
    }
    for item in soup.select("li"):
        stamp = item.find("span", recursive=False)
        if not stamp or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", stamp.get_text(strip=True)):
            continue
        for link in item.find_all("a", href=True, recursive=False):
            title = link.get("title") or link.get_text(strip=True)
            for indicator, suffix in titles.items():
                match = re.match(r"^(\d{4})年(?:1[—－–-])?(\d{1,2})" + suffix, title)
                if match:
                    period = month_period(f"{match[1]}-{match[2]}")
                    if period:
                        releases.append({
                            "id": indicator, "period": period, "releasedOn": stamp.get_text(strip=True),
                            "releaseUrl": urljoin(page, link["href"]),
                        })
                    break
    return releases


def manufacturing_orders_table(url):
    soup = BeautifulSoup(fetch_html(url), "html.parser")
    for table in soup.select("table"):
        if table.find("table") or "新订单" not in table.get_text(strip=True):
            continue
        frames = pd.read_html(StringIO(str(table)))
        if not frames:
            continue
        frame = frames[0]
        for index in range(min(6, len(frame))):
            cells = [re.sub(r"\s+", "", str(cell)) for cell in frame.iloc[index]]
            if "新订单" in cells and "生产" in cells:
                return list(frame.iloc[index + 1:, [0, cells.index("新订单")]].itertuples(index=False, name=None))
    raise ValueError("Manufacturing PMI new orders table was not found")


def mofcom_pmi_bulletins(page):
    try:
        response = requests.post(MOFCOM_ROOT + "/datamofcom/front/swsj/list",
                                 data={"cid": "zxtj", "pageNumber": page, "pageSize": 15}, timeout=10)
        response.raise_for_status()
        rows = response.json()["pageInfo"]["rows"]
        return {
            month_period(match[1]): MOFCOM_ROOT + "/article" + row["url"]
            for row in rows
            if (match := re.match(r"^(\d{4}年\d{1,2}月)中国采购经理指数运行情况", row["title"]))
            and row["url"].startswith("/zxtj/")
        }
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return {}


def pmi_order_observations(incremental):
    def read_index(index):
        page = NBS if index == 0 else f"{NBS}index_{index}.html"
        try:
            return [item for item in nbs_releases(page) if item["id"] == "pmi"]
        except requests.RequestException:
            return []

    points = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        releases = {}
        recent_pages = list(pool.map(read_index, range(4)))
        older_pages = pool.map(read_index, range(8, 66, 8)) if not incremental and any(recent_pages) else []
        for results in (*recent_pages, *older_pages):
            for item in results:
                releases.setdefault(item["period"], item)

        periods = sorted(releases, reverse=True)
        anchors = periods[:1] if incremental else periods
        read_pmi_orders(pool, {period: releases[period]["releaseUrl"] for period in anchors},
                        "国家统计局 · 制造业 PMI 公告", releases, points)

        previous_month = (date.today().replace(day=1) - timedelta(days=1)).isoformat()[:7]
        if max(points, default="") < previous_month:
            copies = {}
            for records in pool.map(mofcom_pmi_bulletins, range(1, 4)):
                copies.update(records)
            read_pmi_orders(pool, copies, "商务部数据中心 · 转载国家统计局", releases, points)
        if not incremental and len(points) < 70:
            # Archived republications keep the original rolling tables intact.
            archives = {
                period: f"https://gxt.ln.gov.cn/gxt/zhzx/xyxx/{article}/index.shtml"
                for period, article in LIAONING_PMI_ARCHIVE.items()
            }
            read_pmi_orders(pool, archives, "辽宁省工信厅 · 转载国家统计局", releases, points)
    return list(points.values())


def read_pmi_orders(pool, bulletins, source, releases, points):
    pending = [(period, pool.submit(manufacturing_orders_table, url))
               for period, url in sorted(bulletins.items(), reverse=True)]
    for anchor, task in pending:
        try:
            for raw_month, value in task.result():
                period = month_period(raw_month)
                stamp = releases.get(period, {})
                point = observation(period, value, source, bulletins[anchor], released_on=stamp.get("releasedOn"))
                if point:
                    if stamp:
                        point["releaseUrl"] = stamp["releaseUrl"]
                    points.setdefault(period, point)
        except Exception as exc:
            print(f"PMI bulletin for {anchor} unavailable: {type(exc).__name__}", file=sys.stderr)


def pbc_releases():
    page = PBC + "116225/index.html"
    soup = BeautifulSoup(fetch_html(page), "html.parser")
    releases = []
    month_for_title = {"一季度": 3, "上半年": 6, "前三季度": 9, "": 12}
    for link in soup.select("a[istitle][href]"):
        title = link.get("title") or link.get_text(strip=True)
        match = re.fullmatch(r"(\d{4})年(?:(\d{1,2})月份?|([一上前][^ ]+?))?金融统计数据报告", title)
        stamp = link.parent.find_next_sibling("span", class_="hui12")
        if not match or not stamp or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", stamp.get_text(strip=True)):
            continue
        month = int(match[2]) if match[2] else month_for_title.get(match[3] or "")
        period = month_period(f"{match[1]}-{month}")
        if period:
            releases.append({
                "id": "credit", "period": period, "releasedOn": stamp.get_text(strip=True),
                "releaseUrl": urljoin(page, link["href"]),
            })
    # Some earlier financial reports were published separately from the credit release.
    with ThreadPoolExecutor(max_workers=4) as pool:
        return [
            {**release, "id": indicator}
            for release, indicators in zip(releases, pool.map(credit_release_indicators, releases))
            for indicator in indicators
        ]


def credit_release_indicators(release):
    try:
        text = BeautifulSoup(fetch_html(release["releaseUrl"]), "html.parser").get_text(" ", strip=True)
    except requests.RequestException:
        return []
    indicators = []
    if "社会融资规模增量" in text:
        indicators.append("credit")
    if re.search(r"社会融资规模存量\s*(?:为|同比)", text):
        indicators.append("credit-stock-yoy")
    return indicators


def handle_macro(args):
    # AKShare calls in this worker may omit a request timeout.
    original = requests.sessions.Session.request

    def bounded_request(session, *positional, **kwargs):
        if kwargs.get("timeout") is None:
            kwargs["timeout"] = (5, 10)
        return original(session, *positional, **kwargs)

    with patch.object(requests.sessions.Session, "request", bounded_request):
        fetch_macro(args)


def fetch_macro(args):
    if args.indicator == "releases":
        pages = [NBS] + [f"{NBS}index_{index}.html" for index in range(1, args.release_pages)]
        releases = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            tasks = [pool.submit(nbs_releases, page) for page in pages]
            tasks.append(pool.submit(pbc_releases))
            for task in tasks:
                try:
                    releases.extend(task.result())
                except Exception as exc:
                    print(f"Macro release listing unavailable: {type(exc).__name__}", file=sys.stderr)
        if not releases:
            raise ValueError("No verified macro publication dates returned")
        emit(releases)
        return
    if args.indicator in MONTHLY:
        points = monthly_observations(args.indicator)
    elif args.indicator == "pmi-orders":
        points = pmi_order_observations(bool(args.start_date))
    elif args.indicator == "credit":
        points = credit_observations()
    elif args.indicator == "credit-stock-yoy":
        points = pbc_credit_observations(date.today().year - (1 if args.start_date else 5), stock=True)
    elif args.indicator == "cn10y":
        points = china_yield_observations(args.start_date)
    else:
        points = daily_observations(args.indicator, args.start_date)
    if not points:
        raise ValueError(f"No valid observations for {args.indicator}")
    emit(points)
