from .runtime import *  # noqa: F401,F403
from .common import STATEMENT_TITLES, build_highlights, emit, extract_company_name, extract_year, first_existing_column, merge_years, normalize_a_symbol, normalize_hk_symbol, normalize_report_dataframe


A_REPORT_ENDPOINTS = {
    "balance": ("zcfzbDateAjaxNew", "zcfzbAjaxNew"),
    "income": ("lrbDateAjaxNew", "lrbAjaxNew"),
    "cashflow": ("xjllbDateAjaxNew", "xjllbAjaxNew"),
}


def eastmoney_get_json(url: str, params: Dict[str, Any], attempts: int = 3) -> Dict[str, Any]:
    last_error: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            response = requests.get(url, params=params, timeout=(5, 20))
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(0.6 * (2**attempt))
    raise last_error or RuntimeError("Eastmoney request failed")


def get_a_company_type(symbol: str) -> str:
    url = "https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/Index"
    last_error: Optional[Exception] = None
    for attempt in range(3):
        try:
            response = requests.get(
                url,
                params={"type": "web", "code": symbol.lower()},
                timeout=(5, 20),
            )
            response.raise_for_status()
            match = re.search(r'id=["\']hidctype["\'][^>]*value=["\']([^"\']+)', response.text)
            if not match:
                match = re.search(r'value=["\']([^"\']+)["\'][^>]*id=["\']hidctype["\']', response.text)
            if match:
                return match.group(1)
            raise RuntimeError("Eastmoney company type was not found")
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.6 * (2**attempt))
    raise last_error or RuntimeError("Unable to determine Eastmoney company type")


def call_a_report(
    statement_type: str,
    symbol: str,
    company_type: str,
    listing_year: Optional[int],
) -> "pd.DataFrame":
    date_endpoint, data_endpoint = A_REPORT_ENDPOINTS[statement_type]
    base_url = "https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis"
    common_params = {
        "companyType": company_type,
        "reportDateType": "0",
        "code": symbol,
    }
    date_payload = eastmoney_get_json(f"{base_url}/{date_endpoint}", common_params)
    date_rows = date_payload.get("data") or []
    dates: List[str] = []
    for row in date_rows:
        date = str(row.get("REPORT_DATE", ""))[:10]
        year = extract_year(date)
        if date and year and (listing_year is None or int(year) >= listing_year):
            dates.append(date)

    batches = [dates[index : index + 5] for index in range(0, len(dates), 5)]
    frames: List[pd.DataFrame] = []
    failed_batches: List[str] = []
    for batch in batches:
        params = {
            **common_params,
            "reportType": "1",
            "dates": ",".join(batch),
        }
        try:
            payload = eastmoney_get_json(f"{base_url}/{data_endpoint}", params)
            rows = payload.get("data") or []
            if rows:
                frames.append(pd.DataFrame(rows))
        except Exception as exc:
            failed_batches.append(f"{batch[-1]}..{batch[0]}: {exc}")

    if not frames and failed_batches:
        raise RuntimeError(f"Eastmoney {statement_type} report batches all failed: {failed_batches[0]}")
    result = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    result.attrs["fetch_warnings"] = failed_batches
    return result


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


def extract_listing_year(market: str, symbol: str) -> Optional[int]:
    """Return the exchange listing year, or None when the profile endpoint is unavailable."""
    try:
        if market == "a":
            code = re.sub(r"\D", "", symbol)
            try:
                market_id = "1" if code.startswith("6") else "0"
                quote = eastmoney_get_json(
                    "https://push2.eastmoney.com/api/qt/stock/get",
                    {"secid": f"{market_id}.{code}", "fields": "f57,f58,f189"},
                )
                listing_date = str((quote.get("data") or {}).get("f189") or "")
                if re.fullmatch(r"(?:19|20)\d{6}", listing_date):
                    return int(listing_date[:4])
            except Exception:
                pass
            try:
                cninfo_profile = ak.stock_profile_cninfo(symbol=code)
                if cninfo_profile is not None and not cninfo_profile.empty:
                    listing_column = first_existing_column(cninfo_profile, ["上市日期", "LISTING_DATE"])
                    if listing_column:
                        year = extract_year(cninfo_profile.iloc[0].get(listing_column))
                        if year:
                            return int(year)
            except Exception:
                pass
            profile = ak.stock_individual_info_em(symbol=code, timeout=20)
        else:
            profile = ak.stock_hk_company_profile_em(symbol=re.sub(r"\D", "", symbol).zfill(5))
        if profile is None or profile.empty:
            return None

        listing_labels = ("LISTING", "LISTED", "IPO", "上市")
        for _, row in profile.iterrows():
            cells = [str(value).strip() for value in row.tolist() if not pd.isna(value)]
            for index, cell in enumerate(cells):
                if any(label in cell.upper() for label in listing_labels):
                    # Some HK profiles only mention the listing year in a narrative
                    # cell such as "2004年于香港联交所上市".
                    candidates = cells[index:] + cells[:index]
                    for candidate_index, candidate in enumerate(candidates):
                        if candidate_index == 0:
                            listing_positions = [
                                candidate.upper().find(label)
                                for label in listing_labels
                                if candidate.upper().find(label) >= 0
                            ]
                            year_matches = list(re.finditer(r"(?:19|20)\d{2}", candidate))
                            if listing_positions and year_matches:
                                listing_position = min(listing_positions)
                                nearest = min(
                                    year_matches,
                                    key=lambda match: abs(match.start() - listing_position),
                                )
                                return int(nearest.group(0))
                        year = extract_year(candidate)
                        if year:
                            return int(year)
    except Exception:
        # Financial reports are still useful when the separate company-profile API fails.
        return None
    return None


def filter_tables_from_year(tables: List[Dict[str, Any]], start_year: Optional[int]) -> None:
    if start_year is None:
        return
    for table in tables:
        years = [year for year in table.get("years", []) if int(year) >= start_year]
        table["years"] = years
        for row in table.get("rows", []):
            row["values"] = {year: row.get("values", {}).get(year) for year in years}


def handle_statements(args: argparse.Namespace) -> None:
    # years=0 is the public "since listing" mode. 200 is only a defensive ceiling,
    # not a business window; the listing year below determines the actual start.
    years_limit = 200 if int(args.years) <= 0 else max(1, min(int(args.years), 200))
    tables: List[Dict[str, Any]] = []
    raw_reports: List[pd.DataFrame] = []
    fetch_warnings: List[str] = []
    if args.market == "a":
        api_symbol, display_symbol = normalize_a_symbol(args.symbol)
        company_symbol = re.sub(r"\D", "", api_symbol)
        listing_year = extract_listing_year("a", company_symbol)
        company_type = get_a_company_type(api_symbol)
        for statement_type, title in STATEMENT_TITLES.items():
            try:
                df = call_a_report(statement_type, api_symbol, company_type, listing_year)
            except Exception as exc:
                fetch_warnings.append(f"{statement_type}: {exc}")
                df = pd.DataFrame()
            fetch_warnings.extend(
                f"{statement_type}: {warning}" for warning in df.attrs.get("fetch_warnings", [])
            )
            raw_reports.append(df)
            tables.append(normalize_report_dataframe(df, statement_type, title, years_limit))
        if not any(not report.empty for report in raw_reports):
            raise RuntimeError("All A-share financial statement requests failed")
        company = {
            "market": "a",
            "symbol": company_symbol,
            "displaySymbol": display_symbol,
            "name": extract_company_name(*raw_reports),
        }
        source = "AKShare Eastmoney A-share financial report APIs"
    else:
        api_symbol, display_symbol = normalize_hk_symbol(args.symbol)
        listing_year = extract_listing_year("hk", api_symbol)
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

    filter_tables_from_year(tables, listing_year)
    years = merge_years(tables, years_limit)
    payload = {
        "company": company,
        "years": years,
        "unit": "AKShare 原始单位",
        "tables": tables,
        "highlights": build_highlights(tables, years),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "listingYear": listing_year,
        "partial": bool(fetch_warnings),
        "fetchWarnings": fetch_warnings,
    }
    emit(payload)
