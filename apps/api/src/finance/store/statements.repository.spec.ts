import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { FinancialStatements } from '../types';
import { CompanyStoreRepository } from './company.repository';
import { initializeFinanceStoreSchema } from './finance-store.schema';
import { StatementStoreRepository } from './statements.repository';
import { mergePartialStatements } from './finance-store.utils';

test('partial refresh retains fiscal starts for preserved reporting-period rows', () => {
  const original = payload(100, '2026-01-01');
  original.periodTables = [{ type:'income', title:'利润表', periods:['2025-06-30'], periodStarts:{'2025-06-30':'2025-01-01'}, rows:[] }];
  const partial = payload(100, '2026-02-01');
  partial.periodTables = [{ type:'income', title:'利润表', periods:[], rows:[] }];
  assert.equal(mergePartialStatements(original, partial).periodTables?.[0].periodStarts?.['2025-06-30'], '2025-01-01');
});

function payload(revenue: number, fetchedAt: string): FinancialStatements {
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
          { item: '经营活动现金流量净额', sourceItem: 'OPERATING_CASH', values: { '2025': 25 } }
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
    fetchedAt,
    source: 'fixture'
  };
}

test('statement repository keeps immutable versions and exposes revisions', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  initializeFinanceStoreSchema(db);
  const repository = new StatementStoreRepository(db, new CompanyStoreRepository(db));

  repository.saveStatements(payload(100, '2026-01-01T00:00:00.000Z'), 0);
  repository.saveStatements(payload(110, '2026-02-01T00:00:00.000Z'), 0);
  repository.saveStatements(payload(110, '2026-03-01T00:00:00.000Z'), 0);

  const stored = repository.getStatements('a', '600000', 0);
  assert.equal(stored?.version?.count, 2);
  assert.equal(stored?.revision?.changedCount, 1);
  assert.equal(stored?.revision?.changes[0]?.sourceItem, 'REVENUE');
  assert.equal(stored?.quality?.checks.find((check) => check.key === 'balance-equation')?.status, 'pass');

  db.close();
});
