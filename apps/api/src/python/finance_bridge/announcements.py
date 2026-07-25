from .runtime import *  # noqa: F401,F403
from .common import emit, normalize_a_symbol, normalize_hk_symbol


def announcement_category(title: str) -> str:
    normalized = re.sub(r"\s+", "", title)
    if re.search(r"年度报告|年报", normalized) and "说明会" not in normalized:
        return "年报"
    if re.search(r"业绩预告|业绩快报|业绩修正", normalized):
        return "业绩预告"
    if re.search(r"权益分派|利润分配|分红|派息|派发", normalized):
        return "权益分派"
    if "董事会" in normalized:
        return "董事会"
    if re.search(r"风险提示|风险警示|可能被|退市风险", normalized):
        return "风险提示"
    return "其他"


def handle_announcements(args: argparse.Namespace) -> None:
    market = args.market
    if market == "a":
        _, display_symbol = normalize_a_symbol(args.symbol)
        symbol = re.sub(r"\D", "", args.symbol)
        cninfo_market = "沪深京"
    else:
        symbol, display_symbol = normalize_hk_symbol(args.symbol)
        cninfo_market = "港股"

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=max(7, min(args.days, 180)))
    try:
        df = ak.stock_zh_a_disclosure_report_cninfo(
            symbol=symbol,
            market=cninfo_market,
            keyword="",
            category="",
            start_date=start_date.strftime("%Y%m%d"),
            end_date=end_date.strftime("%Y%m%d"),
        )
    except KeyError as exc:
        if "公告标题" in str(exc):
            df = pd.DataFrame(columns=["代码", "简称", "公告标题", "公告时间", "公告链接"])
        else:
            raise

    items = []
    company_name = display_symbol
    if df is not None and not df.empty:
        for _, row in df.iterrows():
            title = str(row.get("公告标题", "")).strip()
            url = str(row.get("公告链接", "")).strip()
            published_at = str(row.get("公告时间", "")).strip()
            row_name = str(row.get("简称", "")).strip()
            if row_name and row_name.lower() != "nan":
                company_name = row_name
            if not title or not url or not published_at:
                continue
            announcement_match = re.search(r"announcementId=([^&]+)", url)
            key = announcement_match.group(1) if announcement_match else f"{published_at}:{title}"
            items.append(
                {
                    "key": key,
                    "market": market,
                    "symbol": symbol,
                    "displaySymbol": display_symbol,
                    "companyName": company_name,
                    "title": title,
                    "category": announcement_category(title),
                    "publishedAt": published_at,
                    "url": url,
                    "source": "AKShare CNInfo disclosure API",
                }
            )

    emit(
        {
            "company": {
                "market": market,
                "symbol": symbol,
                "displaySymbol": display_symbol,
                "name": company_name,
            },
            "items": items,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": "AKShare CNInfo disclosure API",
        }
    )
