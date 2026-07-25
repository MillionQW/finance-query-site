import { ADMIN_EXPENSE_ALIASES, CASH_ALIASES, CURRENT_ASSET_ALIASES, CURRENT_LIABILITY_ALIASES, EQUITY_ALIASES, FINANCE_EXPENSE_ALIASES, FIXED_ASSET_ALIASES, GROSS_PROFIT_ALIASES, INCOME_TAX_ALIASES, INTEREST_EXPENSE_ALIASES, LONG_TERM_EQUITY_INVESTMENT_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES, OPERATING_COST_ALIASES, OPERATING_PROFIT_ALIASES, OPERATING_REVENUE_ALIASES, REVENUE_ALIASES, SELLING_EXPENSE_ALIASES, TOTAL_ASSET_ALIASES, TOTAL_OPERATING_COST_ALIASES, TOTAL_OPERATING_REVENUE_ALIASES, TOTAL_PROFIT_ALIASES } from '../financial-metric-fields';
import { absoluteValue, rowValue, safeDivide, sumAbsolute } from '../financial-metric-engine';
import type { MetricDefinition } from '../financial-metric-types';
import { averageBalance, averageInvestedCapital, ebitValue, greenblattCapitalDetails, incrementalRoicDetails, longTermEquityInvestmentValue, nopatValue, operatingCostDetails, rollingProfitabilityStatistics } from '../financial-metric-calculation-helpers';

export const profitabilityDefinitions: MetricDefinition[] = [
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
  }
];
