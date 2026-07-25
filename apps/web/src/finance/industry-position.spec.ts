import assert from 'node:assert/strict';
import test from 'node:test';
import type { PeerComparison } from '../types/finance';
import { buildIndustryPositions } from './industry-position';

const comparison: PeerComparison = {
  company: { market: 'a', symbol: '600000', displaySymbol: '600000.SH' },
  industry: { name: '测试行业', source: 'fixture' },
  peers: [],
  rankings: [
    { key: 'pe', label: '动态市盈率', rank: 2, total: 10, value: 12, direction: 'asc' },
    { key: 'pb', label: '市净率', rank: null, total: 10, value: null, direction: 'asc' }
  ],
  fetchedAt: '2026-01-01T00:00:00.000Z',
  source: 'fixture'
};

test('industry positions translate rank into an explicit percentile band', () => {
  const positions = buildIndustryPositions(comparison);
  assert.equal(positions.length, 1);
  assert.equal(positions[0].rankLabel, '2 / 10');
  assert.equal(positions[0].percentileLabel, '前 20%');
  assert.equal(positions[0].band, 'leading');
  assert.match(positions[0].context, /不等同于投资吸引力/);
});

test('industry positions ignore unavailable rankings', () => {
  assert.deepEqual(buildIndustryPositions(null), []);
  assert.equal(buildIndustryPositions(comparison).some((item) => item.key === 'pb'), false);
});
