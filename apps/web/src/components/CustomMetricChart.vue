<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { AxisPointerComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { FinancialStatements, StatementTable } from '../types/finance';

echarts.use([AxisPointerComponent, GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer]);

type MetricKind = 'percent' | 'times' | 'judgment';
type MetricGroupKey = 'profitability' | 'growth' | 'solvency' | 'efficiency' | 'judgment';

interface MetricPoint {
  year: string;
  value: number | null;
  details: FormulaDetail[];
  expression: string;
}

interface MetricDefinition {
  key: string;
  label: string;
  group: MetricGroupKey;
  formula: string;
  kind: MetricKind;
  description: string;
  calculate: (context: MetricContext, year: string, yearIndex: number) => number | null;
  requirements: MetricRequirement[];
}

interface MetricRequirement {
  label: string;
  table: 'balance' | 'income' | 'cashflow';
  aliases: string[];
}

interface MetricContext {
  statements: FinancialStatements;
  balance: StatementTable | undefined;
  income: StatementTable | undefined;
  cashflow: StatementTable | undefined;
}

interface MetricResult {
  definition: MetricDefinition;
  points: MetricPoint[];
  latest: number | null;
  missing: string[];
  alerts: MetricAlert[];
}

interface MetricAlert {
  year?: string;
  message: string;
  tone: 'warning' | 'danger';
}

interface FormulaDetail {
  label: string;
  value: number | null;
  kind?: MetricKind | 'number';
  note?: string;
}

interface FormulaDetails {
  rows: FormulaDetail[];
  expression: string;
}

const props = defineProps<{
  statements: FinancialStatements | null;
  activeYears: string[];
}>();

const activeMetricKey = ref('roe');
const activeMetricGroup = ref<MetricGroupKey>('profitability');
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);

const NET_PROFIT_ALIASES = ['归属于母公司股东的净利润', '股东应占溢利', '股东应占盈利', '净利润', '除税后溢利', 'PARENT NETPROFIT', 'NETPROFIT'];
const EQUITY_ALIASES = ['归属于母公司股东权益', '股东权益', '所有者权益合计', '总权益', '净资产', 'PARENT EQUITY BALANCE', 'EQUITY BALANCE'];
const TOTAL_ASSET_ALIASES = ['资产总计', '总资产', 'TOTAL ASSETS'];
const CURRENT_ASSET_ALIASES = ['流动资产合计', '流动资产', 'CURRENT ASSET BALANCE', 'TOTAL CURRENT ASSETS'];
const CURRENT_LIABILITY_ALIASES = ['流动负债合计', '流动负债', 'CURRENT LIAB BALANCE', 'TOTAL CURRENT LIAB', 'TOTAL CURRENT LIABILITIES'];
const INVENTORY_ALIASES = ['存货', 'INVENTORY'];
const CASH_ALIASES = ['现金及等价物', '现金及现金等价物', '现金和现金等价物', '货币资金', '现金', 'CASH AND CASH EQUIVALENTS', 'CASH EQUIVALENTS', 'CASH', 'END CCE'];
const REVENUE_ALIASES = ['营业收入', '营业额', 'OPERATE INCOME'];
const OPERATING_REVENUE_ALIASES = ['营业收入', '营业额', 'OPERATE INCOME'];
const TOTAL_OPERATING_REVENUE_ALIASES = ['营业总收入', '营运收入', 'TOTAL OPERATE INCOME'];
const TOTAL_OPERATING_COST_ALIASES = ['营业总成本', 'TOTAL OPERATE COST'];
const OPERATING_PROFIT_ALIASES = ['营业利润', '经营溢利', '经营利润', '营运利润', 'OPERATE PROFIT', 'OPERATE PROFIT BALANCE'];
const TOTAL_PROFIT_ALIASES = ['利润总额', '除税前溢利', '税前利润', 'PROFIT BEFORE TAX', 'TOTAL PROFIT'];
const INCOME_TAX_ALIASES = ['所得税费用', '所得税', '税项', 'INCOME TAX', 'TAXATION'];
const RECEIVABLE_ALIASES = ['应收账款', '应收帐款', '应收票据及应收账款', '应收账款及应收票据', 'ACCOUNTS RECE', 'NOTE ACCOUNTS RECE', '应收款项'];
const GROSS_PROFIT_ALIASES = ['毛利', '毛利润', 'GROSS PROFIT'];
const OPERATING_COST_ALIASES = ['营业成本', '销售成本', '收入成本', '主营业务成本', 'OPERATE COST', 'COST OF SALES', 'COST OF REVENUE'];
const INTEREST_EXPENSE_ALIASES = ['利息支出', '融资成本', 'INTEREST EXPENSE', 'FINANCE COSTS'];
const SELLING_EXPENSE_ALIASES = ['销售费用', '销售及分销费用', 'SALE EXPENSE'];
const ADMIN_EXPENSE_ALIASES = ['管理费用', '行政开支', 'MANAGE EXPENSE'];
const FINANCE_EXPENSE_ALIASES = ['财务费用', '融资成本', 'FINANCE EXPENSE'];
const NET_ASSET_ALIASES = ['净资产', '所有者权益合计', '股东权益', '总权益', '归属于母公司股东权益', 'PARENT EQUITY BALANCE', 'EQUITY BALANCE'];
const FIXED_ASSET_ALIASES = ['固定资产', '固定资产净值', '物业厂房及设备', '物业厂房设备', 'FIXED ASSET', 'PROPERTY PLANT EQUIPMENT', 'PROPERTY PLANT AND EQUIPMENT'];
const LONG_TERM_EQUITY_INVESTMENT_ALIASES = ['长期股权投资', 'LONG EQUITY INVEST', 'LONG TERM EQUITY INVESTMENT'];
const HK_ASSOCIATE_JOINT_VENTURE_GROUPS = [
  { label: '联营公司权益', aliases: ['联营公司权益'] },
  { label: '合营公司权益', aliases: ['合营公司权益'] }
];
const INTEREST_BEARING_DEBT_GROUPS = [
  { label: '短期借款/贷款', aliases: ['短期借款', '短期贷款', 'SHORT LOAN', 'SHORT BORROWING', 'SHORT TERM BORROWING'] },
  { label: '长期借款/贷款', aliases: ['长期借款', '长期贷款', 'LONG LOAN', 'LONG BORROWING', 'LONG TERM BORROWING'] },
  { label: '应付债券', aliases: ['应付债券', '发行债券', 'BOND PAYABLE', 'BONDS PAYABLE'] },
  { label: '租赁负债', aliases: ['租赁负债', '融资租赁负债', 'LEASE LIAB', 'LEASE LIABILITY'] },
  { label: '一年内到期非流动负债', aliases: ['一年内到期的非流动负债', '一年内到期非流动负债', 'NONCURRENT LIAB 1YEAR'] }
];
const INTEREST_BEARING_DEBT_ALIASES = INTEREST_BEARING_DEBT_GROUPS.flatMap((group) => group.aliases);
const OPERATING_CASHFLOW_ALIASES = [
  '经营活动产生的现金流量净额',
  '经营活动现金流量净额',
  '经营业务现金净额',
  'NETCASH OPERATE'
];
const CASH_EQUIVALENT_INCREASE_ALIASES = ['现金及现金等价物净增加额', 'CCE ADD'];
const BEGIN_CASH_EQUIVALENT_ALIASES = ['期初现金', '期初现金及现金等价物余额', 'BEGIN CCE', 'BEGIN CASH'];
const END_CASH_EQUIVALENT_ALIASES = ['期末现金', '期末现金及现金等价物余额', '期末现金及等价物余额', 'END CCE', 'CASH END'];
const INVESTMENT_CASH_INFLOW_ALIASES = ['投资活动现金流入小计', 'TOTAL INVEST INFLOW'];
const INVESTMENT_CASH_OUTFLOW_ALIASES = ['投资活动现金流出小计', 'TOTAL INVEST OUTFLOW'];
const HK_INVESTMENT_CASH_NET_ALIASES = ['投资业务现金净额'];

const metricGroups: Array<{ key: MetricGroupKey; label: string }> = [
  { key: 'profitability', label: '盈利能力' },
  { key: 'growth', label: '成长能力' },
  { key: 'solvency', label: '偿债能力' },
  { key: 'efficiency', label: '营运效率' },
  { key: 'judgment', label: '判断指标' }
];

const definitions: MetricDefinition[] = [
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
        averageBalance(context.balance, year, yearIndex, EQUITY_ALIASES)
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
        averageBalance(context.balance, year, yearIndex, TOTAL_ASSET_ALIASES)
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
    label: '负债率',
    group: 'solvency',
    formula: '有息负债 / 总资产',
    kind: 'percent',
    description: '排除负债率超过60%的企业',
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
        averageBalance(context.balance, year, yearIndex, RECEIVABLE_ALIASES)
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
        averageBalance(context.balance, year, yearIndex, INVENTORY_ALIASES)
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
        averageBalance(context.balance, year, yearIndex, TOTAL_ASSET_ALIASES)
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
    label: '净资产现金回报率',
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
      averageBalance(context.balance, year, yearIndex, TOTAL_ASSET_ALIASES)
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
    key: 'operatingCashflowAboveProfit',
    label: '经营现金流净额 > 净利润 > 0',
    group: 'judgment',
    formula: '经营活动产生的现金流量净额 > 净利润 > 0',
    kind: 'judgment',
    description: '经营现金流净额高于正净利润时通过。',
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
    key: 'operatingCashflowExceedsProfit',
    label: '经营活动现金净额 > 净利润',
    group: 'judgment',
    formula: '经营活动现金流量净额 > 净利润',
    kind: 'judgment',
    description: '如果企业获利很好，但现金流很差，必须关注：企业利润为什么没转化为现金？',
    requirements: [
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES }
    ],
    calculate: (context, year) => judgmentValue(
      rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
      rowValue(context.income, year, NET_PROFIT_ALIASES),
      (operatingCashflow, netProfit) => operatingCashflow > netProfit
    )
  },
  {
    key: 'operatingCashflowCoversRevenue',
    label: '经营现金流净额 ≥ 营业收入',
    group: 'judgment',
    formula: '经营活动现金流量净额 ≥ 营业收入',
    kind: 'judgment',
    description: '经营活动现金流量净额大于或等于营业收入时通过。',
    requirements: [
      { label: '经营活动现金流量净额', table: 'cashflow', aliases: OPERATING_CASHFLOW_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => judgmentValue(
      rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES),
      rowValue(context.income, year, REVENUE_ALIASES),
      (operatingCashflow, revenue) => operatingCashflow >= revenue
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

function definitionForMarket(definition: MetricDefinition, market: 'a' | 'hk'): MetricDefinition {
  if (market !== 'hk') return definition;
  const operatingCashName = '经营业务现金净额';
  const overrides: Record<string, Partial<MetricDefinition>> = {
    internalAssetReturn: {
      label: '内部资产收益率（港股口径）',
      formula: '营业利润 / (总资产 - 联营公司权益 - 合营公司权益)',
      description: '港股口径：扣除联营公司和合营公司权益后，观察内部经营资产的收益效率。'
    },
    netAssetCashReturn: {
      formula: `${operatingCashName} / 平均资产`,
      description: `观察${operatingCashName}相对于平均总资产的回报水平。`
    },
    operatingCashflowAboveProfit: {
      label: `${operatingCashName} > 净利润 > 0`,
      formula: `${operatingCashName} > 净利润 > 0`
    },
    operatingCashflowExceedsProfit: {
      label: `${operatingCashName} > 净利润`,
      formula: `${operatingCashName} > 净利润`
    },
    operatingCashflowCoversRevenue: {
      label: `${operatingCashName} ≥ 营业收入`,
      formula: `${operatingCashName} ≥ 营业收入`
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

const activeDefinitions = computed(() => {
  const market = props.statements?.company.market ?? 'a';
  return definitions
    .filter((definition) => market !== 'hk' || definition.key !== 'tangOperatingMargin')
    .map((definition) => definitionForMarket(definition, market));
});

const metricResults = computed<MetricResult[]>(() => {
  if (!props.statements) {
    return activeDefinitions.value.map((definition) => ({ definition, points: [], latest: null, missing: [], alerts: [] }));
  }

  const context: MetricContext = {
    statements: props.statements,
    balance: props.statements.tables.find((table) => table.type === 'balance'),
    income: props.statements.tables.find((table) => table.type === 'income'),
    cashflow: props.statements.tables.find((table) => table.type === 'cashflow')
  };
  const years = props.activeYears.length ? props.activeYears : props.statements.years;

  return activeDefinitions.value.map((definition) => {
    const points = years.map((year) => {
      const yearIndex = props.statements!.years.indexOf(year);
      const details = metricDetails(definition, context, year, yearIndex);
      return {
        year,
        value: definition.calculate(context, year, yearIndex),
        details: details.rows,
        expression: details.expression
      };
    });
    const latest = points.find((point) => point.value !== null)?.value ?? null;
    return {
      definition,
      points,
      latest,
      missing: missingRequirements(definition, context),
      alerts: metricAlerts(definition, points)
    };
  });
});

const groupedMetricResults = computed(() =>
  metricResults.value.filter((result) => result.definition.group === activeMetricGroup.value)
);

const selectedResult = computed(() =>
  metricResults.value.find((result) => result.definition.key === activeMetricKey.value) ??
  groupedMetricResults.value[0] ??
  metricResults.value[0]
);

function isCriticalMetric(result: MetricResult): boolean {
  if (result.latest === null) return false;
  if (result.definition.kind === 'judgment') return result.latest === 0;
  if (result.definition.key === 'cashDebtRatio') return result.latest < 1;
  if (result.definition.key === 'currentRatio') return result.latest < 1.5;
  if (result.definition.key === 'quickRatio') return result.latest < 0.8;
  if (result.definition.key === 'receivablesToAssets') return result.latest > 0.3;
  if (result.definition.key === 'debtRatio') return result.latest > 0.6;
  return false;
}

function isPositiveMetric(result: MetricResult): boolean {
  if (result.latest === null) return false;
  if (result.definition.kind === 'judgment') return result.latest === 1;
  if (result.definition.key === 'grossMargin') return result.latest > 0.4;
  if (result.definition.key === 'expenseToGrossProfitRatio') return result.latest < 0.3;
  return false;
}

function isWarningMetric(result: MetricResult): boolean {
  if (result.latest === null) return false;
  if (result.definition.key === 'currentRatio') return result.latest > 2.5;
  if (result.definition.key === 'quickRatio') return result.latest > 1.2;
  return false;
}

watch(activeMetricGroup, () => {
  const current = metricResults.value.find((result) => result.definition.key === activeMetricKey.value);
  if (current?.definition.group === activeMetricGroup.value) return;
  activeMetricKey.value = groupedMetricResults.value[0]?.definition.key ?? metricResults.value[0]?.definition.key ?? 'roe';
});

const chartOption = computed<EChartsCoreOption>(() => {
  const result = selectedResult.value;
  const seriesColor = isCriticalMetric(result)
    ? '#dc2626'
    : isPositiveMetric(result)
      ? '#16a34a'
      : isWarningMetric(result)
        ? '#d97706'
        : '#2563eb';
  const areaColor = isCriticalMetric(result)
    ? 'rgba(220, 38, 38, 0.08)'
    : isPositiveMetric(result)
      ? 'rgba(22, 163, 74, 0.10)'
      : isWarningMetric(result)
        ? 'rgba(217, 119, 6, 0.09)'
        : 'rgba(37, 99, 235, 0.08)';
  const displayPoints = result.points.slice().reverse();
  const years = displayPoints.map((point) => point.year);
  const data = displayPoints.map((point) => point.value);
  const showRevenueGrowth = result.definition.key === 'expenseRatio' || result.definition.key === 'receivableTurnover';
  const revenueGrowthData = displayPoints.map((point) => {
    if (!props.statements) return null;
    const income = props.statements.tables.find((table) => table.type === 'income');
    const yearIndex = props.statements.years.indexOf(point.year);
    const previousYear = props.statements.years[yearIndex + 1];
    return growthRate(
      rowValue(income, point.year, REVENUE_ALIASES),
      previousYear ? rowValue(income, previousYear, REVENUE_ALIASES) : null
    );
  });

  return {
    grid: { top: showRevenueGrowth ? 48 : 18, right: 18, bottom: 30, left: 48 },
    legend: showRevenueGrowth
      ? { top: 8, right: 18, textStyle: { color: '#64748b', fontSize: 12 } }
      : { show: false },
    tooltip: {
      show: true,
      trigger: 'axis',
      triggerOn: 'mousemove|click',
      confine: true,
      extraCssText: 'max-width: 380px; white-space: normal;',
      formatter: (params: unknown) => formatTooltip(params, result, displayPoints)
    },
    axisPointer: {
      type: 'line',
      snap: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: years,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      ...(result.definition.kind === 'judgment' ? { min: 0, max: 1, interval: 1 } : {}),
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => formatAxisValue(value, result.definition.kind)
      },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: [
      {
        name: result.definition.label,
        type: 'line',
        smooth: true,
        connectNulls: false,
        symbolSize: 7,
        label: {
          show: true,
          position: 'top',
          color: seriesColor,
          fontSize: 11,
          fontWeight: 700,
          formatter: (params: { value: number | null }) =>
            params.value === null ? '' : formatMetricValue(params.value, result.definition.kind)
        },
        itemStyle: { color: seriesColor },
        lineStyle: { color: seriesColor, width: 3 },
        areaStyle: { color: areaColor },
        data
      },
      ...(showRevenueGrowth
        ? [{
            name: '营业收入增幅',
            type: 'line' as const,
            smooth: true,
            connectNulls: false,
            symbolSize: 6,
            label: {
              show: true,
              position: 'bottom' as const,
              color: '#b45309',
              fontSize: 11,
              fontWeight: 700,
              formatter: (params: { value: number | null }) =>
                params.value === null ? '' : formatMetricValue(params.value, 'percent')
            },
            itemStyle: { color: '#f59e0b' },
            lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' as const },
            data: revenueGrowthData
          }]
        : [])
    ]
  };
});

watch(chartOption, async (option) => {
  await nextTick();
  chart.value?.setOption(option, true);
});

watch(selectedResult, () => {
  chart.value?.resize();
});

onMounted(async () => {
  await nextTick();
  if (chartElement.value) {
    chart.value = echarts.init(chartElement.value);
    chart.value.setOption(chartOption.value, true);
  }
  window.addEventListener('resize', resizeChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  chart.value?.dispose();
});

function resizeChart(): void {
  chart.value?.resize();
}

function rowValue(table: StatementTable | undefined, year: string, aliases: string[]): number | null {
  const row = findRow(table, aliases);
  return toNumber(row?.values[year]);
}

function averageBalance(
  table: StatementTable | undefined,
  year: string,
  yearIndex: number,
  aliases: string[]
): number | null {
  if (!props.statements || yearIndex < 0) return null;
  const row = findRow(table, aliases);
  if (!row) return null;

  const current = toNumber(row.values[year]);
  const previousYear = props.statements.years[yearIndex + 1];
  const previous = previousYear ? toNumber(row.values[previousYear]) : null;
  if (current === null || previous === null) return null;
  return (current + previous) / 2;
}

function previousRowValue(
  context: MetricContext,
  table: StatementTable | undefined,
  yearIndex: number,
  aliases: string[]
): number | null {
  const previousYear = context.statements.years[yearIndex + 1];
  return previousYear ? rowValue(table, previousYear, aliases) : null;
}

function growthRate(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function absoluteValue(value: number | null): number | null {
  return value === null ? null : Math.abs(value);
}

function operatingCostDetails(context: MetricContext, year: string) {
  const directCost = rowValue(context.income, year, OPERATING_COST_ALIASES);
  if (directCost !== null) {
    const costAbs = absoluteValue(directCost);
    const rows: FormulaDetail[] = [
      { label: '营业成本/销售成本', value: directCost, note: '直接科目' }
    ];
    if (directCost < 0) {
      rows.push({ label: '营业成本绝对值', value: costAbs });
    }
    return { costAbs, rows };
  }

  const revenue = rowValue(context.income, year, REVENUE_ALIASES);
  const grossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
  const derivedCost = revenue !== null && grossProfit !== null ? revenue - grossProfit : null;
  const costAbs = absoluteValue(derivedCost);

  return {
    costAbs,
    rows: [
      { label: '营业收入', value: revenue },
      { label: '毛利润', value: grossProfit },
      { label: '推导营业成本', value: derivedCost, note: '营业收入 - 毛利润' }
    ]
  };
}

function effectiveTaxRate(context: MetricContext, year: string): number | null {
  const incomeTax = absoluteValue(rowValue(context.income, year, INCOME_TAX_ALIASES));
  const totalProfit = rowValue(context.income, year, TOTAL_PROFIT_ALIASES);
  if (incomeTax === null || totalProfit === null || totalProfit <= 0) return null;
  return Math.min(Math.max(incomeTax / totalProfit, 0), 1);
}

function ebitValue(context: MetricContext, year: string): number | null {
  const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
  if (operatingProfit === null) return null;
  const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES)) ?? 0;
  return operatingProfit + interestExpense;
}

function nopatValue(context: MetricContext, year: string): number | null {
  const ebit = ebitValue(context, year);
  const taxRate = effectiveTaxRate(context, year);
  return ebit !== null && taxRate !== null ? ebit * (1 - taxRate) : null;
}

function investedCapitalDetails(context: MetricContext, year: string) {
  const equity = rowValue(context.balance, year, EQUITY_ALIASES);
  const cash = rowValue(context.balance, year, CASH_ALIASES);
  const debt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
  const debtTotal = debt.total ?? 0;
  const investedCapital = equity !== null && cash !== null
    ? equity + debtTotal - cash
    : null;
  return { equity, cash, debt, debtTotal, investedCapital };
}

function averageInvestedCapital(context: MetricContext, year: string, yearIndex: number) {
  const current = investedCapitalDetails(context, year);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? investedCapitalDetails(context, previousYear) : null;
  const average = current.investedCapital !== null && previous !== null && previous.investedCapital !== null
    ? (current.investedCapital + previous.investedCapital) / 2
    : null;
  return { current, previous, previousYear, average };
}

function greenblattCapitalDetails(context: MetricContext, year: string) {
  const currentAssets = rowValue(context.balance, year, CURRENT_ASSET_ALIASES);
  const currentLiabilities = rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES);
  const fixedAssets = rowValue(context.balance, year, FIXED_ASSET_ALIASES);
  const workingCapital = currentAssets !== null && currentLiabilities !== null
    ? currentAssets - currentLiabilities
    : null;
  const capital = workingCapital !== null && fixedAssets !== null
    ? workingCapital + fixedAssets
    : null;
  return { currentAssets, currentLiabilities, fixedAssets, workingCapital, capital };
}

function sumRows(
  table: StatementTable | undefined,
  year: string,
  groups: Array<{ label: string; aliases: string[] }>
) {
  const rows: FormulaDetail[] = [];
  let total = 0;
  let hasValue = false;

  for (const group of groups) {
    const matches = findRows(table, group.aliases);
    for (const match of matches) {
      const value = toNumber(match.values[year]);
      if (value === null) continue;
      const normalizedValue = Math.abs(value);
      rows.push({ label: group.label, value: normalizedValue, note: match.sourceItem ?? match.item });
      total += normalizedValue;
      hasValue = true;
    }
  }

  return {
    total: hasValue ? total : null,
    rows
  };
}

function cashEquivalentIncrease(context: MetricContext, year: string): number | null {
  const direct = rowValue(context.cashflow, year, CASH_EQUIVALENT_INCREASE_ALIASES);
  if (direct !== null || context.statements.company.market !== 'hk') return direct;
  const beginning = rowValue(context.cashflow, year, BEGIN_CASH_EQUIVALENT_ALIASES);
  const ending = rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES);
  return beginning !== null && ending !== null ? ending - beginning : null;
}

function longTermEquityInvestmentDetails(context: MetricContext, year: string) {
  if (context.statements.company.market === 'hk') {
    return sumRows(context.balance, year, HK_ASSOCIATE_JOINT_VENTURE_GROUPS);
  }
  const value = rowValue(context.balance, year, LONG_TERM_EQUITY_INVESTMENT_ALIASES);
  return {
    total: value,
    rows: value === null
      ? []
      : [{ label: '长期股权投资', value }]
  };
}

function longTermEquityInvestmentValue(context: MetricContext, year: string): number | null {
  return longTermEquityInvestmentDetails(context, year).total;
}

function operatingCashflowDisplayName(context: MetricContext): string {
  return context.statements.company.market === 'hk'
    ? '经营业务现金净额'
    : '经营活动现金流量净额';
}

function judgmentValue(
  left: number | null,
  right: number | null,
  predicate: (left: number, right: number) => boolean
): number | null {
  if (left === null || right === null) return null;
  return Number(predicate(left, right));
}

function sumRowsContaining(table: StatementTable | undefined, year: string, keyword: string) {
  const matches = table?.rows.filter((row) => row.item.includes(keyword) || row.sourceItem?.includes(keyword)) ?? [];
  const rows: FormulaDetail[] = [];
  let total = 0;

  for (const match of matches) {
    const value = toNumber(match.values[year]);
    if (value === null) continue;
    const normalizedValue = Math.abs(value);
    rows.push({ label: match.item, value: normalizedValue, note: match.sourceItem ?? match.item });
    total += normalizedValue;
  }

  return { total: rows.length ? total : null, rows };
}

function metricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails {
  if (definition.key === 'roe') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const equity = averageBalanceDetails(context, context.balance, year, yearIndex, EQUITY_ALIASES);
    const value = safeDivide(netProfit, equity.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: `${year} 股东权益`, value: equity.current, note: '期末' },
        { label: `${equity.previousYear ?? '上年'} 股东权益`, value: equity.previous, note: '期初' },
        { label: '平均股东权益', value: equity.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(equity.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'roa') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(netProfit, assets.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: `${year} 总资产`, value: assets.current, note: '期末' },
        { label: `${assets.previousYear ?? '上年'} 总资产`, value: assets.previous, note: '期初' },
        { label: '平均总资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'roic') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const interestExpenseForEbit = interestExpense ?? 0;
    const ebit = operatingProfit !== null ? operatingProfit + interestExpenseForEbit : null;
    const totalProfit = rowValue(context.income, year, TOTAL_PROFIT_ALIASES);
    const incomeTax = absoluteValue(rowValue(context.income, year, INCOME_TAX_ALIASES));
    const taxRate = effectiveTaxRate(context, year);
    const nopat = nopatValue(context, year);
    const investedCapital = averageInvestedCapital(context, year, yearIndex);
    const value = safeDivide(nopat, investedCapital.average);
    const previousLabel = investedCapital.previousYear ?? '上年';
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '利息支出', value: interestExpense, note: interestExpense === null ? '缺失时按 0 处理' : undefined },
        { label: '息税前利润 EBIT', value: ebit, note: '营业利润 + 利息支出' },
        { label: '利润总额', value: totalProfit },
        { label: '所得税费用', value: incomeTax },
        { label: '有效所得税率', value: taxRate, kind: 'percent', note: '所得税费用 / 利润总额' },
        { label: '税后经营利润 NOPAT', value: nopat, note: 'EBIT × (1 - 有效所得税率)' },
        { label: `${year} 股东权益`, value: investedCapital.current.equity, note: '期末' },
        ...investedCapital.current.debt.rows,
        { label: `${year} 有息负债合计`, value: investedCapital.current.debtTotal, note: '缺失时按 0 处理' },
        { label: `${year} 现金及现金等价物`, value: investedCapital.current.cash, note: '期末' },
        { label: `${year} 投入资本`, value: investedCapital.current.investedCapital, note: '股东权益 + 有息负债 - 现金及现金等价物' },
        { label: `${previousLabel} 投入资本`, value: investedCapital.previous?.investedCapital ?? null, note: '期初' },
        { label: '平均投入资本', value: investedCapital.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(nopat)} / ${formatRawValue(investedCapital.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'greenblattReturnOnCapital') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const ebit = ebitValue(context, year);
    const capital = greenblattCapitalDetails(context, year);
    const value = capital.capital !== null && capital.capital > 0
      ? safeDivide(ebit, capital.capital)
      : null;
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '利息支出', value: interestExpense, note: interestExpense === null ? '缺失时按 0 处理' : undefined },
        { label: '息税前利润 EBIT', value: ebit, note: '营业利润 + 利息支出' },
        { label: '流动资产', value: capital.currentAssets },
        { label: '流动负债', value: capital.currentLiabilities },
        { label: '营运资本', value: capital.workingCapital, note: '流动资产 - 流动负债' },
        { label: '固定资产净值', value: capital.fixedAssets },
        { label: '投入经营资本', value: capital.capital, note: '营运资本 + 固定资产净值' }
      ],
      expression: `${formatRawValue(ebit)} / ${formatRawValue(capital.capital)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'currentRatio') {
    const currentAssets = rowValue(context.balance, year, CURRENT_ASSET_ALIASES);
    const currentLiabilities = rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES);
    const value = safeDivide(currentAssets, currentLiabilities);
    return {
      rows: [
        { label: '流动资产', value: currentAssets },
        { label: '流动负债', value: currentLiabilities }
      ],
      expression: `${formatRawValue(currentAssets)} / ${formatRawValue(currentLiabilities)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'quickRatio') {
    const currentAssets = rowValue(context.balance, year, CURRENT_ASSET_ALIASES);
    const inventory = rowValue(context.balance, year, INVENTORY_ALIASES);
    const currentLiabilities = rowValue(context.balance, year, CURRENT_LIABILITY_ALIASES);
    const quickAssets = currentAssets !== null && inventory !== null ? currentAssets - inventory : null;
    const value = safeDivide(quickAssets, currentLiabilities);
    return {
      rows: [
        { label: '流动资产', value: currentAssets },
        { label: '存货', value: inventory },
        { label: '速动资产', value: quickAssets, note: '流动资产 - 存货' },
        { label: '流动负债', value: currentLiabilities }
      ],
      expression: `${formatRawValue(quickAssets)} / ${formatRawValue(currentLiabilities)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cashDebtRatio') {
    const cash = rowValue(context.balance, year, CASH_ALIASES);
    const interestBearingDebt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const value = safeDivide(cash, interestBearingDebt.total);
    return {
      rows: [
        { label: '现金及现金等价物', value: cash },
        ...interestBearingDebt.rows,
        { label: '有息负债合计', value: interestBearingDebt.total, note: '借款/贷款/债券/租赁等合计' }
      ],
      expression: `${formatRawValue(cash)} / ${formatRawValue(interestBearingDebt.total)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'debtRatio') {
    const interestBearingDebt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const value = safeDivide(interestBearingDebt.total, totalAssets);
    return {
      rows: [
        ...interestBearingDebt.rows,
        { label: '有息负债合计', value: interestBearingDebt.total, note: '借款/贷款/债券/租赁等合计' },
        { label: '总资产', value: totalAssets, note: '期末' }
      ],
      expression: `${formatRawValue(interestBearingDebt.total)} / ${formatRawValue(totalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'receivablesToAssets') {
    const receivables = sumRowsContaining(context.balance, year, '应收');
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const value = safeDivide(receivables.total, totalAssets);
    return {
      rows: [
        ...receivables.rows,
        { label: '所有“应收”科目合计', value: receivables.total },
        { label: '总资产', value: totalAssets, note: '期末' }
      ],
      expression: `${formatRawValue(receivables.total)} / ${formatRawValue(totalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'receivableRevenueMonths') {
    const receivable = rowValue(context.balance, year, RECEIVABLE_ALIASES);
    const annualRevenue = rowValue(context.income, year, REVENUE_ALIASES);
    const monthlyRevenue = annualRevenue === null ? null : annualRevenue / 12;
    const value = safeDivide(receivable, monthlyRevenue);
    return {
      rows: [
        { label: '应收账款余额', value: receivable, note: '期末' },
        { label: '年度营业收入', value: annualRevenue },
        { label: '月均营业收入', value: monthlyRevenue, note: '年度营业收入 / 12' }
      ],
      expression: `${formatRawValue(receivable)} / ${formatRawValue(monthlyRevenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'receivableTurnover') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const receivable = averageBalanceDetails(context, context.balance, year, yearIndex, RECEIVABLE_ALIASES);
    const value = safeDivide(revenue, receivable.average);
    const previousRevenue = previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES);
    const revenueGrowth = growthRate(revenue, previousRevenue);
    return {
      rows: [
        { label: '营业收入', value: revenue },
        { label: `${year} 应收账款`, value: receivable.current, note: '期末' },
        { label: `${receivable.previousYear ?? '上年'} 应收账款`, value: receivable.previous, note: '期初' },
        { label: '应收账款平均余额', value: receivable.average, note: '(期初 + 期末) / 2' },
        { label: '营业收入增幅', value: revenueGrowth, kind: 'percent', note: '与上年比较' }
      ],
      expression: `${formatRawValue(revenue)} / ${formatRawValue(receivable.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'inventoryTurnover') {
    const cost = operatingCostDetails(context, year);
    const inventory = averageBalanceDetails(context, context.balance, year, yearIndex, INVENTORY_ALIASES);
    const value = safeDivide(cost.costAbs, inventory.average);
    return {
      rows: [
        ...cost.rows,
        { label: `${year} 存货`, value: inventory.current, note: '期末' },
        { label: `${inventory.previousYear ?? '上年'} 存货`, value: inventory.previous, note: '期初' },
        { label: '存货平均余额', value: inventory.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(cost.costAbs)} / ${formatRawValue(inventory.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'fixedAssetTurnover') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const fixedAssets = rowValue(context.balance, year, FIXED_ASSET_ALIASES);
    const value = safeDivide(revenue, fixedAssets);
    return {
      rows: [
        { label: '营业收入', value: revenue },
        { label: '固定资产净值', value: fixedAssets }
      ],
      expression: `${formatRawValue(revenue)} / ${formatRawValue(fixedAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'totalAssetTurnover') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(revenue, assets.average);
    return {
      rows: [
        { label: '营业收入', value: revenue },
        { label: `${year} 总资产`, value: assets.current, note: '期末' },
        { label: `${assets.previousYear ?? '上年'} 总资产`, value: assets.previous, note: '期初' },
        { label: '平均总资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(revenue)} / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'grossMargin') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
    const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
    const grossProfit = directGrossProfit ?? (
      revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
    );
    const value = safeDivide(grossProfit, revenue);
    const rows: FormulaDetail[] = [
      { label: '营业收入', value: revenue }
    ];
    if (directGrossProfit !== null) {
      rows.push({ label: '毛利润', value: directGrossProfit });
    } else {
      rows.push(
        { label: '营业成本', value: cost },
        { label: '推导毛利润', value: grossProfit, note: '营业收入 - |营业成本|' }
      );
    }
    return {
      rows,
      expression: `${formatRawValue(grossProfit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'operatingMargin') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(operatingProfit, revenue);
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(operatingProfit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'tangOperatingMargin') {
    const totalRevenue = rowValue(context.income, year, TOTAL_OPERATING_REVENUE_ALIASES);
    const totalCost = rowValue(context.income, year, TOTAL_OPERATING_COST_ALIASES);
    const operatingRevenue = rowValue(context.income, year, OPERATING_REVENUE_ALIASES);
    const tangOperatingProfit = totalRevenue !== null && totalCost !== null
      ? totalRevenue - Math.abs(totalCost)
      : null;
    const value = safeDivide(tangOperatingProfit, operatingRevenue);
    return {
      rows: [
        { label: '营业总收入', value: totalRevenue },
        { label: '营业总成本', value: totalCost },
        { label: '老唐营业利润', value: tangOperatingProfit, note: '营业总收入 - |营业总成本|' },
        { label: '营业收入', value: operatingRevenue }
      ],
      expression: `${formatRawValue(tangOperatingProfit)} / ${formatRawValue(operatingRevenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'netMargin') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(netProfit, revenue);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'expenseRatio') {
  const revenue = rowValue(context.income, year, REVENUE_ALIASES);
  const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
  const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
  const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
  const threeFees = sumAbsolute([selling, admin, finance]);
  const value = safeDivide(threeFees, revenue);
  const previousRevenue = previousRowValue(context, context.income, yearIndex, REVENUE_ALIASES);
  const revenueGrowth = growthRate(revenue, previousRevenue);
  return {
    rows: [
      { label: '营业收入', value: revenue },
      { label: '销售费用', value: selling },
      { label: '管理费用', value: admin },
      { label: '财务费用', value: finance },
      { label: '三费合计', value: threeFees, note: '|销售| + |管理| + |财务|' },
      { label: '营业收入增幅', value: revenueGrowth, kind: 'percent', note: '与上年比较' }
    ],
    expression: `${formatRawValue(threeFees)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
  };
  }

  if (definition.key === 'operatingCostRatio') {
    const operatingCost = absoluteValue(rowValue(context.income, year, OPERATING_COST_ALIASES));
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(operatingCost, revenue);
    return {
      rows: [
        { label: '营业成本', value: operatingCost },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(operatingCost)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'sellingExpenseRatio') {
    const sellingExpense = absoluteValue(rowValue(context.income, year, SELLING_EXPENSE_ALIASES));
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(sellingExpense, revenue);
    return {
      rows: [
        { label: '销售费用', value: sellingExpense },
        { label: '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(sellingExpense)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'ebitMargin') {
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const ebit = interestExpense !== null && operatingProfit !== null ? interestExpense + operatingProfit : null;
    const financingCostLabel = context.statements.company.market === 'hk' ? '融资成本' : '利息支出';
    const operatingProfitLabel = context.statements.company.market === 'hk' ? '经营溢利' : '营业利润';
    const value = safeDivide(ebit, revenue);
    return {
      rows: [
        { label: financingCostLabel, value: interestExpense },
        { label: operatingProfitLabel, value: operatingProfit },
        { label: '息税前利润', value: ebit, note: `${financingCostLabel} + ${operatingProfitLabel}` },
        { label: context.statements.company.market === 'hk' ? '营业额' : '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(ebit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'netAssetCashReturn') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(operatingCashflow, assets.average);
    return {
      rows: [
        { label: operatingCashflowDisplayName(context), value: operatingCashflow },
        { label: `${year} 总资产`, value: assets.current, note: '期末' },
        { label: `${assets.previousYear ?? '上年'} 总资产`, value: assets.previous, note: '期初' },
        { label: '平均资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(operatingCashflow)} / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'internalAssetReturn') {
    const operatingProfit = rowValue(context.income, year, OPERATING_PROFIT_ALIASES);
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const investment = longTermEquityInvestmentDetails(context, year);
    const longTermEquityInvestment = investment.total;
    const internalAssets = totalAssets !== null && longTermEquityInvestment !== null
      ? totalAssets - longTermEquityInvestment
      : null;
    const value = safeDivide(operatingProfit, internalAssets);
    return {
      rows: [
        { label: '营业利润', value: operatingProfit },
        { label: '总资产', value: totalAssets },
        ...investment.rows,
        { label: '内部经营资产', value: internalAssets, note: context.statements.company.market === 'hk' ? '总资产 - 联营公司权益 - 合营公司权益' : '总资产 - 长期股权投资' }
      ],
      expression: `${formatRawValue(operatingProfit)} / ${formatRawValue(internalAssets)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'expenseToGrossProfitRatio') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
    const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
    const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
    const threeFees = sumAbsolute([selling, admin, finance]);
    const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
    const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
    const grossProfit = directGrossProfit ?? (
      revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
    );
    const value = safeDivide(threeFees, grossProfit);
    const grossProfitRows: FormulaDetail[] = directGrossProfit !== null
      ? [{ label: '毛利润', value: directGrossProfit, note: '直接科目' }]
      : [
          { label: '营业收入', value: revenue },
          { label: '营业成本', value: cost },
          { label: '推导毛利润', value: grossProfit, note: '营业收入 - |营业成本|' }
        ];
    return {
      rows: [
        { label: '销售费用', value: selling },
        { label: '管理费用', value: admin },
        { label: '财务费用', value: finance },
        { label: '三费合计', value: threeFees, note: '|销售| + |管理| + |财务|' },
        ...grossProfitRows
      ],
      expression: `${formatRawValue(threeFees)} / ${formatRawValue(grossProfit)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'revenueGrowth') {
    return growthDetails(definition, context, year, yearIndex, '营业收入', context.income, REVENUE_ALIASES);
  }

  if (definition.key === 'operatingProfitGrowth') {
    return growthDetails(definition, context, year, yearIndex, '营业利润', context.income, OPERATING_PROFIT_ALIASES);
  }

  if (definition.key === 'assetGrowth') {
    return growthDetails(definition, context, year, yearIndex, '总资产', context.balance, TOTAL_ASSET_ALIASES);
  }

  if (definition.key === 'netAssetGrowth') {
    return growthDetails(definition, context, year, yearIndex, '净资产', context.balance, NET_ASSET_ALIASES);
  }

  if (definition.key === 'operatingCashflowAboveProfit') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const value = judgmentValue(operatingCashflow, netProfit, (cashflow, profit) => cashflow > profit && profit > 0);
    return judgmentDetails(definition, value, [
      { label: operatingCashflowDisplayName(context), value: operatingCashflow },
      { label: '净利润', value: netProfit }
    ]);
  }

  if (definition.key === 'operatingCashflowExceedsProfit') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const value = judgmentValue(operatingCashflow, netProfit, (cashflow, profit) => cashflow > profit);
    return judgmentDetails(definition, value, [
      { label: operatingCashflowDisplayName(context), value: operatingCashflow },
      { label: '净利润', value: netProfit }
    ]);
  }

  if (definition.key === 'operatingCashflowCoversRevenue') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = judgmentValue(operatingCashflow, revenue, (cashflow, operatingRevenue) => cashflow >= operatingRevenue);
    return judgmentDetails(definition, value, [
      { label: operatingCashflowDisplayName(context), value: operatingCashflow },
      { label: '营业收入', value: revenue }
    ]);
  }

  if (definition.key === 'cashEquivalentIncreasePositive') {
    const increase = cashEquivalentIncrease(context, year);
    const beginning = context.statements.company.market === 'hk'
      ? rowValue(context.cashflow, year, BEGIN_CASH_EQUIVALENT_ALIASES)
      : null;
    const ending = context.statements.company.market === 'hk'
      ? rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES)
      : null;
    const value = increase === null ? null : Number(increase > 0);
    return judgmentDetails(definition, value, [
      ...(beginning !== null && ending !== null
        ? [
            { label: '期末现金', value: ending },
            { label: '期初现金', value: beginning }
          ]
        : []),
      { label: '现金及现金等价物净增加额', value: increase }
    ]);
  }

  if (definition.key === 'endingCashAboveDebt') {
    const endingCash = rowValue(context.cashflow, year, END_CASH_EQUIVALENT_ALIASES);
    const debt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const value = judgmentValue(endingCash, debt.total, (cash, totalDebt) => cash > totalDebt);
    return judgmentDetails(definition, value, [
      { label: '期末现金及现金等价物余额', value: endingCash },
      ...debt.rows,
      { label: '有息负债合计', value: debt.total }
    ]);
  }

  if (definition.key === 'investmentOutflowAboveInflow') {
    if (context.statements.company.market === 'hk') {
      const netCashflow = rowValue(context.cashflow, year, HK_INVESTMENT_CASH_NET_ALIASES);
      const value = netCashflow === null ? null : Number(netCashflow < 0);
      return judgmentDetails(definition, value, [
        { label: '投资业务现金净额', value: netCashflow }
      ]);
    }
    const outflow = absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_OUTFLOW_ALIASES));
    const inflow = absoluteValue(rowValue(context.cashflow, year, INVESTMENT_CASH_INFLOW_ALIASES));
    const value = judgmentValue(outflow, inflow, (cashOutflow, cashInflow) => cashOutflow > cashInflow);
    return judgmentDetails(definition, value, [
      { label: '投资活动现金流出', value: outflow },
      { label: '投资活动现金流入', value: inflow }
    ]);
  }

  return {
    rows: [],
    expression: '-'
  };
}

function averageBalanceDetails(
  context: MetricContext,
  table: StatementTable | undefined,
  year: string,
  yearIndex: number,
  aliases: string[]
) {
  const row = findRow(table, aliases);
  const current = toNumber(row?.values[year]);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? toNumber(row?.values[previousYear]) : null;
  const average = current !== null && previous !== null ? (current + previous) / 2 : null;
  return { current, previous, previousYear, average };
}

function growthDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number,
  label: string,
  table: StatementTable | undefined,
  aliases: string[]
): FormulaDetails {
  const current = rowValue(table, year, aliases);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? rowValue(table, previousYear, aliases) : null;
  const change = current !== null && previous !== null ? current - previous : null;
  const value = growthRate(current, previous);
  return {
    rows: [
      { label: `${year} ${label}`, value: current, note: '本期' },
      { label: `${previousYear ?? '上期'} ${label}`, value: previous, note: '上期' },
      { label: `${label}变动额`, value: change, note: '本期 - 上期' }
    ],
    expression: `(${formatRawValue(current)} - ${formatRawValue(previous)}) / ${formatRawValue(previous)} = ${formatMetricValue(value, definition.kind)}`
  };
}

function findRow(table: StatementTable | undefined, aliases: string[]) {
  if (!table) return undefined;
  const normalizedAliases = aliases.map(normalizeLabel);
  const rows = table.rows.map((row) => ({
    row,
    item: normalizeLabel(row.item)
  }));
  const exact = rows.find(({ item }) => normalizedAliases.some((alias) => item === alias));
  if (exact) return exact.row;

  return rows.find(({ item }) => {
    return normalizedAliases.some((alias) => alias.length >= 6 && item.startsWith(alias));
  })?.row;
}

function findRows(table: StatementTable | undefined, aliases: string[]) {
  if (!table) return [];
  const normalizedAliases = aliases.map(normalizeLabel);
  return table.rows.filter((row) => {
    const item = normalizeLabel(row.item);
    return normalizedAliases.some((alias) => item === alias || (alias.length >= 6 && item.startsWith(alias)));
  });
}

function missingRequirements(definition: MetricDefinition, context: MetricContext): string[] {
  if (context.statements.company.market === 'hk' && definition.key === 'operatingCostRatio') {
    const latestYear = context.statements.years[0];
    return operatingCostDetails(context, latestYear).costAbs === null ? ['销售成本或毛利'] : [];
  }
  if (context.statements.company.market === 'hk' && definition.key === 'internalAssetReturn') {
    const commonMissing = definition.requirements
      .filter((requirement) => requirement.aliases !== LONG_TERM_EQUITY_INVESTMENT_ALIASES)
      .filter((requirement) => {
        const table = requirement.table === 'balance' ? context.balance : context.income;
        return !findRow(table, requirement.aliases);
      })
      .map((requirement) => requirement.label);
    const hasAssociateOrJointVenture = HK_ASSOCIATE_JOINT_VENTURE_GROUPS.some((group) =>
      Boolean(findRow(context.balance, group.aliases))
    );
    return hasAssociateOrJointVenture
      ? commonMissing
      : [...commonMissing, '联营公司权益或合营公司权益'];
  }
  if (context.statements.company.market === 'hk' && definition.key === 'cashEquivalentIncreasePositive') {
    return cashEquivalentIncrease(context, context.statements.years[0]) === null
      ? ['期初现金和期末现金']
      : [];
  }
  if (context.statements.company.market === 'hk' && definition.key === 'investmentOutflowAboveInflow') {
    return findRow(context.cashflow, HK_INVESTMENT_CASH_NET_ALIASES)
      ? []
      : ['投资业务现金净额'];
  }
  return definition.requirements
    .filter((requirement) => {
      const table = requirement.table === 'balance'
        ? context.balance
        : requirement.table === 'cashflow'
          ? context.cashflow
          : context.income;
      if (definition.key === 'receivablesToAssets' && requirement.label === '所有“应收”科目') {
        return !table?.rows.some((row) => row.item.includes('应收') || row.sourceItem?.includes('应收'));
      }
      return !findRow(table, requirement.aliases);
    })
    .map((requirement) => requirement.label);
}

function judgmentDetails(
  definition: MetricDefinition,
  value: number | null,
  rows: FormulaDetail[]
): FormulaDetails {
  return {
    rows,
    expression: `${definition.formula}：${formatMetricValue(value, definition.kind)}`
  };
}

function metricAlerts(definition: MetricDefinition, points: MetricPoint[]): MetricAlert[] {
  const alerts: MetricAlert[] = [];
  const missingYears = points.filter((point) => point.value === null).map((point) => point.year);
  if (missingYears.length) {
    alerts.push({
      message: `${missingYears.join('、')} 无法计算，通常是公式科目缺失或分母为 0。`,
      tone: 'warning'
    });
  }

  for (const point of points) {
    if (point.value === null) continue;
    if (definition.kind === 'percent' && Math.abs(point.value) >= 1) {
      alerts.push({
        year: point.year,
        message: `${point.year} 数值达到 ${formatMetricValue(point.value, definition.kind)}，建议核对公式明细。`,
        tone: 'danger'
      });
    }
    if (definition.kind === 'times' && Math.abs(point.value) >= 100) {
      alerts.push({
        year: point.year,
        message: `${point.year} 倍数达到 ${formatMetricValue(point.value, definition.kind)}，可能由分母过小导致。`,
        tone: 'warning'
      });
    }
  }

  return alerts.slice(0, 3);
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized || normalized === '-') return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function sumAbsolute(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + Math.abs(value ?? 0), 0);
}

function formatTooltip(
  params: unknown,
  result: MetricResult,
  displayPoints: MetricPoint[]
): string {
  const point = displayPoints[getTooltipDataIndex(params)] ?? displayPoints[0];
  if (!point) return '';

  const rows = point.details
    .map((detail) => `
      <tr>
        <th>${escapeHtml(detail.label)}</th>
        <td>${escapeHtml(formatDetailValue(detail))}</td>
        <td>${escapeHtml(detail.note ?? '')}</td>
      </tr>
    `)
    .join('');

  return `
    <div class="metric-tooltip-content">
      <div class="metric-tooltip-title">
        <strong>${escapeHtml(point.year)} ${escapeHtml(result.definition.label)}</strong>
        <span>${escapeHtml(formatMetricValue(point.value, result.definition.kind))}</span>
      </div>
      <div class="metric-tooltip-formula">${escapeHtml(result.definition.formula)}</div>
      <div class="metric-tooltip-expression">${escapeHtml(point.expression)}</div>
      <table>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function getTooltipDataIndex(params: unknown): number {
  const firstParam = Array.isArray(params) ? params[0] : params;
  if (!firstParam || typeof firstParam !== 'object') return 0;
  const dataIndex = (firstParam as { dataIndex?: unknown }).dataIndex;
  return typeof dataIndex === 'number' ? dataIndex : 0;
}

function formatDetailValue(detail: FormulaDetail): string {
  if (detail.kind === 'percent' || detail.kind === 'times' || detail.kind === 'judgment') {
    return formatMetricValue(detail.value, detail.kind);
  }
  return formatRawValue(detail.value);
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()（）\s_、，,]/g, '')
    .replace(/帐/g, '账')
    .replace(/凈/g, '净');
}

function formatMetricValue(value: number | null, kind: MetricKind): string {
  if (value === null) return '-';
  if (kind === 'judgment') return value === 1 ? '通过' : '不通过';
  if (kind === 'percent') return `${(value * 100).toFixed(2)}%`;
  return `${value.toFixed(2)} 次`;
}

function formatRawValue(value: number | null): string {
  if (value === null) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  }
  if (abs >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}亿`;
  }
  if (abs >= 10_000) {
    return `${(value / 10_000).toFixed(2)}万`;
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAxisValue(value: number, kind: MetricKind): string {
  if (kind === 'judgment') return value === 1 ? '通过' : '不通过';
  if (kind === 'percent') return `${(value * 100).toFixed(0)}%`;
  return value.toFixed(1);
}
</script>

<template>
  <section class="custom-metric-panel">
    <div class="custom-metric-head">
      <div>
        <p class="section-label">自定义指标图表</p>
        <h3>{{ selectedResult.definition.label }}</h3>
      </div>
      <strong :class="{
        critical: isCriticalMetric(selectedResult),
        positive: isPositiveMetric(selectedResult),
        warning: isWarningMetric(selectedResult)
      }">
        {{ formatMetricValue(selectedResult.latest, selectedResult.definition.kind) }}
      </strong>
    </div>

    <div class="metric-group-tabs" aria-label="指标分组">
      <button
        v-for="group in metricGroups"
        :key="group.key"
        :class="{ active: activeMetricGroup === group.key }"
        type="button"
        @click="activeMetricGroup = group.key"
      >
        {{ group.label }}
      </button>
    </div>

    <div class="metric-selector" aria-label="自定义指标">
      <button
        v-for="result in groupedMetricResults"
        :key="result.definition.key"
        :class="{
          active: activeMetricKey === result.definition.key,
          critical: isCriticalMetric(result),
          positive: isPositiveMetric(result),
          warning: isWarningMetric(result)
        }"
        type="button"
        @click="activeMetricKey = result.definition.key"
      >
        <span>{{ result.definition.label }}</span>
        <strong>{{ formatMetricValue(result.latest, result.definition.kind) }}</strong>
      </button>
    </div>

    <div ref="chartElement" class="custom-chart" role="img" :aria-label="`${selectedResult.definition.label} 趋势图`"></div>

    <div class="formula-row">
      <span>{{ selectedResult.definition.formula }}</span>
      <small>{{ selectedResult.definition.description }}</small>
    </div>

    <div v-if="selectedResult.missing.length" class="metric-warning">
      缺少科目：{{ selectedResult.missing.join('、') }}
    </div>

    <div v-if="selectedResult.alerts.length" class="metric-alert-list">
      <div
        v-for="alert in selectedResult.alerts"
        :key="`${alert.year ?? 'metric'}-${alert.message}`"
        :class="['metric-alert', alert.tone]"
      >
        {{ alert.message }}
      </div>
    </div>
  </section>
</template>
