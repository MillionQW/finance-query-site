import type { StatementTable } from '../types/finance';
import { cashFlowClassificationByCode } from './cash-flow-classification';
import type { MetricKind } from './financial-metric-types';

export function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized || normalized === '-') return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

export function growthRate(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function growthGapValue(
  primaryCurrent: number | null,
  primaryPrevious: number | null,
  benchmarkCurrent: number | null,
  benchmarkPrevious: number | null
): number | null {
  const primaryGrowth = growthRate(primaryCurrent, primaryPrevious);
  const benchmarkGrowth = growthRate(benchmarkCurrent, benchmarkPrevious);
  return primaryGrowth !== null && benchmarkGrowth !== null
    ? primaryGrowth - benchmarkGrowth
    : null;
}

export function absoluteValue(value: number | null): number | null {
  return value === null ? null : Math.abs(value);
}

export function sumAbsolute(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + Math.abs(value ?? 0), 0);
}

export function calculateFreeCashFlow(
  operatingCashflow: number | null,
  combinedCapitalExpenditure: number | null,
  separateCapitalExpenditures: Array<number | null>
): { capitalExpenditure: number | null; freeCashFlow: number | null } {
  const separateValues = separateCapitalExpenditures.filter((value): value is number => value !== null);
  const separateTotal = separateValues.reduce((total, value) => total + Math.abs(value), 0);
  const capitalExpenditure = combinedCapitalExpenditure !== null
    ? Math.abs(combinedCapitalExpenditure)
    : separateValues.length
      ? separateTotal
      : null;
  return {
    capitalExpenditure,
    freeCashFlow: operatingCashflow !== null && capitalExpenditure !== null
      ? operatingCashflow - capitalExpenditure
      : null
  };
}

export function calculateRollingRatio(
  numerators: Array<number | null>,
  denominators: Array<number | null>,
  startIndex: number,
  windowSize: number
): { numeratorTotal: number | null; denominatorTotal: number | null; value: number | null } {
  const numeratorWindow = numerators.slice(startIndex, startIndex + windowSize);
  const denominatorWindow = denominators.slice(startIndex, startIndex + windowSize);
  if (
    startIndex < 0 ||
    numeratorWindow.length < windowSize ||
    denominatorWindow.length < windowSize ||
    numeratorWindow.some((value) => value === null) ||
    denominatorWindow.some((value) => value === null)
  ) {
    return { numeratorTotal: null, denominatorTotal: null, value: null };
  }
  const numeratorTotal = numeratorWindow.reduce<number>((total, value) => total + (value ?? 0), 0);
  const denominatorTotal = denominatorWindow.reduce<number>((total, value) => total + (value ?? 0), 0);
  return { numeratorTotal, denominatorTotal, value: safeDivide(numeratorTotal, denominatorTotal) };
}

export function calculateIncrementalReturn(
  currentProfit: number | null,
  baseProfit: number | null,
  currentCapital: number | null,
  baseCapital: number | null
): { profitChange: number | null; capitalChange: number | null; value: number | null } {
  const profitChange = currentProfit !== null && baseProfit !== null
    ? currentProfit - baseProfit
    : null;
  const capitalChange = currentCapital !== null && baseCapital !== null
    ? currentCapital - baseCapital
    : null;
  return {
    profitChange,
    capitalChange,
    value: profitChange !== null && capitalChange !== null && capitalChange > 0
      ? profitChange / capitalChange
      : null
  };
}

export function calculateDevelopmentCapitalizationProxy(
  currentDevelopmentExpenditure: number | null,
  previousDevelopmentExpenditure: number | null,
  researchExpense: number | null
): {
  developmentIncrease: number | null;
  totalResearchInvestmentProxy: number | null;
  value: number | null;
} {
  if (
    currentDevelopmentExpenditure === null ||
    previousDevelopmentExpenditure === null ||
    researchExpense === null
  ) {
    return { developmentIncrease: null, totalResearchInvestmentProxy: null, value: null };
  }
  const developmentIncrease = Math.max(currentDevelopmentExpenditure - previousDevelopmentExpenditure, 0);
  const totalResearchInvestmentProxy = Math.abs(researchExpense) + developmentIncrease;
  return {
    developmentIncrease,
    totalResearchInvestmentProxy,
    value: safeDivide(developmentIncrease, totalResearchInvestmentProxy)
  };
}

export function calculateRollingStatistics(
  values: Array<number | null>,
  startIndex: number,
  windowSize: number
): { count: number; mean: number | null; standardDeviation: number | null } {
  const window = values.slice(startIndex, startIndex + windowSize);
  if (
    startIndex < 0 ||
    window.length < windowSize ||
    window.some((value) => value === null)
  ) {
    return { count: window.filter((value) => value !== null).length, mean: null, standardDeviation: null };
  }
  const numericValues = window as number[];
  const mean = numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
  const variance = numericValues.reduce((total, value) => total + (value - mean) ** 2, 0) / numericValues.length;
  return {
    count: numericValues.length,
    mean,
    standardDeviation: Math.sqrt(variance)
  };
}

export function calculateCashConversionCycle(
  revenue: number | null,
  operatingCost: number | null,
  averageReceivables: number | null,
  averageInventory: number | null,
  averagePayables: number | null
) {
  const receivableDays = safeDivide(averageReceivables === null ? null : averageReceivables * 365, revenue);
  const inventoryDays = safeDivide(averageInventory === null ? null : averageInventory * 365, operatingCost);
  const payableDays = safeDivide(averagePayables === null ? null : averagePayables * 365, operatingCost);
  const cycle = receivableDays !== null && inventoryDays !== null && payableDays !== null
    ? receivableDays + inventoryDays - payableDays
    : null;
  return { receivableDays, inventoryDays, payableDays, cycle };
}

export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()（）\s_、，,]/g, '')
    .replace(/帐/g, '账')
    .replace(/凈/g, '净');
}

export function findRow(table: StatementTable | undefined, aliases: string[]) {
  if (!table) return undefined;
  const normalizedAliases = aliases.map(normalizeLabel);
  const rows = table.rows.map((row) => ({ row, item: normalizeLabel(row.item) }));
  const exact = rows.find(({ item }) => normalizedAliases.some((alias) => item === alias));
  if (exact) return exact.row;
  return rows.find(({ item }) =>
    normalizedAliases.some((alias) => alias.length >= 6 && item.startsWith(alias))
  )?.row;
}

export function findRows(table: StatementTable | undefined, aliases: string[]) {
  if (!table) return [];
  const normalizedAliases = aliases.map(normalizeLabel);
  return table.rows.filter((row) => {
    const item = normalizeLabel(row.item);
    return normalizedAliases.some((alias) => item === alias || (alias.length >= 6 && item.startsWith(alias)));
  });
}

export function rowValue(table: StatementTable | undefined, year: string, aliases: string[]): number | null {
  const row = findRow(table, aliases);
  return toNumber(row?.values[year]);
}

export function formatRawValue(value: number | null): string {
  if (value === null) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

export function formatMetricValue(value: number | null, kind: MetricKind): string {
  if (value === null) return '-';
  if (kind === 'classification') return cashFlowClassificationByCode(value)?.companyType ?? `第${value}类`;
  if (kind === 'judgment') return value === 1 ? '通过' : '不通过';
  if (kind === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (kind === 'amount') return formatRawValue(value);
  if (kind === 'days') return `${value.toFixed(1)} 天`;
  return `${value.toFixed(2)} 次`;
}
