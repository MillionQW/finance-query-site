import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialDiagnostics } from './financial-diagnostics';
import type {
  MetricDefinition,
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
