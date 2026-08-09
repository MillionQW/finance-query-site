import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPeerMetricValue, latestPeerMetricSnapshot } from './peer-metrics';

test('peer metric formatting distinguishes percentages and financial scale', () => {
  assert.equal(formatPeerMetricValue(0.126, 'percent'), '12.6%');
  assert.equal(formatPeerMetricValue(1_230_000_000, 'amount'), '12.3亿');
  assert.equal(formatPeerMetricValue(null, 'amount'), '-');
});

test('latest peer metric snapshot exposes selected rank and median', () => {
  const snapshot = latestPeerMetricSnapshot({
    metricKey: 'netMargin',
    metricLabel: '净利率',
    years: ['2024', '2025'],
    companies: [
      {
        market: 'a', symbol: '1', displaySymbol: '1.SZ', name: '甲', cached: true, isSelected: true,
        points: [{ year: '2024', value: 0.1 }, { year: '2025', value: 0.2 }]
      },
      {
        market: 'a', symbol: '2', displaySymbol: '2.SZ', name: '乙', cached: true,
        points: [{ year: '2024', value: 0.2 }, { year: '2025', value: 0.4 }]
      },
      {
        market: 'a', symbol: '3', displaySymbol: '3.SZ', name: '丙', cached: true,
        points: [{ year: '2024', value: 0.05 }, { year: '2025', value: 0.1 }]
      }
    ],
    missingCompanies: []
  }, 'a', '1');
  assert.equal(snapshot.year, '2025');
  assert.equal(snapshot.median, 0.2);
  assert.equal(snapshot.selectedRank, 2);
  assert.equal(snapshot.sampleCount, 3);
});
