from .runtime import *  # noqa: F401,F403
from .common import (
    clean_value,
    find_date_column,
    find_row,
    first_existing_column,
    is_meta_column,
    label_for,
    looks_like_annual_period,
    numeric_or_none,
    sorted_rows,
    value_score,
)


def extract_report_period(value: Any) -> Optional[str]:
    if value is None:
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.strftime("%Y-%m-%d")


def report_period_label(period: str, annual: bool = False) -> str:
    parsed = datetime.strptime(period, "%Y-%m-%d")
    if annual:
        return f"{parsed.year}年报"
    if parsed.month == 3:
        return f"{parsed.year}一季报"
    if parsed.month == 6:
        return f"{parsed.year}中报"
    if parsed.month == 9:
        return f"{parsed.year}三季报"
    return period


def report_period_type(period: str, annual: bool = False) -> str:
    if annual:
        return "annual"
    month = int(period[5:7])
    if month == 6:
        return "half-year"
    if month in (3, 9):
        return "quarter"
    return "other"


def normalize_period_report_dataframe(
    df: "pd.DataFrame", statement_type: str, title: str, periods_limit: int
) -> Dict[str, Any]:
    if df is None or df.empty:
        return {"type": statement_type, "title": title, "periods": [], "rows": []}

    df = df.copy()
    date_column = find_date_column(df)
    if not date_column:
        return {"type": statement_type, "title": title, "periods": [], "rows": []}

    item_name_column = first_existing_column(
        df, ["STD_ITEM_NAME", "ITEM_NAME", "项目", "报表项目"]
    )
    amount_column = first_existing_column(df, ["AMOUNT", "金额", "本期金额", "value"])
    df["_period"] = df[date_column].map(extract_report_period)
    df = df[df["_period"].notna()]
    if df.empty:
        return {"type": statement_type, "title": title, "periods": [], "rows": []}

    periods = sorted(df["_period"].astype(str).unique(), reverse=True)[:periods_limit]
    selected = df[df["_period"].isin(periods)].copy()
    starts = {}
    if "START_DATE" in selected.columns:
        for period in periods:
            values = {
                extract_report_period(value)
                for value in selected.loc[selected["_period"] == period, "START_DATE"]
            } - {None}
            starts[period] = next(iter(values)) if len(values) == 1 else None

    if item_name_column and amount_column:
        selected["_item"] = selected[item_name_column].astype(str).str.strip()
        selected = selected[selected["_item"].ne("") & selected["_item"].ne("nan")]
        selected = selected.drop_duplicates(subset=["_item", "_period"], keep="first")
        rows = []
        for item_name in selected["_item"].drop_duplicates().tolist():
            item_records = selected[selected["_item"] == item_name]
            values = {}
            for period in periods:
                matched = item_records[item_records["_period"].astype(str) == period]
                values[period] = (
                    clean_value(matched.iloc[0].get(amount_column))
                    if not matched.empty
                    else None
                )
            if value_score(values.values()) == 0:
                continue
            rows.append(
                {
                    "item": label_for(item_name),
                    "sourceItem": item_name,
                    "values": values,
                }
            )
        return {
            "type": statement_type,
            "title": title,
            "periods": periods,
            "periodStarts": starts,
            "rows": sorted_rows(statement_type, rows),
        }

    selected = selected.drop_duplicates(subset=["_period"], keep="first")
    by_period = {row["_period"]: row for _, row in selected.iterrows()}
    rows = []
    for column in df.columns:
        if column in ("_period", date_column) or is_meta_column(column):
            continue
        values = {
            period: clean_value(by_period[period].get(column))
            for period in periods
            if period in by_period
        }
        if value_score(values.values()) == 0:
            continue
        source_item = str(column).strip()
        rows.append(
            {
                "item": label_for(column),
                "sourceItem": source_item,
                "values": values,
            }
        )
    return {
        "type": statement_type,
        "title": title,
        "periods": periods,
        "periodStarts": starts,
        "rows": sorted_rows(statement_type, rows),
    }


def merge_report_periods(
    tables: List[Dict[str, Any]], annual_periods: Iterable[str], limit: int
) -> List[Dict[str, Any]]:
    available = set()
    for table in tables:
        available.update(table.get("periods", []))
    annual_set = set(annual_periods)
    periods = sorted(available, reverse=True)[:limit]
    result = []
    for period in periods:
        annual = period in annual_set or looks_like_annual_period(period)
        prior_year = f"{int(period[:4]) - 1}{period[4:]}"
        result.append(
            {
                "key": period,
                "label": report_period_label(period, annual),
                "fiscalYear": int(period[:4]),
                "type": report_period_type(period, annual),
                "annual": annual,
                "priorYearKey": prior_year if prior_year in available else None,
            }
        )
    return result


def make_period_series(
    key: str, label: str, periods: List[str], row: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    values = row.get("values", {}) if row else {}
    return {
        "key": key,
        "label": label,
        "points": [
            {"period": period, "value": numeric_or_none(values.get(period))}
            for period in reversed(periods)
        ],
    }


def build_period_highlights(
    tables: List[Dict[str, Any]], periods: List[str]
) -> List[Dict[str, Any]]:
    table_by_type = {table["type"]: table for table in tables}
    balance = table_by_type.get("balance", {})
    income = table_by_type.get("income", {})
    cashflow = table_by_type.get("cashflow", {})
    return [
        make_period_series(
            "assets",
            "总资产",
            periods,
            find_row(balance, ["总资产", "资产总计", "total assets"]),
        ),
        make_period_series(
            "liabilities",
            "总负债",
            periods,
            find_row(balance, ["总负债", "负债合计", "total liabilities"]),
        ),
        make_period_series(
            "revenue",
            "营业收入（累计）",
            periods,
            find_row(
                income,
                [
                    "营业额",
                    "收益",
                    "营业收入",
                    "营业总收入",
                    "营运收入",
                    "收入",
                    "operate income",
                    "revenue",
                ],
            ),
        ),
        make_period_series(
            "netProfit",
            "净利润（累计）",
            periods,
            find_row(
                income,
                [
                    "净利润",
                    "股东应占溢利",
                    "年度溢利",
                    "期内溢利",
                    "除税后溢利",
                    "本公司权益持有人应占盈利",
                    "归属于母公司",
                    "netprofit",
                    "net income",
                ],
            ),
        ),
        make_period_series(
            "operatingCashflow",
            "经营现金流（累计）",
            periods,
            find_row(
                cashflow,
                [
                    "经营活动现金流量净额",
                    "经营活动所得现金流量净额",
                    "经营业务现金净额",
                    "经营业务所得现金净额",
                    "netcash operate",
                    "operating cash",
                ],
            ),
        ),
    ]


def ttm_value(
    period: str,
    values: Dict[str, Any],
    annual_periods: Iterable[str],
) -> Optional[float]:
    current = numeric_or_none(values.get(period))
    if current is None:
        return None
    annual_keys = sorted(set(annual_periods))
    if period in annual_keys:
        return current

    prior_year_period = f"{int(period[:4]) - 1}{period[4:]}"
    prior_same = numeric_or_none(values.get(prior_year_period))
    previous_annual_candidates = [
        key for key in annual_keys if prior_year_period < key < period
    ]
    if prior_same is None or not previous_annual_candidates:
        return None
    previous_annual = numeric_or_none(values.get(previous_annual_candidates[-1]))
    if previous_annual is None:
        return None
    return current + previous_annual - prior_same


def make_ttm_series(
    key: str,
    label: str,
    periods: List[str],
    row: Optional[Dict[str, Any]],
    annual_periods: Iterable[str],
) -> Dict[str, Any]:
    values = row.get("values", {}) if row else {}
    return {
        "key": key,
        "label": label,
        "points": [
            {
                "period": period,
                "value": ttm_value(period, values, annual_periods),
            }
            for period in reversed(periods)
        ],
    }


def build_ttm_highlights(
    tables: List[Dict[str, Any]],
    periods: List[str],
    annual_periods: Iterable[str],
) -> List[Dict[str, Any]]:
    table_by_type = {table["type"]: table for table in tables}
    income = table_by_type.get("income", {})
    cashflow = table_by_type.get("cashflow", {})
    return [
        make_ttm_series(
            "revenue",
            "营业收入 TTM",
            periods,
            find_row(
                income,
                [
                    "营业额",
                    "收益",
                    "营业收入",
                    "营业总收入",
                    "营运收入",
                    "收入",
                    "operate income",
                    "revenue",
                ],
            ),
            annual_periods,
        ),
        make_ttm_series(
            "netProfit",
            "净利润 TTM",
            periods,
            find_row(
                income,
                [
                    "净利润",
                    "股东应占溢利",
                    "年度溢利",
                    "期内溢利",
                    "除税后溢利",
                    "本公司权益持有人应占盈利",
                    "归属于母公司",
                    "netprofit",
                    "net income",
                ],
            ),
            annual_periods,
        ),
        make_ttm_series(
            "operatingCashflow",
            "经营现金流 TTM",
            periods,
            find_row(
                cashflow,
                [
                    "经营活动现金流量净额",
                    "经营活动所得现金流量净额",
                    "经营业务现金净额",
                    "经营业务所得现金净额",
                    "netcash operate",
                    "operating cash",
                ],
            ),
            annual_periods,
        ),
    ]
