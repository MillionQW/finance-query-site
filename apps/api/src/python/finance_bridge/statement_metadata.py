"""Conservative statement denomination metadata; never infer HK currency from listing."""
from .runtime import pd


def statement_metadata(market, reports):
    currencies = set()
    names = {"人民币": "CNY", "人民币元": "CNY", "RMB": "CNY",
             "港元": "HKD", "港币": "HKD", "美元": "USD", "美圆": "USD"}
    for report in reports:
        if report is None or report.empty:
            continue
        for column in ("CURRENCY", "CURRENCY_NAME", "币种"):
            if column in report.columns:
                for value in report[column].dropna().unique():
                    raw = str(value).strip().upper()
                    if raw:
                        currencies.add(names.get(raw, raw))
    currency = next(iter(currencies)) if len(currencies) == 1 else None
    if not currencies and market == "a":
        currency = "CNY"
    # Eastmoney A-share statement amounts are in yuan; HK AMOUNT has no unit contract.
    scale = 1 if market == "a" else None
    return {
        "reportingCurrency": currency,
        "amountScale": scale,
        "unit": "元（CNY；每股及比例项目按原科目）" if market == "a" else "源报表金额单位（未确认）",
        "currencyNote": "币种与金额单位按A股报表接口口径。" if market == "a" else
            "港股报价通常为HKD，但报告币种和金额单位须以原报告核实；不自动换算。"
            + ("历史币种存在差异，跨期金额不宜直接比较。" if len(currencies) > 1 else ""),
    }
