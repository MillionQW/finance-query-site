import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyValuationModel, calculateScenario, modelErrors, impliedGrowth } from './scenario-valuation';

function model() {
  const m = emptyValuationModel();
  Object.assign(m, { baseProfit: 10, shares: 10, price: 10, reportCurrency: 'CNY', quoteCurrency: 'CNY', basePeriod: '2025年报', baseSource: 'verified fixture', requiredReturn: 0 });
  m.scenarios.forEach(s => Object.assign(s, { growth: 0, exitPe: 10, payout: 0, shareChange: 0, rationale: 'test' }));
  return m;
}
test('flat earnings with no dividends have a value of EPS times PE and zero IRR at fair price', () => {
  const m = model(), result = calculateScenario(m, m.scenarios[0])!;
  assert.equal(result.fairPrice, 10);
  assert.equal(result.terminalMarketCap, 100);
  assert.ok(Math.abs(result.annualReturn) < 1e-10);
  assert.equal(result.watchPrice, 7.5);
});
test('annual dividends are discounted at their own dates and IRR reconciles all cash flows', () => {
  const m = model(); m.requiredReturn = 10; m.scenarios[0].payout = 50;
  const r = calculateScenario(m, m.scenarios[0])!;
  const expected = .5 / 1.1 + .5 / 1.1 ** 2 + 10.5 / 1.1 ** 3;
  assert.ok(Math.abs(r.fairPrice - expected) < 1e-10);
  const npv = r.dividends.reduce((a, d, i) => a + d / (1 + r.annualReturn) ** (i + 1), 0) + r.terminalPrice / (1 + r.annualReturn) ** 3;
  assert.ok(Math.abs(npv - m.price!) < 1e-8);
});
test('FX and dilution affect per-share value once, without changing reported-currency terminal market cap', () => {
  const m = model(); m.quoteCurrency = 'HKD'; m.fx = 1.1; m.fxDate = '2026-10-23'; m.scenarios[0].shareChange = 10;
  const r = calculateScenario(m, m.scenarios[0])!;
  assert.ok(Math.abs(r.terminalPrice - 11 / 1.1 ** 3) < 1e-10);
  assert.equal(r.terminalMarketCap, 100);
});
test('zero, negative, blank, nonfinite or missing FX inputs cannot generate an estimate', () => {
  for (const invalid of [0, -1, NaN, Infinity, null, '' as any]) {
    const m = model(); m.baseProfit = invalid;
    assert.equal(calculateScenario(m, m.scenarios[0]), null);
  }
  const m = model(); m.quoteCurrency = 'HKD'; m.fxDate = '2026-02-30';
  assert.ok(modelErrors(m).length > 0);
});
test('reverse valuation solves the growth assumption that reconciles price', () => {
  const m = model(); m.scenarios[1].growth = 12;
  m.price = calculateScenario(m, m.scenarios[1])!.fairPrice;
  assert.ok(Math.abs(impliedGrowth(m, m.scenarios[1])! - 12) < 1e-7);
  m.price = 1e8;
  assert.equal(impliedGrowth(m, m.scenarios[1]), null);
});
