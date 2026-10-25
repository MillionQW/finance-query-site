import test from 'node:test';
import assert from 'node:assert/strict';
import { holdingSupported, shanghaiYear, valuationExpired, holdingAllocation, impliedSharePrice } from './portfolio';

test('target prices use consistent CNY caps and preserve quote currency, missing data and zero', () => {
  assert.equal(impliedSharePrice('2000', 100, 1000), 200);
  assert.equal(impliedSharePrice('900', 50, 1000 * .9), 50);
  assert.equal(impliedSharePrice('0', 100, 1000), 0);
  assert.equal(impliedSharePrice('1.5', 100, 10), 15);
  for (const value of ['', '<30000', '60000±10%', 'NaN', '-10']) assert.equal(impliedSharePrice(value, 100, 1000), null);
  assert.equal(impliedSharePrice('2000', null, 1000), null);
  assert.equal(impliedSharePrice('2000', 100, null), null);
  assert.equal(impliedSharePrice('2000', 100, 0), null);
});

test('valuation expires at Shanghai New Year, not the UTC or rolling-year boundary', () => {
  const entered = '2026-12-31T15:59:00Z';
  assert.equal(valuationExpired('60000±10%', entered, new Date('2026-12-31T15:59:59Z')), false);
  assert.equal(valuationExpired('60000±10%', entered, new Date('2026-12-31T16:00:00Z')), true);
  assert.equal(valuationExpired('60000±10%', '2026-12-31T16:01:00Z', new Date('2027-01-01T02:00:00Z')), false);
  assert.equal(valuationExpired('', null), false);
  assert.equal(valuationExpired('60000', null), true);
  assert.equal(shanghaiYear(new Date('2026-12-31T16:01:00Z')), 2027);
});

test('allocation converts HKD to CNY before computing weights and responds to FX updates', () => {
  const holdings = [{ id: 1, holdingValue: 100000, holdingCurrency: 'CNY' as const }, { id: 2, holdingValue: 100000, holdingCurrency: 'HKD' as const }];
  const summary = holdingAllocation(holdings, 0.9);
  assert.equal(summary.total, 190000);
  assert.equal(summary.cnyValues[2], 90000);
  assert.equal(summary.weights[1]!.toFixed(2), '52.63');
  assert.equal(summary.weights[2]!.toFixed(2), '47.37');
  assert.equal(holdingAllocation(holdings, 1).weights[1], 50);
  assert.equal(holdingAllocation([{ ...holdings[0], holdingValue: 123.45 }], null).weights[1], 100);
});

test('missing amounts or necessary FX never produce misleading full portfolio weights', () => {
  const holdings = [{ id: 1, holdingValue: 100, holdingCurrency: 'CNY' as const }, { id: 2, holdingValue: null, holdingCurrency: 'HKD' as const }];
  const missing = holdingAllocation(holdings, .9);
  assert.equal(missing.complete, false);
  assert.equal(missing.total, 100);
  assert.deepEqual(missing.weights, { 1: null, 2: null });
  assert.match(missing.message, /尚未填写/);
  for (const fx of [null, undefined, 0, -1, NaN, Infinity]) {
    const result = holdingAllocation([{ ...holdings[1], holdingValue: 100 }], fx);
    assert.equal(result.total, null);
    assert.equal(result.weights[2], null);
    assert.match(result.message, /汇率暂不可用/);
  }
  const zero = holdingAllocation([{ ...holdings[0], holdingValue: 0 }], null);
  assert.equal(zero.complete, true);
  assert.equal(zero.weights[1], null);
  const explicitZero = holdingAllocation([holdings[0], { ...holdings[1], holdingValue: 0 }], null);
  assert.deepEqual(explicitZero.weights, { 1: 100, 2: 0 });
  assert.equal(holdingAllocation([], null).total, 0);
});

test('A/HK are supported while both B-share markets are excluded', () => {
  for (const symbol of ['600519', '000001', '688001', '920001']) assert.equal(holdingSupported('a', symbol), true);
  assert.equal(holdingSupported('hk', '00700'), true);
  for (const symbol of ['200596', '900901', '510300', '00700']) assert.equal(holdingSupported('a', symbol), false);
});
