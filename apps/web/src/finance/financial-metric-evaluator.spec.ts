import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialStatements, StatementTable, StatementType } from '../types/finance';
import { definitions, definitionForMarket, metricGroups } from './financial-metric-definitions';
import { evaluateFinancialMetrics } from './financial-metric-evaluator';

function statementTable(type: StatementType, rows: StatementTable['rows']): StatementTable {
  return {
    type,
    title: type,
    years: ['2025', '2024'],
    rows
  };
}

function statements(): FinancialStatements {
  return {
    company: {
      market: 'a',
      symbol: '600000',
      displaySymbol: 'SH600000',
      name: '测试公司'
    },
    years: ['2025', '2024'],
    unit: '元',
    tables: [
      statementTable('balance', [
        { item: '归属于母公司股东权益合计', values: { '2025': 1000, '2024': 800 } }
      ]),
      statementTable('income', [
        { item: '归属于母公司股东的净利润', values: { '2025': 120, '2024': 80 } }
      ]),
      statementTable('cashflow', [])
    ],
    highlights: [],
    fetchedAt: '2026-07-25T00:00:00.000Z',
    source: 'test'
  };
}

test('metric catalog keeps unique keys and references declared groups', () => {
  const keys = definitions.map((definition) => definition.key);
  const groups = new Set(metricGroups.map((group) => group.key));

  assert.equal(new Set(keys).size, keys.length);
  assert.ok(definitions.every((definition) => groups.has(definition.group)));
});

test('Hong Kong labels are adapted without mutating the shared definition', () => {
  const source = definitions.find((definition) => definition.key === 'internalAssetReturn');
  assert.ok(source);

  const adapted = definitionForMarket(source, 'hk');

  assert.equal(adapted.label, '内部资产收益率（港股口径）');
  assert.equal(source.label, '内部资产收益率');
  assert.notStrictEqual(adapted, source);
});

test('evaluator builds values, details, and missing-field state outside Vue', () => {
  const roe = definitions.find((definition) => definition.key === 'roe');
  assert.ok(roe);

  const [result] = evaluateFinancialMetrics(statements(), ['2025'], [roe]);

  assert.equal(result.latest, 120 / 900);
  assert.deepEqual(result.missing, []);
  assert.equal(result.points[0].year, '2025');
  assert.equal(result.points[0].value, 120 / 900);
  assert.equal(result.points[0].expression, '120 / 900 = 13.33%');
  assert.equal(result.points[0].details.at(-1)?.label, '平均股东权益');
});

test('evaluator returns stable empty results before statements load', () => {
  const roe = definitions.find((definition) => definition.key === 'roe');
  assert.ok(roe);

  const [result] = evaluateFinancialMetrics(null, [], [roe]);

  assert.deepEqual(result.points, []);
  assert.equal(result.latest, null);
  assert.deepEqual(result.alerts, []);
});
