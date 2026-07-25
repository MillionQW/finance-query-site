import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCashConversionCycle,
  calculateFreeCashFlow,
  calculateIncrementalReturn,
  calculateRollingRatio,
  calculateRollingStatistics,
  findRow,
  formatMetricValue,
  growthGapValue,
  growthRate,
  rowValue,
  safeDivide,
  toNumber
} from './financial-metric-engine';
import {
  ACCOUNTS_PAYABLE_ALIASES,
  COMBINED_CAPITAL_EXPENDITURE_ALIASES,
  FIXED_ASSET_CAPEX_ALIASES,
  INTANGIBLE_ASSET_CAPEX_ALIASES,
  NET_PROFIT_ALIASES
} from './financial-metric-fields';
import type { StatementTable } from '../types/finance';

function table(rows: StatementTable['rows']): StatementTable {
  return {
    type: 'cashflow',
    title: '测试财报',
    years: ['2025', '2024', '2023'],
    rows
  };
}

test('numeric parsing and safe ratios reject unusable financial values', () => {
  assert.equal(toNumber('1,234.50'), 1234.5);
  assert.equal(toNumber('-'), null);
  assert.equal(toNumber(''), null);
  assert.equal(safeDivide(10, 2), 5);
  assert.equal(safeDivide(10, 0), null);
  assert.equal(safeDivide(null, 2), null);
});

test('field matching supports A-share aliases and traditional account characters', () => {
  const statement = table([
    { item: '归属于母公司股东的净利润', values: { '2025': 88 } },
    { item: '应付帐款', values: { '2025': '1,200' } }
  ]);
  assert.equal(rowValue(statement, '2025', NET_PROFIT_ALIASES), 88);
  assert.equal(rowValue(statement, '2025', ACCOUNTS_PAYABLE_ALIASES), 1200);
  assert.equal(findRow(statement, ['应付账款'])?.item, '应付帐款');
});

test('free cash flow prefers the combined A-share capex line', () => {
  const result = calculateFreeCashFlow(500, -180, [-100, -40]);
  assert.deepEqual(result, { capitalExpenditure: 180, freeCashFlow: 320 });
  assert.ok(COMBINED_CAPITAL_EXPENDITURE_ALIASES.includes('购建固定资产、无形资产和其他长期资产支付的现金'));
});

test('free cash flow sums separate Hong Kong fixed and intangible asset purchases', () => {
  const result = calculateFreeCashFlow(500, null, [-100, -40]);
  assert.deepEqual(result, { capitalExpenditure: 140, freeCashFlow: 360 });
  assert.ok(FIXED_ASSET_CAPEX_ALIASES.includes('购建固定资产'));
  assert.ok(INTANGIBLE_ASSET_CAPEX_ALIASES.includes('购建无形资产及其他资产'));
});

test('free cash flow stays unavailable when capex fields are absent', () => {
  assert.deepEqual(
    calculateFreeCashFlow(500, null, [null, null]),
    { capitalExpenditure: null, freeCashFlow: null }
  );
});

test('three-year rolling cash conversion requires a complete window', () => {
  assert.deepEqual(
    calculateRollingRatio([120, 100, 80], [100, 90, 70], 0, 3),
    { numeratorTotal: 300, denominatorTotal: 260, value: 300 / 260 }
  );
  assert.deepEqual(
    calculateRollingRatio([120, null, 80], [100, 90, 70], 0, 3),
    { numeratorTotal: null, denominatorTotal: null, value: null }
  );
  assert.equal(calculateRollingRatio([120, 100, 80], [100, 90, 70], 1, 3).value, null);
});

test('cash conversion cycle combines receivable, inventory, and payable days', () => {
  const result = calculateCashConversionCycle(1000, 600, 100, 120, 90);
  assert.equal(result.receivableDays, 36.5);
  assert.equal(result.inventoryDays, 73);
  assert.equal(result.payableDays, 54.75);
  assert.equal(result.cycle, 54.75);
});

test('incremental return uses only positive additions to invested capital', () => {
  assert.deepEqual(
    calculateIncrementalReturn(160, 100, 1400, 1000),
    { profitChange: 60, capitalChange: 400, value: 0.15 }
  );
  assert.deepEqual(
    calculateIncrementalReturn(160, 100, 900, 1000),
    { profitChange: 60, capitalChange: -100, value: null }
  );
  assert.equal(calculateIncrementalReturn(null, 100, 1400, 1000).value, null);
});

test('five-year statistics calculate mean and population volatility', () => {
  const result = calculateRollingStatistics([0.10, 0.12, 0.08, 0.11, 0.09], 0, 5);
  assert.equal(result.count, 5);
  assert.equal(result.mean, 0.1);
  assert.ok(Math.abs((result.standardDeviation ?? 0) - Math.sqrt(0.0002)) < 1e-12);
  assert.deepEqual(
    calculateRollingStatistics([0.10, 0.12, null, 0.11, 0.09], 0, 5),
    { count: 4, mean: null, standardDeviation: null }
  );
});

test('growth gaps preserve direction and handle negative comparison bases', () => {
  assert.equal(growthRate(120, 100), 0.2);
  assert.equal(growthRate(-80, -100), 0.2);
  assert.ok(Math.abs((growthGapValue(130, 100, 110, 100) ?? 0) - 0.2) < 1e-12);
  assert.equal(growthGapValue(130, 0, 110, 100), null);
});

test('metric formatting distinguishes money, ratios, and days', () => {
  assert.equal(formatMetricValue(0.1234, 'percent'), '12.34%');
  assert.equal(formatMetricValue(1.5, 'times'), '1.50 次');
  assert.equal(formatMetricValue(54.75, 'days'), '54.8 天');
  assert.equal(formatMetricValue(120_000_000, 'amount'), '1.20亿');
});
