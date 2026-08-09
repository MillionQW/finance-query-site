import assert from 'node:assert/strict';
import test from 'node:test';
import type { CacheEntry, PeerComparison } from '../types/finance';
import {
  buildPeerSnapshot,
  comparePeerSnapshots,
  sanitizePeerBasketKeys
} from './peer-preferences';

const entries: CacheEntry[] = ['1', '2', '3'].map((symbol) => ({
  kind: 'statements', market: 'a', symbol, displaySymbol: `${symbol}.SZ`, name: symbol,
  years: 5, refreshedAt: '2026-01-01', source: 'fixture', payloadBytes: 10
}));

function comparison(fetchedAt: string, peerSymbols: string[], peRank: number): PeerComparison {
  return {
    company: { market: 'a', symbol: '1', displaySymbol: '1.SZ', name: '甲' },
    industry: { name: '测试行业', source: 'fixture' },
    peers: peerSymbols.map((symbol) => ({
      market: 'a', symbol, displaySymbol: `${symbol}.SZ`, name: `公司${symbol}`, source: 'fixture'
    })),
    rankings: [{ key: 'pe', label: '动态市盈率', rank: peRank, total: 10, value: 12, direction: 'asc' }],
    fetchedAt,
    source: 'fixture'
  };
}

test('peer baskets keep required cached company, remove duplicates, and honor the limit', () => {
  assert.deepEqual(sanitizePeerBasketKeys(['a:2', 'a:2', 'a:3', 'a:9'], entries, 'a:1', 2), ['a:1', 'a:2']);
});

test('peer snapshots explain membership and material rank changes', () => {
  const previous = buildPeerSnapshot(comparison('2026-01-01', ['1', '2'], 6));
  const current = buildPeerSnapshot(comparison('2026-02-01', ['1', '3'], 3));
  const change = comparePeerSnapshots(previous, current);
  assert.equal(change?.title, '同行样本较上次有变化');
  assert.match(change?.detail ?? '', /新增 公司3/);
  assert.match(change?.detail ?? '', /移出 公司2/);
  assert.match(change?.detail ?? '', /动态市盈率上升 3 位/);
});

test('identical fetched snapshots do not repeat a reminder', () => {
  const snapshot = buildPeerSnapshot(comparison('2026-01-01', ['1', '2'], 3));
  assert.equal(comparePeerSnapshots(snapshot, snapshot), null);
});
