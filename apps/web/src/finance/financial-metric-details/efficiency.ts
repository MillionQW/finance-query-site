import { ACCOUNTS_PAYABLE_ALIASES, FIXED_ASSET_ALIASES, INVENTORY_ALIASES, RECEIVABLE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES } from '../financial-metric-fields';
import { formatMetricValue, formatRawValue, growthRate, rowValue, safeDivide } from '../financial-metric-engine';
import type { FormulaDetails, MetricContext, MetricDefinition } from '../financial-metric-types';
import { previousRowValue, operatingCostDetails, cashConversionCycleDetails, averageBalanceDetails } from '../financial-metric-calculation-helpers';

export function efficiencyMetricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails | null {
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

  if (definition.key === 'receivablesToRevenue') {
    const receivable = rowValue(context.balance, year, RECEIVABLE_ALIASES);
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const value = safeDivide(receivable, revenue);
    return {
      rows: [
        { label: `${year} 应收账款`, value: receivable, note: '期末' },
        { label: context.statements.company.market === 'hk' ? '年度营业额' : '年度营业收入', value: revenue, note: year }
      ],
      expression: `${formatRawValue(receivable)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'inventoryTurnoverDays') {
    const cost = operatingCostDetails(context, year);
    const inventory = averageBalanceDetails(context, context.balance, year, yearIndex, INVENTORY_ALIASES);
    const value = safeDivide(inventory.average === null ? null : inventory.average * 365, cost.costAbs);
    return {
      rows: [
        ...cost.rows,
        { label: `${year} 存货`, value: inventory.current, note: '期末' },
        { label: `${inventory.previousYear ?? '上年'} 存货`, value: inventory.previous, note: '期初' },
        { label: '存货平均余额', value: inventory.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(inventory.average)} × 365 / ${formatRawValue(cost.costAbs)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'payableTurnover') {
    const cost = operatingCostDetails(context, year);
    const payable = averageBalanceDetails(context, context.balance, year, yearIndex, ACCOUNTS_PAYABLE_ALIASES);
    const value = safeDivide(cost.costAbs, payable.average);
    return {
      rows: [
        ...cost.rows,
        { label: `${year} 应付账款`, value: payable.current, note: '期末' },
        { label: `${payable.previousYear ?? '上年'} 应付账款`, value: payable.previous, note: '期初' },
        { label: '应付账款平均余额', value: payable.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(cost.costAbs)} / ${formatRawValue(payable.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'cashConversionCycle') {
    const details = cashConversionCycleDetails(context, year, yearIndex);
    return {
      rows: [
        { label: '营业收入', value: details.revenue },
        ...details.cost.rows,
        { label: '应收账款平均余额', value: details.receivable.average },
        { label: '应收天数', value: details.receivableDays, kind: 'days', note: '平均应收账款 × 365 / 营业收入' },
        { label: '存货平均余额', value: details.inventory.average },
        { label: '存货天数', value: details.inventoryDays, kind: 'days', note: '平均存货 × 365 / 营业成本' },
        { label: '应付账款平均余额', value: details.payable.average },
        { label: '应付天数', value: details.payableDays, kind: 'days', note: '平均应付账款 × 365 / 营业成本' }
      ],
      expression: `${formatMetricValue(details.receivableDays, 'days')} + ${formatMetricValue(details.inventoryDays, 'days')} - ${formatMetricValue(details.payableDays, 'days')} = ${formatMetricValue(details.cycle, definition.kind)}`
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

  return null;
}
