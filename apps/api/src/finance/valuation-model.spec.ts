import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValuationModelDto } from './valuation-model.dto';
import { validateModelSemantics } from './valuation-model.controller';

function fixture(): ValuationModelDto {
  return plainToInstance(ValuationModelDto, {
    version: 1, baseProfit: 10, shares: 10, price: 20, reportCurrency: 'CNY', quoteCurrency: 'CNY', fx: 1, fxDate: '',
    basePeriod: '2025年报', profitBasis: '归母净利润', baseSource: 'report page 10', statementHash: 'hash', valuationDate: '2026-10-23',
    years: 3, requiredReturn: 10, safetyMargin: 25,
    scenarios: ['悲观','中性','乐观'].map(name => ({ name, growth: 5, exitPe: 20, payout: 30, shareChange: 0, rationale: '经营假设' }))
  });
}
test('nested valuation inputs reject nonnumeric values and out-of-range assumptions', async () => {
  assert.equal((await validate(fixture())).length, 0);
  for (const value of [null, '', '10', NaN, Infinity, -1]) {
    const m = fixture(); (m as any).baseProfit = value;
    assert.ok((await validate(m)).length);
  }
  const m = fixture(); m.scenarios[1].growth = -100;
  assert.ok((await validate(m)).length);
  m.scenarios = [];
  assert.ok((await validate(m)).length);
});
test('semantic validation enforces dates, explanatory text, and same-currency identity FX', () => {
  assert.doesNotThrow(() => validateModelSemantics(fixture()));
  const date = fixture(); date.valuationDate = '2026-02-30';
  assert.throws(() => validateModelSemantics(date));
  const fx = fixture(); fx.quoteCurrency = 'HKD';
  assert.throws(() => validateModelSemantics(fx));
  const text = fixture(); text.scenarios[0].rationale = '   ';
  assert.throws(() => validateModelSemantics(text));
  const same = fixture(); same.fx = 2;
  assert.throws(() => validateModelSemantics(same));
});
