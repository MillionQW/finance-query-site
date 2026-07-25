from .runtime import *  # noqa: F401,F403
from .common import emit, numeric_or_none


INDEX_CATALOG = [
    ("cn", "000001", "000001.SH", "上证指数", "核心宽基"),
    ("cn", "000300", "000300.CSI", "沪深300", "核心宽基"),
    ("cn", "000905", "000905.CSI", "中证500", "核心宽基"),
    ("cn", "000852", "000852.CSI", "中证1000", "核心宽基"),
    ("cn", "000510", "000510.CSI", "中证A500", "核心宽基"),
    ("cn", "399001", "399001.SZ", "深证成指", "成长与科技"),
    ("cn", "399006", "399006.SZ", "创业板指", "成长与科技"),
    ("cn", "000688", "000688.SH", "科创50", "成长与科技"),
    ("bj", "899050", "899050.BJ", "北证50", "北交所"),
    ("hk", "HSI", "HSI.HK", "恒生指数", "港股"),
    ("hk", "HSTECH", "HSTECH.HK", "恒生科技指数", "港股"),
    ("hk", "HSCEI", "HSCEI.HK", "恒生中国企业指数", "港股"),
]


def handle_index_market(_: argparse.Namespace) -> None:
    frames = []
    for group in ["沪深重要指数", "上证系列指数", "深证系列指数", "中证系列指数"]:
        try:
            frames.append(ak.stock_zh_index_spot_em(symbol=group))
        except Exception:
            pass
    cn_frame = pd.concat(frames, ignore_index=True).drop_duplicates(subset=["代码", "名称"]) if frames else pd.DataFrame()
    try:
        sina_cn = ak.stock_zh_index_spot_sina()
        cn_frame = pd.concat([cn_frame, sina_cn], ignore_index=True).drop_duplicates(subset=["代码", "名称"])
    except Exception:
        pass
    try:
        hk_frame = ak.stock_hk_index_spot_em()
    except Exception:
        hk_frame = ak.stock_hk_index_spot_sina()
    quotes = []
    for market, symbol, display_symbol, name, category in INDEX_CATALOG:
        frame = hk_frame if market == "hk" else cn_frame
        if frame.empty:
            continue
        code_col = "代码"
        normalized_codes = frame[code_col].astype(str).str.strip().str.upper().str.replace(r"^(SH|SZ|BJ)", "", regex=True)
        exact = frame[normalized_codes == symbol]
        if exact.empty:
            exact = frame[frame["名称"].astype(str).str.strip() == name]
        if exact.empty:
            continue
        row = exact.iloc[0]
        quotes.append({
            "market": market, "symbol": symbol, "key": f"{market}:{symbol}",
            "displaySymbol": display_symbol, "name": name, "category": category,
            "latestPrice": numeric_or_none(row.get("最新价")),
            "changeAmount": numeric_or_none(row.get("涨跌额")),
            "changePercent": numeric_or_none(row.get("涨跌幅")),
            "volume": numeric_or_none(row.get("成交量")), "amount": numeric_or_none(row.get("成交额")),
            "open": numeric_or_none(row.get("今开", row.get("开盘价"))),
            "high": numeric_or_none(row.get("最高", row.get("最高价"))),
            "low": numeric_or_none(row.get("最低", row.get("最低价"))),
            "previousClose": numeric_or_none(row.get("昨收")),
            "quoteUpdatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "AKShare stock_hk_index_spot_em" if market == "hk" else "AKShare stock_zh_index_spot_em",
        })
    emit(quotes)


def handle_index_history(args: argparse.Namespace) -> None:
    years = max(1, min(int(args.years), 20))
    today = datetime.now()
    start_date = f"{today.year - years}{today.strftime('%m%d')}"
    end_date = today.strftime("%Y%m%d")
    fallback_symbol = f"hk{args.symbol}" if args.market == "hk" else (
        f"sh{args.symbol}" if args.provider_symbol.startswith("csi") else args.provider_symbol
    )
    attempts = []
    if args.market == "hk":
        attempts = [
            ("AKShare stock_hk_index_daily_em", lambda: ak.stock_hk_index_daily_em(symbol=args.provider_symbol), False),
            ("AKShare stock_zh_index_daily_tx Tencent fallback", lambda: ak.stock_zh_index_daily_tx(symbol=fallback_symbol, start_date=start_date, end_date=end_date), False),
            ("AKShare stock_hk_index_daily_sina fallback", lambda: ak.stock_hk_index_daily_sina(symbol=args.provider_symbol), False),
        ]
    else:
        if args.provider_symbol.startswith("csi"):
            attempts.append(("AKShare stock_zh_index_hist_csindex", lambda: ak.stock_zh_index_hist_csindex(symbol=args.symbol, start_date=start_date, end_date=end_date), False))
        else:
            attempts.append(("AKShare stock_zh_index_daily_em", lambda: ak.stock_zh_index_daily_em(symbol=args.provider_symbol, start_date=start_date, end_date=end_date), False))
        attempts.extend([
            ("AKShare stock_zh_index_daily_tx Tencent fallback", lambda: ak.stock_zh_index_daily_tx(symbol=fallback_symbol, start_date=start_date, end_date=end_date), True),
            ("AKShare stock_zh_index_daily Sina fallback", lambda: ak.stock_zh_index_daily(symbol=fallback_symbol), False),
        ])

    frame, source, tx_amount_is_volume, errors = pd.DataFrame(), "", False, []
    for candidate_source, loader, candidate_tx_amount_is_volume in attempts:
        try:
            candidate = loader()
            if candidate is not None and not candidate.empty:
                frame, source, tx_amount_is_volume = candidate, candidate_source, candidate_tx_amount_is_volume
                break
            errors.append(f"{candidate_source}: empty response")
        except Exception as exc:
            errors.append(f"{candidate_source}: {type(exc).__name__}")
    if frame.empty:
        raise ValueError(f"{args.name}历史行情数据源暂时不可用，请稍后重试；已尝试中证/东财、腾讯和新浪")
    points, previous_close = [], None
    for _, row in frame.iterrows():
        raw_date = row.get("date", row.get("日期", ""))
        date = str(pd.to_datetime(raw_date, errors="coerce"))[:10]
        if not date or date < f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:]}":
            continue
        close = numeric_or_none(row.get("close", row.get("收盘")))
        change_amount = numeric_or_none(row.get("涨跌额"))
        change_percent = numeric_or_none(row.get("涨跌幅"))
        if change_percent is None and close is not None and previous_close:
            change_amount, change_percent = close - previous_close, (close / previous_close - 1) * 100
        raw_amount = numeric_or_none(row.get("amount", row.get("成交额", row.get("成交金额"))))
        raw_volume = numeric_or_none(row.get("volume", row.get("成交量")))
        if tx_amount_is_volume:
            raw_volume, raw_amount = raw_amount, None
        points.append({"date": date, "open": numeric_or_none(row.get("open", row.get("开盘"))), "close": close,
            "high": numeric_or_none(row.get("high", row.get("最高"))), "low": numeric_or_none(row.get("low", row.get("最低"))),
            "volume": raw_volume, "amount": raw_amount,
            "changePercent": change_percent, "changeAmount": change_amount})
        if close is not None:
            previous_close = close
    emit({"market": args.market, "symbol": args.symbol, "points": points, "fetchedAt": datetime.now(timezone.utc).isoformat(), "source": source})


def handle_index_valuation(args: argparse.Namespace) -> None:
    source = "AKShare stock_zh_index_value_csindex"
    try:
        frame = ak.stock_zh_index_value_csindex(symbol=args.symbol)
    except Exception:
        source = "AKShare stock_zh_index_hist_csindex rolling PE fallback"
        today = datetime.now()
        frame = ak.stock_zh_index_hist_csindex(
            symbol=args.symbol,
            start_date=(today - timedelta(days=30)).strftime("%Y%m%d"),
            end_date=today.strftime("%Y%m%d"),
        ).rename(columns={"滚动市盈率": "市盈率1"})
    frame["日期"] = pd.to_datetime(frame["日期"], errors="coerce")
    frame = frame.dropna(subset=["日期"]).sort_values("日期", ascending=False)
    if frame.empty:
        raise ValueError(f"中证指数 {args.symbol} 暂无估值数据")
    latest = frame.iloc[0]
    pe1 = numeric_or_none(latest.get("市盈率1"))
    emit({
        "market": args.market, "symbol": args.symbol, "name": args.name,
        "peTotalShares": pe1, "peCalculatedShares": numeric_or_none(latest.get("市盈率2")),
        "valuationDate": latest["日期"].date().isoformat(), "available": pe1 is not None,
        "unavailableReason": None if pe1 is not None else "官方估值数据中没有可用的市盈率",
        "fetchedAt": datetime.now(timezone.utc).isoformat(), "source": source,
    })
