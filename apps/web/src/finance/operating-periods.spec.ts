import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOperatingPeriods, comparableGrowth } from './operating-periods';
import type { FinancialStatements } from '../types/finance';

function fixture(market: 'a' | 'hk', periods: string[], values: number[], starts?: Record<string, string>): FinancialStatements {
  return { company: { market, symbol: '1', displaySymbol: '1' }, years: [], unit: '元', tables: [], highlights: [], source: 'test', fetchedAt: '',
    periodTables: ['income', 'cashflow'].map(type => ({ type: type as 'income' | 'cashflow', title: type, periods, periodStarts: starts,
      rows: (type === 'income' ? ['营业收入', '归属于母公司股东的净利润'] : ['经营活动现金流量净额']).map(item => ({ item, values: Object.fromEntries(periods.map((p, i) => [p, values[i]])) })) })) };
}
test('single quarters subtract only adjacent same-fiscal-year YTD and compare matching prior quarters', () => {
  const input = fixture('a', ['2025-12-31','2025-09-30','2025-06-30','2025-03-31','2024-12-31','2024-09-30','2024-06-30','2024-03-31'], [500,300,210,100,400,240,160,80]);
  const rows = buildOperatingPeriods(input);
  assert.equal(rows[0].revenue, 200);
  assert.equal(rows[0].revenueYoY, 0.25);
  assert.equal(rows[0].cash, 200);
  assert.equal(rows[3].revenue, 100);
  assert.equal(rows[0].months, 3);
});
test('a missing previous quarter does not turn YTD into a quarter', () => {
  const rows = buildOperatingPeriods(fixture('a', ['2025-09-30', '2025-03-31'], [300,100]));
  assert.equal(rows[0].revenue, null);
  assert.equal(rows[0].cash, null);
});
test('Hong Kong half years respect a March year end and never fabricate quarters', () => {
  const input = fixture('hk', ['2025-03-31', '2024-09-30', '2024-03-31', '2023-09-30'], [250,100,200,80], {
    '2025-03-31':'2024-04-01','2024-09-30':'2024-04-01','2024-03-31':'2023-04-01','2023-09-30':'2023-04-01'
  });
  const rows = buildOperatingPeriods(input);
  assert.equal(rows[0].start, '2024-10-01');
  assert.equal(rows[0].months, 6);
  assert.equal(rows[0].revenue, 150);
  assert.equal(rows[0].revenueYoY, 0.25);
  assert.equal(rows[1].revenue, 100);
});
test('unknown HK fiscal starts produce no guessed analysis', () => {
  assert.equal(buildOperatingPeriods(fixture('hk', ['2025-06-30'], [100])).length, 0);
});
test('consolidated profit never substitutes for parent earnings; negative bases have no ordinary growth rate', () => {
  const input = fixture('a', ['2025-03-31'], [100]);
  input.periodTables![0].rows[1].item = '净利润';
  assert.equal(buildOperatingPeriods(input)[0].profit, null);
  assert.equal(comparableGrowth(5, -10), null);
  assert.equal(comparableGrowth(5, 0), null);
});
