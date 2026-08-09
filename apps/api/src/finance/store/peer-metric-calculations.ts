import type { Market } from '../types';

export interface StoredPeerMetricRow {
  market: Market;
  symbol: string;
  display_symbol: string;
  name: string;
  metric_key: string;
  metric_label: string;
  year: string | number;
  value_num: number | null;
}

interface DerivedMetricDefinition {
  label: string;
  dependencies: string[];
  calculate: (values: Record<string, number>) => number | null;
}

function safeRatio(numerator: number | undefined, denominator: number | undefined): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return (numerator as number) / Math.abs(denominator as number);
}

const DERIVED_METRICS: Record<string, DerivedMetricDefinition> = {
  netMargin: {
    label: '净利率',
    dependencies: ['netProfit', 'revenue'],
    calculate: (values) => safeRatio(values.netProfit, values.revenue)
  },
  operatingCashConversion: {
    label: '经营现金含金量',
    dependencies: ['operatingCashflow', 'netProfit'],
    calculate: (values) => safeRatio(values.operatingCashflow, values.netProfit)
  },
  assetLiabilityRatio: {
    label: '资产负债率',
    dependencies: ['liabilities', 'assets'],
    calculate: (values) => safeRatio(values.liabilities, values.assets)
  }
};

const GROWTH_METRICS: Record<string, { label: string; dependency: string }> = {
  revenueGrowth: { label: '营业收入同比增长', dependency: 'revenue' },
  netProfitGrowth: { label: '净利润同比增长', dependency: 'netProfit' }
};

export function peerMetricDependencies(metricKey: string): string[] {
  const derived = DERIVED_METRICS[metricKey];
  if (derived) return derived.dependencies;
  const growth = GROWTH_METRICS[metricKey];
  return growth ? [growth.dependency] : [metricKey];
}

export function calculatePeerMetricRows(
  rows: StoredPeerMetricRow[],
  metricKey: string
): StoredPeerMetricRow[] {
  const derived = DERIVED_METRICS[metricKey];
  const growth = GROWTH_METRICS[metricKey];
  if (!derived && !growth) {
    return rows.filter((row) => row.metric_key === metricKey);
  }

  const byCompany = new Map<string, StoredPeerMetricRow[]>();
  for (const row of rows) {
    const key = `${row.market}:${row.symbol}`;
    const companyRows = byCompany.get(key) ?? [];
    companyRows.push(row);
    byCompany.set(key, companyRows);
  }

  const result: StoredPeerMetricRow[] = [];
  for (const companyRows of byCompany.values()) {
    const seed = companyRows[0];
    const byYear = new Map<string, Record<string, number>>();
    for (const row of companyRows) {
      if (row.value_num === null || !Number.isFinite(Number(row.value_num))) continue;
      const year = String(row.year);
      const values = byYear.get(year) ?? {};
      values[row.metric_key] = Number(row.value_num);
      byYear.set(year, values);
    }

    const years = [...byYear.keys()].sort();
    years.forEach((year, index) => {
      let value: number | null = null;
      let label = derived?.label ?? growth?.label ?? metricKey;
      if (derived) {
        value = derived.calculate(byYear.get(year) ?? {});
      } else if (growth && index > 0) {
        const current = byYear.get(year)?.[growth.dependency];
        const previous = byYear.get(years[index - 1])?.[growth.dependency];
        value = safeRatio(
          current === undefined || previous === undefined ? undefined : current - previous,
          previous
        );
      }
      if (value === null || !Number.isFinite(value)) return;
      result.push({
        ...seed,
        metric_key: metricKey,
        metric_label: label,
        year,
        value_num: value
      });
    });
  }
  return result;
}
