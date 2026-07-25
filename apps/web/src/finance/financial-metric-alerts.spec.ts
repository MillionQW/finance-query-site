import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCriticalMetric,
  isPositiveMetric,
  isWarningMetric,
  metricAlerts
} from './financial-metric-alerts';
import type {
  MetricDefinition,
  MetricPoint,
  MetricResult
} from './financial-metric-types';

function definition(key: string, kind: MetricDefinition['kind'] = 'percent'): MetricDefinition {
  return {
    key,
    label: key,
    group: 'growth',
    formula: key,
    kind,
    description: key,
    requirements: [],
    calculate: () => null
  };
}

function point(year: string, value: number | null): MetricPoint {
  return { year, value, details: [], expression: '-' };
}

function result(key: string, latest: number, kind: MetricDefinition['kind'] = 'percent'): MetricResult {
  return {
    definition: definition(key, kind),
    latest,
    points: [point('2025', latest)],
    missing: [],
    alerts: []
  };
}

test('persistent growth divergence is promoted to a danger alert', () => {
  const alerts = metricAlerts(
    definition('receivablesRevenueGrowthGap'),
    [point('2025', 0.15), point('2024', 0.12)]
  );
  assert.equal(alerts[0]?.tone, 'danger');
  assert.match(alerts[0]?.message ?? '', /连续出现/);
});

test('single-year moderate divergence remains a warning', () => {
  const alerts = metricAlerts(
    definition('inventoryRevenueGrowthGap'),
    [point('2025', 0.15), point('2024', 0.02)]
  );
  assert.equal(alerts[0]?.tone, 'warning');
  assert.match(alerts[0]?.message ?? '', /15.00%/);
});

test('cash conversion alerts explain weak cash realization', () => {
  const alerts = metricAlerts(
    definition('operatingCashConversion', 'times'),
    [point('2025', 0.6)]
  );
  assert.equal(alerts[0]?.tone, 'danger');
  assert.match(alerts[0]?.message ?? '', /0.60 次/);
});

test('cash conversion cycle warns when it lengthens by more than 30 days', () => {
  const alerts = metricAlerts(
    definition('cashConversionCycle', 'days'),
    [point('2025', 90), point('2024', 50)]
  );
  assert.equal(alerts[0]?.tone, 'warning');
  assert.match(alerts[0]?.message ?? '', /40.0 天/);
});

test('metric state classification keeps danger, warning, and positive thresholds separate', () => {
  assert.equal(isCriticalMetric(result('interestCoverage', 0.8, 'times')), true);
  assert.equal(isWarningMetric(result('interestCoverage', 2, 'times')), true);
  assert.equal(isPositiveMetric(result('interestCoverage', 6, 'times')), true);
  assert.equal(isWarningMetric(result('assetLiabilityRatio', 0.75)), true);
  assert.equal(isCriticalMetric(result('assetLiabilityRatio', 0.85)), true);
});

test('missing years are surfaced without inventing zero values', () => {
  const alerts = metricAlerts(
    definition('freeCashFlowMargin'),
    [point('2025', null), point('2024', 0.1)]
  );
  assert.equal(alerts[0]?.tone, 'warning');
  assert.match(alerts[0]?.message ?? '', /2025 无法计算/);
});
