import { INTEREST_BEARING_DEBT_GROUPS, INVENTORY_ALIASES, NET_ASSET_ALIASES, NET_PROFIT_ALIASES, OPERATING_CASHFLOW_ALIASES, OPERATING_PROFIT_ALIASES, RECEIVABLE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { formatMetricValue, growthGapValue, growthRate, rowValue } from '../financial-metric-engine';
import type { FormulaDetails, MetricContext, MetricDefinition } from '../financial-metric-types';
import { previousRowValue, sumRows, operatingCashflowDisplayName, growthDetails, growthGapDetails } from '../financial-metric-calculation-helpers';

export function growthMetricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails | null {
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

  if (definition.key === 'receivablesRevenueGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '应收账款', context.balance, RECEIVABLE_ALIASES,
      '营业收入', context.income, REVENUE_ALIASES
    );
  }

  if (definition.key === 'inventoryRevenueGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '存货', context.balance, INVENTORY_ALIASES,
      '营业收入', context.income, REVENUE_ALIASES
    );
  }

  if (definition.key === 'profitCashflowGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '净利润', context.income, NET_PROFIT_ALIASES,
      operatingCashflowDisplayName(context), context.cashflow, OPERATING_CASHFLOW_ALIASES
    );
  }

  if (definition.key === 'assetRevenueGrowthGap') {
    return growthGapDetails(
      definition, context, year, yearIndex,
      '总资产', context.balance, TOTAL_ASSET_ALIASES,
      '营业收入', context.income, REVENUE_ALIASES
    );
  }

  if (definition.key === 'debtCashflowGrowthGap') {
    const previousYear = context.statements.years[yearIndex + 1];
    const currentDebt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS).total;
    const previousDebt = previousYear
      ? sumRows(context.balance, previousYear, INTEREST_BEARING_DEBT_GROUPS).total
      : null;
    const currentCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const previousCashflow = previousRowValue(context, context.cashflow, yearIndex, OPERATING_CASHFLOW_ALIASES);
    const debtGrowth = growthRate(currentDebt, previousDebt);
    const cashflowGrowth = growthRate(currentCashflow, previousCashflow);
    const value = growthGapValue(currentDebt, previousDebt, currentCashflow, previousCashflow);
    return {
      rows: [
        { label: '有息负债增长率', value: debtGrowth, kind: 'percent' },
        { label: `${operatingCashflowDisplayName(context)}增长率`, value: cashflowGrowth, kind: 'percent' }
      ],
      expression: `${formatMetricValue(debtGrowth, 'percent')} - ${formatMetricValue(cashflowGrowth, 'percent')} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  return null;
}
