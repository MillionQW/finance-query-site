"""Company PE history. Keep missing/latest values so callers never backfill current PE."""
from .runtime import *  # noqa: F401,F403
from .common import emit, numeric_or_none


def handle_company_valuation(args: argparse.Namespace) -> None:
    function = "stock_zh_valuation_baidu" if args.market == "a" else "stock_hk_valuation_baidu"
    frame = getattr(ak, function)(symbol=args.symbol, indicator="市盈率(TTM)", period="全部")
    if not {"date", "value"}.issubset(frame.columns):
        raise ValueError("PE（TTM）历史接口返回了无法识别的数据格式")
    points = []
    for _, row in frame.iterrows():
        date = pd.to_datetime(row["date"], errors="coerce")
        if pd.isna(date):
            continue
        points.append({"date": date.date().isoformat(), "pe": numeric_or_none(row["value"])})
    if not points:
        raise ValueError("该公司暂无可用的 PE（TTM）历史数据")
    emit({
        "market": args.market, "symbol": args.symbol, "points": points,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": f"AKShare {function} / 百度股市通",
    })
