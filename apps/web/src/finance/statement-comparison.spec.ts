import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialStatements, StatementTable } from '../types/finance';
import { buildStatementComparison, STATEMENT_COMPARISON_PRESETS } from './statement-comparison';

function table(
  type: StatementTable['type'],
  rows: Array<{ item: string; values: Record<string, number> }>
): StatementTable {
  return {
    type,
    title: type,
    years: ['2025', '2024'],
    rows: rows.map((row) => ({ ...row, sourceItem: row.item }))
  };
}

const statements: FinancialStatements = {
  company: { market: 'a', symbol: '600000', displaySymbol: '600000.SH' },
  years: ['2025', '2024'],
  unit: '元',
  tables: [
    table('balance', [
      { item: '货币资金', values: { '2025': 350, '2024': 300 } },
      { item: '短期借款', values: { '2025': 80, '2024': 70 } },
      { item: '长期借款', values: { '2025': 120, '2024': 100 } },
      { item: '应付债券', values: { '2025': 30, '2024': 20 } }
    ]),
    table('income', [
      { item: '营业收入', values: { '2025': 1000, '2024': 900 } },
      { item: '净利润', values: { '2025': 120, '2024': 100 } }
    ]),
    table('cashflow', [
      { item: '经营活动产生的现金流量净额', values: { '2025': 150, '2024': 110 } },
      { item: '销售商品、提供劳务收到的现金', values: { '2025': 1080, '2024': 920 } },
      { item: '期末现金及现金等价物余额', values: { '2025': 320, '2024': 280 } },
      { item: '购建固定资产、无形资产和其他长期资产支付的现金', values: { '2025': -45, '2024': -30 } },
      { item: '分配股利、利润或偿付利息支付的现金', values: { '2025': -25, '2024': -20 } }
    ])
  ],
  highlights: [],
  fetchedAt: '2026-01-01T00:00:00.000Z',
  source: 'fixture'
};

test('exposes the three requested comparison presets', () => {
  assert.deepEqual(
    STATEMENT_COMPARISON_PRESETS.map((preset) => preset.key),
    ['profitCash', 'cashRevenue', 'capitalAllocation']
  );
});

test('builds profit/cash and cash/revenue series across statements', () => {
  const profitCash = buildStatementComparison(statements, ['2025', '2024'], 'profitCash');
  const cashRevenue = buildStatementComparison(statements, ['2025', '2024'], 'cashRevenue');

  assert.deepEqual(profitCash.series.map((series) => series.points[0]?.value), [120, 150]);
  assert.deepEqual(cashRevenue.series.map((series) => series.points[0]?.value), [1080, 1000]);
  assert.deepEqual(profitCash.missing, []);
});

test('derives cash, spending, dividends and interest-bearing debt consistently', () => {
  const result = buildStatementComparison(statements, ['2025', '2024'], 'capitalAllocation');

  assert.deepEqual(result.series.map((series) => series.points[0]?.value), [320, 45, 25, 230]);
  assert.deepEqual(result.missing, []);
});

test('falls back to balance-sheet cash when ending cash is unavailable', () => {
  const withoutEndingCash: FinancialStatements = {
    ...statements,
    tables: statements.tables.map((item) => item.type === 'cashflow'
      ? { ...item, rows: item.rows.filter((row) => row.item !== '期末现金及现金等价物余额') }
      : item)
  };
  const result = buildStatementComparison(withoutEndingCash, ['2025'], 'capitalAllocation');

  assert.equal(result.series[0]?.points[0]?.value, 350);
});
