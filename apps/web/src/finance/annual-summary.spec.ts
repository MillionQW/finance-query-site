import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinancialStatements } from '../types/finance';
import { annualSummaryCards } from './annual-summary';
test('annual summary aligns every metric with the latest report year and calendar prior year', () => {
  const input = { years: ['2025','2024'], highlights: [{ key: 'revenue', label: '收入', points: [{year:'2023',value:80},{year:'2024',value:100},{year:'2025',value:null}] }] } as FinancialStatements;
  const card = annualSummaryCards(input)[0];
  assert.equal(card.year, '2025');
  assert.equal(card.latest, null);
  assert.equal(card.delta, null);
});
