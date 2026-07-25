from .runtime import *  # noqa: F401,F403
from .common import emit, normalize_a_symbol, normalize_hk_symbol


def classify_announcement(title: str) -> Dict[str, Any]:
    normalized = re.sub(r"\s+", "", title)
    if re.search(
        r"翌日披露报表|月报表|证券变动月报表|通知信函|展示文件|委任代表表格",
        normalized,
    ):
        return {
            "category": "例行披露",
            "importance": "routine",
            "isRoutine": True,
            "impactHint": "例行披露，默认折叠；通常不代表经营基本面变化。",
        }
    if (
        re.search(r"年度报告|中期报告|半年度报告|季度报告|年报|中报|季报", normalized)
        and "说明会" not in normalized
    ):
        return {
            "category": "定期报告",
            "importance": "high",
            "isRoutine": False,
            "impactHint": "核心财务披露，建议与上一报告期及市场预期对比。",
        }
    if re.search(r"业绩预告|业绩快报|业绩修正", normalized):
        return {
            "category": "业绩预告",
            "importance": "high",
            "isRoutine": False,
            "impactHint": "可能改变盈利预期，关注预告区间、原因和后续修正。",
        }
    if re.search(r"权益分派|利润分配|分红|派息|派发|回购|购回", normalized):
        return {
            "category": "分红回购",
            "importance": "medium",
            "isRoutine": False,
            "impactHint": "影响股东回报、流通股本或每股指标。",
        }
    if re.search(
        r"增持|减持|股权激励|员工持股|股份发行|配股|供股|可转债|股票期权|限售股|股本变动",
        normalized,
    ):
        return {
            "category": "股权变动",
            "importance": "high",
            "isRoutine": False,
            "impactHint": "可能影响控制权、流通股本、稀释比例或管理层激励。",
        }
    if re.search(
        r"融资|借款|贷款|授信|债券|票据|担保|抵押|质押|财务资助",
        normalized,
    ):
        return {
            "category": "融资债务",
            "importance": "high",
            "isRoutine": False,
            "impactHint": "可能改变有息负债、融资成本、到期结构或或有负债。",
        }
    if re.search(r"收购|并购|出售|处置|投资|合资|子公司|资产重组|分拆", normalized):
        return {
            "category": "并购投资",
            "importance": "high",
            "isRoutine": False,
            "impactHint": "可能改变资产结构、资本开支、商誉或未来盈利来源。",
        }
    if re.search(r"关联交易|关连交易|关联方|关连人士", normalized):
        return {
            "category": "关联交易",
            "importance": "high",
            "isRoutine": False,
            "impactHint": "关注交易定价、公允性、资金占用及利益输送风险。",
        }
    if re.search(r"重大合同|中标|订单|项目|特许经营|经营数据", normalized):
        return {
            "category": "经营事项",
            "importance": "medium",
            "isRoutine": False,
            "impactHint": "可能影响收入兑现、订单能见度或资本投入。",
        }
    if re.search(
        r"董事会|监事会|股东大会|董事变更|监事变更|高级管理人员|管理层|核数师|审计师",
        normalized,
    ):
        return {
            "category": "治理人事",
            "importance": "medium",
            "isRoutine": False,
            "impactHint": "关注治理结构、关键人员和审计机构变化。",
        }
    if re.search(
        r"风险提示|风险警示|可能被|退市风险|诉讼|仲裁|处罚|调查|违约|减值|审计意见|保留意见|持续经营",
        normalized,
    ):
        return {
            "category": "风险事项",
            "importance": "high",
            "isRoutine": False,
            "impactHint": "可能涉及损失确认、合规、偿债或持续经营风险。",
        }
    return {
        "category": "其他",
        "importance": "medium",
        "isRoutine": False,
        "impactHint": "尚未匹配明确事件类型，建议结合标题和原文判断影响。",
    }


def announcement_category(title: str) -> str:
    return str(classify_announcement(title)["category"])


def handle_announcements(args: argparse.Namespace) -> None:
    market = args.market
    if market == "a":
        _, display_symbol = normalize_a_symbol(args.symbol)
        symbol = re.sub(r"\D", "", args.symbol)
        cninfo_market = "沪深京"
    else:
        symbol, display_symbol = normalize_hk_symbol(args.symbol)
        cninfo_market = "港股"

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=max(7, min(args.days, 180)))
    try:
        df = ak.stock_zh_a_disclosure_report_cninfo(
            symbol=symbol,
            market=cninfo_market,
            keyword="",
            category="",
            start_date=start_date.strftime("%Y%m%d"),
            end_date=end_date.strftime("%Y%m%d"),
        )
    except KeyError as exc:
        if "公告标题" in str(exc):
            df = pd.DataFrame(columns=["代码", "简称", "公告标题", "公告时间", "公告链接"])
        else:
            raise

    items = []
    company_name = display_symbol
    if df is not None and not df.empty:
        for _, row in df.iterrows():
            title = str(row.get("公告标题", "")).strip()
            url = str(row.get("公告链接", "")).strip()
            published_at = str(row.get("公告时间", "")).strip()
            row_name = str(row.get("简称", "")).strip()
            if row_name and row_name.lower() != "nan":
                company_name = row_name
            if not title or not url or not published_at:
                continue
            classification = classify_announcement(title)
            announcement_match = re.search(r"announcementId=([^&]+)", url)
            key = announcement_match.group(1) if announcement_match else f"{published_at}:{title}"
            items.append(
                {
                    "key": key,
                    "market": market,
                    "symbol": symbol,
                    "displaySymbol": display_symbol,
                    "companyName": company_name,
                    "title": title,
                    **classification,
                    "publishedAt": published_at,
                    "url": url,
                    "source": "AKShare CNInfo disclosure API",
                }
            )

    emit(
        {
            "company": {
                "market": market,
                "symbol": symbol,
                "displaySymbol": display_symbol,
                "name": company_name,
            },
            "items": items,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": "AKShare CNInfo disclosure API",
        }
    )
