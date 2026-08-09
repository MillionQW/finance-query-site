import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePeerMetricRows,
  peerMetricDependencies,
  type StoredPeerMetricRow
} from './peer-metric-calculations';

function row(metricKey: string, year: string, value: number): StoredPeerMetricRow {
  return {
    market: 'a',
    symbol: '600000',
    display_symbol: '600000.SH',
    name: '测试公司',
    metric_key: metricKey,
    metric_label: metricKey,
    year,
    value_num: value
  };
}

test('derived peer metrics expose their base dependencies', () => {
  assert.deepEqual(peerMetricDependencies('netMargin'), ['netProfit', 'revenue']);
  assert.deepEqual(peerMetricDependencies('revenueGrowth'), ['revenue']);
  assert.deepEqual(peerMetricDependencies('assets'), ['assets']);
});

test('peer metric calculations derive ratios without inventing missing values', () => {
  const rows = [row('netProfit', '2025', 20), row('revenue', '2025', 100)];
  const result = calculatePeerMetricRows(rows, 'netMargin');
  assert.equal(result.length, 1);
  assert.equal(result[0].metric_label, '净利率');
  assert.equal(result[0].value_num, 0.2);
  assert.deepEqual(calculatePeerMetricRows([row('netProfit', '2025', 20)], 'netMargin'), []);
});

test('growth calculations compare adjacent available annual observations', () => {
  const rows = [row('revenue', '2023', 80), row('revenue', '2024', 100), row('revenue', '2025', 120)];
  const result = calculatePeerMetricRows(rows, 'revenueGrowth');
  assert.deepEqual(result.map((item) => [item.year, item.value_num]), [
    ['2024', 0.25],
    ['2025', 0.2]
  ]);
});
