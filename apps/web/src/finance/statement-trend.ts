import type { ReportPeriod } from '../types/finance';

export interface StatementTrendGroup {
  key: string;
  label: string;
  periods: ReportPeriod[];
}

// Compare annual reports with annual reports, and interim reports with the
// same reporting date in other years. Never combine Q1 and nine-month totals.
export function statementTrendGroups(periods: ReportPeriod[], availableKeys: string[]): StatementTrendGroup[] {
  const available = new Set(availableKeys);
  const groups = new Map<string, StatementTrendGroup>();
  for (const period of [...periods].sort((a, b) => a.key.localeCompare(b.key))) {
    if (!available.has(period.key)) continue;
    const annual = period.annual || period.type === 'annual';
    const key = annual ? 'annual' : `${period.type}:${period.key.slice(5)}`;
    const label = annual ? '年报' : period.label === period.key
      ? `${period.key.slice(5)} 报告期`
      : period.label.replace(/^\d{4}年?/, '');
    const group = groups.get(key) ?? { key, label, periods: [] };
    if (!group.periods.some((entry) => entry.key === period.key)) group.periods.push(period);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.key === 'annual' ? -1 : b.key === 'annual' ? 1 : a.key.localeCompare(b.key)
  );
}
