import argparse
import contextlib
import json
import math
import re
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlencode

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

REAL_STDOUT = sys.stdout

try:
    import akshare as ak
    import pandas as pd
    import requests
except Exception as exc:  # pragma: no cover - surfaced to NestJS
    print(
        json.dumps(
            {
                "ok": False,
                "error": {
                    "code": "AKSHARE_IMPORT_FAILED",
                    "message": "无法导入 AKShare，请先安装 Python 依赖。",
                    "detail": str(exc),
                },
            },
            ensure_ascii=False,
        )
    )
    sys.exit(0)


STATEMENT_TITLES = {
    "balance": "资产负债表",
    "income": "利润表",
    "cashflow": "现金流量表",
}

REPORT_FUNCTIONS_A = {
    "balance": "stock_balance_sheet_by_report_em",
    "income": "stock_profit_sheet_by_report_em",
    "cashflow": "stock_cash_flow_sheet_by_report_em",
}

IMPORTANT_ROW_PATTERNS = {
    "balance": [
        "资产总计",
        "总资产",
        "负债合计",
        "总负债",
        "所有者权益",
        "股东权益",
        "流动资产合计",
        "非流动资产合计",
        "流动负债合计",
        "非流动负债合计",
        "货币资金",
        "现金及等价物",
        "存货",
    ],
    "income": [
        "营业总收入",
        "营业收入",
        "收益",
        "收入",
        "毛利",
        "经营利润",
        "营业利润",
        "利润总额",
        "归属于母公司",
        "净利润",
        "每股收益",
    ],
    "cashflow": [
        "经营活动现金流量净额",
        "经营活动",
        "投资活动现金流量净额",
        "投资活动",
        "筹资活动现金流量净额",
        "筹资活动",
        "现金及现金等价物",
        "现金及等价物",
    ],
}

META_PATTERNS = [
    "code",
    "name",
    "security",
    "org",
    "report",
    "date",
    "type",
    "currency",
    "notice",
    "update",
    "industry",
    "listing",
    "上市",
    "股票",
    "代码",
    "名称",
    "公告",
    "报告",
    "日期",
]

LABEL_MAP = {
    "TOTAL_ASSETS": "资产总计",
    "TOTAL_LIABILITIES": "负债合计",
    "TOTAL_EQUITY": "所有者权益合计",
    "TOTAL_PARENT_EQUITY": "归属于母公司股东权益",
    "MONETARYFUNDS": "货币资金",
    "MONETARY_FUNDS": "货币资金",
    "INVENTORY": "存货",
    "ACCOUNTS_RECE": "应收账款",
    "TOTAL_CURRENT_ASSETS": "流动资产合计",
    "TOTAL_NONCURRENT_ASSETS": "非流动资产合计",
    "TOTAL_CURRENT_LIAB": "流动负债合计",
    "TOTAL_NONCURRENT_LIAB": "非流动负债合计",
    "OPERATE_INCOME": "营业收入",
    "TOTAL_OPERATE_INCOME": "营业总收入",
    "OPERATE_PROFIT": "营业利润",
    "TOTAL_PROFIT": "利润总额",
    "NETPROFIT": "净利润",
    "PARENT_NETPROFIT": "归属于母公司股东的净利润",
    "BASIC_EPS": "基本每股收益",
    "DEDUCT_PARENT_NETPROFIT": "扣非归母净利润",
    "NETCASH_OPERATE": "经营活动现金流量净额",
    "NETCASH_INVEST": "投资活动现金流量净额",
    "NETCASH_FINANCE": "筹资活动现金流量净额",
    "CASH_END": "期末现金及现金等价物余额",
}


def emit(data: Any) -> None:
    print(json.dumps({"ok": True, "data": data}, ensure_ascii=False, default=json_default), file=REAL_STDOUT)


def emit_error(code: str, message: str, detail: str = "") -> None:
    print(
        json.dumps(
            {"ok": False, "error": {"code": code, "message": message, "detail": detail}},
            ensure_ascii=False,
        ),
        file=REAL_STDOUT,
    )


def json_default(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if pd.isna(value):
        return None
    return str(value)


def clean_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return round(float(value), 4)
    text = str(value).strip()
    if text in {"", "--", "-", "None", "nan", "NaN"}:
        return None
    numeric = text.replace(",", "").replace("%", "")
    if re.fullmatch(r"[-+]?\d+(\.\d+)?", numeric):
        return round(float(numeric), 4)
    return text


def text_contains(value: Any, keyword: str) -> bool:
    return keyword.lower() in str(value).lower()


def infer_a_exchange(symbol: str) -> str:
    cleaned = re.sub(r"\D", "", symbol)
    if not cleaned:
        return symbol.upper().replace(".", "")
    if symbol.upper().startswith(("SH", "SZ", "BJ")):
        return symbol.upper().replace(".", "")
    if cleaned.startswith("6"):
        return f"SH{cleaned}"
    if cleaned.startswith(("0", "3")):
        return f"SZ{cleaned}"
    if cleaned.startswith(("4", "8", "9")):
        return f"BJ{cleaned}"
    return cleaned


def normalize_a_symbol(symbol: str) -> Tuple[str, str]:
    em_symbol = infer_a_exchange(symbol)
    code = re.sub(r"\D", "", em_symbol)
    suffix = ""
    if em_symbol.startswith("SH"):
        suffix = ".SH"
    elif em_symbol.startswith("SZ"):
        suffix = ".SZ"
    elif em_symbol.startswith("BJ"):
        suffix = ".BJ"
    return em_symbol, f"{code}{suffix}" if suffix else code


def normalize_hk_symbol(symbol: str) -> Tuple[str, str]:
    code = re.sub(r"\D", "", symbol)
    padded = code.zfill(5) if code else symbol.upper().replace(".HK", "")
    return padded, f"{padded}.HK"


def first_existing_column(df: "pd.DataFrame", candidates: Iterable[str]) -> Optional[str]:
    lower_map = {str(column).lower(): column for column in df.columns}
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
        lowered = candidate.lower()
        if lowered in lower_map:
            return lower_map[lowered]
    return None


def find_date_column(df: "pd.DataFrame") -> Optional[str]:
    exact = first_existing_column(
        df,
        [
            "REPORT_DATE",
            "报告日期",
            "报表日期",
            "日期",
            "截止日期",
            "END_DATE",
            "DATE",
        ],
    )
    if exact:
        return exact
    for column in df.columns:
        name = str(column).lower()
        if "date" in name or "日期" in str(column):
            return column
    return None


def extract_year(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value)
    match = re.search(r"(20\d{2}|19\d{2})", text)
    return match.group(1) if match else None


def looks_like_annual_period(value: Any) -> bool:
    text = str(value)
    normalized = text.replace("/", "-").replace(".", "-")
    return "12-31" in normalized or "年报" in text


def is_meta_column(column: Any) -> bool:
    lowered = str(column).lower()
    return any(pattern in lowered for pattern in META_PATTERNS)


def label_for(column: Any) -> str:
    text = str(column).strip()
    upper = text.upper()
    if upper in LABEL_MAP:
        return LABEL_MAP[upper]
    return text.replace("_", " ")


def reorder_rows(statement_type: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    patterns = IMPORTANT_ROW_PATTERNS.get(statement_type, [])

    def score(row: Dict[str, Any]) -> Tuple[int, int]:
        item = str(row.get("item", "")).lower()
        for index, pattern in enumerate(patterns):
            if pattern.lower() in item:
                return (0, index)
        return (1, 0)

    return sorted(enumerate(rows), key=lambda pair: (score(pair[1]), pair[0]))  # type: ignore[return-value]


def sorted_rows(statement_type: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [row for _, row in reorder_rows(statement_type, rows)]


def value_score(values: Iterable[Any]) -> int:
    score = 0
    for value in values:
        cleaned = clean_value(value)
        if isinstance(cleaned, (int, float)):
            score += 3
        elif cleaned is not None:
            score += 1
    return score


def normalize_report_dataframe(
    df: "pd.DataFrame", statement_type: str, title: str, years_limit: int
) -> Dict[str, Any]:
    if df is None or df.empty:
        return {"type": statement_type, "title": title, "years": [], "rows": []}

    df = df.copy()
    date_column = find_date_column(df)
    item_name_column = first_existing_column(df, ["STD_ITEM_NAME", "ITEM_NAME", "项目", "报表项目"])
    amount_column = first_existing_column(df, ["AMOUNT", "金额", "本期金额", "value"])
    if date_column and item_name_column and amount_column:
        return normalize_long_report_dataframe(
            df, statement_type, title, years_limit, date_column, item_name_column, amount_column
        )

    if date_column:
        df["_year"] = df[date_column].map(extract_year)
        df = df[df["_year"].notna()]
        annual_df = df[df[date_column].map(looks_like_annual_period)]
        if not annual_df.empty:
            df = annual_df
        if df.empty:
            return {"type": statement_type, "title": title, "years": [], "rows": []}

        df = df.drop_duplicates(subset=["_year"], keep="first")
        years = sorted(df["_year"].astype(str).unique(), reverse=True)[:years_limit]
        selected = df[df["_year"].isin(years)].copy()
        selected["_year"] = selected["_year"].astype(str)
        by_year = {row["_year"]: row for _, row in selected.iterrows()}

        rows = []
        for column in df.columns:
            if column == "_year" or column == date_column or is_meta_column(column):
                continue
            values = {year: clean_value(by_year[year].get(column)) for year in years if year in by_year}
            if value_score(values.values()) == 0:
                continue
            rows.append({"item": label_for(column), "values": values})
            if len(rows) >= 80:
                break
        return {"type": statement_type, "title": title, "years": years, "rows": sorted_rows(statement_type, rows)}

    item_column = df.columns[0]
    year_columns = []
    for column in df.columns[1:]:
        year = extract_year(column)
        if year:
            year_columns.append((column, year))

    if not year_columns:
        return {"type": statement_type, "title": title, "years": [], "rows": []}

    year_columns = sorted(year_columns, key=lambda item: item[1], reverse=True)[:years_limit]
    years = [year for _, year in year_columns]
    rows = []
    for _, record in df.iterrows():
        item_name = str(record.get(item_column, "")).strip()
        if not item_name or item_name.lower() == "nan":
            continue
        values = {year: clean_value(record.get(column)) for column, year in year_columns}
        if value_score(values.values()) == 0:
            continue
        rows.append({"item": item_name, "values": values})

    return {"type": statement_type, "title": title, "years": years, "rows": sorted_rows(statement_type, rows[:100])}


def normalize_long_report_dataframe(
    df: "pd.DataFrame",
    statement_type: str,
    title: str,
    years_limit: int,
    date_column: str,
    item_name_column: str,
    amount_column: str,
) -> Dict[str, Any]:
    df = df.copy()
    df["_year"] = df[date_column].map(extract_year)
    df = df[df["_year"].notna()]
    annual_df = df[df[date_column].map(looks_like_annual_period)]
    if not annual_df.empty:
        df = annual_df
    if df.empty:
        return {"type": statement_type, "title": title, "years": [], "rows": []}

    years = sorted(df["_year"].astype(str).unique(), reverse=True)[:years_limit]
    selected = df[df["_year"].isin(years)].copy()
    selected["_item"] = selected[item_name_column].astype(str).str.strip()
    selected = selected[selected["_item"].ne("") & selected["_item"].ne("nan")]
    selected = selected.drop_duplicates(subset=["_item", "_year"], keep="first")

    rows = []
    for item_name in selected["_item"].drop_duplicates().tolist():
        item_records = selected[selected["_item"] == item_name]
        values = {}
        for year in years:
            matched = item_records[item_records["_year"].astype(str) == year]
            values[year] = clean_value(matched.iloc[0].get(amount_column)) if not matched.empty else None
        if value_score(values.values()) == 0:
            continue
        rows.append({"item": item_name, "values": values})
        if len(rows) >= 100:
            break

    return {"type": statement_type, "title": title, "years": years, "rows": sorted_rows(statement_type, rows)}


def extract_company_name(*dfs: "pd.DataFrame") -> Optional[str]:
    for df in dfs:
        if df is None or df.empty:
            continue
        column = first_existing_column(df, ["SECURITY_NAME_ABBR", "证券简称", "股票简称", "名称"])
        if column:
            value = str(df.iloc[0].get(column, "")).strip()
            if value and value.lower() != "nan":
                return value
    return None


def merge_years(tables: List[Dict[str, Any]], limit: int) -> List[str]:
    years = set()
    for table in tables:
        years.update(table.get("years", []))
    return sorted(years, reverse=True)[:limit]


def find_row(table: Dict[str, Any], patterns: Iterable[str]) -> Optional[Dict[str, Any]]:
    lowered_patterns = [pattern.lower() for pattern in patterns]
    rows = table.get("rows", [])
    for pattern in lowered_patterns:
        for row in rows:
            item = str(row.get("item", "")).lower()
            if item == pattern:
                return row
    for pattern in lowered_patterns:
        for row in rows:
            item = str(row.get("item", "")).lower()
            if pattern in item:
                return row
    return None


def make_series(key: str, label: str, years: List[str], row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    values = row.get("values", {}) if row else {}
    return {
        "key": key,
        "label": label,
        "points": [{"year": year, "value": numeric_or_none(values.get(year))} for year in reversed(years)],
    }


def numeric_or_none(value: Any) -> Optional[float]:
    cleaned = clean_value(value)
    if isinstance(cleaned, (int, float)):
        return float(cleaned)
    return None


def build_highlights(tables: List[Dict[str, Any]], years: List[str]) -> List[Dict[str, Any]]:
    table_by_type = {table["type"]: table for table in tables}
    balance = table_by_type.get("balance", {})
    income = table_by_type.get("income", {})
    cashflow = table_by_type.get("cashflow", {})
    return [
        make_series("assets", "总资产", years, find_row(balance, ["总资产", "资产总计", "total assets"])),
        make_series("liabilities", "总负债", years, find_row(balance, ["总负债", "负债合计", "total liabilities"])),
        make_series("revenue", "营业收入", years, find_row(income, ["营业额", "收益", "营业收入", "营业总收入", "营运收入", "收入", "operate income", "revenue"])),
        make_series(
            "netProfit",
            "净利润",
            years,
            find_row(income, ["净利润", "股东应占溢利", "年度溢利", "年内溢利", "除税后溢利", "本公司权益持有人应占盈利", "归属于母公司", "netprofit", "net income"]),
        ),
        make_series(
            "operatingCashflow",
            "经营现金流",
            years,
            find_row(cashflow, ["经营活动现金流量净额", "经营活动所得现金流量净额", "经营业务现金净额", "经营业务所得现金净额", "netcash operate", "operating cash"]),
        ),
    ]


def search_a_shares(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    df = ak.stock_info_a_code_name()
    code_col = first_existing_column(df, ["code", "代码", "证券代码"]) or df.columns[0]
    name_col = first_existing_column(df, ["name", "名称", "证券简称"]) or df.columns[1]
    matches = df[
        df[code_col].map(lambda value: text_contains(value, query))
        | df[name_col].map(lambda value: text_contains(value, query))
    ].head(limit)
    results = []
    for _, row in matches.iterrows():
        code = str(row[code_col]).strip()
        _, display_symbol = normalize_a_symbol(code)
        results.append(
            {
                "market": "a",
                "symbol": re.sub(r"\D", "", code),
                "displaySymbol": display_symbol,
                "name": str(row[name_col]).strip(),
                "source": "AKShare stock_info_a_code_name",
                "latestPrice": None,
                "changePercent": None,
            }
        )
    return results


def search_hk_shares(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    try:
        df = ak.stock_hk_spot_em()
        code_col = first_existing_column(df, ["代码", "code", "证券代码"]) or df.columns[0]
        name_col = first_existing_column(df, ["名称", "name", "证券简称"]) or df.columns[1]
        price_col = first_existing_column(df, ["最新价", "最新", "price"])
        pct_col = first_existing_column(df, ["涨跌幅", "changePercent", "涨幅"])
        matches = df[
            df[code_col].map(lambda value: text_contains(value, query))
            | df[name_col].map(lambda value: text_contains(value, query))
        ].head(limit)
        results = []
        for _, row in matches.iterrows():
            symbol, display_symbol = normalize_hk_symbol(str(row[code_col]))
            results.append(
                {
                    "market": "hk",
                    "symbol": symbol,
                    "displaySymbol": display_symbol,
                    "name": str(row[name_col]).strip(),
                    "source": "AKShare stock_hk_spot_em",
                    "latestPrice": clean_value(row.get(price_col)) if price_col else None,
                    "changePercent": clean_value(row.get(pct_col)) if pct_col else None,
                }
            )
        return results
    except Exception:
        return search_hk_with_eastmoney_suggest(query, limit)


def flatten_json_lists(value: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(value, list):
        for item in value:
            yield from flatten_json_lists(item)
    elif isinstance(value, dict):
        if any(key.lower() in {"code", "name", "securitytype", "markettype"} for key in value.keys()):
            yield value
        for item in value.values():
            yield from flatten_json_lists(item)


def search_hk_with_eastmoney_suggest(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    params = {
        "input": query,
        "type": "14",
        "count": str(limit),
        "token": "D43BF722C8E33BDC906FB84D85E326E8",
    }
    url = f"https://searchapi.eastmoney.com/api/suggest/get?{urlencode(params)}"
    response = requests.get(url, timeout=12)
    response.raise_for_status()
    payload = response.json()
    results: List[Dict[str, Any]] = []
    seen = set()
    derivative_keywords = [
        "购",
        "沽",
        "牛",
        "熊",
        "法兴",
        "法巴",
        "瑞银",
        "摩通",
        "摩利",
        "汇丰",
        "中银",
        "信证",
        "国君",
        "麦银",
    ]
    for item in flatten_json_lists(payload):
        raw_code = str(item.get("Code") or item.get("code") or item.get("SECURITY_CODE") or "").strip()
        raw_name = str(item.get("Name") or item.get("name") or item.get("SECURITY_NAME_ABBR") or "").strip()
        market_text = " ".join(str(item.get(key, "")) for key in item.keys())
        if not raw_code or not raw_name:
            continue
        if any(keyword in raw_name for keyword in derivative_keywords):
            continue
        if "HK" not in market_text.upper() and "港" not in market_text and not re.fullmatch(r"\d{1,5}", raw_code):
            continue
        symbol, display_symbol = normalize_hk_symbol(raw_code)
        if symbol in seen:
            continue
        seen.add(symbol)
        results.append(
            {
                "market": "hk",
                "symbol": symbol,
                "displaySymbol": display_symbol,
                "name": raw_name,
                "source": "Eastmoney suggest fallback",
                "latestPrice": None,
                "changePercent": None,
            }
        )
        if len(results) >= limit:
            break
    return results


def handle_search(args: argparse.Namespace) -> None:
    query = args.q.strip()
    if not query:
        emit([])
        return
    results: List[Dict[str, Any]] = []
    errors: List[str] = []
    if args.market in ("all", "a"):
        try:
            results.extend(search_a_shares(query))
        except Exception as exc:
            errors.append(f"A股搜索失败: {exc}")
    if args.market in ("all", "hk"):
        try:
            results.extend(search_hk_shares(query))
        except Exception as exc:
            errors.append(f"港股搜索失败: {exc}")
    if errors and not results:
        raise RuntimeError("; ".join(errors))
    emit(results[:30])


def call_a_report(statement_type: str, symbol: str) -> "pd.DataFrame":
    function_name = REPORT_FUNCTIONS_A[statement_type]
    function = getattr(ak, function_name)
    return function(symbol=symbol)


def call_hk_report(statement_type: str, symbol: str) -> "pd.DataFrame":
    function = getattr(ak, "stock_financial_hk_report_em")
    title = STATEMENT_TITLES[statement_type]
    attempts = [
        {"stock": symbol, "symbol": title, "indicator": "年度"},
        {"stock": symbol, "symbol": title, "indicator": "年报"},
        {"symbol": symbol, "indicator": title},
    ]
    last_error: Optional[Exception] = None
    for kwargs in attempts:
        try:
            return function(**kwargs)
        except TypeError as exc:
            last_error = exc
        except Exception as exc:
            last_error = exc
            if "invalid" not in str(exc).lower() and "unexpected" not in str(exc).lower():
                break
    raise last_error or RuntimeError("无法调用港股财报接口")


def handle_statements(args: argparse.Namespace) -> None:
    years_limit = max(1, min(int(args.years), 10))
    tables: List[Dict[str, Any]] = []
    raw_reports: List[pd.DataFrame] = []
    if args.market == "a":
        api_symbol, display_symbol = normalize_a_symbol(args.symbol)
        company_symbol = re.sub(r"\D", "", api_symbol)
        for statement_type, title in STATEMENT_TITLES.items():
            df = call_a_report(statement_type, api_symbol)
            raw_reports.append(df)
            tables.append(normalize_report_dataframe(df, statement_type, title, years_limit))
        company = {
            "market": "a",
            "symbol": company_symbol,
            "displaySymbol": display_symbol,
            "name": extract_company_name(*raw_reports),
        }
        source = "AKShare Eastmoney A-share financial report APIs"
    else:
        api_symbol, display_symbol = normalize_hk_symbol(args.symbol)
        for statement_type, title in STATEMENT_TITLES.items():
            df = call_hk_report(statement_type, api_symbol)
            raw_reports.append(df)
            tables.append(normalize_report_dataframe(df, statement_type, title, years_limit))
        company = {
            "market": "hk",
            "symbol": api_symbol,
            "displaySymbol": display_symbol,
            "name": extract_company_name(*raw_reports),
        }
        source = "AKShare Eastmoney HK financial report API"

    years = merge_years(tables, years_limit)
    payload = {
        "company": company,
        "years": years,
        "unit": "AKShare 原始单位",
        "tables": tables,
        "highlights": build_highlights(tables, years),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
    }
    emit(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AKShare bridge for finance-query-site")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("--q", required=True)
    search_parser.add_argument("--market", choices=["all", "a", "hk"], default="all")

    statements_parser = subparsers.add_parser("statements")
    statements_parser.add_argument("--market", choices=["a", "hk"], required=True)
    statements_parser.add_argument("--symbol", required=True)
    statements_parser.add_argument("--years", type=int, default=10)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            if args.command == "search":
                handle_search(args)
            elif args.command == "statements":
                handle_statements(args)
            else:
                emit_error("UNKNOWN_COMMAND", f"Unknown command: {args.command}")
    except Exception as exc:
        emit_error("AKSHARE_REQUEST_FAILED", str(exc), traceback.format_exc())


if __name__ == "__main__":
    main()
