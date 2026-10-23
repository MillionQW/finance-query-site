import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { initializeFinanceStoreSchema } from './finance-store.schema';
import { ValuationModelRepository } from './valuation-model.repository';
import type { ValuationModelDto } from '../valuation-model.dto';
const { DatabaseSync } = createRequire(__filename)('node:sqlite');
test('valuation snapshots are immutable, normalize identity, and isolate companies and markets', () => {
  const db = new DatabaseSync(':memory:');
  try {
    initializeFinanceStoreSchema(db);
    const repo = new ValuationModelRepository(db);
    const first = { baseProfit: 10, statementHash: 'v1' } as ValuationModelDto;
    repo.save('hk', '700', first);
    repo.save('hk', '00700', { ...first, baseProfit: 12, statementHash: 'v2' });
    const history = repo.list('hk', '00700');
    assert.equal(history.length, 2);
    assert.equal(history[1].model.baseProfit, 10);
    assert.equal(history[0].model.statementHash, 'v2');
    assert.deepEqual(repo.list('a', '00700'), []);
    assert.deepEqual(repo.list('hk', '00941'), []);
    initializeFinanceStoreSchema(db);
    assert.equal(repo.list('hk', '00700').length, 2);
  } finally { db.close(); }
});
