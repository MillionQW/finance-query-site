import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calculatePerformance, calculateXirr } from './performance-calculation';
import { cleanPerformance } from './performance.validation';
import { PerformanceRepository } from './store/performance.repository';
import type { PerformanceEntry, PerformanceEntryInput } from './performance.types';

const { DatabaseSync } = createRequire(__filename)('node:sqlite');
const entry = (kind: PerformanceEntryInput['kind'], at: string, amount: number, beforeValue: number | null = null): PerformanceEntry =>
  ({ id: at, kind, at, amount, beforeValue, currency: 'CNY', fx: 1, note: '', updatedAt: '' });
const initial = entry('initial', '2025-01-01T09:00', 100000);
const close = (a: number | null, b: number, epsilon = 1e-7) => assert.ok(a !== null && Math.abs(a - b) < epsilon, `${a} != ${b}`);

test('a one-year buy-and-hold portfolio returns 10% in both methods; same-day XIRR is unavailable', () => {
  const result = calculatePerformance([initial, entry('snapshot', '2026-01-01T16:00', 110000)]);
  close(result.twr, .1); close(result.xirr, .1); close(result.nav, 1.1);
  assert.equal(result.profit, 10000); assert.equal(result.days, 365);
  const sameDay = calculatePerformance([initial]);
  assert.equal(sameDay.twr, 0); assert.equal(sameDay.xirr, null);
  assert.match(sameDay.xirrReason!, /不足一天/);
});

test('deposits issue units, withdrawals redeem units, and HKD uses the saved rate', () => {
  const deposit = entry('deposit', '2025-07-01T12:00', 110000, 110000);
  const result = calculatePerformance([entry('snapshot', '2026-01-01T16:00', 240000), deposit, initial]);
  close(result.twr, .2); close(result.nav, 1.2); assert.equal(result.profit, 30000);
  assert.ok(result.xirr! > .1 && result.xirr! < .3);
  const withdrawal = calculatePerformance([initial, entry('withdrawal', '2025-07-01T12:00', 55000, 110000), entry('snapshot', '2026-01-01T16:00', 60000)]);
  close(withdrawal.twr, .2); assert.equal(withdrawal.profit, 15000);
  const hkd = { ...entry('deposit', '2025-07-01T12:00', 100000, 100000), currency: 'HKD' as const, fx: .9 };
  const converted = calculatePerformance([initial, hkd, entry('snapshot', '2026-01-01T16:00', 190000)]);
  close(converted.twr, 0); close(converted.xirr, 0); assert.equal(converted.netContributions, 90000);
});

test('missing transfer valuations affect TWR without blocking XIRR when an ending snapshot exists', () => {
  const flow = entry('deposit', '2025-07-01T12:00', 100000);
  const result = calculatePerformance([initial, flow, entry('snapshot', '2026-01-01T16:00', 220000)]);
  assert.equal(result.twr, null); assert.match(result.twrReason!, /缺少/); assert.ok(result.xirr! > 0);
  const incomplete = calculatePerformance([initial, flow]);
  assert.equal(incomplete.endingValue, null); assert.equal(incomplete.xirr, null); assert.equal(incomplete.profit, null);
});

test('zero balance, full redemption, reinvestment and nonunique IRRs are explicit', () => {
  const loss = calculatePerformance([initial, entry('snapshot', '2026-01-01T16:00', 0)]);
  assert.equal(loss.twr, -1); assert.equal(loss.xirr, -1);
  const redeemed = calculatePerformance([initial, entry('withdrawal', '2026-01-01T16:00', 110000, 110000)]);
  close(redeemed.twr, .1); close(redeemed.xirr, .1);
  const restarted = calculatePerformance([initial, entry('withdrawal', '2025-05-01T16:00', 110000, 110000), entry('deposit', '2025-07-01T16:00', 55000, 0), entry('snapshot', '2026-01-01T16:00', 60000)]);
  close(restarted.twr, .2);
  const multiple = calculateXirr([{ at: '2021-01-01', amount: -100 }, { at: '2022-01-01', amount: 230 }, { at: '2023-01-01', amount: -132 }]);
  assert.equal(multiple.value, null); assert.match(multiple.reason!, /多个/);
});

test('validation rejects impossible dates, future dates, invalid exchange rates and excessive withdrawals', () => {
  const body = { ...entry('deposit', '2025-07-01T12:00', 100), expectedVersion: 0 };
  assert.equal(cleanPerformance(body, '2025-01-01').input.amount, 100);
  for (const at of ['2025-02-30T12:00', '2099-01-01T12:00', '2024-12-31T12:00']) assert.throws(() => cleanPerformance({ ...body, at }, '2025-01-01'));
  for (const fx of [0, -1, NaN, null, 2]) assert.throws(() => cleanPerformance({ ...body, fx }, '2025-01-01'));
  assert.throws(() => cleanPerformance({ ...body, kind: 'withdrawal', beforeValue: 50 }, '2025-01-01'), /超过/);
  assert.throws(() => cleanPerformance({ ...body, kind: 'initial', amount: 0 }, '2025-01-01'));
});

test('ledger persists corrections and audit revisions, enforces ordering and optimistic versions', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repo = new PerformanceRepository(db);
    db.prepare('UPDATE portfolio_performance SET payload_json=? WHERE id=1').run(JSON.stringify({ startDate: '2025-01-01', version: 0, entries: [] }));
    const first = repo.save(null, { ...initial, expectedVersion: 0 });
    assert.throws(() => repo.save(null, { ...entry('snapshot', '2026-01-01T16:00', 110000), expectedVersion: 0 }), /变化/);
    assert.throws(() => repo.save(null, { ...entry('snapshot', initial.at, 110000), expectedVersion: 1 }), /相同时刻/);
    const second = repo.save(null, { ...entry('snapshot', '2026-01-01T16:00', 110000), expectedVersion: 1 });
    assert.throws(() => repo.remove(first.entries[0].id, 2), /起始资产/);
    const updated = repo.save(second.entries[1].id, { ...second.entries[1], amount: 120000, expectedVersion: 2 });
    close(updated.result.twr, .2);
    assert.equal(new PerformanceRepository(db).get().version, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM portfolio_performance_history').get().n, 3);
    assert.equal(repo.remove(second.entries[1].id, 3).result.twr, 0);
  } finally { db.close(); }
});
