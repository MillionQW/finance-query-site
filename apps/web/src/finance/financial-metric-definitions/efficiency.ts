import { ACCOUNTS_PAYABLE_ALIASES, FIXED_ASSET_ALIASES, GROSS_PROFIT_ALIASES, INVENTORY_ALIASES, OPERATING_COST_ALIASES, RECEIVABLE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { rowValue, safeDivide } from '../financial-metric-engine';
import type { MetricDefinition } from '../financial-metric-types';
import { averageBalance, cashConversionCycleDetails, operatingCostDetails } from '../financial-metric-calculation-helpers';

export const efficiencyDefinitions: MetricDefinition[] = [
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
    key: 'receivablesToRevenue',
    label: '应收账款占营业收入比',
    group: 'efficiency',
    formula: '期末应收账款 / 同年度营业收入',
    kind: 'percent',
    description: '观察期末应收账款相对于年度营收的规模。比例上升可能来自赊销增加、回款放缓或收入下降，需结合账龄、坏账准备、经营现金流和应收账款周转率判断。',
    requirements: [
      { label: '应收账款', table: 'balance', aliases: RECEIVABLE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) =>
      safeDivide(
        rowValue(context.balance, year, RECEIVABLE_ALIASES),
        rowValue(context.income, year, REVENUE_ALIASES)
      )
  },
  {
    key: 'inventoryTurnoverDays',
    label: '存货周转天数',
    group: 'efficiency',
    formula: '存货平均余额 × 365 / 营业成本',
    kind: 'days',
    description: '按一年365天计算，观察存货平均周转一次所需的天数。存货平均余额为期初与期末余额的平均值；天数越短通常表示周转越快，需结合行业特点、季节性和备货策略判断。',
    requirements: [
      { label: '营业成本或毛利润', table: 'income', aliases: [...OPERATING_COST_ALIASES, ...GROSS_PROFIT_ALIASES] },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '存货', table: 'balance', aliases: INVENTORY_ALIASES }
    ],
    calculate: (context, year, yearIndex) => {
      const inventory = averageBalance(context, context.balance, year, yearIndex, INVENTORY_ALIASES);
      return safeDivide(
        inventory === null ? null : inventory * 365,
        operatingCostDetails(context, year).costAbs
      );
    }
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
  }
];
