from .runtime import *  # noqa: F401,F403
from .common import clean_value, emit, first_existing_column, normalize_a_symbol, normalize_hk_symbol


def float_or_none(value: Any) -> Optional[float]:
    cleaned = clean_value(value)
    if isinstance(cleaned, (int, float)) and not isinstance(cleaned, bool):
        return float(cleaned)
    return None


def key_value_lookup(df: "pd.DataFrame", candidates: Iterable[str]) -> Optional[str]:
    if df is None or df.empty:
        return None
    normalized_candidates = [normalize_lookup_key(candidate) for candidate in candidates]
    for _, row in df.iterrows():
        if len(row.index) < 2:
            continue
        key = normalize_lookup_key(row.iloc[0])
        if key in normalized_candidates:
            value = str(row.iloc[1]).strip()
            if value and value.lower() != "nan":
                return value
    for candidate in candidates:
        column = first_existing_column(df, [candidate])
        if column:
            value = str(df.iloc[0].get(column, "")).strip()
            if value and value.lower() != "nan":
                return value
    return None


def normalize_lookup_key(value: Any) -> str:
    return re.sub(r"[\s:_-]+", "", str(value).strip().lower())


def row_lookup(row: "pd.Series", candidates: Iterable[str]) -> Any:
    lower_map = {str(column).lower(): column for column in row.index}
    for candidate in candidates:
        if candidate in row.index:
            return row.get(candidate)
        lowered = candidate.lower()
        if lowered in lower_map:
            return row.get(lower_map[lowered])
    return None


def normalized_market_list(value: str) -> List[str]:
    raw_markets = [item.strip().lower() for item in value.split(",") if item.strip()]
    if not raw_markets or "all" in raw_markets:
        return ["a", "hk"]
    return [market for market in raw_markets if market in {"a", "hk"}]


SCREENER_A_INDEX_SCOPES = {
    "a:000300": ("000300", "沪深300"),
    "a:000001": ("000001", "上证指数"),
    "a:000688": ("000688", "科创50"),
    "a:000905": ("000905", "中证500"),
}


def latest_metric_row(frame: "pd.DataFrame", annual_only: bool = True) -> Optional["pd.Series"]:
    if frame is None or frame.empty:
        return None
    df = frame.copy()
    date_column = first_existing_column(df, ["日期", "REPORT_DATE", "report_date", "date"])
    if date_column:
        df["_metric_date"] = pd.to_datetime(df[date_column], errors="coerce")
        df = df.dropna(subset=["_metric_date"]).sort_values("_metric_date", ascending=False)
        annual_df = df[df[date_column].astype(str).str.contains("12-31", na=False)]
        if annual_only and not annual_df.empty:
            return annual_df.iloc[0]
        if not df.empty:
            return df.iloc[0]
    return frame.iloc[0]


def normalize_screener_spot_row(
    row: "pd.Series", market: str, max_pe: float, require_pe: bool
) -> Optional[Dict[str, Any]]:
    code = str(row_lookup(row, ["代码", "code", "symbol", "SECURITY_CODE"]) or "").strip()
    code_digits = re.sub(r"\D", "", code)
    if not code_digits:
        return None
    if market == "hk":
        symbol, display_symbol = normalize_hk_symbol(code_digits)
        pe = float_or_none(row_lookup(row, ["市盈率", "市盈率-动态", "pe", "PE"]))
    else:
        symbol = code_digits
        display_symbol = normalize_a_symbol(symbol)[1]
        pe = float_or_none(row_lookup(row, ["市盈率-动态", "市盈率", "动态市盈率", "pe", "per"]))
    if require_pe and (pe is None or pe <= 0 or pe > max_pe):
        return None
    return {
        "market": market,
        "symbol": symbol,
        "displaySymbol": display_symbol,
        "name": str(row_lookup(row, ["名称", "中文名称", "name", "SECURITY_NAME_ABBR"]) or display_symbol).strip(),
        "latestPrice": float_or_none(row_lookup(row, ["最新价", "最新", "trade", "latestPrice"])),
        "changePercent": float_or_none(row_lookup(row, ["涨跌幅", "changepercent", "changePercent"])),
        "pe": pe,
        "marketCapBillion": market_cap_billion_from_row(row),
    }


def pe_from_price_and_eps(price: Optional[float], eps: Optional[float]) -> Optional[float]:
    if price is None or eps is None or eps <= 0:
        return None
    return round(price / eps, 4)


def market_cap_billion_from_row(row: "pd.Series") -> Optional[float]:
    raw = float_or_none(row_lookup(row, ["总市值", "总市值(元)", "mktcap", "marketCap"]))
    if raw is None or raw <= 0:
        return None
    # Sina index constituent mktcap is reported in ten-thousand CNY.
    if raw > 100000:
        return round(raw / 10000, 4)
    return round(raw / 100000000, 4)


def is_bank_candidate(candidate: Dict[str, Any]) -> bool:
    name = str(candidate.get("name") or "").lower()
    symbol = str(candidate.get("symbol") or "")
    display_symbol = str(candidate.get("displaySymbol") or "")
    industry = str(candidate.get("industry") or candidate.get("industryName") or "").lower()
    bank_keywords = ["银行", "bank", "banco"]
    if any(keyword in name or keyword in industry for keyword in bank_keywords):
        return True
    a_bank_symbols = {
        "000001", "002142", "002807", "002839", "002936", "002948", "002958", "002966",
        "600000", "600015", "600016", "600036", "600908", "600919", "600926", "600928",
        "601009", "601077", "601128", "601166", "601169", "601187", "601229", "601288",
        "601328", "601398", "601577", "601658", "601818", "601838", "601860", "601916",
        "601939", "601963", "601988", "601997", "601998", "603323"
    }
    hk_bank_symbols = {
        "00005", "00011", "00023", "00235", "00939", "01288", "01398", "01963",
        "02356", "02388", "03968", "03988", "06138", "06818"
    }
    return symbol in a_bank_symbols or symbol in hk_bank_symbols or display_symbol.split(".")[0] in a_bank_symbols


def call_with_retries(loader: Any, retries: int = 3, delay_seconds: float = 0.7) -> Any:
    last_error: Optional[Exception] = None
    for attempt_index in range(retries):
        try:
            return loader()
        except Exception as exc:
            last_error = exc
            if attempt_index < retries - 1:
                time.sleep(delay_seconds * (attempt_index + 1))
    raise last_error or RuntimeError("Request failed")


def fetch_a_latest_price_sina(symbol: str) -> Optional[float]:
    display_symbol = normalize_a_symbol(symbol)[1].lower().replace(".", "")
    today = datetime.now()
    frame = call_with_retries(
        lambda: ak.stock_zh_a_daily(
            symbol=display_symbol,
            start_date=(today - timedelta(days=30)).strftime("%Y%m%d"),
            end_date=today.strftime("%Y%m%d"),
            adjust="",
        )
    )
    if frame is None or frame.empty:
        return None
    return float_or_none(frame.iloc[-1].get("close"))


HK_FALLBACK_CANDIDATES = [
    ("00001", "长和"),
    ("00002", "中电控股"),
    ("00005", "汇丰控股"),
    ("00388", "香港交易所"),
    ("00669", "创科实业"),
    ("00688", "中国海外发展"),
    ("00700", "腾讯控股"),
    ("00883", "中国海洋石油"),
    ("00939", "建设银行"),
    ("00941", "中国移动"),
    ("00992", "联想集团"),
    ("01024", "快手-W"),
    ("01088", "中国神华"),
    ("01109", "华润置地"),
    ("01211", "比亚迪股份"),
    ("01299", "友邦保险"),
    ("01398", "工商银行"),
    ("01810", "小米集团-W"),
    ("01919", "中远海控"),
    ("02020", "安踏体育"),
    ("02313", "申洲国际"),
    ("02318", "中国平安"),
    ("02331", "李宁"),
    ("02628", "中国人寿"),
    ("02899", "紫金矿业"),
    ("03690", "美团-W"),
    ("03988", "中国银行"),
    ("06862", "海底捞"),
    ("09618", "京东集团-SW"),
    ("09988", "阿里巴巴-W"),
]


HK_INDEX_SCOPE_CANDIDATES = {
    "hk:hsi": HK_FALLBACK_CANDIDATES,
    "hk:hstech": [
        ("00700", "腾讯控股"),
        ("09988", "阿里巴巴-W"),
        ("03690", "美团-W"),
        ("01810", "小米集团-W"),
        ("09618", "京东集团-SW"),
        ("01024", "快手-W"),
        ("09888", "百度集团-SW"),
        ("09999", "网易-S"),
        ("00268", "金蝶国际"),
        ("00285", "比亚迪电子"),
        ("00981", "中芯国际"),
        ("01347", "华虹半导体"),
        ("02015", "理想汽车-W"),
        ("09866", "蔚来-SW"),
        ("09868", "小鹏汽车-W"),
        ("06618", "京东健康"),
        ("06690", "海尔智家"),
        ("09626", "哔哩哔哩-W"),
        ("02382", "舜宇光学科技"),
        ("03888", "金山软件"),
    ],
}


def hk_fallback_candidates_frame() -> "pd.DataFrame":
    return pd.DataFrame([{"代码": code, "中文名称": name} for code, name in HK_FALLBACK_CANDIDATES])


def hk_scope_candidates_frame(scope: str) -> "pd.DataFrame":
    rows = HK_INDEX_SCOPE_CANDIDATES.get(scope, HK_FALLBACK_CANDIDATES)
    return pd.DataFrame([{"代码": code, "中文名称": name} for code, name in rows])


def fetch_hk_latest_price_daily(symbol: str) -> Optional[float]:
    frame = call_with_retries(lambda: ak.stock_hk_daily(symbol=normalize_hk_symbol(symbol)[0], adjust=""))
    if frame is None or frame.empty:
        return None
    return float_or_none(frame.iloc[-1].get("close"))


def fetch_a_screen_metrics(
    symbol: str, annual_only: bool, latest_price: Optional[float]
) -> Tuple[Optional[float], Optional[float], Optional[str], str]:
    attempts = [
        (
            "AKShare stock_financial_analysis_indicator_em",
            lambda: ak.stock_financial_analysis_indicator_em(
                symbol=normalize_a_symbol(symbol)[1], indicator="按报告期"
            ),
            ["JROA", "总资产净利润率(%)", "总资产利润率(%)", "ROA", "roa"],
            ["EPSJB", "加权每股收益(元)", "摊薄每股收益(元)", "基本每股收益", "BASIC_EPS", "EPS"],
        ),
        (
            "AKShare stock_financial_analysis_indicator Sina fallback",
            lambda: ak.stock_financial_analysis_indicator(
                symbol=symbol, start_year=str(max(1990, datetime.now().year - 3))
            ),
            ["总资产净利润率(%)", "总资产利润率(%)", "ROA", "roa"],
            ["加权每股收益(元)", "摊薄每股收益(元)", "基本每股收益", "BASIC_EPS", "EPS"],
        ),
    ]
    last_error: Optional[Exception] = None
    for source, loader, roa_columns, eps_columns in attempts:
        try:
            frame = call_with_retries(loader)
            row = latest_metric_row(frame, annual_only)
            if row is None:
                continue
            roa = float_or_none(row_lookup(row, roa_columns))
            eps = float_or_none(row_lookup(row, eps_columns))
            pe = pe_from_price_and_eps(latest_price, eps)
            report_date = clean_value(row_lookup(row, ["日期", "REPORT_DATE", "date"]))
            return roa, pe, str(report_date)[:10] if report_date else None, source
        except Exception as exc:
            last_error = exc
    raise last_error or RuntimeError("A-share financial metrics unavailable")


def fetch_hk_screen_metrics(
    symbol: str, annual_only: bool, latest_price: Optional[float]
) -> Tuple[Optional[float], Optional[float], Optional[str], str]:
    frame = call_with_retries(lambda: ak.stock_financial_hk_analysis_indicator_em(symbol=symbol, indicator="年度"))
    row = latest_metric_row(frame, annual_only)
    if row is None:
        return None, None, None, "AKShare stock_financial_hk_analysis_indicator_em"
    roa = float_or_none(row_lookup(row, ["ROA", "roa"]))
    eps = float_or_none(row_lookup(row, ["EPS_TTM", "BASIC_EPS", "DILUTED_EPS", "EPS", "每股收益"]))
    pe = pe_from_price_and_eps(latest_price, eps)
    report_date = clean_value(row_lookup(row, ["REPORT_DATE", "日期", "date"]))
    return roa, pe, str(report_date)[:10] if report_date else None, "AKShare stock_financial_hk_analysis_indicator_em"


def load_screener_spot_candidates(market: str, max_pe: float) -> Tuple[List[Dict[str, Any]], str, bool]:
    attempts = [
        (
            "AKShare stock_hk_spot_em" if market == "hk" else "AKShare stock_zh_a_spot_em",
            ak.stock_hk_spot_em if market == "hk" else ak.stock_zh_a_spot_em,
            True,
        ),
        (
            "AKShare stock_hk_spot Sina fallback" if market == "hk" else "AKShare stock_zh_a_spot Sina fallback",
            ak.stock_hk_spot if market == "hk" else ak.stock_zh_a_spot,
            False,
        ),
    ]
    if market == "a":
        attempts.append(("AKShare stock_info_a_code_name fallback", ak.stock_info_a_code_name, False))
    else:
        attempts.append(("Built-in major HK candidates fallback", hk_fallback_candidates_frame, False))
    last_error: Optional[Exception] = None
    frame: "pd.DataFrame" = pd.DataFrame()
    source = ""
    require_pe = True
    for candidate_source, loader, candidate_require_pe in attempts:
        for attempt_index in range(3):
            try:
                frame = loader()
                if frame is not None and not frame.empty:
                    source = candidate_source
                    require_pe = candidate_require_pe
                    break
            except Exception as exc:
                last_error = exc
                if attempt_index < 2:
                    time.sleep(0.8 * (attempt_index + 1))
        if source:
            break
    if frame is None or frame.empty:
        raise last_error or RuntimeError("No screener spot candidates returned")
    candidates = []
    for _, row in frame.iterrows():
        item = normalize_screener_spot_row(row, market, max_pe, require_pe)
        if item:
            candidates.append(item)
    candidates.sort(key=lambda item: (item.get("pe") is None, item.get("pe") or 0))
    return candidates, source, require_pe


def load_screener_scope_candidates(scope: str, max_pe: float) -> Optional[Tuple[List[Dict[str, Any]], str, bool]]:
    normalized_scope = scope.strip().lower()
    if not normalized_scope or normalized_scope == "all":
        return None
    if normalized_scope in SCREENER_A_INDEX_SCOPES:
        index_code, index_name = SCREENER_A_INDEX_SCOPES[normalized_scope]
        frame = ak.index_stock_cons_sina(symbol=index_code)
        has_pe = any(str(column).lower() in {"per", "pe", "市盈率", "市盈率-动态"} for column in frame.columns)
        candidates = []
        for _, row in frame.iterrows():
            item = normalize_screener_spot_row(row, "a", max_pe, has_pe)
            if item:
                candidates.append(item)
        candidates.sort(key=lambda item: (item.get("pe") is None, item.get("pe") or 0))
        return candidates, f"AKShare index_stock_cons_sina {index_name}", has_pe
    if normalized_scope in HK_INDEX_SCOPE_CANDIDATES:
        frame = hk_scope_candidates_frame(normalized_scope)
        candidates = []
        for _, row in frame.iterrows():
            item = normalize_screener_spot_row(row, "hk", max_pe, False)
            if item:
                candidates.append(item)
        return candidates, f"Built-in {normalized_scope.upper()} candidates", False
    return None


def handle_screener(args: argparse.Namespace) -> None:
    min_roa = float(args.min_roa)
    max_pe = float(args.max_pe)
    limit = max(1, min(int(args.limit), 300))
    max_candidates = max(1, min(int(args.max_candidates), 800))
    min_market_cap_billion = float(args.min_market_cap_billion or 0)
    request_gap_ms = max(0, min(int(args.request_gap_ms), 10000))
    annual_only = not bool(args.latest_period)
    pe_only = bool(args.pe_only)
    exclude_banks = bool(args.exclude_banks)
    markets = normalized_market_list(args.markets)
    fetched_at = datetime.now(timezone.utc).isoformat()
    items: List[Dict[str, Any]] = []
    warnings: List[str] = []
    scanned_candidates = 0
    sources: List[str] = []

    scoped = load_screener_scope_candidates(args.scope, max_pe)
    market_batches = []
    if scoped:
        market_batches.append(scoped)
    else:
        for market in markets:
            try:
                candidates, spot_source, spot_has_pe = load_screener_spot_candidates(market, max_pe)
                market_batches.append((candidates, spot_source, spot_has_pe))
            except Exception as exc:
                warnings.append(f"{market} 行情候选读取失败: {exc}")
                continue

    for candidates, spot_source, spot_has_pe in market_batches:
        sources.append(spot_source)
        selected_candidates = candidates[:max_candidates]
        scanned_candidates += len(selected_candidates)
        for candidate_index, candidate in enumerate(selected_candidates):
            if len(items) >= limit:
                break
            needs_metric_pe = pe_only and candidate.get("pe") is None
            if (not pe_only or needs_metric_pe) and candidate_index > 0 and request_gap_ms > 0:
                time.sleep(request_gap_ms / 1000)
            if min_market_cap_billion > 0:
                market_cap = candidate.get("marketCapBillion")
                if market_cap is None or market_cap < min_market_cap_billion:
                    continue
            if exclude_banks and is_bank_candidate(candidate):
                continue
            market = candidate["market"]
            if pe_only:
                pe = candidate.get("pe")
                metric_source = spot_source
                report_date = None
                if pe is None:
                    try:
                        if market == "a" and candidate.get("latestPrice") is None:
                            candidate["latestPrice"] = fetch_a_latest_price_sina(candidate["symbol"])
                        if market == "hk" and candidate.get("latestPrice") is None:
                            candidate["latestPrice"] = fetch_hk_latest_price_daily(candidate["symbol"])
                        if market == "hk":
                            _, pe, report_date, metric_source = fetch_hk_screen_metrics(
                                candidate["symbol"], annual_only, candidate.get("latestPrice")
                            )
                        else:
                            _, pe, report_date, metric_source = fetch_a_screen_metrics(
                                candidate["symbol"], annual_only, candidate.get("latestPrice")
                            )
                        if metric_source not in sources:
                            sources.append(metric_source)
                    except Exception as exc:
                        warnings.append(f"{candidate['displaySymbol']} PE 读取失败: {exc}")
                        continue
                if pe is None or pe <= 0 or pe > max_pe:
                    continue
                items.append(
                    {
                        **candidate,
                        "pe": pe,
                        "roa": None,
                        "reportDate": report_date,
                        "source": metric_source,
                    }
                )
                continue
            try:
                if market == "a" and candidate.get("latestPrice") is None:
                    candidate["latestPrice"] = fetch_a_latest_price_sina(candidate["symbol"])
                if market == "hk" and candidate.get("latestPrice") is None:
                    candidate["latestPrice"] = fetch_hk_latest_price_daily(candidate["symbol"])
                if market == "hk":
                    roa, calculated_pe, report_date, metric_source = fetch_hk_screen_metrics(
                        candidate["symbol"], annual_only, candidate.get("latestPrice")
                    )
                else:
                    roa, calculated_pe, report_date, metric_source = fetch_a_screen_metrics(
                        candidate["symbol"], annual_only, candidate.get("latestPrice")
                    )
                if metric_source not in sources:
                    sources.append(metric_source)
            except Exception as exc:
                warnings.append(f"{candidate['displaySymbol']} ROA 读取失败: {exc}")
                continue
            pe = candidate.get("pe") if spot_has_pe else calculated_pe
            if pe is None or pe <= 0 or pe > max_pe:
                continue
            if roa is None or roa < min_roa:
                continue
            items.append(
                {
                    **candidate,
                    "pe": pe,
                    "roa": roa,
                    "reportDate": report_date,
                    "source": metric_source,
                }
            )

    items.sort(key=lambda item: (-(item.get("roa") or 0), item.get("pe") or 999999))
    emit(
        {
            "items": items[:limit],
            "params": {
                "markets": markets,
                "minRoa": min_roa,
                "maxPe": max_pe,
                "limit": limit,
                "maxCandidates": max_candidates,
                "scope": args.scope,
                "minMarketCapBillion": min_market_cap_billion,
                "requestGapMs": request_gap_ms,
                "annualOnly": annual_only,
                "peOnly": pe_only,
                "excludeBanks": exclude_banks,
            },
            "summary": {
                "matched": len(items[:limit]),
                "scannedCandidates": scanned_candidates,
                "warnings": len(warnings),
            },
            "warnings": warnings[:80],
            "fetchedAt": fetched_at,
            "source": " + ".join(sources) if sources else "AKShare screener",
        }
    )
