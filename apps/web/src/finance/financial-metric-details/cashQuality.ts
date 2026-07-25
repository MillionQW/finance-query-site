import { CUSTOMER_CASH_RECEIPTS_ALIASES, DEDUCTED_NET_PROFIT_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { formatMetricValue, formatRawValue, rowValue, safeDivide } from '../financial-metric-engine';
import type { FormulaDetails, MetricContext, MetricDefinition } from '../financial-metric-types';
import { freeCashFlowDetails, rollingCashConversionDetails, operatingCashflowDisplayName, averageBalanceDetails } from '../financial-metric-calculation-helpers';

export function cashQualityMetricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails | null {
  if (definition.key === 'operatingCashConversion') {
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const value = safeDivide(operatingCashflow, netProfit);
    return {
      rows: [
        { label: operatingCashflowDisplayName(context), value: operatingCashflow },
        { label: '净利润', value: netProfit }
      ],
      expression: `${formatRawValue(operatingCashflow)} / ${formatRawValue(netProfit)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cumulativeCashConversion3y') {
    const rolling = rollingCashConversionDetails(context, yearIndex, 3);
    return {
      rows: [
        { label: '滚动区间', value: null, note: rolling.years.join('、') || '-' },
        { label: '近3年经营现金流合计', value: rolling.operatingCashflowTotal },
        { label: '近3年净利润合计', value: rolling.netProfitTotal }
      ],
      expression: `${formatRawValue(rolling.operatingCashflowTotal)} / ${formatRawValue(rolling.netProfitTotal)} = ${formatMetricValue(rolling.value, definition.kind)}`
    };
  }

  if (definition.key === 'freeCashFlow' || definition.key === 'freeCashFlowMargin') {
    const freeCashFlow = freeCashFlowDetails(context, year);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = definition.key === 'freeCashFlow'
      ? freeCashFlow.freeCashFlow
      : safeDivide(freeCashFlow.freeCashFlow, revenue);
    return {
      rows: [
        { label: operatingCashflowDisplayName(context), value: freeCashFlow.operatingCashflow },
        ...(freeCashFlow.combinedCapitalExpenditure === null
          ? [
              { label: '购建固定资产', value: freeCashFlow.fixedAssetCapitalExpenditure },
              { label: '购建无形资产及其他资产', value: freeCashFlow.intangibleCapitalExpenditure }
            ]
          : []),
        { label: '资本开支', value: freeCashFlow.capitalExpenditure, note: '购建长期资产支付现金的绝对值' },
        { label: '自由现金流', value: freeCashFlow.freeCashFlow, note: '经营现金流 - 资本开支' },
        ...(definition.key === 'freeCashFlowMargin'
          ? [{ label: context.statements.company.market === 'hk' ? '营业额' : '营业收入', value: revenue }]
          : [])
      ],
      expression: definition.key === 'freeCashFlow'
        ? `${formatRawValue(freeCashFlow.operatingCashflow)} - ${formatRawValue(freeCashFlow.capitalExpenditure)} = ${formatMetricValue(value, definition.kind)}`
        : `${formatRawValue(freeCashFlow.freeCashFlow)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'accrualRatio') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const accruals = netProfit !== null && operatingCashflow !== null
      ? netProfit - operatingCashflow
      : null;
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(accruals, assets.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: operatingCashflowDisplayName(context), value: operatingCashflow },
        { label: '应计利润', value: accruals, note: '净利润 - 经营现金流' },
        { label: '平均总资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `(${formatRawValue(netProfit)} - ${formatRawValue(operatingCashflow)}) / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'deductedProfitRatio') {
    const deductedProfit = rowValue(context.income, year, DEDUCTED_NET_PROFIT_ALIASES);
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const value = safeDivide(deductedProfit, netProfit);
    return {
      rows: [
        { label: '扣非归母净利润', value: deductedProfit },
        { label: '归母净利润', value: netProfit }
      ],
      expression: `${formatRawValue(deductedProfit)} / ${formatRawValue(netProfit)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cashCollectionRatio') {
    const customerCashReceipts = rowValue(context.cashflow, year, CUSTOMER_CASH_RECEIPTS_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(customerCashReceipts, revenue);
    return {
      rows: [
        { label: '销售商品、提供劳务收到的现金', value: customerCashReceipts },
        { label: context.statements.company.market === 'hk' ? '营业额' : '营业收入', value: revenue }
      ],
      expression: `${formatRawValue(customerCashReceipts)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  return null;
}
