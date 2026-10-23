import type { FinancialStatements } from '../types/finance';
export function annualSummaryCards(statements: FinancialStatements | null) {
  const year = statements?.years[0];
  const previousYear = year ? String(Number(year) - 1) : '';
  return (statements?.highlights ?? []).slice(0, 4).map(series => {
    const latest = series.points.find(p => p.year === year)?.value ?? null;
    const previous = series.points.find(p => p.year === previousYear)?.value ?? null;
    return { ...series, year: year ?? '', latest,
      delta: latest !== null && previous !== null && previous > 0 ? (latest / previous - 1) * 100 : null };
  });
}
