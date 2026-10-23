import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCompanyValuation } from './company-valuation';
import { CompanyValuationService } from './company-valuation.service';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import type { CompanyPeHistory } from './company-valuation.types';

const history = (points: CompanyPeHistory['points']): CompanyPeHistory => ({
  market: 'a', symbol: '600519', points, source: 'fixture', fetchedAt: new Date().toISOString()
});

test('3/5/10 year windows use calendar cutoffs and inclusive empirical percentile', () => {
  const value = calculateCompanyValuation(history([
    { date: '2010-10-23', pe: 1 }, // Outside every window.
    { date: '2016-10-23', pe: 5 }, // Included at exact 10 year boundary.
    { date: '2021-10-23', pe: 40 }, // Included at exact 5 year boundary.
    { date: '2023-10-23', pe: 10 },
    { date: '2025-10-23', pe: 30 },
    { date: '2026-10-23', pe: 20 }
  ]));
  assert.deepEqual(value.windows.map(w => [w.years, w.sampleCount, w.percentile]), [
    [3, 3, 66.67], [5, 4, 50], [10, 5, 60]
  ]);
  assert.ok(value.windows.every(w => w.historyComplete));
  assert.equal(value.dataDate, '2026-10-23');
  assert.equal(value.history.length, 5);
  assert.equal(value.history[0].date, '2016-10-23');
  assert.deepEqual(value.windows.map(w => w.referenceLevels.map(level => level.pe)), [
    [14, 20, 26], [16, 25, 34], [9, 20, 32]
  ]);
  for (const window of value.windows) {
    const plotted = value.history.filter(p => p.date >= window.startDate && p.pe !== null);
    assert.equal(plotted.length, window.sampleCount);
    const percentile = Math.round(plotted.filter(p => p.pe! <= value.currentPe!).length / plotted.length * 10000) / 100;
    assert.equal(percentile, window.percentile);
  }
});

test('sorts/deduplicates dates and excludes missing, nonpositive, nonfinite and invalid-date samples', () => {
  const value = calculateCompanyValuation(history([
    { date: '2026-10-23', pe: 20 },
    { date: '2026-02-30', pe: 100 },
    { date: 'bad', pe: 100 },
    { date: '2026-01-01', pe: 5 },
    { date: '2026-01-01', pe: 20 },
    { date: '2026-01-02', pe: -5 },
    { date: '2026-01-03', pe: null },
    { date: '2026-01-04', pe: Infinity },
    { date: '2026-01-05', pe: NaN },
    { date: '2026-01-06', pe: 0 }
  ]));
  assert.equal(value.windows[0].sampleCount, 2);
  assert.equal(value.windows[0].percentile, 100); // Ties count as <=.
  assert.equal(value.windows[0].firstSampleDate, '2026-01-01');
  assert.equal(value.windows[0].historyComplete, false);
  assert.deepEqual(value.windows[0].referenceLevels.map(level => level.pe), [20, 20, 20]);
  assert.deepEqual(value.history.map(p => p.pe), [20, null, null, null, null, null, 20]);
  assert.equal(value.history.at(-1)?.date, '2026-10-23');
});

test('latest invalid PE never falls back to an older positive PE', () => {
  for (const pe of [null, 0, -10, NaN, Infinity]) {
    const value = calculateCompanyValuation(history([
      { date: '2024-01-01', pe: 10 }, { date: '2025-01-01', pe: 20 },
      { date: '2026-10-23', pe }
    ]));
    assert.equal(value.currentPe, null);
    assert.equal(value.dataDate, '2026-10-23');
    assert.ok(value.unavailableReason);
    assert.ok(value.windows.every(w => w.percentile === null && w.sampleCount === 2));
    assert.deepEqual(value.history.at(-1), { date: '2026-10-23', pe: null });
    assert.deepEqual(value.windows[0].referenceLevels.map(level => level.pe), [12, 15, 18]);
  }
});

test('empty history and a single valid sample do not produce a percentile', () => {
  for (const points of [[], [{ date: '2026-10-23', pe: 20 }]]) {
    const value = calculateCompanyValuation(history(points));
    assert.ok(value.windows.every(w => w.percentile === null));
    assert.ok(value.windows.every(w => w.referenceLevels.every(level => level.pe === null)));
  }
});

test('leap-day cutoffs clamp to the last day of February', () => {
  const value = calculateCompanyValuation(history([
    { date: '2020-02-28', pe: 10 }, { date: '2024-02-29', pe: 20 }
  ]));
  assert.equal(value.windows[0].startDate, '2021-02-28');
  assert.equal(value.windows[1].startDate, '2019-02-28');
});

test('same-company requests share one fetch, normalize symbols, and use saved daily cache', async () => {
  let cached: CompanyPeHistory | null = null;
  let calls = 0;
  const service = new CompanyValuationService({
    run: async (args: string[]) => {
      calls++;
      assert.deepEqual(args, ['company-valuation', '--market', 'hk', '--symbol', '00700']);
      await new Promise(resolve => setImmediate(resolve));
      return { ...history([{ date: '2026-10-23', pe: 20 }]), market: 'hk', symbol: '00700' };
    }
  } as unknown as PythonAkshareService, {
    getCompanyPeHistory: () => cached,
    saveCompanyPeHistory: (value: CompanyPeHistory) => { cached = value; }
  } as unknown as FinanceStoreService);
  await Promise.all([service.get('hk', '700'), service.get('hk', '00700')]);
  assert.equal(calls, 1);
  assert.deepEqual((await service.get('hk', '700')).cache, { hit: true, stale: false });
  assert.equal(calls, 1);
  await service.get('hk', '700', true);
  assert.equal(calls, 2);
  await assert.rejects(service.get('hk', '--oops'), /股票代码/);
});

test('failed refresh preserves old data and marks it stale; no-cache failure propagates', async () => {
  let cached: CompanyPeHistory | null = {
    ...history([{ date: '2020-01-01', pe: 10 }]), fetchedAt: '2020-01-01T00:00:00Z'
  };
  const service = new CompanyValuationService({
    run: async () => { throw new Error('upstream unavailable'); }
  } as unknown as PythonAkshareService, {
    getCompanyPeHistory: () => cached,
    saveCompanyPeHistory: () => { assert.fail('should not overwrite cache'); }
  } as unknown as FinanceStoreService);
  const value = await service.get('a', '600519');
  assert.deepEqual(value.cache, { hit: true, stale: true });
  assert.equal(value.dataDate, '2020-01-01');
  cached = null;
  await assert.rejects(service.get('a', '600519'), /upstream unavailable/);
});
