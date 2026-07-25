import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialDiagnostics } from './financial-diagnostics';
import type {
  MetricDefinition,
  MetricPoint,
  MetricResult
} from './financial-metric-types';

function result(
  key: string,
  latest: number | null,
  kind: MetricDefinition['kind'] = 'percent',
  alertMessage?: string
): MetricResult {
  return {
    definition: {
      key,
      label: key,
      group: 'profitability',
      formula: key,
      kind,
      description: key,
      requirements: [],
      calculate: () => null
    },
    latest,
    points: [],
    missing: [],
    alerts: alertMessage
      ? [{ year: '2025', message: alertMessage, tone: 'danger' }]
      : []
  };
}

function trendResult(
  key: string,
  values: Array<[string, number | null]>,
  group: MetricDefinition['group'] = 'profitability'
): MetricResult {
  const base = result(key, values[0]?.[1] ?? null);
  base.definition.group = group;
  base.definition.label = key;
  base.points = values.map(([year, value]): MetricPoint => ({
    year,
    value,
    details: [],
    expression: key
  }));
  return base;
}

test('diagnostics expose a critical metric and its explainable alert', () => {
  const diagnostics = buildFinancialDiagnostics([
    result('roic', 0.12),
    result('averageRoic5y', -0.01, 'percent', '五年回报转负'),
    result('incrementalRoic3y', 0.18)
  ]);
  const profitability = diagnostics.find((item) => item.key === 'profitability');
  assert.equal(profitability?.status, '风险');
  assert.equal(profitability?.summary, '五年回报转负');
  assert.equal(profitability?.metrics[0]?.metricKey, 'averageRoic5y');
});

test('diagnostics show concern without turning moderate warnings into danger', () => {
  const diagnostics = buildFinancialDiagnostics([
    result('cumulativeCashConversion3y', 0.9, 'times'),
    result('operatingCashConversion', 1.1, 'times'),
    result('freeCashFlowMargin', 0.08)
  ]);
  const cash = diagnostics.find((item) => item.key === 'cashCreation');
  assert.equal(cash?.status, '关注');
  assert.equal(cash?.tone, 'warning');
  assert.equal(cash?.metrics[0]?.metricKey, 'cumulativeCashConversion3y');
});

test('diagnostics remain transparent when no configured data is available', () => {
  const diagnostics = buildFinancialDiagnostics([
    result('roic', null),
    result('revenueGrowth', null)
  ]);
  const profitability = diagnostics.find((item) => item.key === 'profitability');
  assert.equal(profitability?.status, '数据不足');
  assert.match(profitability?.summary ?? '', /可计算指标不足/);
  assert.equal(profitability?.metrics.length, 0);
});

test('stable diagnostics require at least two available inputs and show representative metrics', () => {
  const diagnostics = buildFinancialDiagnostics([
    result('interestCoverage', 6, 'times'),
    result('netDebtToOperatingCash', 1, 'times'),
    result('assetLiabilityRatio', 0.45)
  ]);
  const risk = diagnostics.find((item) => item.key === 'financialRisk');
  assert.equal(risk?.status, '稳健');
  assert.equal(risk?.availableCount, 3);
  assert.equal(risk?.metrics.length, 3);
});

test('two consecutive contraction years promote growth quality to danger', () => {
  const diagnostics = buildFinancialDiagnostics([
    trendResult('revenueGrowth', [['2025', -0.08], ['2024', -0.04]], 'growth'),
    result('receivablesRevenueGrowthGap', 0.02)
  ]);
  const growth = diagnostics.find((item) => item.key === 'growthQuality');
  assert.equal(growth?.status, '风险');
  assert.equal(growth?.signals[0]?.metricKey, 'revenueGrowth');
  assert.match(growth?.summary ?? '', /2024和2025.*连续为负/);
});

test('a three-year profitability decline is surfaced with its magnitude', () => {
  const diagnostics = buildFinancialDiagnostics([
    trendResult('roic', [['2025', 0.07], ['2024', 0.13], ['2023', 0.17]]),
    result('netMargin', 0.12)
  ]);
  const profitability = diagnostics.find((item) => item.key === 'profitability');
  assert.equal(profitability?.status, '风险');
  assert.match(profitability?.signals[0]?.message ?? '', /2023至2025.*10.00%/);
});

test('missing intermediate years do not create a false consecutive trend', () => {
  const diagnostics = buildFinancialDiagnostics([
    trendResult('roic', [['2025', 0.04], ['2024', null], ['2023', 0.12]]),
    result('netMargin', 0.08)
  ]);
  const profitability = diagnostics.find((item) => item.key === 'profitability');
  assert.equal(profitability?.signals.length, 0);
  assert.equal(profitability?.status, '关注');
});

test('hidden calendar years do not count as consecutive observations', () => {
  const diagnostics = buildFinancialDiagnostics([
    trendResult('revenueGrowth', [['2025', -0.08], ['2023', -0.04]], 'growth'),
    result('receivablesRevenueGrowthGap', 0.02)
  ]);
  const growth = diagnostics.find((item) => item.key === 'growthQuality');
  assert.equal(growth?.signals.length, 0);
  assert.equal(growth?.status, '关注');
});

test('rapid leverage growth can elevate a moderate latest ratio to danger', () => {
  const diagnostics = buildFinancialDiagnostics([
    trendResult('assetLiabilityRatio', [['2025', 0.72], ['2024', 0.61], ['2023', 0.5]], 'solvency'),
    result('interestCoverage', 6, 'times')
  ]);
  const risk = diagnostics.find((item) => item.key === 'financialRisk');
  assert.equal(risk?.status, '风险');
  assert.match(risk?.summary ?? '', /上升 22.00%/);
});
