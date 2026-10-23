import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialStatements, StatementTable } from '../types/finance';
import { buildFinancialDriverAnalysis } from './financial-driver-analysis';

function table(
  type: StatementTable['type'],
  rows: Array<{ item: string; values: Record<string, number> }>
): StatementTable {
  return {
    type,
    title: type,
    years: ['2025', '2024', '2023'],
    rows: rows.map((row) => ({ ...row, sourceItem: row.item }))
  };
}

const statements: FinancialStatements = {
  company: { market: 'a', symbol: '600000', displaySymbol: '600000.SH' },
  years: ['2025', '2024', '2023'],
  unit: '元',
  tables: [
    table('balance', [
      { item: '资产总计', values: { '2025': 1200, '2024': 1000, '2023': 800 } },
      { item: '所有者权益合计', values: { '2025': 600, '2024': 500, '2023': 400 } },
      { item: '应收账款', values: { '2025': 130, '2024': 100, '2023': 90 } },
      { item: '存货', values: { '2025': 105, '2024': 100, '2023': 95 } },
      { item: '应付账款', values: { '2025': 120, '2024': 100, '2023': 90 } }
    ]),
    table('income', [
      { item: '营业收入', values: { '2025': 1200, '2024': 1000, '2023': 900 } },
      { item: '净利润', values: { '2025': 120, '2024': 100, '2023': 90 } }
    ]),
    table('cashflow', [
      { item: '经营活动产生的现金流量净额', values: { '2025': 150, '2024': 110, '2023': 100 } },
      { item: '购建固定资产、无形资产和其他长期资产支付的现金', values: { '2025': 40, '2024': 30, '2023': 20 } }
    ])
  ],
  highlights: [],
  fetchedAt: '2026-01-01T00:00:00.000Z',
  source: 'fixture'
};

test('driver analysis reconciles DuPont and cash bridge values', () => {
  const analysis = buildFinancialDriverAnalysis(statements);
  const dupontRoe = analysis.dupont.find((item) => item.label === '杜邦 ROE');
  const freeCash = analysis.cashBridge.find((item) => item.label === '自由现金流');
  assert.ok(Math.abs((dupontRoe?.current ?? 0) - 0.2181818) < 0.0001);
  assert.equal(freeCash?.current, 110);
  assert.equal(analysis.coverage, 100);
});

test('driver analysis flags receivables growing faster than revenue', () => {
  const analysis = buildFinancialDriverAnalysis(statements);
  const receivables = analysis.workingCapital.find((item) => item.label === '应收账款');
  assert.equal(receivables?.tone, 'warning');
  assert.ok((receivables?.revenueGap ?? 0) > 0);
});

test('driver analysis explains insufficient history', () => {
  const analysis = buildFinancialDriverAnalysis({ ...statements, years: ['2025'] });
  assert.equal(analysis.coverage, 0);
  assert.equal(analysis.dupont.length, 0);
});

test('cash bridge does not count capex components twice when the total is supplied', () => {
  const input = structuredClone(statements);
  input.tables.find(t => t.type === 'cashflow')!.rows.push(
    { item: '购建固定资产', values: { '2025': 25, '2024': 20 } },
    { item: '购建无形资产及其他资产', values: { '2025': 15, '2024': 10 } }
  );
  const bridge = buildFinancialDriverAnalysis(input).cashBridge;
  assert.equal(bridge.find(r => r.label === '资本开支')?.current, 40);
  assert.equal(bridge.find(r => r.label === '自由现金流')?.current, 110);
});
