import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { initializeFinanceStoreSchema } from './finance-store.schema';
import { CompanyValuationRepository } from './company-valuation.repository';
import type { CompanyPeHistory } from '../company-valuation.types';

const { DatabaseSync } = createRequire(__filename)('node:sqlite');

test('PE history cache round-trips missing values, isolates markets, and replaces a snapshot', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeFinanceStoreSchema(db);
    const store = new CompanyValuationRepository(db);
    const value: CompanyPeHistory = {
      market: 'a', symbol: '600519', source: 'fixture', fetchedAt: '2026-10-23T00:00:00Z',
      points: [{ date: '2026-10-22', pe: null }, { date: '2026-10-23', pe: 20 }]
    };
    assert.equal(store.get('a', value.symbol), null);
    store.save(value);
    assert.deepEqual(store.get('a', value.symbol), value);
    assert.equal(store.get('hk', value.symbol), null);
    const next = { ...value, points: [{ date: '2026-10-24', pe: 21 }] };
    store.save(next);
    assert.deepEqual(store.get('a', value.symbol), next);
  } finally { db.close(); }
});
