from .runtime import *  # noqa: F401,F403
from .common import clean_value, emit, numeric_or_none


def normalize_etf_symbol(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value).split(".")[0])
    return digits.zfill(6)[-6:]


def etf_display_symbol(symbol: str) -> str:
    return f"{symbol}.SH" if symbol.startswith("5") else f"{symbol}.SZ"


def handle_etf_market(_: argparse.Namespace) -> None:
    frame = ak.fund_etf_spot_em()
    quotes: List[Dict[str, Any]] = []
    for _, row in frame.iterrows():
        symbol = normalize_etf_symbol(row.get("代码"))
        if not symbol.strip("0"):
            continue
        exchange = "sh" if symbol.startswith("5") else "sz"
        discount_rate = numeric_or_none(row.get("基金折价率"))
        quotes.append(
            {
                "symbol": symbol,
                "displaySymbol": etf_display_symbol(symbol),
                "name": str(row.get("名称", symbol)).strip(),
                "exchange": exchange,
                "latestPrice": numeric_or_none(row.get("最新价")),
                "iopv": numeric_or_none(row.get("IOPV实时估值")),
                "premiumRate": -discount_rate if discount_rate is not None else None,
                "changeAmount": numeric_or_none(row.get("涨跌额")),
                "changePercent": numeric_or_none(row.get("涨跌幅")),
                "volume": numeric_or_none(row.get("成交量")),
                "amount": numeric_or_none(row.get("成交额")),
                "open": numeric_or_none(row.get("开盘价")),
                "high": numeric_or_none(row.get("最高价")),
                "low": numeric_or_none(row.get("最低价")),
                "previousClose": numeric_or_none(row.get("昨收")),
                "amplitude": numeric_or_none(row.get("振幅")),
                "turnoverRate": numeric_or_none(row.get("换手率")),
                "latestShares": numeric_or_none(row.get("最新份额")),
                "marketCap": numeric_or_none(row.get("总市值")),
                "dataDate": str(row.get("数据日期", ""))[:10] or None,
                "quoteUpdatedAt": clean_value(row.get("更新时间")),
                "source": "AKShare fund_etf_spot_em",
            }
        )
    emit(quotes)


def handle_etf_history(args: argparse.Namespace) -> None:
    symbol = normalize_etf_symbol(args.symbol)
    years = max(1, min(int(args.years), 10))
    today = datetime.now()
    start_date = f"{today.year - years}{today.strftime('%m%d')}"
    end_date = today.strftime("%Y%m%d")
    source = "AKShare fund_etf_hist_em"
    try:
        frame = ak.fund_etf_hist_em(
            symbol=symbol,
            period="daily",
            start_date=start_date,
            end_date=end_date,
            adjust="",
        )
    except Exception:
        source = "AKShare fund_etf_hist_sina fallback"
        sina_symbol = f"sh{symbol}" if symbol.startswith("5") else f"sz{symbol}"
        frame = ak.fund_etf_hist_sina(symbol=sina_symbol)
        if not frame.empty:
            date_column = "date" if "date" in frame.columns else "日期"
            frame = frame[
                pd.to_datetime(frame[date_column], errors="coerce")
                >= pd.to_datetime(start_date, format="%Y%m%d")
            ]
    points: List[Dict[str, Any]] = []
    previous_close: Optional[float] = None
    for _, row in frame.iterrows():
        close = numeric_or_none(row.get("收盘", row.get("close")))
        change_amount = numeric_or_none(row.get("涨跌额"))
        change_percent = numeric_or_none(row.get("涨跌幅"))
        if source.endswith("fallback") and close is not None and previous_close:
            change_amount = close - previous_close
            change_percent = (close / previous_close - 1) * 100
        points.append(
            {
                "date": str(row.get("日期", row.get("date", "")))[:10],
                "open": numeric_or_none(row.get("开盘", row.get("open"))),
                "close": close,
                "high": numeric_or_none(row.get("最高", row.get("high"))),
                "low": numeric_or_none(row.get("最低", row.get("low"))),
                "volume": numeric_or_none(row.get("成交量", row.get("volume"))),
                "amount": numeric_or_none(row.get("成交额")),
                "amplitude": numeric_or_none(row.get("振幅")),
                "changePercent": change_percent,
                "changeAmount": change_amount,
                "turnoverRate": numeric_or_none(row.get("换手率")),
            }
        )
        if close is not None:
            previous_close = close
    emit(
        {
            "symbol": symbol,
            "points": points,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": source,
        }
    )


def handle_etf_valuation(args: argparse.Namespace) -> None:
    symbol = normalize_etf_symbol(args.symbol)
    overview = ak.fund_overview_em(symbol=symbol)
    fetched_at = datetime.now(timezone.utc).isoformat()
    source = "AKShare fund_overview_em + index_csindex_all + stock_zh_index_value_csindex"
    if overview.empty:
        emit({
            "symbol": symbol,
            "trackingIndexName": None,
            "trackingIndexCode": None,
            "peTotalShares": None,
            "peCalculatedShares": None,
            "valuationDate": None,
            "available": False,
            "unavailableReason": "未获取到基金基本概况",
            "fetchedAt": fetched_at,
            "source": source,
        })
        return

    tracking_name = clean_value(overview.iloc[0].get("跟踪标的"))
    if not tracking_name or tracking_name == "该基金无跟踪标的":
        emit({
            "symbol": symbol,
            "trackingIndexName": tracking_name,
            "trackingIndexCode": None,
            "peTotalShares": None,
            "peCalculatedShares": None,
            "valuationDate": None,
            "available": False,
            "unavailableReason": "该 ETF 没有可用的跟踪指数",
            "fetchedAt": fetched_at,
            "source": source,
        })
        return

    catalog = ak.index_csindex_all()
    exact = catalog[
        (catalog["指数全称"].astype(str).str.strip() == tracking_name)
        | (catalog["指数简称"].astype(str).str.strip() == tracking_name)
        | ((catalog["指数简称"].astype(str).str.strip() + "指数") == tracking_name)
    ]
    if len(exact) != 1:
        emit({
            "symbol": symbol,
            "trackingIndexName": tracking_name,
            "trackingIndexCode": None,
            "peTotalShares": None,
            "peCalculatedShares": None,
            "valuationDate": None,
            "available": False,
            "unavailableReason": "跟踪标的无法唯一匹配中证指数",
            "fetchedAt": fetched_at,
            "source": source,
        })
        return

    index_code = str(exact.iloc[0]["指数代码"]).strip().zfill(6)
    valuation = ak.stock_zh_index_value_csindex(symbol=index_code)
    valuation["日期"] = pd.to_datetime(valuation["日期"], errors="coerce")
    valuation = valuation.dropna(subset=["日期"]).sort_values("日期", ascending=False)
    if valuation.empty:
        raise ValueError(f"中证指数 {index_code} 暂无估值数据")
    latest = valuation.iloc[0]
    emit({
        "symbol": symbol,
        "trackingIndexName": tracking_name,
        "trackingIndexCode": index_code,
        "peTotalShares": numeric_or_none(latest.get("市盈率1")),
        "peCalculatedShares": numeric_or_none(latest.get("市盈率2")),
        "valuationDate": latest["日期"].date().isoformat(),
        "available": numeric_or_none(latest.get("市盈率1")) is not None,
        "unavailableReason": None,
        "fetchedAt": fetched_at,
        "source": source,
    })
