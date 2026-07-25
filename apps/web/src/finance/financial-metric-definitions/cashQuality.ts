import { CAPITAL_EXPENDITURE_ALIASES, CUSTOMER_CASH_RECEIPTS_ALIASES, DEDUCTED_NET_PROFIT_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { rowValue, safeDivide } from '../financial-metric-engine';
import type { MetricDefinition } from '../financial-metric-types';
import { averageBalance, freeCashFlowDetails, rollingCashConversionDetails } from '../financial-metric-calculation-helpers';

export const cashQualityDefinitions: MetricDefinition[] = [
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
  }
];
