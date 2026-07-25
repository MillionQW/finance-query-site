import type {
  PeriodMetricSeries,
  ReportPeriod
} from '../types/finance';

export interface PeriodMetricCard {
  key: string;
  label: string;
  value: number | null;
  comparisonValue: number | null;
  yoy: number | null;
}

function pointValue(
  series: PeriodMetricSeries,
  period: string | null | undefined
): number | null {
  if (!period) return null;
  return series.points.find((point) => point.period === period)?.value ?? null;
}

export function buildPeriodMetricCards(
  series: PeriodMetricSeries[],
  period: ReportPeriod | null | undefined
): PeriodMetricCard[] {
  return series.map((item) => {
    const value = pointValue(item, period?.key);
    const comparisonValue = pointValue(item, period?.priorYearKey);
    const yoy = value !== null && comparisonValue !== null && comparisonValue !== 0
      ? ((value - comparisonValue) / Math.abs(comparisonValue)) * 100
      : null;
    return {
      key: item.key,
      label: item.label,
      value,
      comparisonValue,
      yoy
    };
  });
}

export function latestPeriodWithData(
  periods: ReportPeriod[],
  series: PeriodMetricSeries[]
): ReportPeriod | null {
  return periods.find((period) =>
    series.some((item) => pointValue(item, period.key) !== null)
  ) ?? null;
}

export function reportPeriodLabels(periods: ReportPeriod[]): Record<string, string> {
  return Object.fromEntries(periods.map((period) => [period.key, period.label]));
}

export function reportPeriodComparisons(periods: ReportPeriod[]): Record<string, string> {
  return Object.fromEntries(
    periods
      .filter((period): period is ReportPeriod & { priorYearKey: string } => Boolean(period.priorYearKey))
      .map((period) => [period.key, period.priorYearKey])
  );
}
