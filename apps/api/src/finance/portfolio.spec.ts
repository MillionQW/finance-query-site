import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { PortfolioRepository } from './store/portfolio.repository';
import { PortfolioService } from './portfolio.service';
import { cleanHolding } from './portfolio.validation';
import type { HoldingInput, PortfolioQuote } from './portfolio.types';

const { DatabaseSync } = createRequire(__filename)('node:sqlite');
const input: HoldingInput = { market: 'hk', symbol: '00700', name: '腾讯控股', holdingValue: 100000, holdingCurrency: 'CNY',
  valuation: '60000 ±10%', buyPoint: '30000', sellPoint: '78000', note: '', expectedVersion: 0, confirmValuation: false };

test('valuation timestamps change only for valuation updates or explicit confirmation; writes are versioned', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repo = new PortfolioRepository(db);
    const first = repo.save(null, input, '2026-06-01T00:00:00Z');
    const unchanged = repo.save(first.id, { ...input, holdingValue: 200000, holdingCurrency: 'HKD', expectedVersion: 1 }, '2027-01-01T00:00:00Z');
    assert.equal(unchanged.valuationUpdatedAt, first.valuationUpdatedAt);
    assert.equal(repo.list()[0].holdingValue, 200000);
    assert.equal(repo.list()[0].holdingCurrency, 'HKD');
    assert.throws(() => repo.save(first.id, { ...input, expectedVersion: 1 }), /其他页面修改/);
    assert.throws(() => repo.save(null, input), /已经在表格/);
    const confirmed = repo.save(first.id, { ...input, expectedVersion: 2, confirmValuation: true }, '2027-02-01T00:00:00Z');
    assert.equal(confirmed.valuationUpdatedAt, '2027-02-01T00:00:00Z');
    const changed = repo.save(first.id, { ...input, valuation: '65000', expectedVersion: 3 }, '2027-03-01T00:00:00Z');
    assert.equal(changed.valuationUpdatedAt, '2027-03-01T00:00:00Z');
    assert.equal(db.prepare('SELECT count(*) n FROM portfolio_valuation_history').get().n, 3);
    assert.deepEqual(new PortfolioRepository(db).list(), [changed]);
    assert.throws(() => repo.remove(first.id, 1), /记录已变化/);
    repo.remove(first.id, 4);
    assert.deepEqual(repo.list(), []);
  } finally { db.close(); }
});

test('validation rejects B-shares, invalid numbers and does not accept client timestamps', () => {
  for (const symbol of ['200596', '900901']) assert.throws(() => cleanHolding({ ...input, market: 'a', symbol }), /仅支持A股/);
  for (const holdingValue of [NaN, -1, Infinity, '44', undefined, 1e13]) assert.throws(() => cleanHolding({ ...input, holdingValue }));
  for (const holdingCurrency of ['USD', '', 1]) assert.throws(() => cleanHolding({ ...input, holdingCurrency }));
  assert.equal(cleanHolding({ ...input, holdingCurrency: undefined }).holdingCurrency, 'HKD');
  assert.equal(cleanHolding({ ...input, market: 'a', symbol: '600519', holdingCurrency: undefined }).holdingCurrency, 'CNY');
  assert.equal(cleanHolding(input).holdingCurrency, 'CNY');
  const clean = cleanHolding({ ...input, valuationUpdatedAt: '2099-01-01' });
  assert.equal('valuationUpdatedAt' in clean, false);
  assert.equal(cleanHolding({ ...input, holdingValue: null }).holdingValue, null);
  assert.equal(cleanHolding({ ...input, holdingValue: 0 }).holdingValue, 0);
  assert.equal(cleanHolding({ ...input, holdingValue: 12345.67 }).holdingValue, 12345.67);
  for (const field of ['buyPoint', 'sellPoint']) {
    for (const value of ['<30000', '30000±10%', '-1', '1e3', '文字']) assert.throws(() => cleanHolding({ ...input, [field]: value }), /只能填写/);
    assert.equal(cleanHolding({ ...input, [field]: '123.45' })[field as 'buyPoint' | 'sellPoint'], '123.45');
  }
});

test('legacy manual weights are not reinterpreted as money; valuation and raw records survive reads', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repo = new PortfolioRepository(db);
    const { holdingValue, holdingCurrency, ...fields } = input;
    const legacy = { ...fields, id: 1, weight: 44, version: 2, updatedAt: '2026-01-01', valuationUpdatedAt: '2025-12-31T12:00:00Z' };
    const raw = JSON.stringify(legacy);
    db.prepare('INSERT INTO portfolio_holdings VALUES (?,?,?,?,?)').run(1, 'hk', '00700', 2, raw);
    const record = repo.list()[0];
    assert.equal(record.holdingValue, null); assert.equal(record.holdingCurrency, 'CNY');
    assert.equal(record.valuationUpdatedAt, legacy.valuationUpdatedAt);
    assert.equal('weight' in record, false);
    assert.equal(db.prepare('SELECT payload_json FROM portfolio_holdings').get().payload_json, raw);
    const updated = repo.save(1, { ...input, expectedVersion: 2 });
    assert.equal(updated.valuationUpdatedAt, legacy.valuationUpdatedAt);
    assert.equal(updated.holdingValue, 100000);
  } finally { db.close(); }
});

test('quote failures retain cached data; concurrent refresh shares a request and never changes manual fields', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const portfolio = new PortfolioRepository(db);
    portfolio.save(null, input);
    const quote: PortfolioQuote = { price: 386, marketCap: 35000, currency: 'HKD', year: 2026, quoteAt: '2026-10-23',
      ytd: -35, baseDate: '2025-12-31', source: 'test', fetchedAt: '2026-01-01T00:00:00Z', warning: null };
    portfolio.saveQuote('hk:00700', quote);
    let calls = 0;
    const service = new PortfolioService({ portfolio } as any, { run: async () => { calls++; throw new Error('offline'); } } as any);
    const [a, b] = await Promise.all([service.quote('hk', '00700', true), service.quote('hk', '00700', true)]);
    assert.equal(calls, 1); assert.deepEqual(a, b); assert.equal(a.stale, true); assert.deepEqual(a.quote, quote);
    assert.equal(portfolio.list()[0].valuation, input.valuation);
    const missing = await service.quote('a', '600519', true);
    assert.equal(missing.quote, null); assert.equal(missing.stale, true);
  } finally { db.close(); }
});
