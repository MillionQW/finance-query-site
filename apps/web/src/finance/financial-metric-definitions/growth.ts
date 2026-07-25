import { INTEREST_BEARING_DEBT_ALIASES, INTEREST_BEARING_DEBT_GROUPS, INVENTORY_ALIASES, NET_ASSET_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES, OPERATING_PROFIT_ALIASES, RECEIVABLE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { growthGapValue, growthRate, rowValue } from '../financial-metric-engine';
import type { MetricDefinition } from '../financial-metric-types';
import { previousRowValue, sumRows } from '../financial-metric-calculation-helpers';

export const growthDefinitions: MetricDefinition[] = [
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
  }
];
