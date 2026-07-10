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

def label_key(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", str(value).upper()).strip("_")


LABEL_MAP = {
    "TOTAL_ASSETS": "资产总计",
    "TOTAL_LIABILITIES": "负债合计",
    "TOTAL_EQUITY": "所有者权益合计",
    "TOTAL_PARENT_EQUITY": "归属于母公司股东权益",
    "MONETARYFUNDS": "货币资金",
    "MONETARY_FUNDS": "货币资金",
    "INVENTORY": "存货",
    "ACCOUNTS_RECE": "应收账款",
    "NOTE_ACCOUNTS_RECE": "应收票据及应收账款",
    "NOTE_RECE": "应收票据",
    "OTHER_RECE": "其他应收款",
    "TOTAL_OTHER_RECE": "其他应收款合计",
    "INTEREST_RECE": "应收利息",
    "PREPAYMENT": "预付款项",
    "TOTAL_CURRENT_ASSETS": "流动资产合计",
    "CURRENT_ASSET_BALANCE": "流动资产调整项",
    "CURRENT_ASSET_OTHER": "流动资产其他项目",
    "TOTAL_NONCURRENT_ASSETS": "非流动资产合计",
    "NONCURRENT_ASSET_BALANCE": "非流动资产调整项",
    "NONCURRENT_ASSET_OTHER": "非流动资产其他项目",
    "NONCURRENT_ASSET_1YEAR": "一年内到期的非流动资产",
    "FIXED_ASSET": "固定资产",
    "CIP": "在建工程",
    "PROJECT_MATERIAL": "工程物资",
    "INVEST_REALESTATE": "投资性房地产",
    "INTANGIBLE_ASSET": "无形资产",
    "GOODWILL": "商誉",
    "DEVELOP_EXPENSE": "开发支出",
    "LONG_PREPAID_EXPENSE": "长期待摊费用",
    "DEFER_TAX_ASSET": "递延所得税资产",
    "LONG_EQUITY_INVEST": "长期股权投资",
    "FVTPL_FINASSET": "以公允价值计量且其变动计入当期损益的金融资产",
    "TRADE_FINASSET_NOTFVTPL": "交易性金融资产",
    "AVAILABLE_SALE_FINASSET": "可供出售金融资产",
    "OTHER_EQUITY_INVEST": "其他权益工具投资",
    "OTHER_EQUITY_OTHER": "其他权益工具投资其他项目",
    "OTHER_EQUITY_TOOL": "其他权益工具",
    "OTHER_NONCURRENT_FINASSET": "其他非流动金融资产",
    "OTHER_CURRENT_ASSET": "其他流动资产",
    "OTHER_NONCURRENT_ASSET": "其他非流动资产",
    "CONTRACT_ASSET": "合同资产",
    "BUY_RESALE_FINASSET": "买入返售金融资产",
    "CREDITOR_INVEST": "债权投资",
    "OTHER_CREDITOR_INVEST": "其他债权投资",
    "FINANCE_RECE": "长期应收款",
    "LEND_FUND": "拆出资金",
    "LOAN_ADVANCE": "发放贷款及垫款",
    "ASSET_BALANCE": "资产调整项",
    "ASSET_OTHER": "资产其他项目",
    "TOTAL_CURRENT_LIAB": "流动负债合计",
    "CURRENT_LIAB_BALANCE": "流动负债调整项",
    "CURRENT_LIAB_OTHER": "流动负债其他项目",
    "OTHER_CURRENT_LIAB": "其他流动负债",
    "TOTAL_NONCURRENT_LIAB": "非流动负债合计",
    "NONCURRENT_LIAB_BALANCE": "非流动负债调整项",
    "NONCURRENT_LIAB_OTHER": "非流动负债其他项目",
    "OTHER_NONCURRENT_LIAB": "其他非流动负债",
    "NONCURRENT_LIAB_1YEAR": "一年内到期的非流动负债",
    "ACCOUNTS_PAYABLE": "应付账款",
    "NOTE_PAYABLE": "应付票据",
    "NOTE_ACCOUNTS_PAYABLE": "应付票据及应付账款",
    "OTHER_PAYABLE": "其他应付款",
    "TOTAL_OTHER_PAYABLE": "其他应付款合计",
    "ADVANCE_RECEIVABLES": "预收款项",
    "CONTRACT_LIAB": "合同负债",
    "STAFF_SALARY_PAYABLE": "应付职工薪酬",
    "TAX_PAYABLE": "应交税费",
    "INTEREST_PAYABLE": "应付利息",
    "DIVIDEND_PAYABLE": "应付股利",
    "SHORT_LOAN": "短期借款",
    "LONG_LOAN": "长期借款",
    "BOND_PAYABLE": "应付债券",
    "LONG_PAYABLE": "长期应付款",
    "LONG_STAFFSALARY_PAYABLE": "长期应付职工薪酬",
    "SPECIAL_PAYABLE": "专项应付款",
    "LEASE_LIAB": "租赁负债",
    "DEFER_TAX_LIAB": "递延所得税负债",
    "DEFER_INCOME": "递延收益",
    "FVTPL_FINLIAB": "以公允价值计量且其变动计入当期损益的金融负债",
    "TRADE_FINLIAB_NOTFVTPL": "交易性金融负债",
    "LIAB_BALANCE": "负债调整项",
    "LIAB_OTHER": "负债其他项目",
    "ACCEPT_DEPOSIT_INTERBANK": "吸收存款及同业存放",
    "ACCEPT_DEPOSIT_INTERBANK_ADD": "吸收存款及同业存放增加额",
    "DEPOSIT_INTERBANK_ADD": "客户存款和同业存放款项净增加额",
    "PBC_INTERBANK_ADD": "向央行借款及同业存放增加额",
    "EQUITY_BALANCE": "所有者权益调整项",
    "PARENT_EQUITY_BALANCE": "归属于母公司股东权益",
    "PARENT_EQUITY_OTHER": "归属于母公司股东权益其他项目",
    "MINORITY_EQUITY": "少数股东权益",
    "SHARE_CAPITAL": "股本",
    "CAPITAL_RESERVE": "资本公积",
    "SURPLUS_RESERVE": "盈余公积",
    "SPECIAL_RESERVE": "专项储备",
    "GENERAL_RISK_RESERVE": "一般风险准备",
    "TREASURY_SHARES": "库存股",
    "PREFERRED_SHARES": "优先股",
    "PERPETUAL_BOND": "永续债",
    "PREFERRED_SHARES_PAYBALE": "应付优先股",
    "PERPETUAL_BOND_PAYBALE": "应付永续债",
    "UNASSIGN_RPOFIT": "未分配利润",
    "EQUITY_OTHER": "所有者权益其他项目",
    "OTHER_COMPRE_INCOME": "其他综合收益",
    "TOTAL_LIAB_EQUITY": "负债和所有者权益总计",
    "USERIGHT_ASSET": "使用权资产",
    "OPERATE_INCOME": "营业收入",
    "TOTAL_OPERATE_INCOME": "营业总收入",
    "INTEREST_INCOME": "利息收入",
    "FEE_COMMISSION_INCOME": "手续费及佣金收入",
    "TOTAL_OPERATE_COST": "营业总成本",
    "OPERATE_COST": "营业成本",
    "INTEREST_EXPENSE": "利息支出",
    "FEE_COMMISSION_EXPENSE": "手续费及佣金支出",
    "RESEARCH_EXPENSE": "研发费用",
    "NET_CONTRACT_RESERVE": "提取保险责任准备金净额",
    "OPERATE_TAX_ADD": "税金及附加",
    "SALE_EXPENSE": "销售费用",
    "MANAGE_EXPENSE": "管理费用",
    "FINANCE_EXPENSE": "财务费用",
    "FE_INTEREST_EXPENSE": "其中：利息费用",
    "FE_INTEREST_INCOME": "其中：利息收入",
    "ASSET_IMPAIRMENT_LOSS": "资产减值损失",
    "ASSET_IMPAIRMENT_INCOME": "资产减值收益",
    "CREDIT_IMPAIRMENT_INCOME": "信用减值收益",
    "FAIRVALUE_CHANGE_INCOME": "公允价值变动收益",
    "INVEST_INCOME": "投资收益",
    "INVEST_JOINT_INCOME": "对联营企业和合营企业的投资收益",
    "ASSET_DISPOSAL_INCOME": "资产处置收益",
    "NONCURRENT_DISPOSAL_LOSS": "非流动资产处置损失",
    "OTHER_INCOME": "其他收益",
    "TOC_OTHER": "营业总成本其他项目",
    "OPERATE_PROFIT": "营业利润",
    "OPERATE_PROFIT_BALANCE": "营业利润调整项",
    "NONBUSINESS_INCOME": "营业外收入",
    "NONBUSINESS_EXPENSE": "营业外支出",
    "EFFECT_TP_OTHER": "利润总额其他项目",
    "TOTAL_PROFIT": "利润总额",
    "TOTAL_PROFIT_BALANCE": "利润总额调整项",
    "INCOME_TAX": "所得税费用",
    "NETPROFIT": "净利润",
    "CONTINUED_NETPROFIT": "持续经营净利润",
    "DISCONTINUED_NETPROFIT": "终止经营净利润",
    "PARENT_NETPROFIT": "归属于母公司股东的净利润",
    "MINORITY_INTEREST": "少数股东损益",
    "BASIC_EPS": "基本每股收益",
    "DILUTED_EPS": "稀释每股收益",
    "DEDUCT_PARENT_NETPROFIT": "扣非归母净利润",
    "TOTAL_COMPRE_INCOME": "综合收益总额",
    "PARENT_TCI": "归属于母公司股东的综合收益总额",
    "MINORITY_TCI": "归属于少数股东的综合收益总额",
    "PARENT_OCI": "归属于母公司股东的其他综合收益",
    "MINORITY_OCI": "归属于少数股东的其他综合收益",
    "ABLE_OCI": "可重分类进损益的其他综合收益",
    "UNABLE_OCI": "不能重分类进损益的其他综合收益",
    "AFA_FAIRVALUE_CHANGE": "可供出售金融资产公允价值变动",
    "CREDITOR_FAIRVALUE_CHANGE": "债权投资公允价值变动",
    "OTHERRIGHT_FAIRVALUE_CHANGE": "其他权益工具投资公允价值变动",
    "RIGHTLAW_ABLE_OCI": "权益法下可转损益的其他综合收益",
    "SETUP_PROFIT_CHANGE": "重新计量设定受益计划变动额",
    "ACF_END_INCOME": "现金流量套期储备",
    "CONVERT_DIFF": "外币财务报表折算差额",
    "SALES_SERVICES": "销售商品、提供劳务收到的现金",
    "RECEIVE_INTEREST_COMMISSION": "收到利息、手续费及佣金的现金",
    "RECEIVE_TAX_REFUND": "收到的税费返还",
    "RECEIVE_OTHER_OPERATE": "收到其他与经营活动有关的现金",
    "OPERATE_INFLOW_OTHER": "经营活动现金流入其他项目",
    "OPERATE_INFLOW_BALANCE": "经营活动现金流入调整项",
    "TOTAL_OPERATE_INFLOW": "经营活动现金流入小计",
    "BUY_SERVICES": "购买商品、接受劳务支付的现金",
    "LOAN_ADVANCE_ADD": "客户贷款及垫款净增加额",
    "PAY_INTEREST_COMMISSION": "支付利息、手续费及佣金的现金",
    "PAY_STAFF_CASH": "支付给职工以及为职工支付的现金",
    "PAY_ALL_TAX": "支付的各项税费",
    "PAY_OTHER_OPERATE": "支付其他与经营活动有关的现金",
    "OPERATE_OUTFLOW_OTHER": "经营活动现金流出其他项目",
    "OPERATE_OUTFLOW_BALANCE": "经营活动现金流出调整项",
    "TOTAL_OPERATE_OUTFLOW": "经营活动现金流出小计",
    "NETCASH_OPERATE": "经营活动现金流量净额",
    "OPERATE_NETCASH_BALANCE": "经营活动现金流量净额调整项",
    "NETCASH_INVEST": "投资活动现金流量净额",
    "WITHDRAW_INVEST": "收回投资收到的现金",
    "RECEIVE_INVEST_INCOME": "取得投资收益收到的现金",
    "DISPOSAL_LONG_ASSET": "处置固定资产、无形资产和其他长期资产收回的现金净额",
    "DISPOSAL_SUBSIDIARY_OTHER": "处置子公司及其他营业单位收到的现金净额",
    "RECEIVE_OTHER_INVEST": "收到其他与投资活动有关的现金",
    "INVEST_INFLOW_OTHER": "投资活动现金流入其他项目",
    "INVEST_INFLOW_BALANCE": "投资活动现金流入调整项",
    "TOTAL_INVEST_INFLOW": "投资活动现金流入小计",
    "CONSTRUCT_LONG_ASSET": "购建固定资产、无形资产和其他长期资产支付的现金",
    "INVEST_PAY_CASH": "投资支付的现金",
    "OBTAIN_SUBSIDIARY_OTHER": "取得子公司及其他营业单位支付的现金净额",
    "PAY_OTHER_INVEST": "支付其他与投资活动有关的现金",
    "INVEST_OUTFLOW_OTHER": "投资活动现金流出其他项目",
    "INVEST_OUTFLOW_BALANCE": "投资活动现金流出调整项",
    "TOTAL_INVEST_OUTFLOW": "投资活动现金流出小计",
    "INVEST_NETCASH_BALANCE": "投资活动现金流量净额调整项",
    "NETCASH_FINANCE": "筹资活动现金流量净额",
    "ACCEPT_INVEST_CASH": "吸收投资收到的现金",
    "SUBSIDIARY_ACCEPT_INVEST": "子公司吸收少数股东投资收到的现金",
    "RECEIVE_LOAN_CASH": "取得借款收到的现金",
    "RECEIVE_OTHER_FINANCE": "收到其他与筹资活动有关的现金",
    "ISSUE_BOND": "发行债券收到的现金",
    "FINANCE_INFLOW_BALANCE": "筹资活动现金流入调整项",
    "TOTAL_FINANCE_INFLOW": "筹资活动现金流入小计",
    "PAY_DEBT_CASH": "偿还债务支付的现金",
    "ASSIGN_DIVIDEND_PORFIT": "分配股利、利润或偿付利息支付的现金",
    "SUBSIDIARY_PAY_DIVIDEND": "子公司支付给少数股东的股利、利润",
    "PAY_OTHER_FINANCE": "支付其他与筹资活动有关的现金",
    "FINANCE_OUTFLOW_OTHER": "筹资活动现金流出其他项目",
    "FINANCE_OUTFLOW_BALANCE": "筹资活动现金流出调整项",
    "TOTAL_FINANCE_OUTFLOW": "筹资活动现金流出小计",
    "FINANCE_NETCASH_BALANCE": "筹资活动现金流量净额调整项",
    "RATE_CHANGE_EFFECT": "汇率变动对现金及现金等价物的影响",
    "CCE_ADD": "现金及现金等价物净增加额",
    "CCE_ADD_BALANCE": "现金及现金等价物净增加额调整项",
    "BEGIN_CCE": "期初现金及现金等价物余额",
    "END_CCE": "期末现金及现金等价物余额",
    "ASSET_IMPAIRMENT": "资产减值准备",
    "FA_IR_DEPR": "固定资产折旧、油气资产折耗、生产性生物资产折旧",
    "OILGAS_BIOLOGY_DEPR": "油气资产折耗、生产性生物资产折旧",
    "IA_AMORTIZE": "无形资产摊销",
    "LPE_AMORTIZE": "长期待摊费用摊销",
    "DISPOSAL_LONGASSET_LOSS": "处置长期资产损失",
    "FA_SCRAP_LOSS": "固定资产报废损失",
    "FAIRVALUE_CHANGE_LOSS": "公允价值变动损失",
    "INVEST_LOSS": "投资损失",
    "DEFER_TAX": "递延所得税",
    "DT_ASSET_REDUCE": "递延所得税资产减少",
    "DT_LIAB_ADD": "递延所得税负债增加",
    "INVENTORY_REDUCE": "存货减少",
    "OPERATE_RECE_REDUCE": "经营性应收项目减少",
    "OPERATE_PAYABLE_ADD": "经营性应付项目增加",
    "OPERATE_NETCASH_OTHERNOTE": "经营活动现金流量净额补充资料其他项目",
    "OPERATE_NETCASH_BALANCENOTE": "经营活动现金流量净额补充资料调整项",
    "NETCASH_OPERATENOTE": "经营活动现金流量净额补充资料",
    "END_CASH": "期末现金余额",
    "BEGIN_CASH": "期初现金余额",
    "END_CASH_EQUIVALENTS": "期末现金等价物余额",
    "BEGIN_CASH_EQUIVALENTS": "期初现金等价物余额",
    "CCE_ADDNOTE": "现金及现金等价物净增加额补充资料",
    "END_CCE_BALANCE": "期末现金及现金等价物余额调整项",
    "USERIGHT_ASSET_AMORTIZE": "使用权资产摊销",
    "UNINVOLVE_INVESTFIN_OTHER": "不涉及现金收支的投资和筹资活动其他项目",
    "OTHER": "其他项目",
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
    key = label_key(column)
    return key.endswith("_YOY") or any(pattern in lowered for pattern in META_PATTERNS)


def label_for(column: Any) -> str:
    text = str(column).strip()
    upper = label_key(text)
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
            source_item = str(column).strip()
            rows.append({"item": label_for(column), "sourceItem": source_item, "values": values})
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
        label = label_for(item_name)
        values = {year: clean_value(record.get(column)) for column, year in year_columns}
        if value_score(values.values()) == 0:
            continue
        rows.append({"item": label, "sourceItem": item_name, "values": values})

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
        rows.append({"item": label_for(item_name), "sourceItem": item_name, "values": values})
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

    peers_parser = subparsers.add_parser("peers")
    peers_parser.add_argument("--market", choices=["a", "hk"], required=True)
    peers_parser.add_argument("--symbol", required=True)
    peers_parser.add_argument("--limit", type=int, default=20)
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
            elif args.command == "peers":
                handle_peers(args)
            else:
                emit_error("UNKNOWN_COMMAND", f"Unknown command: {args.command}")
    except Exception as exc:
        emit_error("AKSHARE_REQUEST_FAILED", str(exc), traceback.format_exc())


if __name__ == "__main__":
    main()
