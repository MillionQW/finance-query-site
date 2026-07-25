import assert from 'node:assert/strict';
import test from 'node:test';
import { metricThresholdGuide } from './financial-metric-thresholds';
import type { MetricDefinition, MetricResult } from './financial-metric-types';

function result(
  key: string,
  latest: number,
  kind: MetricDefinition['kind'] = 'percent'
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
    alerts: []
  };
}

test('threshold guides expose the exact ROIC bands and active state', () => {
  const guide = metricThresholdGuide(result('roic', 0.03));
  assert.equal(guide?.activeTone, 'warning');
  assert.deepEqual(
    guide?.bands.map((band) => [band.label, band.condition]),
    [['风险', '< 0%'], ['关注', '0%–5%'], ['较强', '≥ 12%']]
  );
});

test('danger takes precedence when warning predicates overlap', () => {
  const guide = metricThresholdGuide(result('accrualRatio', 0.12));
  assert.equal(guide?.activeTone, 'danger');
});

test('growth divergence uses percentage-point thresholds', () => {
  const guide = metricThresholdGuide(result('receivablesRevenueGrowthGap', 0.15));
  assert.equal(guide?.activeTone, 'warning');
  assert.equal(guide?.bands[0]?.condition, '> 20个百分点');
});

test('judgment metrics explain pass and fail states', () => {
  const guide = metricThresholdGuide(result('operatingCashFlowPositive', 1, 'judgment'));
  assert.equal(guide?.activeTone, 'positive');
  assert.deepEqual(guide?.bands.map((band) => band.condition), ['未通过', '通过']);
});

test('metrics without fixed absolute thresholds stay unlabelled', () => {
  assert.equal(metricThresholdGuide(result('grossMargin', 0.3)), null);
});
