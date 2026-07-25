from .runtime import *  # noqa: F401,F403
from .common import clean_value, emit, first_existing_column, normalize_a_symbol, normalize_hk_symbol, text_contains


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
