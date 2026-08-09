export const NET_PROFIT_ALIASES = ['归属于母公司股东的净利润', '股东应占溢利', '股东应占盈利', '净利润', '除税后溢利', 'PARENT NETPROFIT', 'NETPROFIT'];
export const EQUITY_ALIASES = ['归属于母公司股东权益', '股东权益', '所有者权益合计', '总权益', '净资产', 'PARENT EQUITY BALANCE', 'EQUITY BALANCE'];
export const TOTAL_ASSET_ALIASES = ['资产总计', '总资产', 'TOTAL ASSETS'];
export const TOTAL_LIABILITY_ALIASES = ['负债合计', '负债总计', '总负债', 'TOTAL LIABILITIES', 'TOTAL LIAB'];
export const CURRENT_ASSET_ALIASES = ['流动资产合计', '流动资产', 'CURRENT ASSET BALANCE', 'TOTAL CURRENT ASSETS'];
export const CURRENT_LIABILITY_ALIASES = ['流动负债合计', '流动负债', 'CURRENT LIAB BALANCE', 'TOTAL CURRENT LIAB', 'TOTAL CURRENT LIABILITIES'];
export const INVENTORY_ALIASES = ['存货', 'INVENTORY'];
export const CASH_ALIASES = ['现金及等价物', '现金及现金等价物', '现金和现金等价物', '货币资金', '现金', 'CASH AND CASH EQUIVALENTS', 'CASH EQUIVALENTS', 'CASH', 'END CCE'];
export const REVENUE_ALIASES = ['营业收入', '营业额', 'OPERATE INCOME'];
export const OPERATING_REVENUE_ALIASES = ['营业收入', '营业额', 'OPERATE INCOME'];
export const TOTAL_OPERATING_REVENUE_ALIASES = ['营业总收入', '营运收入', 'TOTAL OPERATE INCOME'];
export const TOTAL_OPERATING_COST_ALIASES = ['营业总成本', 'TOTAL OPERATE COST'];
export const OPERATING_PROFIT_ALIASES = ['营业利润', '经营溢利', '经营利润', '营运利润', 'OPERATE PROFIT', 'OPERATE PROFIT BALANCE'];
export const TOTAL_PROFIT_ALIASES = ['利润总额', '除税前溢利', '税前利润', 'PROFIT BEFORE TAX', 'TOTAL PROFIT'];
export const INCOME_TAX_ALIASES = ['所得税费用', '所得税', '税项', 'INCOME TAX', 'TAXATION'];
export const DEDUCTED_NET_PROFIT_ALIASES = ['扣除非经常性损益后的净利润', '扣除非经常性损益后的归属于母公司股东的净利润', '扣非归母净利润', 'DEDUCT PARENT NETPROFIT'];
export const RECEIVABLE_ALIASES = ['应收账款', '应收帐款', '应收票据及应收账款', '应收账款及应收票据', 'ACCOUNTS RECE', 'NOTE ACCOUNTS RECE', '应收款项'];
export const ACCOUNTS_PAYABLE_ALIASES = ['应付账款', '应付帐款', '应付票据及应付账款', '应付账款及应付票据', 'ACCOUNTS PAYABLE', 'NOTE ACCOUNTS PAYABLE', '应付款项'];
export const GROSS_PROFIT_ALIASES = ['毛利', '毛利润', 'GROSS PROFIT'];
export const OPERATING_COST_ALIASES = ['营业成本', '销售成本', '收入成本', '主营业务成本', 'OPERATE COST', 'COST OF SALES', 'COST OF REVENUE'];
export const INTEREST_EXPENSE_ALIASES = ['利息支出', '融资成本', 'INTEREST EXPENSE', 'FINANCE COSTS'];
export const SELLING_EXPENSE_ALIASES = ['销售费用', '销售及分销费用', 'SALE EXPENSE'];
export const ADMIN_EXPENSE_ALIASES = ['管理费用', '行政开支', 'MANAGE EXPENSE'];
export const FINANCE_EXPENSE_ALIASES = ['财务费用', '融资成本', 'FINANCE EXPENSE'];
export const NET_ASSET_ALIASES = ['净资产', '所有者权益合计', '股东权益', '总权益', '归属于母公司股东权益', 'PARENT EQUITY BALANCE', 'EQUITY BALANCE'];
export const FIXED_ASSET_ALIASES = ['固定资产', '固定资产净值', '物业厂房及设备', '物业厂房设备', 'FIXED ASSET', 'PROPERTY PLANT EQUIPMENT', 'PROPERTY PLANT AND EQUIPMENT'];
export const LONG_TERM_EQUITY_INVESTMENT_ALIASES = ['长期股权投资', 'LONG EQUITY INVEST', 'LONG TERM EQUITY INVESTMENT'];
export const RESEARCH_EXPENSE_ALIASES = ['研发费用', '研究及开发开支', '研发开支', 'RESEARCH EXPENSE'];
export const DEVELOPMENT_EXPENDITURE_ALIASES = ['开发支出', 'DEVELOP EXPENSE'];
export const GOODWILL_ALIASES = ['商誉', 'GOODWILL'];
export const INTANGIBLE_ASSET_ALIASES = ['无形资产', 'INTANGIBLE ASSET'];
export const IMPAIRMENT_ALIASES = ['资产减值损失', '资产减值收益', '信用减值损失', '信用减值收益', '减值及拨备', 'ASSET IMPAIRMENT LOSS', 'ASSET IMPAIRMENT INCOME', 'CREDIT IMPAIRMENT INCOME'];
export const INTANGIBLE_GOODWILL_ALIASES = [
  ...GOODWILL_ALIASES,
  ...INTANGIBLE_ASSET_ALIASES,
  ...DEVELOPMENT_EXPENDITURE_ALIASES
];

export const HK_ASSOCIATE_JOINT_VENTURE_GROUPS = [
  { label: '联营公司权益', aliases: ['联营公司权益'] },
  { label: '合营公司权益', aliases: ['合营公司权益'] }
];

export const INTEREST_BEARING_DEBT_GROUPS = [
  { label: '短期借款/贷款', aliases: ['短期借款', '短期贷款', 'SHORT LOAN', 'SHORT BORROWING', 'SHORT TERM BORROWING'] },
  { label: '长期借款/贷款', aliases: ['长期借款', '长期贷款', 'LONG LOAN', 'LONG BORROWING', 'LONG TERM BORROWING'] },
  { label: '应付债券', aliases: ['应付债券', '发行债券', 'BOND PAYABLE', 'BONDS PAYABLE'] },
  { label: '租赁负债', aliases: ['租赁负债', '融资租赁负债', 'LEASE LIAB', 'LEASE LIABILITY'] },
  { label: '一年内到期非流动负债', aliases: ['一年内到期的非流动负债', '一年内到期非流动负债', 'NONCURRENT LIAB 1YEAR'] }
];

export const INTEREST_BEARING_DEBT_ALIASES = INTEREST_BEARING_DEBT_GROUPS.flatMap((group) => group.aliases);
export const OPERATING_CASHFLOW_ALIASES = ['经营活动产生的现金流量净额', '经营活动现金流量净额', '经营业务现金净额', 'NETCASH OPERATE'];
export const INVESTING_CASHFLOW_ALIASES = ['投资活动产生的现金流量净额', '投资活动现金流量净额', '投资业务现金净额', 'NETCASH INVEST'];
export const FINANCING_CASHFLOW_ALIASES = ['筹资活动产生的现金流量净额', '筹资活动现金流量净额', '融资业务现金净额', 'NETCASH FINANCE'];
export const CUSTOMER_CASH_RECEIPTS_ALIASES = ['销售商品、提供劳务收到的现金', '销售商品提供劳务收到的现金', '客户合约现金流入', 'SALES SERVICES'];
export const COMBINED_CAPITAL_EXPENDITURE_ALIASES = ['购建固定资产、无形资产和其他长期资产支付的现金', '购建固定资产无形资产和其他长期资产支付的现金', '购买物业厂房及设备支付的现金', '购买固定资产支付的现金', 'CONSTRUCT LONG ASSET'];
export const FIXED_ASSET_CAPEX_ALIASES = ['购建固定资产'];
export const INTANGIBLE_ASSET_CAPEX_ALIASES = ['购建无形资产及其他资产'];
export const CAPITAL_EXPENDITURE_ALIASES = [...COMBINED_CAPITAL_EXPENDITURE_ALIASES, ...FIXED_ASSET_CAPEX_ALIASES, ...INTANGIBLE_ASSET_CAPEX_ALIASES];
export const CASH_EQUIVALENT_INCREASE_ALIASES = ['现金及现金等价物净增加额', 'CCE ADD'];
export const BEGIN_CASH_EQUIVALENT_ALIASES = ['期初现金', '期初现金及现金等价物余额', 'BEGIN CCE', 'BEGIN CASH'];
export const END_CASH_EQUIVALENT_ALIASES = ['期末现金', '期末现金及现金等价物余额', '期末现金及等价物余额', 'END CCE', 'CASH END'];
export const INVESTMENT_CASH_INFLOW_ALIASES = ['投资活动现金流入小计', 'TOTAL INVEST INFLOW'];
export const INVESTMENT_CASH_OUTFLOW_ALIASES = ['投资活动现金流出小计', 'TOTAL INVEST OUTFLOW'];
export const HK_INVESTMENT_CASH_NET_ALIASES = ['投资业务现金净额'];
