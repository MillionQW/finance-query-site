import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPeriodMetricCards,
  latestPeriodWithData,
  reportPeriodComparisons,
  reportPeriodLabels
} from './period-analysis';
import type { PeriodMetricSeries, ReportPeriod } from '../types/finance';

const periods: ReportPeriod[] = [
  {
    key: '2025-09-30',
    label: '2025三季报',
    fiscalYear: 2025,
    type: 'quarter',
    annual: false,
    priorYearKey: '2024-09-30'
  },
  {
    key: '2024-09-30',
    label: '2024三季报',
    fiscalYear: 2024,
    type: 'quarter',
    annual: false,
    priorYearKey: null
  }
];

const series: PeriodMetricSeries[] = [
  {
    key: 'revenue',
    label: '营业收入（累计）',
    points: [
      { period: '2024-09-30', value: 100 },
      { period: '2025-09-30', value: 125 }
    ]
  }
];

test('period cards compare the same reporting period year over year', () => {
  assert.deepEqual(buildPeriodMetricCards(series, periods[0]), [
    {
      key: 'revenue',
      label: '营业收入（累计）',
      value: 125,
      comparisonValue: 100,
      yoy: 25
    }
  ]);
});

test('period helpers expose labels, comparison keys, and latest available data', () => {
  assert.equal(latestPeriodWithData(periods, series)?.key, '2025-09-30');
  assert.deepEqual(reportPeriodLabels(periods), {
    '2025-09-30': '2025三季报',
    '2024-09-30': '2024三季报'
  });
  assert.deepEqual(reportPeriodComparisons(periods), {
    '2025-09-30': '2024-09-30'
  });
});
