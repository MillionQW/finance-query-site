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
  assert.equal(isCriticalMetric(result('incrementalRoic3y', -0.02)), true);
  assert.equal(isWarningMetric(result('incrementalRoic3y', 0.06)), true);
  assert.equal(isPositiveMetric(result('incrementalRoic3y', 0.18)), true);
  assert.equal(isPositiveMetric(result('roicVolatility5y', 0.02)), true);
  assert.equal(isWarningMetric(result('roicVolatility5y', 0.07)), true);
});

test('profitability stability alerts explain low incremental returns and high volatility', () => {
  const incrementalAlerts = metricAlerts(
    definition('incrementalRoic3y'),
    [point('2025', 0.05)]
  );
  assert.equal(incrementalAlerts[0]?.tone, 'warning');
  assert.match(incrementalAlerts[0]?.message ?? '', /新增资本回报偏低/);

  const volatilityAlerts = metricAlerts(
    definition('grossMarginVolatility5y'),
    [point('2025', 0.12)]
  );
  assert.equal(volatilityAlerts[0]?.tone, 'danger');
  assert.match(volatilityAlerts[0]?.message ?? '', /跨周期波动较大/);
});

test('missing years are surfaced without inventing zero values', () => {
  const alerts = metricAlerts(
    definition('freeCashFlowMargin'),
    [point('2025', null), point('2024', 0.1)]
  );
  assert.equal(alerts[0]?.tone, 'warning');
  assert.match(alerts[0]?.message ?? '', /2025 无法计算/);
});
