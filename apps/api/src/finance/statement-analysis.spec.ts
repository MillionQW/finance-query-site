import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialStatements } from './types';
import {
  diffFinancialStatements,
  evaluateStatementQuality,
  statementDataForHash
} from './statement-analysis';

test('currency and amount scale changes are part of the immutable data version', () => {
  assert.notDeepEqual(statementDataForHash({ ...fixture(), reportingCurrency: 'CNY' }), statementDataForHash({ ...fixture(), reportingCurrency: 'HKD' }));
  assert.notDeepEqual(statementDataForHash({ ...fixture(), amountScale: 1 }), statementDataForHash({ ...fixture(), amountScale: 1000 }));
});

function fixture(revenue = 100): FinancialStatements {
  return {
    schemaVersion: 2,
    company: {
      market: 'a',
      symbol: '600000',
      displaySymbol: '600000.SH',
      name: '测试公司'
    },
    years: ['2025'],
    unit: '元',
    tables: [
      {
        type: 'balance',
        title: '资产负债表',
        years: ['2025'],
        rows: [
          { item: '总资产', sourceItem: 'TOTAL_ASSETS', values: { '2025': 100 } },
          { item: '总负债', sourceItem: 'TOTAL_LIABILITIES', values: { '2025': 40 } },
          { item: '所有者权益合计', sourceItem: 'TOTAL_EQUITY', values: { '2025': 60 } }
        ]
      },
      {
        type: 'income',
        title: '利润表',
        years: ['2025'],
        rows: [
          { item: '营业收入', sourceItem: 'REVENUE', values: { '2025': revenue } },
          { item: '净利润', sourceItem: 'NETPROFIT', values: { '2025': 20 } }
        ]
      },
      {
        type: 'cashflow',
        title: '现金流量表',
        years: ['2025'],
        rows: [
          { item: '经营活动现金流量净额', sourceItem: 'OPERATING_CASH', values: { '2025': 25 } },
          { item: '期初现金及现金等价物余额', sourceItem: 'CASH_BEGIN', values: { '2025': 10 } },
          { item: '现金及现金等价物净增加额', sourceItem: 'CASH_CHANGE', values: { '2025': 5 } },
          { item: '期末现金及现金等价物余额', sourceItem: 'CASH_END', values: { '2025': 15 } }
        ]
      }
    ],
    highlights: [
      { key: 'assets', label: '总资产', points: [{ year: '2025', value: 100 }] },
      { key: 'liabilities', label: '总负债', points: [{ year: '2025', value: 40 }] },
      { key: 'revenue', label: '营业收入', points: [{ year: '2025', value: revenue }] },
      { key: 'netProfit', label: '净利润', points: [{ year: '2025', value: 20 }] },
      { key: 'operatingCashflow', label: '经营现金流', points: [{ year: '2025', value: 25 }] }
    ],
    reportPeriods: [
      {
        key: '2025-12-31',
        label: '2025年报',
        fiscalYear: 2025,
        type: 'annual',
        annual: true,
        priorYearKey: null
      }
    ],
    periodTables: [
      { type: 'balance', title: '资产负债表', periods: ['2025-12-31'], rows: [] },
      { type: 'income', title: '利润表', periods: ['2025-12-31'], rows: [] },
      { type: 'cashflow', title: '现金流量表', periods: ['2025-12-31'], rows: [] }
    ],
    fetchedAt: '2026-01-01T00:00:00.000Z',
    source: 'fixture'
  };
}

test('quality evaluation checks coverage and accounting reconciliations', () => {
  const quality = evaluateStatementQuality(fixture());
  assert.equal(quality.checks.find((check) => check.key === 'balance-equation')?.status, 'pass');
  assert.equal(quality.checks.find((check) => check.key === 'cash-reconciliation')?.status, 'pass');
  assert.equal(quality.coveragePercent, 80);
});

test('statement diffs only report changed overlapping values', () => {
  const changes = diffFinancialStatements(fixture(100), fixture(110));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].sourceItem, 'REVENUE');
  assert.equal(changes[0].changePercent, 10);
  assert.equal(changes[0].material, true);
});

test('stable statement hash input excludes fetch timestamps', () => {
  const first = fixture();
  const second = { ...fixture(), fetchedAt: '2026-02-01T00:00:00.000Z' };
  assert.deepEqual(statementDataForHash(first), statementDataForHash(second));
});
