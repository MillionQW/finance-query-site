import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialStatements } from '../types/finance';
import { buildResearchSummary } from './research-summary';

test('research summary stays transparent when statements are unavailable', () => {
  const summary = buildResearchSummary(null);
  assert.equal(summary.status, '数据不足');
  assert.equal(summary.diagnostics.length, 0);
});

test('research summary produces four explainable dimensions', () => {
  const statements: FinancialStatements = {
    company: {
      market: 'a',
      symbol: '600000',
      displaySymbol: '600000.SH',
      name: '测试公司'
    },
    years: ['2025', '2024'],
    unit: '元',
    tables: [
      { type: 'balance', title: '资产负债表', years: ['2025', '2024'], rows: [] },
      { type: 'income', title: '利润表', years: ['2025', '2024'], rows: [] },
      { type: 'cashflow', title: '现金流量表', years: ['2025', '2024'], rows: [] }
    ],
    highlights: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
    source: 'fixture'
  };
  const summary = buildResearchSummary(statements);
  assert.equal(summary.diagnostics.length, 4);
  assert.equal(summary.status, '数据不足');
});
