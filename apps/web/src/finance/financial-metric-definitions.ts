import {
  ACCOUNTS_PAYABLE_ALIASES,
  ADMIN_EXPENSE_ALIASES,
  CAPITAL_EXPENDITURE_ALIASES,
  CASH_ALIASES,
  CASH_EQUIVALENT_INCREASE_ALIASES,
  CURRENT_ASSET_ALIASES,
  CURRENT_LIABILITY_ALIASES,
  CUSTOMER_CASH_RECEIPTS_ALIASES,
  DEDUCTED_NET_PROFIT_ALIASES,
  DEVELOPMENT_EXPENDITURE_ALIASES,
  END_CASH_EQUIVALENT_ALIASES,
  EQUITY_ALIASES,
  FINANCE_EXPENSE_ALIASES,
  FIXED_ASSET_ALIASES,
  GROSS_PROFIT_ALIASES,
  GOODWILL_ALIASES,
  HK_INVESTMENT_CASH_NET_ALIASES,
  INCOME_TAX_ALIASES,
  INTEREST_BEARING_DEBT_ALIASES,
  INTEREST_BEARING_DEBT_GROUPS,
  INTEREST_EXPENSE_ALIASES,
  INTANGIBLE_GOODWILL_ALIASES,
  INVENTORY_ALIASES,
  INVESTMENT_CASH_INFLOW_ALIASES,
  INVESTMENT_CASH_OUTFLOW_ALIASES,
  LONG_TERM_EQUITY_INVESTMENT_ALIASES,
  IMPAIRMENT_ALIASES,
  NET_ASSET_ALIASES,
  NET_PROFIT_ALIASES,
  OPERATING_CASHFLOW_ALIASES,
  OPERATING_COST_ALIASES,
  OPERATING_PROFIT_ALIASES,
  OPERATING_REVENUE_ALIASES,
  RECEIVABLE_ALIASES,
  RESEARCH_EXPENSE_ALIASES,
  REVENUE_ALIASES,
  SELLING_EXPENSE_ALIASES,
  TOTAL_ASSET_ALIASES,
  TOTAL_LIABILITY_ALIASES,
  TOTAL_OPERATING_COST_ALIASES,
  TOTAL_OPERATING_REVENUE_ALIASES,
  TOTAL_PROFIT_ALIASES
} from './financial-metric-fields';
import {
  absoluteValue,
  growthGapValue,
  growthRate,
  rowValue,
  safeDivide,
  sumAbsolute
} from './financial-metric-engine';
import type { MetricDefinition, MetricGroupKey } from './financial-metric-types';
import {
  averageBalance,
  averageInvestedCapital,
  cashConversionCycleDetails,
  cashEquivalentIncrease,
  developmentCapitalizationDetails,
  ebitValue,
  freeCashFlowDetails,
  greenblattCapitalDetails,
  incrementalRoicDetails,
  judgmentValue,
  longTermEquityInvestmentValue,
  nopatValue,
  operatingCostDetails,
  previousRowValue,
  rollingCashConversionDetails,
  rollingProfitabilityStatistics,
  sumRows,
  sumRowsContaining
} from './financial-metric-calculations';

export const metricGroups: Array<{ key: MetricGroupKey; label: string }> = [
  { key: 'profitability', label: '盈利能力' },
  { key: 'cashQuality', label: '现金质量' },
  { key: 'growth', label: '成长能力' },
  { key: 'solvency', label: '偿债能力' },
  { key: 'efficiency', label: '营运效率' },
  { key: 'assetQuality', label: '研发与资产' },
  { key: 'judgment', label: '判断指标' }
];

export const definitions: MetricDefinition[] = [
  {
    key: 'roe',
    label: 'ROE（净资产收益率）',
    group: 'profitability',
    formula: '净利润 / 平均股东权益',
    kind: 'percent',
    description: '衡量股东权益产生利润的效率。',
    requirements: [
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        rowValue(context.income, year, NET_PROFIT_ALIASES),
        averageBalance(context, context.balance, year, yearIndex, EQUITY_ALIASES)
      )
  },
  {
    key: 'roa',
    label: 'ROA（总资产收益率）',
    group: 'profitability',
    formula: '净利润 / 平均总资产',
    kind: 'percent',
    description: '衡量资产投入转化为利润的效率。',
    requirements: [
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        rowValue(context.income, year, NET_PROFIT_ALIASES),
        averageBalance(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'roic',
    label: 'ROIC（投入资本回报率）',
    group: 'profitability',
    formula: 'NOPAT / 平均投入资本',
    kind: 'percent',
    description: '衡量公司用股东权益和有息债务等投入资本产生税后经营利润的效率。本系统口径：NOPAT = 息税前利润 × (1 - 有效所得税率)，投入资本 = 股东权益 + 有息负债 - 现金及现金等价物。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '利润总额', table: 'income', aliases: TOTAL_PROFIT_ALIASES },
      { label: '所得税费用', table: 'income', aliases: INCOME_TAX_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES },
      { label: '现金及现金等价物', table: 'balance', aliases: CASH_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        nopatValue(context, year),
        averageInvestedCapital(context, year, yearIndex).average
      )
  },
  {
    key: 'incrementalRoic3y',
    label: '3年增量ROIC',
    group: 'profitability',
    formula: '(本期NOPAT - 三年前NOPAT) / (本期投入资本 - 三年前投入资本)',
    kind: 'percent',
    description: '观察近三年新增投入资本带来的税后经营利润增量。只有投入资本净增加时计算；高且稳定说明企业仍有较强的再投资能力。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '利润总额', table: 'income', aliases: TOTAL_PROFIT_ALIASES },
      { label: '所得税费用', table: 'income', aliases: INCOME_TAX_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES },
      { label: '现金及现金等价物', table: 'balance', aliases: CASH_ALIASES }
    ],
    calculate: (context, _year, yearIndex) => incrementalRoicDetails(context, yearIndex, 3).value
  },
  {
    key: 'averageRoic5y',
    label: '5年平均ROIC',
    group: 'profitability',
    formula: '近5年ROIC算术平均值',
    kind: 'percent',
    description: '用五年平均值过滤单年周期和会计波动，观察企业长期投入资本回报水平。完整计算通常需要至少六年资产负债表数据。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '利润总额', table: 'income', aliases: TOTAL_PROFIT_ALIASES },
      { label: '所得税费用', table: 'income', aliases: INCOME_TAX_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES },
      { label: '现金及现金等价物', table: 'balance', aliases: CASH_ALIASES }
    ],
    calculate: (context, _year, yearIndex) => rollingProfitabilityStatistics(context, yearIndex, 5, 'roic').mean
  },
  {
    key: 'roicVolatility5y',
    label: '5年ROIC波动',
    group: 'profitability',
    formula: '近5年ROIC标准差',
    kind: 'percent',
    description: '衡量投入资本回报的稳定程度，数值越低越稳定。应与五年平均ROIC一起看，避免把稳定的低回报误判为优秀。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '利润总额', table: 'income', aliases: TOTAL_PROFIT_ALIASES },
      { label: '所得税费用', table: 'income', aliases: INCOME_TAX_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES },
      { label: '现金及现金等价物', table: 'balance', aliases: CASH_ALIASES }
    ],
    calculate: (context, _year, yearIndex) =>
      rollingProfitabilityStatistics(context, yearIndex, 5, 'roic').standardDeviation
  },
  {
    key: 'grossMarginVolatility5y',
    label: '5年毛利率波动',
    group: 'profitability',
    formula: '近5年毛利率标准差',
    kind: 'percent',
    description: '观察产品定价、成本转嫁和竞争格局是否稳定。波动突然扩大时，应检查产品结构、原材料价格和行业竞争变化。',
    requirements: [
      { label: '毛利润或营业成本', table: 'income', aliases: [...GROSS_PROFIT_ALIASES, ...OPERATING_COST_ALIASES] },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, _year, yearIndex) =>
      rollingProfitabilityStatistics(context, yearIndex, 5, 'grossMargin').standardDeviation
  },
  {
    key: 'operatingMarginVolatility5y',
    label: '5年营业利润率波动',
    group: 'profitability',
    formula: '近5年营业利润率标准差',
    kind: 'percent',
    description: '观察主营经营利润跨周期的稳定程度。毛利率稳定而营业利润率波动扩大时，通常要进一步检查费用、减值和非主营项目。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, _year, yearIndex) =>
      rollingProfitabilityStatistics(context, yearIndex, 5, 'operatingMargin').standardDeviation
  },
  {
    key: 'greenblattReturnOnCapital',
    label: 'ROC（资本回报率，《股市稳赚》推荐指标）',
    group: 'profitability',
    formula: 'EBIT / (营运资本 + 固定资产净值)',
    kind: 'percent',
    description: '《股市稳赚》神奇公式推荐指标之一，用来衡量好生意。本系统口径：资本回报率 = 息税前利润 EBIT / (营运资本 + 固定资产净值)，其中营运资本 = 流动资产 - 流动负债。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '流动资产', table: 'balance', aliases: CURRENT_ASSET_ALIASES },
      { label: '流动负债', table: 'balance', aliases: CURRENT_LIABILITY_ALIASES },
      { label: '固定资产净值', table: 'balance', aliases: FIXED_ASSET_ALIASES }
    ],
    calculate: (context, year) => {
      const ebit = ebitValue(context, year);
      const capital = greenblattCapitalDetails(context, year).capital;
      return capital !== null && capital > 0 ? safeDivide(ebit, capital) : null;
    }
  },
  {
    key: 'currentRatio',
    label: '流动比率',
    group: 'solvency',
    formula: '流动资产 / 流动负债',
    kind: 'times',
    description: '观察短期资产覆盖短期债务的能力。在2左右比较理想，比率过高：流动资产未能有效利用。比率过低：企业有短期偿债风险。',
    requirements: [
      { label: '流动资产', table: 'balance', aliases: CURRENT_ASSET_ALIASES },
      { label: '流动负债', table: 'balance', aliases: CURRENT_LIABILITY_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.balance, year, CURRENT_ASSET_ALIASES),
        rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES)
      )
  },
  {
    key: 'quickRatio',
    label: '速动比率',
    group: 'solvency',
    formula: '(流动资产 - 存货) / 流动负债',
    kind: 'times',
    description: '剔除存货后观察短期偿债能力。速动比率在1左右，比率过高：流动资产未能有效利用。比率过低：企业有短期偿债风险。',
    requirements: [
      { label: '流动资产', table: 'balance', aliases: CURRENT_ASSET_ALIASES },
      { label: '存货', table: 'balance', aliases: INVENTORY_ALIASES },
      { label: '流动负债', table: 'balance', aliases: CURRENT_LIABILITY_ALIASES }
    ],
    calculate: (context, year) => {
      const currentAssets = rowValue(context.balance, year, CURRENT_ASSET_ALIASES);
      const inventory = rowValue(context.balance, year, INVENTORY_ALIASES);
      const currentLiabilities = rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES);
      const quickAssets = currentAssets !== null && inventory !== null ? currentAssets - inventory : null;
      return safeDivide(quickAssets, currentLiabilities);
    }
  },
  {
    key: 'cashDebtRatio',
    label: '现金债务比',
    group: 'solvency',
    formula: '现金及现金等价物 / 有息负债',
    kind: 'times',
    description: '观察现金对有息债务的覆盖倍数。老唐认为的唯一安全性指标。大于等于1才理想。',
    requirements: [
      { label: '现金及现金等价物', table: 'balance', aliases: CASH_ALIASES },
      { label: '有息负债', table: 'balance', aliases: INTEREST_BEARING_DEBT_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.balance, year, CASH_ALIASES),
        sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total
      )
  },
  {
    key: 'debtRatio',
    label: '有息负债率',
    group: 'solvency',
    formula: '有息负债 / 总资产',
    kind: 'percent',
    description: '观察借款、债券、租赁负债等有息债务占总资产的比例。该指标不等同于资产负债率，应结合行业和现金创造能力判断。',
    requirements: [
      { label: '有息负债', table: 'balance', aliases: INTEREST_BEARING_DEBT_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total,
        rowValue(context.balance, year, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'assetLiabilityRatio',
    label: '资产负债率',
    group: 'solvency',
    formula: '负债合计 / 总资产',
    kind: 'percent',
    description: '观察全部负债对资产的占用程度。金融、地产、零售等行业的合理区间差异较大，优先与同行及公司历史比较。',
    requirements: [
      { label: '负债合计', table: 'balance', aliases: TOTAL_LIABILITY_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.balance, year, TOTAL_LIABILITY_ALIASES),
        rowValue(context.balance, year, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'receivablesToAssets',
    label: '应收/总资产',
    group: 'solvency',
    formula: '所有“应收”科目合计 / 总资产',
    kind: 'percent',
    description: '比值超过30%算有严重问题',
    requirements: [
      { label: '所有“应收”科目', table: 'balance', aliases: [] },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        sumRowsContaining(context.balance, year, '应收').total,
        rowValue(context.balance, year, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'receivableRevenueMonths',
    label: '应收账款余额/月均营业收入',
    group: 'solvency',
    formula: '应收账款余额 / (年度营业收入 / 12)',
    kind: 'times',
    description: '看应收账款相当于几个月的收入。这个比例越小越好。',
    requirements: [
      { label: '应收账款余额', table: 'balance', aliases: RECEIVABLE_ALIASES },
      { label: '营业收入', table: 'income', aliases: OPERATING_REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const annualRevenue = rowValue(context.income, year, REVENUE_ALIASES);
      const monthlyRevenue = annualRevenue === null ? null : annualRevenue / 12;
      return safeDivide(rowValue(context.balance, year, RECEIVABLE_ALIASES), monthlyRevenue);
    }
  },
  {
    key: 'receivableTurnover',
    label: '应收账款周转率',
    group: 'efficiency',
    formula: '营业收入 / 应收账款平均余额',
    kind: 'times',
    description: '观察收入回款相关资产的周转速度。比率越高，说明应收账款在一个年度里转化为现金的次数越多。看营业收入增长的同时，应收账款周转率是否下降了。应收账款周转率下降，说明营业收入的增长，有放松销售政策的因素。反之，营业收入增长，应收账款周转率稳定或提高，说明营业收入的增长可靠，可信赖。',
    requirements: [
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '应收账款', table: 'balance', aliases: RECEIVABLE_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        rowValue(context.income, year, REVENUE_ALIASES),
        averageBalance(context, context.balance, year, yearIndex, RECEIVABLE_ALIASES)
      )
  },
  {
    key: 'inventoryTurnover',
    label: '存货周转率',
    group: 'efficiency',
    formula: '营业成本 / 存货平均余额',
    kind: 'times',
    description: '观察存货转化为销售成本的速度。',
    requirements: [
      { label: '营业成本或毛利润', table: 'income', aliases: [...OPERATING_COST_ALIASES, ...GROSS_PROFIT_ALIASES] },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '存货', table: 'balance', aliases: INVENTORY_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        operatingCostDetails(context, year).costAbs,
        averageBalance(context, context.balance, year, yearIndex, INVENTORY_ALIASES)
      )
  },
  {
    key: 'fixedAssetTurnover',
    label: '固定资产周转率',
    group: 'efficiency',
    formula: '营业收入 / 固定资产净值',
    kind: 'times',
    description: '观察固定资产带来收入的效率。',
    requirements: [
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '固定资产净值', table: 'balance', aliases: FIXED_ASSET_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.income, year, REVENUE_ALIASES),
        rowValue(context.balance, year, FIXED_ASSET_ALIASES)
      )
  },
  {
    key: 'payableTurnover',
    label: '应付账款周转率',
    group: 'efficiency',
    formula: '营业成本 / 应付账款平均余额',
    kind: 'times',
    description: '观察企业支付供应商货款的速度。比率下降可能代表议价能力增强，也可能代表付款压力，需要结合现金、采购和供应商关系判断。',
    requirements: [
      { label: '营业成本或毛利润', table: 'income', aliases: [...OPERATING_COST_ALIASES, ...GROSS_PROFIT_ALIASES] },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '应付账款', table: 'balance', aliases: ACCOUNTS_PAYABLE_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        operatingCostDetails(context, year).costAbs,
        averageBalance(context, context.balance, year, yearIndex, ACCOUNTS_PAYABLE_ALIASES)
      )
  },
  {
    key: 'cashConversionCycle',
    label: '现金循环周期',
    group: 'efficiency',
    formula: '应收天数 + 存货天数 - 应付天数',
    kind: 'days',
    description: '衡量现金从支付采购到销售回款被占用的天数。周期缩短通常代表营运资金效率改善；突然拉长要检查回款、库存和供应链压力。',
    requirements: [
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '营业成本或毛利润', table: 'income', aliases: [...OPERATING_COST_ALIASES, ...GROSS_PROFIT_ALIASES] },
      { label: '应收账款', table: 'balance', aliases: RECEIVABLE_ALIASES },
      { label: '存货', table: 'balance', aliases: INVENTORY_ALIASES },
      { label: '应付账款', table: 'balance', aliases: ACCOUNTS_PAYABLE_ALIASES }
    ],
    calculate: (context, year, yearIndex) => cashConversionCycleDetails(context, year, yearIndex).cycle
  },
  {
    key: 'totalAssetTurnover',
    label: '总资产周转率',
    group: 'efficiency',
    formula: '营业收入 / 平均总资产',
    kind: 'times',
    description: '总资产周转率是综合评价企业全部资产经营质量和利用效率的重要指标。总资产周转率越大，证明同样数量的资产，产生更多的销售收入。',
    requirements: [
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        rowValue(context.income, year, REVENUE_ALIASES),
        averageBalance(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'grossMargin',
    label: '毛利率',
    group: 'profitability',
    formula: '毛利润 / 营业收入',
    kind: 'percent',
    description: '观察主营业务留存的毛利空间。毛利率保持在40%以上的企业，通常具有某种持续竞争优势。',
    requirements: [
      { label: '毛利润或营业成本', table: 'income', aliases: [...GROSS_PROFIT_ALIASES, ...OPERATING_COST_ALIASES] },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const revenue = rowValue(context.income, year, REVENUE_ALIASES);
      const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
      const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
      const grossProfit = directGrossProfit ?? (
        revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
      );
      return safeDivide(grossProfit, revenue);
    }
  },
  {
    key: 'operatingMargin',
    label: '营业利润率',
    group: 'profitability',
    formula: '营业利润 / 营业收入',
    kind: 'percent',
    description: '观察营业利润对收入的留存比例。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.income, year, OPERATING_PROFIT_ALIASES),
        rowValue(context.income, year, REVENUE_ALIASES)
      )
  },
  {
    key: 'tangOperatingMargin',
    label: '老唐营业利润率',
    group: 'profitability',
    formula: '(营业总收入 - 营业总成本) / 营业收入',
    kind: 'percent',
    description: '老唐营业利润不含公允价值变动收益，投资收益，汇兑收益。',
    requirements: [
      { label: '营业总收入', table: 'income', aliases: TOTAL_OPERATING_REVENUE_ALIASES },
      { label: '营业总成本', table: 'income', aliases: TOTAL_OPERATING_COST_ALIASES },
      { label: '营业收入', table: 'income', aliases: OPERATING_REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const totalRevenue = rowValue(context.income, year, TOTAL_OPERATING_REVENUE_ALIASES);
      const totalCost = rowValue(context.income, year, TOTAL_OPERATING_COST_ALIASES);
      const operatingRevenue = rowValue(context.income, year, OPERATING_REVENUE_ALIASES);
      const tangOperatingProfit = totalRevenue !== null && totalCost !== null
        ? totalRevenue - Math.abs(totalCost)
        : null;
      return safeDivide(tangOperatingProfit, operatingRevenue);
    }
  },
  {
    key: 'netMargin',
    label: '净利率',
    group: 'profitability',
    formula: '净利润 / 营业收入',
    kind: 'percent',
    description: '观察净利润对收入的留存比例。',
    requirements: [
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.income, year, NET_PROFIT_ALIASES),
        rowValue(context.income, year, REVENUE_ALIASES)
      )
  },
  {
    key: 'expenseRatio',
    label: '费用率',
    group: 'profitability',
    formula: '(销售费用 + 管理费用 + 财务费用) / 营业收入',
    kind: 'percent',
    description: '观察三费对营业收入的消耗比例。警惕费用率过高或剧烈变化的公司，销售费用过高，说明产品没吸引力。如果管理费用增幅大于营业收入增幅，需查出明细，可能利用管理费用操控报表。',
    requirements: [
      { label: '销售费用', table: 'income', aliases: SELLING_EXPENSE_ALIASES },
      { label: '管理费用', table: 'income', aliases: ADMIN_EXPENSE_ALIASES },
      { label: '财务费用', table: 'income', aliases: FINANCE_EXPENSE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
      const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
      const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
      const revenue = rowValue(context.income, year, REVENUE_ALIASES);
      return safeDivide(sumAbsolute([selling, admin, finance]), revenue);
    }
  },
  {
    key: 'operatingCostRatio',
    label: '营业成本率',
    group: 'profitability',
    formula: '营业成本 / 营业收入',
    kind: 'percent',
    description: '观察营业成本占营业收入的比例。',
    requirements: [
      { label: '营业成本', table: 'income', aliases: OPERATING_COST_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => safeDivide(
      operatingCostDetails(context, year).costAbs,
      rowValue(context.income, year, REVENUE_ALIASES)
    )
  },
  {
    key: 'sellingExpenseRatio',
    label: '销售费用率',
    group: 'profitability',
    formula: '销售费用 / 营业收入',
    kind: 'percent',
    description: '观察销售费用占营业收入的比例。',
    requirements: [
      { label: '销售费用', table: 'income', aliases: SELLING_EXPENSE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => safeDivide(
      absoluteValue(rowValue(context.income, year, SELLING_EXPENSE_ALIASES)),
      rowValue(context.income, year, REVENUE_ALIASES)
    )
  },
  {
    key: 'ebitMargin',
    label: '息税前利润率',
    group: 'profitability',
    formula: '(利息支出 + 营业利润) / 营业收入',
    kind: 'percent',
    description: '按利息支出与营业利润之和衡量息税前利润占营业收入的比例。',
    requirements: [
      { label: '利息支出', table: 'income', aliases: INTEREST_EXPENSE_ALIASES },
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
      const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
      const ebit = interestExpense !== null && operatingProfit !== null ? interestExpense + operatingProfit : null;
      return safeDivide(ebit, rowValue(context.income, year, REVENUE_ALIASES));
    }
  },
  {
    key: 'netAssetCashReturn',
    label: '经营现金资产回报率',
    group: 'profitability',
    formula: '经营活动现金流量净额 / 平均资产',
    kind: 'percent',
    description: '观察经营活动现金流量净额相对于平均总资产的回报水平。',
    requirements: [
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year, yearIndex) => safeDivide(
      rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
      averageBalance(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES)
    )
  },
  {
    key: 'operatingCashConversion',
    label: '经营现金含金量',
    group: 'cashQuality',
    formula: '经营活动现金流量净额 / 净利润',
    kind: 'times',
    description: '观察账面利润转化为经营现金的能力。单年容易受收付款时点影响，应同时查看三年累计值；长期低于1需要检查应收、存货和利润确认。',
    requirements: [
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
        rowValue(context.income, year, NET_PROFIT_ALIASES)
      )
  },
  {
    key: 'cumulativeCashConversion3y',
    label: '3年累计现金含金量',
    group: 'cashQuality',
    formula: '近3年经营现金流合计 / 近3年净利润合计',
    kind: 'times',
    description: '使用三年累计数据过滤单年收付款波动，更适合判断利润是否持续转化为现金。图中每个年份表示截至该年的三年滚动结果。',
    requirements: [
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES }
    ],
    calculate: (context, _year, yearIndex) => rollingCashConversionDetails(context, yearIndex, 3).value
  },
  {
    key: 'freeCashFlow',
    label: '自由现金流',
    group: 'cashQuality',
    formula: '经营活动现金流量净额 - 资本开支',
    kind: 'amount',
    description: '企业维持和扩张长期资产投入后真正留下的现金。本系统以购建固定资产、无形资产和其他长期资产支付的现金近似资本开支。',
    requirements: [
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '资本开支', table: 'cashflow', aliases: CAPITAL_EXPENDITURE_ALIASES }
    ],
    calculate: (context, year) => freeCashFlowDetails(context, year).freeCashFlow
  },
  {
    key: 'freeCashFlowMargin',
    label: '自由现金流率',
    group: 'cashQuality',
    formula: '自由现金流 / 营业收入',
    kind: 'percent',
    description: '观察每一元收入最终留下多少自由现金。收入增长但自由现金流率持续下降，通常代表扩张越来越依赖资本投入或外部融资。',
    requirements: [
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '资本开支', table: 'cashflow', aliases: CAPITAL_EXPENDITURE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        freeCashFlowDetails(context, year).freeCashFlow,
        rowValue(context.income, year, REVENUE_ALIASES)
      )
  },
  {
    key: 'accrualRatio',
    label: '应计利润率',
    group: 'cashQuality',
    formula: '(净利润 - 经营活动现金流量净额) / 平均总资产',
    kind: 'percent',
    description: '衡量利润中尚未转化为现金的部分。长期为正且持续上升，可能意味着应收、存货、资本化或会计估计对利润的影响增强。',
    requirements: [
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES },
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year, yearIndex) => {
      const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
      const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
      const accruals = netProfit !== null && operatingCashflow !== null
        ? netProfit - operatingCashflow
        : null;
      return safeDivide(accruals, averageBalance(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES));
    }
  },
  {
    key: 'deductedProfitRatio',
    label: '扣非利润占比',
    group: 'cashQuality',
    formula: '扣非归母净利润 / 归母净利润',
    kind: 'percent',
    description: '观察利润有多少来自持续主营业务。占比长期偏低或波动很大，要检查政府补助、投资收益、资产处置等非经常项目。',
    requirements: [
      { label: '扣非归母净利润', table: 'income', aliases: DEDUCTED_NET_PROFIT_ALIASES },
      { label: '归母净利润', table: 'income', aliases: NET_PROFIT_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.income, year, DEDUCTED_NET_PROFIT_ALIASES),
        rowValue(context.income, year, NET_PROFIT_ALIASES)
      )
  },
  {
    key: 'cashCollectionRatio',
    label: '销售收现比',
    group: 'cashQuality',
    formula: '销售商品、提供劳务收到的现金 / 营业收入',
    kind: 'percent',
    description: '观察销售收入的回款情况。现金流入通常含增值税，因此不宜机械要求等于100%，重点看历史趋势以及与同行的差异。',
    requirements: [
      { label: '销售商品、提供劳务收到的现金', table: 'cashflow', aliases: CUSTOMER_CASH_RECEIPTS_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.cashflow, year, CUSTOMER_CASH_RECEIPTS_ALIASES),
        rowValue(context.income, year, REVENUE_ALIASES)
      )
  },
  {
    key: 'interestCoverage',
    label: '利息保障倍数',
    group: 'solvency',
    formula: '息税前利润 EBIT / 利息支出',
    kind: 'times',
    description: '直接衡量经营利润覆盖利息的能力。低于1表示当期经营利润不足以覆盖利息；周期性企业应保留更大的安全边际。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '利息支出', table: 'income', aliases: INTEREST_EXPENSE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        ebitValue(context, year),
        absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES))
      )
  },
  {
    key: 'netDebtToOperatingCash',
    label: '净债务/经营现金流',
    group: 'solvency',
    formula: '(有息负债 - 现金及现金等价物) / 经营活动现金流量净额',
    kind: 'times',
    description: '按当前经营现金创造能力估算偿还净债务所需的年数。负值代表现金超过有息负债；经营现金流为负时该指标只作风险提示。',
    requirements: [
      { label: '有息负债', table: 'balance', aliases: INTEREST_BEARING_DEBT_ALIASES },
      { label: '现金及现金等价物', table: 'balance', aliases: CASH_ALIASES },
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES }
    ],
    calculate: (context, year) => {
      const debt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total;
      const cash = rowValue(context.balance, year, CASH_ALIASES);
      const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
      const netDebt = debt !== null && cash !== null ? debt - cash : null;
      return safeDivide(netDebt, operatingCashflow);
    }
  },
  {
    key: 'researchExpenseRatio',
    label: '研发费用率',
    group: 'assetQuality',
    formula: '研发费用 / 营业收入',
    kind: 'percent',
    description: '观察企业当期费用化研发投入强度。高投入不直接等于高产出，应结合收入增长、毛利率和后续产品表现判断。',
    requirements: [
      { label: '研发费用', table: 'income', aliases: RESEARCH_EXPENSE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        absoluteValue(rowValue(context.income, year, RESEARCH_EXPENSE_ALIASES)),
        rowValue(context.income, year, REVENUE_ALIASES)
      )
  },
  {
    key: 'developmentCapitalizationProxy',
    label: '研发资本化代理率',
    group: 'assetQuality',
    formula: '开发支出正增长额 / (研发费用 + 开发支出正增长额)',
    kind: 'percent',
    description: '用开发支出余额的正增长近似当期资本化金额，只作趋势预警；开发项目转入无形资产会令该代理值偏低，不能替代财报附注中的真实资本化率。',
    requirements: [
      { label: '研发费用', table: 'income', aliases: RESEARCH_EXPENSE_ALIASES },
      { label: '开发支出', table: 'balance', aliases: DEVELOPMENT_EXPENDITURE_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      developmentCapitalizationDetails(context, year, yearIndex).value
  },
  {
    key: 'developmentToEquity',
    label: '开发支出/净资产',
    group: 'assetQuality',
    formula: '开发支出 / 股东权益',
    kind: 'percent',
    description: '观察尚未完成或尚未转入无形资产的开发项目占净资产比例。比例过高时，项目失败或减值可能显著影响股东权益。',
    requirements: [
      { label: '开发支出', table: 'balance', aliases: DEVELOPMENT_EXPENDITURE_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        absoluteValue(rowValue(context.balance, year, DEVELOPMENT_EXPENDITURE_ALIASES)),
        rowValue(context.balance, year, EQUITY_ALIASES)
      )
  },
  {
    key: 'goodwillToEquity',
    label: '商誉/净资产',
    group: 'assetQuality',
    formula: '商誉 / 股东权益',
    kind: 'percent',
    description: '观察并购形成的商誉相对股东权益的暴露。商誉本身不等于风险，但比例较高时，一次重大减值可能明显侵蚀净资产。',
    requirements: [
      { label: '商誉', table: 'balance', aliases: GOODWILL_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        absoluteValue(rowValue(context.balance, year, GOODWILL_ALIASES)),
        rowValue(context.balance, year, EQUITY_ALIASES)
      )
  },
  {
    key: 'intangibleGoodwillToAssets',
    label: '商誉及无形资产/总资产',
    group: 'assetQuality',
    formula: '(商誉 + 无形资产 + 开发支出) / 总资产',
    kind: 'percent',
    description: '观察总资产中依赖估值、摊销和未来现金流假设的资产比例。比例高时需进一步查看无形资产构成、使用寿命和减值测试。',
    requirements: [
      { label: '商誉、无形资产或开发支出', table: 'balance', aliases: INTANGIBLE_GOODWILL_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        sumRows(context.balance, year, [{ label: '商誉及无形资产', aliases: INTANGIBLE_GOODWILL_ALIASES }]).total,
        rowValue(context.balance, year, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'impairmentToOperatingProfit',
    label: '减值侵蚀率',
    group: 'assetQuality',
    formula: '资产及信用减值绝对额 / |营业利润|',
    kind: 'percent',
    description: '观察资产减值、信用减值或港股减值拨备相对经营利润的侵蚀程度。不同报表可能以损失或收益列示，因此统一使用绝对额。',
    requirements: [
      { label: '资产减值、信用减值或减值拨备', table: 'income', aliases: IMPAIRMENT_ALIASES },
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        sumRows(context.income, year, [{ label: '减值及拨备', aliases: IMPAIRMENT_ALIASES }]).total,
        absoluteValue(rowValue(context.income, year, OPERATING_PROFIT_ALIASES))
      )
  },
  {
    key: 'internalAssetReturn',
    label: '内部资产收益率',
    group: 'profitability',
    formula: '营业利润 / (总资产 - 长期股权投资)',
    kind: 'percent',
    description: '观察剔除长期股权投资后，企业内部经营资产产生营业利润的效率。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES },
      { label: '长期股权投资', table: 'balance', aliases: LONG_TERM_EQUITY_INVESTMENT_ALIASES }
    ],
    calculate: (context, year) => {
      const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
      const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
      const longTermEquityInvestment = longTermEquityInvestmentValue(context, year);
      const internalAssets = totalAssets !== null && longTermEquityInvestment !== null
        ? totalAssets - longTermEquityInvestment
        : null;
      return safeDivide(operatingProfit, internalAssets);
    }
  },
  {
    key: 'expenseToGrossProfitRatio',
    label: '费用率（毛利润）',
    group: 'profitability',
    formula: '(销售费用 + 管理费用 + 财务费用) / 毛利润',
    kind: 'percent',
    description: '费用率在毛利润的30%内，算优秀企业；30%-70%，仍然是有一定竞争优势的企业；超过70%，关注价值不大。',
    requirements: [
      { label: '销售费用', table: 'income', aliases: SELLING_EXPENSE_ALIASES },
      { label: '管理费用', table: 'income', aliases: ADMIN_EXPENSE_ALIASES },
      { label: '财务费用', table: 'income', aliases: FINANCE_EXPENSE_ALIASES },
      { label: '毛利润或营业成本', table: 'income', aliases: [...GROSS_PROFIT_ALIASES, ...OPERATING_COST_ALIASES] },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
      const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
      const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
      const revenue = rowValue(context.income, year, REVENUE_ALIASES);
      const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
      const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
      const grossProfit = directGrossProfit ?? (
        revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
      );
      return safeDivide(sumAbsolute([selling, admin, finance]), grossProfit);
    }
  },
  {
    key: 'revenueGrowth',
    label: '营业收入增长率',
    group: 'growth',
    formula: '(本期营业收入 - 上期营业收入) / 上期营业收入',
    kind: 'percent',
    description: '观察营业收入同比增长速度。',
    requirements: [
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      growthRate(
        rowValue(context.income, year, REVENUE_ALIASES),
        previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES)
      )
  },
  {
    key: 'operatingProfitGrowth',
    label: '营业利润增长率',
    group: 'growth',
    formula: '(本期营业利润 - 上期营业利润) / 上期营业利润',
    kind: 'percent',
    description: '观察营业利润同比增长速度。',
    requirements: [
      { label: '营业利润', table: 'income', aliases: OPERATING_PROFIT_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      growthRate(
        rowValue(context.income, year, OPERATING_PROFIT_ALIASES),
        previousRowValue(context, context.income, yearIndex, OPERATING_PROFIT_ALIASES)
      )
  },
  {
    key: 'assetGrowth',
    label: '资产增长率',
    group: 'growth',
    formula: '(本期资产 - 上期资产) / 上期资产',
    kind: 'percent',
    description: '观察资产规模同比增长速度。',
    requirements: [
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      growthRate(
        rowValue(context.balance, year, TOTAL_ASSET_ALIASES),
        previousRowValue(context, context.balance, yearIndex, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'netAssetGrowth',
    label: '净资产增长率',
    group: 'growth',
    formula: '(本期净资产 - 上期净资产) / 上期净资产',
    kind: 'percent',
    description: '观察净资产规模同比增长速度。',
    requirements: [
      { label: '净资产', table: 'balance', aliases: NET_ASSET_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      growthRate(
        rowValue(context.balance, year, NET_ASSET_ALIASES),
        previousRowValue(context, context.balance, yearIndex, NET_ASSET_ALIASES)
      )
  },
  {
    key: 'receivablesRevenueGrowthGap',
    label: '应收-收入增速差',
    group: 'growth',
    formula: '应收账款增长率 - 营业收入增长率',
    kind: 'percent',
    description: '应收增长持续快于收入，可能代表放宽信用、回款变慢或收入确认偏激进。正值越大越需要关注。',
    requirements: [
      { label: '应收账款', table: 'balance', aliases: RECEIVABLE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year, yearIndex) => growthGapValue(
      rowValue(context.balance, year, RECEIVABLE_ALIASES),
      previousRowValue(context, context.balance, yearIndex, RECEIVABLE_ALIASES),
      rowValue(context.income, year, REVENUE_ALIASES),
      previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES)
    )
  },
  {
    key: 'inventoryRevenueGrowthGap',
    label: '存货-收入增速差',
    group: 'growth',
    formula: '存货增长率 - 营业收入增长率',
    kind: 'percent',
    description: '存货增长持续快于收入，可能代表需求转弱、积压、渠道压货或未来跌价风险。正值越大越需要关注。',
    requirements: [
      { label: '存货', table: 'balance', aliases: INVENTORY_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year, yearIndex) => growthGapValue(
      rowValue(context.balance, year, INVENTORY_ALIASES),
      previousRowValue(context, context.balance, yearIndex, INVENTORY_ALIASES),
      rowValue(context.income, year, REVENUE_ALIASES),
      previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES)
    )
  },
  {
    key: 'profitCashflowGrowthGap',
    label: '利润-现金流增速差',
    group: 'growth',
    formula: '净利润增长率 - 经营现金流增长率',
    kind: 'percent',
    description: '利润增长持续快于经营现金流，说明新增利润尚未同步转化为现金。正值越大，增长含金量越值得核查。',
    requirements: [
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES },
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES }
    ],
    calculate: (context, year, yearIndex) => growthGapValue(
      rowValue(context.income, year, NET_PROFIT_ALIASES),
      previousRowValue(context, context.income, yearIndex, NET_PROFIT_ALIASES),
      rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
      previousRowValue(context, context.cashflow, yearIndex, OPERATING_CASHFLOW_ALIASES)
    )
  },
  {
    key: 'assetRevenueGrowthGap',
    label: '资产-收入增速差',
    group: 'growth',
    formula: '总资产增长率 - 营业收入增长率',
    kind: 'percent',
    description: '资产增长持续快于收入，可能代表扩张效率下降或新增资产尚未形成产出。应结合总资产周转率和增量回报判断。',
    requirements: [
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year, yearIndex) => growthGapValue(
      rowValue(context.balance, year, TOTAL_ASSET_ALIASES),
      previousRowValue(context, context.balance, yearIndex, TOTAL_ASSET_ALIASES),
      rowValue(context.income, year, REVENUE_ALIASES),
      previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES)
    )
  },
  {
    key: 'debtCashflowGrowthGap',
    label: '有息债务-现金流增速差',
    group: 'growth',
    formula: '有息负债增长率 - 经营现金流增长率',
    kind: 'percent',
    description: '有息负债增长持续快于经营现金流，代表扩张越来越依赖债务融资。正值越大，融资韧性越弱。',
    requirements: [
      { label: '有息负债', table: 'balance', aliases: INTEREST_BEARING_DEBT_ALIASES },
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES }
    ],
    calculate: (context, year, yearIndex) => {
      const previousYear = context.statements.years[yearIndex + 1];
      return growthGapValue(
        sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total,
        previousYear ? sumRows(context.balance, previousYear, INTEREST_BEARING_DEBT_GROUPS).total : null,
        rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
        previousRowValue(context, context.cashflow, yearIndex, OPERATING_CASHFLOW_ALIASES)
      );
    }
  },
  {
    key: 'operatingCashflowAboveProfit',
    label: '经营现金流净额 > 净利润 > 0',
    group: 'judgment',
    formula: '经营活动产生的现金流量净额 > 净利润 > 0',
    kind: 'judgment',
    description: '经营现金流净额高于正净利润时通过。更完整的判断请查看“现金质量”中的经营现金含金量及三年累计值。',
    requirements: [
      { label: '经营活动产生的现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES }
    ],
    calculate: (context, year) => judgmentValue(
      rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
      rowValue(context.income, year, NET_PROFIT_ALIASES),
      (operatingCashflow, netProfit) => operatingCashflow > netProfit && netProfit > 0
    )
  },
  {
    key: 'cashEquivalentIncreasePositive',
    label: '现金净增加额 > 0',
    group: 'judgment',
    formula: '现金及现金等价物净增加额 > 0',
    kind: 'judgment',
    description: '现金及现金等价物净增加额为正时通过。该数值直接取自现金流量表的“现金及现金等价物净增加额”科目，并非使用货币资金或期末、期初现金余额自行计算。',
    requirements: [
      { label: '现金及现金等价物净增加额', table: 'cashflow', aliases: CASH_EQUIVALENT_INCREASE_ALIASES }
    ],
    calculate: (context, year) => {
      const value = cashEquivalentIncrease(context, year);
      return value === null ? null : Number(value > 0);
    }
  },
  {
    key: 'endingCashAboveDebt',
    label: '期末现金余额 > 有息负债',
    group: 'judgment',
    formula: '期末现金及现金等价物余额 > 有息负债',
    kind: 'judgment',
    description: '期末现金及现金等价物余额能够覆盖有息负债时通过。',
    requirements: [
      { label: '期末现金及现金等价物余额', table: 'cashflow', aliases: END_CASH_EQUIVALENT_ALIASES },
      { label: '有息负债', table: 'balance', aliases: INTEREST_BEARING_DEBT_ALIASES }
    ],
    calculate: (context, year) => judgmentValue(
      rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES),
      sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total,
      (endingCash, debt) => endingCash > debt
    )
  },
  {
    key: 'investmentOutflowAboveInflow',
    label: '投资现金流出 > 流入',
    group: 'judgment',
    formula: '投资活动现金流出 > 投资活动现金流入',
    kind: 'judgment',
    description: '投资活动现金流出大于流入时通过。',
    requirements: [
      { label: '投资活动现金流出', table: 'cashflow', aliases: INVESTMENT_CASH_OUTFLOW_ALIASES },
      { label: '投资活动现金流入', table: 'cashflow', aliases: INVESTMENT_CASH_INFLOW_ALIASES }
    ],
    calculate: (context, year) => {
      if (context.statements.company.market === 'hk') {
        const netCashflow = rowValue(context.cashflow, year, HK_INVESTMENT_CASH_NET_ALIASES);
        return netCashflow === null ? null : Number(netCashflow < 0);
      }
      return judgmentValue(
        absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_OUTFLOW_ALIASES)),
        absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_INFLOW_ALIASES)),
        (outflow, inflow) => outflow > inflow
      );
    }
  }
];

export function definitionForMarket(definition: MetricDefinition, market: 'a' | 'hk'): MetricDefinition {
  if (market !== 'hk') return definition;
  const operatingCashName = '经营业务现金净额';
  const overrides: Record<string, Partial<MetricDefinition>> = {
    internalAssetReturn: {
      label: '内部资产收益率（港股口径）',
      formula: '营业利润 / (总资产 - 联营公司权益 - 合营公司权益)',
      description: '港股口径：扣除联营公司和合营公司权益后，观察内部经营资产的收益效率。'
    },
    netAssetCashReturn: {
      label: '经营现金资产回报率',
      formula: `${operatingCashName} / 平均资产`,
      description: `观察${operatingCashName}相对于平均总资产的回报水平。`
    },
    operatingCashflowAboveProfit: {
      label: `${operatingCashName} > 净利润 > 0`,
      formula: `${operatingCashName} > 净利润 > 0`
    },
    cashEquivalentIncreasePositive: {
      label: '期末现金 > 期初现金',
      formula: '期末现金 - 期初现金 > 0',
      description: '港股口径：期末现金高于期初现金时通过。'
    },
    endingCashAboveDebt: {
      label: '期末现金 > 有息负债',
      formula: '期末现金 > 有息负债'
    },
    investmentOutflowAboveInflow: {
      label: '投资业务现金净额 < 0',
      formula: '投资业务现金净额 < 0',
      description: '港股口径：投资业务现金净额为负时，表示投资现金流出大于流入。'
    }
  };
  const override = overrides[definition.key] ?? {};
  const marketDefinition = {
    ...definition,
    ...override,
    requirements: definition.requirements.map((requirement) =>
      requirement.aliases === OPERATING_CASHFLOW_ALIASES
        ? { ...requirement, label: operatingCashName }
        : requirement
    )
  };
  const useHongKongNames = (value: string) => value
    .split('营业总收入').join('营运收入')
    .split('营业成本').join('销售成本')
    .split('营业收入').join('营业额')
    .split('利息支出').join('融资成本')
    .split('营业利润').join('经营溢利');
  return {
    ...marketDefinition,
    label: useHongKongNames(marketDefinition.label),
    formula: useHongKongNames(marketDefinition.formula),
    description: useHongKongNames(marketDefinition.description),
    requirements: marketDefinition.requirements.map((requirement) => ({
      ...requirement,
      label: useHongKongNames(requirement.label)
    }))
  };
}
