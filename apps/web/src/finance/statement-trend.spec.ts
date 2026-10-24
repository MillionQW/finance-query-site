import assert from 'node:assert/strict';
import test from 'node:test';
import { statementTrendGroups } from './statement-trend';
import type { ReportPeriod } from '../types/finance';

function period(key: string, type: ReportPeriod['type'], label: string): ReportPeriod {
  return { key, type, label, annual: type === 'annual', fiscalYear: Number(key.slice(0, 4)) };
}

test('mixed reports default to annual and compare each interim period separately in chronological order', () => {
  const periods = [2025, 2024, 2023].flatMap((year) => [
    period(`${year}-12-31`, 'annual', `${year}年报`),
    period(`${year}-09-30`, 'quarter', `${year}三季报`),
    period(`${year}-06-30`, 'half-year', `${year}中报`),
    period(`${year}-03-31`, 'quarter', `${year}一季报`)
  ]);
  const groups = statementTrendGroups(periods, periods.map((entry) => entry.key));
  assert.equal(groups.length, 4);
  assert.equal(groups[0].label, '年报');
  assert.deepEqual(groups[0].periods.map((entry) => entry.key), ['2023-12-31', '2024-12-31', '2025-12-31']);
  for (const [label, suffix] of [['一季报', '03-31'], ['中报', '06-30'], ['三季报', '09-30']]) {
    assert.deepEqual(groups.find((group) => group.label === label)?.periods.map((entry) => entry.key),
      [2023, 2024, 2025].map((year) => `${year}-${suffix}`));
  }
});

test('annual classification uses report metadata for a non-December fiscal year', () => {
  const periods = [
    period('2025-03-31', 'annual', '2025年报'),
    period('2024-09-30', 'half-year', '2024中报'),
    period('2024-03-31', 'annual', '2024年报')
  ];
  const groups = statementTrendGroups(periods, periods.map((entry) => entry.key));
  assert.deepEqual(groups[0].periods.map((entry) => entry.key), ['2024-03-31', '2025-03-31']);
  assert.equal(groups[1].label, '中报');
});

test('only available table periods are included, with no annual or unknown-period fallback mixing', () => {
  const periods = [
    period('2025-12-31', 'annual', '2025年报'),
    period('2025-06-30', 'half-year', '2025中报'),
    period('2024-06-30', 'half-year', '2024中报'),
    period('2024-08-31', 'other', '2024-08-31')
  ];
  const groups = statementTrendGroups(periods, ['2024-06-30', '2024-08-31']);
  assert.deepEqual(groups.map((group) => group.label), ['中报', '08-31 报告期']);
  assert.deepEqual(statementTrendGroups(periods, []), []);
});
