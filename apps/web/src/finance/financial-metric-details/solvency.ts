import { CASH_ALIASES, CURRENT_ASSET_ALIASES, CURRENT_LIABILITY_ALIASES, INTEREST_BEARING_DEBT_GROUPS, INTEREST_EXPENSE_ALIASES, INVENTORY_ALIASES, OPERATING_CASHFLOW_ALIASES, RECEIVABLE_ALIASES, REVENUE_ALIASES, TOTAL_ASSET_ALIASES, TOTAL_LIABILITY_ALIASES } from '../financial-metric-fields';
import { absoluteValue, formatMetricValue, formatRawValue, rowValue, safeDivide } from '../financial-metric-engine';
import type { FormulaDetails, MetricContext, MetricDefinition } from '../financial-metric-types';
import { ebitValue, sumRows, operatingCashflowDisplayName, sumRowsContaining } from '../financial-metric-calculation-helpers';

export function solvencyMetricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails | null {
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

  if (definition.key === 'assetLiabilityRatio') {
    const totalLiabilities = rowValue(context.balance, year, TOTAL_LIABILITY_ALIASES);
    const totalAssets = rowValue(context.balance, year, TOTAL_ASSET_ALIASES);
    const value = safeDivide(totalLiabilities, totalAssets);
    return {
      rows: [
        { label: '负债合计', value: totalLiabilities, note: '期末' },
        { label: '总资产', value: totalAssets, note: '期末' }
      ],
      expression: `${formatRawValue(totalLiabilities)} / ${formatRawValue(totalAssets)} = ${formatMetricValue(value, definition.kind)}`
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

  if (definition.key === 'interestCoverage') {
    const ebit = ebitValue(context, year);
    const interestExpense = absoluteValue(rowValue(context.income, year, INTEREST_EXPENSE_ALIASES));
    const value = safeDivide(ebit, interestExpense);
    return {
      rows: [
        { label: '息税前利润 EBIT', value: ebit },
        { label: context.statements.company.market === 'hk' ? '融资成本' : '利息支出', value: interestExpense }
      ],
      expression: `${formatRawValue(ebit)} / ${formatRawValue(interestExpense)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'netDebtToOperatingCash') {
    const debt = sumRows(context.balance, year, INTEREST_BEARING_DEBT_GROUPS);
    const cash = rowValue(context.balance, year, CASH_ALIASES);
    const operatingCashflow = rowValue(context.cashflow, year, OPERATING_CASHFLOW_ALIASES);
    const netDebt = debt.total !== null && cash !== null ? debt.total - cash : null;
    const value = safeDivide(netDebt, operatingCashflow);
    return {
      rows: [
        ...debt.rows,
        { label: '有息负债合计', value: debt.total },
        { label: '现金及现金等价物', value: cash },
        { label: '净债务', value: netDebt, note: '有息负债 - 现金' },
        { label: operatingCashflowDisplayName(context), value: operatingCashflow }
      ],
      expression: `${formatRawValue(netDebt)} / ${formatRawValue(operatingCashflow)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  return null;
}
