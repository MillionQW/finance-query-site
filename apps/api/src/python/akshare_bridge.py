import argparse
import contextlib
import json
import math
import re
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
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

    return {"type": statement_type, "title": title, "years": years, "rows": sorted_rows(statement_type, rows)}


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


def announcement_category(title: str) -> str:
    normalized = re.sub(r"\s+", "", title)
    if re.search(r"年度报告|年报", normalized) and "说明会" not in normalized:
        return "年报"
    if re.search(r"业绩预告|业绩快报|业绩修正", normalized):
        return "业绩预告"
    if re.search(r"权益分派|利润分配|分红|派息|派发", normalized):
        return "权益分派"
    if "董事会" in normalized:
        return "董事会"
    if re.search(r"风险提示|风险警示|可能被|退市风险", normalized):
        return "风险提示"
    return "其他"


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
                    "category": announcement_category(title),
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


def normalize_etf_symbol(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value).split(".")[0])
    return digits.zfill(6)[-6:]


def etf_display_symbol(symbol: str) -> str:
    return f"{symbol}.SH" if symbol.startswith("5") else f"{symbol}.SZ"


def handle_etf_market(_: argparse.Namespace) -> None:
    frame = ak.fund_etf_spot_em()
    quotes: List[Dict[str, Any]] = []
    for _, row in frame.iterrows():
        symbol = normalize_etf_symbol(row.get("代码"))
        if not symbol.strip("0"):
            continue
        exchange = "sh" if symbol.startswith("5") else "sz"
        discount_rate = numeric_or_none(row.get("基金折价率"))
        quotes.append(
            {
                "symbol": symbol,
                "displaySymbol": etf_display_symbol(symbol),
                "name": str(row.get("名称", symbol)).strip(),
                "exchange": exchange,
                "latestPrice": numeric_or_none(row.get("最新价")),
                "iopv": numeric_or_none(row.get("IOPV实时估值")),
                "premiumRate": -discount_rate if discount_rate is not None else None,
                "changeAmount": numeric_or_none(row.get("涨跌额")),
                "changePercent": numeric_or_none(row.get("涨跌幅")),
                "volume": numeric_or_none(row.get("成交量")),
                "amount": numeric_or_none(row.get("成交额")),
                "open": numeric_or_none(row.get("开盘价")),
                "high": numeric_or_none(row.get("最高价")),
                "low": numeric_or_none(row.get("最低价")),
                "previousClose": numeric_or_none(row.get("昨收")),
                "amplitude": numeric_or_none(row.get("振幅")),
                "turnoverRate": numeric_or_none(row.get("换手率")),
                "latestShares": numeric_or_none(row.get("最新份额")),
                "marketCap": numeric_or_none(row.get("总市值")),
                "dataDate": str(row.get("数据日期", ""))[:10] or None,
                "quoteUpdatedAt": clean_value(row.get("更新时间")),
                "source": "AKShare fund_etf_spot_em",
            }
        )
    emit(quotes)


def handle_etf_history(args: argparse.Namespace) -> None:
    symbol = normalize_etf_symbol(args.symbol)
    years = max(1, min(int(args.years), 10))
    today = datetime.now()
    start_date = f"{today.year - years}{today.strftime('%m%d')}"
    end_date = today.strftime("%Y%m%d")
    source = "AKShare fund_etf_hist_em"
    try:
        frame = ak.fund_etf_hist_em(
            symbol=symbol,
            period="daily",
            start_date=start_date,
            end_date=end_date,
            adjust="",
        )
    except Exception:
        source = "AKShare fund_etf_hist_sina fallback"
        sina_symbol = f"sh{symbol}" if symbol.startswith("5") else f"sz{symbol}"
        frame = ak.fund_etf_hist_sina(symbol=sina_symbol)
        if not frame.empty:
            date_column = "date" if "date" in frame.columns else "日期"
            frame = frame[
                pd.to_datetime(frame[date_column], errors="coerce")
                >= pd.to_datetime(start_date, format="%Y%m%d")
            ]
    points: List[Dict[str, Any]] = []
    previous_close: Optional[float] = None
    for _, row in frame.iterrows():
        close = numeric_or_none(row.get("收盘", row.get("close")))
        change_amount = numeric_or_none(row.get("涨跌额"))
        change_percent = numeric_or_none(row.get("涨跌幅"))
        if source.endswith("fallback") and close is not None and previous_close:
            change_amount = close - previous_close
            change_percent = (close / previous_close - 1) * 100
        points.append(
            {
                "date": str(row.get("日期", row.get("date", "")))[:10],
                "open": numeric_or_none(row.get("开盘", row.get("open"))),
                "close": close,
                "high": numeric_or_none(row.get("最高", row.get("high"))),
                "low": numeric_or_none(row.get("最低", row.get("low"))),
                "volume": numeric_or_none(row.get("成交量", row.get("volume"))),
                "amount": numeric_or_none(row.get("成交额")),
                "amplitude": numeric_or_none(row.get("振幅")),
                "changePercent": change_percent,
                "changeAmount": change_amount,
                "turnoverRate": numeric_or_none(row.get("换手率")),
            }
        )
        if close is not None:
            previous_close = close
    emit(
        {
            "symbol": symbol,
            "points": points,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": source,
        }
    )


def handle_etf_valuation(args: argparse.Namespace) -> None:
    symbol = normalize_etf_symbol(args.symbol)
    overview = ak.fund_overview_em(symbol=symbol)
    fetched_at = datetime.now(timezone.utc).isoformat()
    source = "AKShare fund_overview_em + index_csindex_all + stock_zh_index_value_csindex"
    if overview.empty:
        emit({
            "symbol": symbol,
            "trackingIndexName": None,
            "trackingIndexCode": None,
            "peTotalShares": None,
            "peCalculatedShares": None,
            "valuationDate": None,
            "available": False,
            "unavailableReason": "未获取到基金基本概况",
            "fetchedAt": fetched_at,
            "source": source,
        })
        return

    tracking_name = clean_value(overview.iloc[0].get("跟踪标的"))
    if not tracking_name or tracking_name == "该基金无跟踪标的":
        emit({
            "symbol": symbol,
            "trackingIndexName": tracking_name,
            "trackingIndexCode": None,
            "peTotalShares": None,
            "peCalculatedShares": None,
            "valuationDate": None,
            "available": False,
            "unavailableReason": "该 ETF 没有可用的跟踪指数",
            "fetchedAt": fetched_at,
            "source": source,
        })
        return

    catalog = ak.index_csindex_all()
    exact = catalog[
        (catalog["指数全称"].astype(str).str.strip() == tracking_name)
        | (catalog["指数简称"].astype(str).str.strip() == tracking_name)
        | ((catalog["指数简称"].astype(str).str.strip() + "指数") == tracking_name)
    ]
    if len(exact) != 1:
        emit({
            "symbol": symbol,
            "trackingIndexName": tracking_name,
            "trackingIndexCode": None,
            "peTotalShares": None,
            "peCalculatedShares": None,
            "valuationDate": None,
            "available": False,
            "unavailableReason": "跟踪标的无法唯一匹配中证指数",
            "fetchedAt": fetched_at,
            "source": source,
        })
        return

    index_code = str(exact.iloc[0]["指数代码"]).strip().zfill(6)
    valuation = ak.stock_zh_index_value_csindex(symbol=index_code)
    valuation["日期"] = pd.to_datetime(valuation["日期"], errors="coerce")
    valuation = valuation.dropna(subset=["日期"]).sort_values("日期", ascending=False)
    if valuation.empty:
        raise ValueError(f"中证指数 {index_code} 暂无估值数据")
    latest = valuation.iloc[0]
    emit({
        "symbol": symbol,
        "trackingIndexName": tracking_name,
        "trackingIndexCode": index_code,
        "peTotalShares": numeric_or_none(latest.get("市盈率1")),
        "peCalculatedShares": numeric_or_none(latest.get("市盈率2")),
        "valuationDate": latest["日期"].date().isoformat(),
        "available": numeric_or_none(latest.get("市盈率1")) is not None,
        "unavailableReason": None,
        "fetchedAt": fetched_at,
        "source": source,
    })


INDEX_CATALOG = [
    ("cn", "000001", "000001.SH", "上证指数", "核心宽基"),
    ("cn", "000300", "000300.CSI", "沪深300", "核心宽基"),
    ("cn", "000905", "000905.CSI", "中证500", "核心宽基"),
    ("cn", "000852", "000852.CSI", "中证1000", "核心宽基"),
    ("cn", "000510", "000510.CSI", "中证A500", "核心宽基"),
    ("cn", "399001", "399001.SZ", "深证成指", "成长与科技"),
    ("cn", "399006", "399006.SZ", "创业板指", "成长与科技"),
    ("cn", "000688", "000688.SH", "科创50", "成长与科技"),
    ("bj", "899050", "899050.BJ", "北证50", "北交所"),
    ("hk", "HSI", "HSI.HK", "恒生指数", "港股"),
    ("hk", "HSTECH", "HSTECH.HK", "恒生科技指数", "港股"),
    ("hk", "HSCEI", "HSCEI.HK", "恒生中国企业指数", "港股"),
]


def handle_index_market(_: argparse.Namespace) -> None:
    frames = []
    for group in ["沪深重要指数", "上证系列指数", "深证系列指数", "中证系列指数"]:
        try:
            frames.append(ak.stock_zh_index_spot_em(symbol=group))
        except Exception:
            pass
    cn_frame = pd.concat(frames, ignore_index=True).drop_duplicates(subset=["代码", "名称"]) if frames else pd.DataFrame()
    try:
        sina_cn = ak.stock_zh_index_spot_sina()
        cn_frame = pd.concat([cn_frame, sina_cn], ignore_index=True).drop_duplicates(subset=["代码", "名称"])
    except Exception:
        pass
    try:
        hk_frame = ak.stock_hk_index_spot_em()
    except Exception:
        hk_frame = ak.stock_hk_index_spot_sina()
    quotes = []
    for market, symbol, display_symbol, name, category in INDEX_CATALOG:
        frame = hk_frame if market == "hk" else cn_frame
        if frame.empty:
            continue
        code_col = "代码"
        normalized_codes = frame[code_col].astype(str).str.strip().str.upper().str.replace(r"^(SH|SZ|BJ)", "", regex=True)
        exact = frame[normalized_codes == symbol]
        if exact.empty:
            exact = frame[frame["名称"].astype(str).str.strip() == name]
        if exact.empty:
            continue
        row = exact.iloc[0]
        quotes.append({
            "market": market, "symbol": symbol, "key": f"{market}:{symbol}",
            "displaySymbol": display_symbol, "name": name, "category": category,
            "latestPrice": numeric_or_none(row.get("最新价")),
            "changeAmount": numeric_or_none(row.get("涨跌额")),
            "changePercent": numeric_or_none(row.get("涨跌幅")),
            "volume": numeric_or_none(row.get("成交量")), "amount": numeric_or_none(row.get("成交额")),
            "open": numeric_or_none(row.get("今开", row.get("开盘价"))),
            "high": numeric_or_none(row.get("最高", row.get("最高价"))),
            "low": numeric_or_none(row.get("最低", row.get("最低价"))),
            "previousClose": numeric_or_none(row.get("昨收")),
            "quoteUpdatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "AKShare stock_hk_index_spot_em" if market == "hk" else "AKShare stock_zh_index_spot_em",
        })
    emit(quotes)


def handle_index_history(args: argparse.Namespace) -> None:
    years = max(1, min(int(args.years), 20))
    today = datetime.now()
    start_date = f"{today.year - years}{today.strftime('%m%d')}"
    end_date = today.strftime("%Y%m%d")
    fallback_symbol = f"hk{args.symbol}" if args.market == "hk" else (
        f"sh{args.symbol}" if args.provider_symbol.startswith("csi") else args.provider_symbol
    )
    attempts = []
    if args.market == "hk":
        attempts = [
            ("AKShare stock_hk_index_daily_em", lambda: ak.stock_hk_index_daily_em(symbol=args.provider_symbol), False),
            ("AKShare stock_zh_index_daily_tx Tencent fallback", lambda: ak.stock_zh_index_daily_tx(symbol=fallback_symbol, start_date=start_date, end_date=end_date), False),
            ("AKShare stock_hk_index_daily_sina fallback", lambda: ak.stock_hk_index_daily_sina(symbol=args.provider_symbol), False),
        ]
    else:
        if args.provider_symbol.startswith("csi"):
            attempts.append(("AKShare stock_zh_index_hist_csindex", lambda: ak.stock_zh_index_hist_csindex(symbol=args.symbol, start_date=start_date, end_date=end_date), False))
        else:
            attempts.append(("AKShare stock_zh_index_daily_em", lambda: ak.stock_zh_index_daily_em(symbol=args.provider_symbol, start_date=start_date, end_date=end_date), False))
        attempts.extend([
            ("AKShare stock_zh_index_daily_tx Tencent fallback", lambda: ak.stock_zh_index_daily_tx(symbol=fallback_symbol, start_date=start_date, end_date=end_date), True),
            ("AKShare stock_zh_index_daily Sina fallback", lambda: ak.stock_zh_index_daily(symbol=fallback_symbol), False),
        ])

    frame, source, tx_amount_is_volume, errors = pd.DataFrame(), "", False, []
    for candidate_source, loader, candidate_tx_amount_is_volume in attempts:
        try:
            candidate = loader()
            if candidate is not None and not candidate.empty:
                frame, source, tx_amount_is_volume = candidate, candidate_source, candidate_tx_amount_is_volume
                break
            errors.append(f"{candidate_source}: empty response")
        except Exception as exc:
            errors.append(f"{candidate_source}: {type(exc).__name__}")
    if frame.empty:
        raise ValueError(f"{args.name}历史行情数据源暂时不可用，请稍后重试；已尝试中证/东财、腾讯和新浪")
    points, previous_close = [], None
    for _, row in frame.iterrows():
        raw_date = row.get("date", row.get("日期", ""))
        date = str(pd.to_datetime(raw_date, errors="coerce"))[:10]
        if not date or date < f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:]}":
            continue
        close = numeric_or_none(row.get("close", row.get("收盘")))
        change_amount = numeric_or_none(row.get("涨跌额"))
        change_percent = numeric_or_none(row.get("涨跌幅"))
        if change_percent is None and close is not None and previous_close:
            change_amount, change_percent = close - previous_close, (close / previous_close - 1) * 100
        raw_amount = numeric_or_none(row.get("amount", row.get("成交额", row.get("成交金额"))))
        raw_volume = numeric_or_none(row.get("volume", row.get("成交量")))
        if tx_amount_is_volume:
            raw_volume, raw_amount = raw_amount, None
        points.append({"date": date, "open": numeric_or_none(row.get("open", row.get("开盘"))), "close": close,
            "high": numeric_or_none(row.get("high", row.get("最高"))), "low": numeric_or_none(row.get("low", row.get("最低"))),
            "volume": raw_volume, "amount": raw_amount,
            "changePercent": change_percent, "changeAmount": change_amount})
        if close is not None:
            previous_close = close
    emit({"market": args.market, "symbol": args.symbol, "points": points, "fetchedAt": datetime.now(timezone.utc).isoformat(), "source": source})


def handle_index_valuation(args: argparse.Namespace) -> None:
    source = "AKShare stock_zh_index_value_csindex"
    try:
        frame = ak.stock_zh_index_value_csindex(symbol=args.symbol)
    except Exception:
        source = "AKShare stock_zh_index_hist_csindex rolling PE fallback"
        today = datetime.now()
        frame = ak.stock_zh_index_hist_csindex(
            symbol=args.symbol,
            start_date=(today - timedelta(days=30)).strftime("%Y%m%d"),
            end_date=today.strftime("%Y%m%d"),
        ).rename(columns={"滚动市盈率": "市盈率1"})
    frame["日期"] = pd.to_datetime(frame["日期"], errors="coerce")
    frame = frame.dropna(subset=["日期"]).sort_values("日期", ascending=False)
    if frame.empty:
        raise ValueError(f"中证指数 {args.symbol} 暂无估值数据")
    latest = frame.iloc[0]
    pe1 = numeric_or_none(latest.get("市盈率1"))
    emit({
        "market": args.market, "symbol": args.symbol, "name": args.name,
        "peTotalShares": pe1, "peCalculatedShares": numeric_or_none(latest.get("市盈率2")),
        "valuationDate": latest["日期"].date().isoformat(), "available": pe1 is not None,
        "unavailableReason": None if pe1 is not None else "官方估值数据中没有可用的市盈率",
        "fetchedAt": datetime.now(timezone.utc).isoformat(), "source": source,
    })


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AKShare bridge for finance-query-site")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("--q", required=True)
    search_parser.add_argument("--market", choices=["all", "a", "hk"], default="all")

    statements_parser = subparsers.add_parser("statements")
    statements_parser.add_argument("--market", choices=["a", "hk"], required=True)
    statements_parser.add_argument("--symbol", required=True)
    statements_parser.add_argument("--years", type=int, default=0)

    peers_parser = subparsers.add_parser("peers")
    peers_parser.add_argument("--market", choices=["a", "hk"], required=True)
    peers_parser.add_argument("--symbol", required=True)
    peers_parser.add_argument("--limit", type=int, default=20)

    announcements_parser = subparsers.add_parser("announcements")
    announcements_parser.add_argument("--market", choices=["a", "hk"], required=True)
    announcements_parser.add_argument("--symbol", required=True)
    announcements_parser.add_argument("--days", type=int, default=60)

    screener_parser = subparsers.add_parser("screener")
    screener_parser.add_argument("--markets", default="all")
    screener_parser.add_argument("--scope", default="all")
    screener_parser.add_argument("--min-roa", type=float, default=25)
    screener_parser.add_argument("--max-pe", type=float, default=16)
    screener_parser.add_argument("--min-market-cap-billion", type=float, default=0)
    screener_parser.add_argument("--limit", type=int, default=80)
    screener_parser.add_argument("--max-candidates", type=int, default=30)
    screener_parser.add_argument("--request-gap-ms", type=int, default=1000)
    screener_parser.add_argument("--latest-period", action="store_true")
    screener_parser.add_argument("--pe-only", action="store_true")
    screener_parser.add_argument("--exclude-banks", action="store_true")

    subparsers.add_parser("etf-market")

    etf_history_parser = subparsers.add_parser("etf-history")
    etf_history_parser.add_argument("--symbol", required=True)
    etf_history_parser.add_argument("--years", type=int, default=10)
    etf_valuation_parser = subparsers.add_parser("etf-valuation")
    etf_valuation_parser.add_argument("--symbol", required=True)
    subparsers.add_parser("index-market")
    index_history_parser = subparsers.add_parser("index-history")
    index_history_parser.add_argument("--market", choices=["cn", "bj", "hk"], required=True)
    index_history_parser.add_argument("--symbol", required=True)
    index_history_parser.add_argument("--provider-symbol", required=True)
    index_history_parser.add_argument("--name", required=True)
    index_history_parser.add_argument("--years", type=int, default=10)
    index_valuation_parser = subparsers.add_parser("index-valuation")
    index_valuation_parser.add_argument("--market", choices=["cn", "bj", "hk"], required=True)
    index_valuation_parser.add_argument("--symbol", required=True)
    index_valuation_parser.add_argument("--name", required=True)
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
            elif args.command == "announcements":
                handle_announcements(args)
            elif args.command == "screener":
                handle_screener(args)
            elif args.command == "etf-market":
                handle_etf_market(args)
            elif args.command == "etf-history":
                handle_etf_history(args)
            elif args.command == "etf-valuation":
                handle_etf_valuation(args)
            elif args.command == "index-market":
                handle_index_market(args)
            elif args.command == "index-history":
                handle_index_history(args)
            elif args.command == "index-valuation":
                handle_index_valuation(args)
            else:
                emit_error("UNKNOWN_COMMAND", f"Unknown command: {args.command}")
    except Exception as exc:
        emit_error("AKSHARE_REQUEST_FAILED", str(exc), traceback.format_exc())


if __name__ == "__main__":
    main()
