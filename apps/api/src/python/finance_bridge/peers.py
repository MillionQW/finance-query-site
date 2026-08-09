from .runtime import *  # noqa: F401,F403
from .common import emit, first_existing_column, normalize_a_symbol, normalize_hk_symbol
from .screener import float_or_none, key_value_lookup, row_lookup


def normalize_a_peer_row(row: "pd.Series", selected_symbol: str, source: str) -> Optional[Dict[str, Any]]:
    code = str(row_lookup(row, ["代码", "code", "symbol"]) or "").strip()
    code_digits = re.sub(r"\D", "", code)
    if not code_digits:
        return None
    _, display_symbol = normalize_a_symbol(code_digits)
    return {
        "market": "a",
        "symbol": code_digits,
        "displaySymbol": display_symbol,
        "name": str(row_lookup(row, ["名称", "name"]) or code_digits).strip(),
        "source": source,
        "latestPrice": float_or_none(row_lookup(row, ["最新价", "trade"])),
        "changePercent": float_or_none(row_lookup(row, ["涨跌幅", "changepercent"])),
        "turnoverRate": float_or_none(row_lookup(row, ["换手率", "turnoverratio"])),
        "pe": float_or_none(row_lookup(row, ["市盈率-动态", "市盈率", "per"])),
        "pb": float_or_none(row_lookup(row, ["市净率", "pb"])),
        "isSelected": code_digits == selected_symbol,
    }


def build_peer_ranking(
    peers: List[Dict[str, Any]],
    selected_symbol: str,
    key: str,
    label: str,
    direction: str,
    unit: str = "",
    positive_only: bool = False,
) -> Dict[str, Any]:
    values = []
    for peer in peers:
        value = peer.get(key)
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            continue
        if positive_only and float(value) <= 0:
            continue
        values.append((peer.get("symbol"), float(value)))

    values.sort(key=lambda item: item[1], reverse=direction == "desc")
    rank = None
    selected_value = None
    for index, (symbol, value) in enumerate(values, start=1):
        if symbol == selected_symbol:
            rank = index
            selected_value = value
            break
    return {
        "key": key,
        "label": label,
        "rank": rank,
        "total": len(values),
        "value": selected_value,
        "unit": unit,
        "direction": direction,
    }


def percentile(values: List[float], ratio: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * ratio
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def build_peer_benchmark(
    peers: List[Dict[str, Any]],
    key: str,
    label: str,
    direction: str,
    unit: str = "",
    positive_only: bool = False,
) -> Dict[str, Any]:
    values = []
    for peer in peers:
        value = peer.get(key)
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            continue
        numeric_value = float(value)
        if positive_only and numeric_value <= 0:
            continue
        values.append(numeric_value)

    return {
        "key": key,
        "label": label,
        "count": len(values),
        "min": min(values) if values else None,
        "q1": percentile(values, 0.25),
        "median": percentile(values, 0.5),
        "q3": percentile(values, 0.75),
        "max": max(values) if values else None,
        "unit": unit,
        "direction": direction,
    }


def empty_peer_payload(
    market: str,
    symbol: str,
    display_symbol: str,
    note: str,
    company_name: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "company": {
            "market": market,
            "symbol": symbol,
            "displaySymbol": display_symbol,
            "name": company_name,
        },
        "industry": None,
        "peers": [],
        "rankings": [],
        "benchmarks": [],
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "AKShare peer comparison",
        "note": note,
    }


def build_peer_payload(
    company_symbol: str,
    display_symbol: str,
    company_name: Optional[str],
    industry_name: Optional[str],
    industry_source: str,
    all_peers: List[Dict[str, Any]],
    limit: int,
    source: str,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    selected_peer = next((peer for peer in all_peers if peer.get("isSelected")), None)
    display_peers = []
    if selected_peer:
        display_peers.append(selected_peer)
    display_peers.extend([peer for peer in all_peers if not peer.get("isSelected")][: max(0, limit - len(display_peers))])

    rankings = [
        build_peer_ranking(all_peers, company_symbol, "changePercent", "涨跌幅", "desc", "%"),
        build_peer_ranking(all_peers, company_symbol, "turnoverRate", "换手率", "desc", "%"),
        build_peer_ranking(all_peers, company_symbol, "pe", "动态市盈率", "asc", "", True),
        build_peer_ranking(all_peers, company_symbol, "pb", "市净率", "asc", "", True),
    ]
    benchmarks = [
        build_peer_benchmark(all_peers, "changePercent", "涨跌幅", "desc", "%"),
        build_peer_benchmark(all_peers, "turnoverRate", "换手率", "desc", "%"),
        build_peer_benchmark(all_peers, "pe", "动态市盈率", "asc", "", True),
        build_peer_benchmark(all_peers, "pb", "市净率", "asc", "", True),
    ]

    return {
        "company": {
            "market": "a",
            "symbol": company_symbol,
            "displaySymbol": display_symbol,
            "name": company_name or (selected_peer.get("name") if selected_peer else None),
        },
        "industry": {
            "name": industry_name,
            "code": None,
            "source": industry_source,
        },
        "peers": display_peers,
        "rankings": rankings,
        "benchmarks": benchmarks,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "note": note if note else (None if all_peers else "AKShare 未返回同行成份。"),
    }


def load_eastmoney_peer_payload(company_symbol: str, display_symbol: str, limit: int) -> Dict[str, Any]:
    source = "AKShare Eastmoney industry board APIs"
    info_df = ak.stock_individual_info_em(symbol=company_symbol, timeout=12)
    company_name = key_value_lookup(info_df, ["股票简称", "证券简称", "简称", "名称"])
    industry_name = key_value_lookup(info_df, ["行业", "所属行业", "行业板块"])
    if not industry_name:
        raise RuntimeError("未能从 AKShare 个股资料识别所属行业")

    cons_df = ak.stock_board_industry_cons_em(symbol=industry_name)
    all_peers = []
    for _, row in cons_df.iterrows():
        peer = normalize_a_peer_row(row, company_symbol, source)
        if peer:
            all_peers.append(peer)

    return build_peer_payload(
        company_symbol,
        display_symbol,
        company_name,
        industry_name,
        "东方财富行业板块",
        all_peers,
        limit,
        source,
    )


def normalize_hint_text(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "").strip().lower())


def collect_cninfo_industry_hints(company_symbol: str) -> Tuple[Optional[str], List[str]]:
    try:
        df = ak.stock_industry_change_cninfo(symbol=company_symbol)
    except Exception:
        return None, []
    if df is None or df.empty:
        return None, []

    company_name = None
    name_column = first_existing_column(df, ["新证券简称", "证券简称", "股票简称", "名称"])
    if name_column:
        value = str(df.iloc[0].get(name_column, "")).strip()
        company_name = value if value and value.lower() != "nan" else None

    hints: List[str] = []
    for _, row in df.iterrows():
        for column in ["行业中类", "行业大类", "行业次类", "行业门类"]:
            value = str(row.get(column, "")).strip()
            if value and value.lower() != "nan" and value not in hints:
                hints.append(value)
    return company_name, hints


def score_sector_name(sector_name: Any, hints: List[str]) -> int:
    sector = normalize_hint_text(sector_name)
    if not sector:
        return 0
    score = 0
    for hint in hints:
        normalized_hint = normalize_hint_text(hint)
        if not normalized_hint:
            continue
        if normalized_hint in sector or sector in normalized_hint:
            score += 100 + len(normalized_hint)
            continue
        common_chars = set(normalized_hint) & set(sector)
        if len(common_chars) >= 2:
            score += len(common_chars)
    return score


def sorted_sina_sector_candidates(hints: List[str]) -> List[Tuple[str, str, str]]:
    candidates: List[Tuple[int, int, str, str, str]] = []
    seen = set()
    for indicator in ["行业", "新浪行业"]:
        try:
            sector_df = ak.stock_sector_spot(indicator=indicator)
        except Exception:
            continue
        for index, row in sector_df.iterrows():
            label = str(row.get("label", "")).strip()
            name = str(row.get("板块", "")).strip()
            if not label or label in seen:
                continue
            seen.add(label)
            candidates.append((score_sector_name(name, hints), int(index), indicator, label, name))

    positives = [item for item in candidates if item[0] > 0]
    if positives:
        positives.sort(key=lambda item: (-item[0], item[1]))
        fallback = sorted([item for item in candidates if item[0] <= 0], key=lambda item: item[1])[:8]
        ordered = positives + fallback
    else:
        ordered = sorted(candidates, key=lambda item: item[1])
    return [(indicator, label, name) for _, _, indicator, label, name in ordered]


def load_sina_peer_payload(
    company_symbol: str,
    display_symbol: str,
    limit: int,
    fallback_note: Optional[str] = None,
) -> Dict[str, Any]:
    source = "AKShare Sina sector APIs"
    company_name, hints = collect_cninfo_industry_hints(company_symbol)
    last_error: Optional[Exception] = None
    for indicator, sector_label, sector_name in sorted_sina_sector_candidates(hints)[:24]:
        try:
            cons_df = ak.stock_sector_detail(sector=sector_label)
        except Exception as exc:
            last_error = exc
            continue

        all_peers = []
        for _, row in cons_df.iterrows():
            peer = normalize_a_peer_row(row, company_symbol, source)
            if peer:
                all_peers.append(peer)
        if any(peer.get("isSelected") for peer in all_peers):
            note = fallback_note
            if note:
                note = f"{note}；已自动切换到新浪行业成份兜底。"
            return build_peer_payload(
                company_symbol,
                display_symbol,
                company_name,
                sector_name,
                f"新浪行业板块（{indicator}）",
                all_peers,
                limit,
                source,
                note,
            )

    detail = f"；最后一次错误：{last_error}" if last_error else ""
    raise RuntimeError(f"未能在 AKShare 新浪行业成份中定位该股票{detail}")


def handle_peers(args: argparse.Namespace) -> None:
    limit = max(5, min(int(args.limit), 50))
    if args.market == "hk":
        symbol, display_symbol = normalize_hk_symbol(args.symbol)
        emit(
            empty_peer_payload(
                "hk",
                symbol,
                display_symbol,
                "港股同行成份接口暂未接入；当前先支持 A 股行业板块同行对比。",
            )
        )
        return

    api_symbol, display_symbol = normalize_a_symbol(args.symbol)
    company_symbol = re.sub(r"\D", "", api_symbol)

    eastmoney_error: Optional[Exception] = None
    try:
        emit(load_eastmoney_peer_payload(company_symbol, display_symbol, limit))
        return
    except Exception as exc:
        eastmoney_error = exc

    try:
        note = f"东方财富行业板块接口暂时不可用：{eastmoney_error}" if eastmoney_error else None
        emit(load_sina_peer_payload(company_symbol, display_symbol, limit, note))
        return
    except Exception as sina_exc:
        emit(
            empty_peer_payload(
                "a",
                company_symbol,
                display_symbol,
                f"同行数据暂时获取失败：东财接口 {eastmoney_error}；新浪行业兜底 {sina_exc}",
            )
        )
