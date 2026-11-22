import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { MacroValue } from '../macro.types';
import { initializeFinanceStoreSchema } from './finance-store.schema';
import { MacroRepository } from './macro.repository';

test('a fallback bond feed fills dates without overwriting an already verified curve point', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeFinanceStoreSchema(db);
    const repo = new MacroRepository(db);
    const verified: MacroValue = {
      period: '2026-11-19', periodLabel: null, value: 1.5755, releasedOn: '2026-11-19',
      source: '中债估值中心 · AKShare', sourceUrl: 'https://yield.chinabond.com.cn/'
    };
    const fallback: MacroValue = {
      ...verified, value: 1.58, releasedOn: null,
      source: '东方财富 · AKShare', sourceUrl: 'https://data.eastmoney.com/cjsj/zmgzsyl.html'
    };
    repo.saveValues('cn10y', [verified], '2026-11-19T12:00:00Z');
    repo.saveValues('cn10y', [fallback, { ...fallback, period: '2026-11-20' }], '2026-11-21T12:00:00Z');
    const [first, second] = repo.history('cn10y');
    assert.deepEqual({ ...first }, { ...verified, releaseUrl: null });
    assert.deepEqual({ ...second }, { ...fallback, period: '2026-11-20', releaseUrl: null });
  } finally {
    db.close();
  }
});

test('a PMI observation can preserve a linked release separately from the bulletin supplying its value', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeFinanceStoreSchema(db);
    const repo = new MacroRepository(db);
    const pmiOrder: MacroValue = {
      period: '2026-09', periodLabel: null, value: 50.5, releasedOn: '2026-09-30',
      source: '国家统计局 · 制造业 PMI 公告',
      sourceUrl: 'https://www.stats.gov.cn/sj/zxfb/202610/t20261031_1965718.html',
      releaseUrl: 'https://www.stats.gov.cn/sj/zxfb/202609/t20260930_1965449.html'
    };
    repo.saveValues('pmi-orders', [pmiOrder], '2026-11-22T12:00:00Z');
    assert.deepEqual(repo.history('pmi-orders').map(point => ({ ...point })), [pmiOrder]);
    assert.equal(repo.state('releases'), undefined);

    const repost = { ...pmiOrder, period: '2026-10', value: 49.4, releasedOn: null, releaseUrl: null };
    const release = {
      id: 'pmi' as const, period: repost.period, releasedOn: '2026-10-31',
      releaseUrl: 'https://www.stats.gov.cn/sj/zxfb/202610/t20261031_1965718.html'
    };
    repo.saveValues('pmi-orders', [repost], '2026-11-22T12:00:00Z');
    repo.saveReleases([release], '2026-11-22T12:00:00Z');
    assert.deepEqual({ ...repo.history('pmi-orders', 1)[0] }, {
      ...repost, releasedOn: release.releasedOn, releaseUrl: release.releaseUrl
    });
  } finally {
    db.close();
  }
});
