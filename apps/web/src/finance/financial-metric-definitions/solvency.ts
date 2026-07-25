import { CASH_ALIASES, CURRENT_ASSET_ALIASES, CURRENT_LIABILITY_ALIASES, INTEREST_BEARING_DEBT_ALIASES, INTEREST_BEARING_DEBT_GROUPS, INTEREST_EXPENSE_ALIASES, INVENTORY_ALIASES, OPERATING_CASHFLOW_ALIASES, OPERATING_PROFIT_ALIASES, OPERATING_REVENUE_ALIASES, RECEIVABLE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES, TOTAL_LIABILITY_ALIASES } from '../financial-metric-fields';
import { absoluteValue, rowValue, safeDivide } from '../financial-metric-engine';
import type { MetricDefinition } from '../financial-metric-types';
import { ebitValue, sumRows, sumRowsContaining } from '../financial-metric-calculation-helpers';

export const solvencyDefinitions: MetricDefinition[] = [
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
  }
];
