import type { FinancialStatements, StatementTable } from '../types/finance';
import {
  CASH_ALIASES,
  COMBINED_CAPITAL_EXPENDITURE_ALIASES,
  CUSTOMER_CASH_RECEIPTS_ALIASES,
  END_CASH_EQUIVALENT_ALIASES,
  FIXED_ASSET_CAPEX_ALIASES,
  INTEREST_BEARING_DEBT_GROUPS,
  INTANGIBLE_ASSET_CAPEX_ALIASES,
  NET_PROFIT_ALIASES,
  OPERATING_CASHFLOW_ALIASES,
  REVENUE_ALIASES
} from './financial-metric-fields';
import { sumRows } from './financial-metric-calculation-helpers';
import { absoluteValue, calculateFreeCashFlow, rowValue } from './financial-metric-engine';

export type StatementComparisonPresetKey = 'profitCash' | 'cashRevenue' | 'capitalAllocation';

export interface StatementComparisonPreset {
  key: StatementComparisonPresetKey;
  label: string;
  description: string;
  note: string;
}

export interface StatementComparisonPoint {
  year: string;
  value: number | null;
}

export interface StatementComparisonSeries {
  key: string;
  label: string;
  points: StatementComparisonPoint[];
}

export interface StatementComparisonResult {
  preset: StatementComparisonPreset;
  series: StatementComparisonSeries[];
  missing: string[];
}

export const STATEMENT_COMPARISON_PRESETS: StatementComparisonPreset[] = [
  {
    key: 'profitCash',
    label: '净利润 + 经营现金流净额',
    description: '观察利润是否同步转化为经营现金',
    note: '净利润取利润表口径，经营现金流净额取现金流量表口径。'
  },
  {
    key: 'cashRevenue',
    label: '销售收现 + 营业收入',
    description: '对照销售回款与收入确认',
    note: '销售收现取“销售商品、提供劳务收到的现金”，营业收入取利润表口径。'
  },
  {
    key: 'capitalAllocation',
    label: '现金 / 投资 / 分红 / 有息负债',
    description: '同图观察现金储备与资本配置',
    note: '投资支出按资本开支口径取绝对值；现金分红取“分配股利、利润或偿付利息支付的现金”，可能包含付息金额；有息负债为借款、债券、租赁负债等合计。'
  }
];

const CASH_DIVIDEND_ALIASES = [
  '分配股利、利润或偿付利息支付的现金',
  '分配股利利润或偿付利息支付的现金',
  '分配股利、利润和偿付利息支付的现金',
  '支付股利、利润或利息',
  '已付股息',
  '支付股息',
  '股息支付',
  'ASSIGN DIVIDEND PORFIT',
  'DIVIDEND PAID'
];

function tableOf(
  statements: FinancialStatements,
  type: StatementTable['type']
): StatementTable | undefined {
  return statements.tables.find((table) => table.type === type);
}

function capitalExpenditureValue(cashflow: StatementTable | undefined, year: string): number | null {
  const combined = rowValue(cashflow, year, COMBINED_CAPITAL_EXPENDITURE_ALIASES);
  const fixedAsset = rowValue(cashflow, year, FIXED_ASSET_CAPEX_ALIASES);
  const intangibleAsset = rowValue(cashflow, year, INTANGIBLE_ASSET_CAPEX_ALIASES);
  return calculateFreeCashFlow(null, combined, [fixedAsset, intangibleAsset]).capitalExpenditure;
}

export function buildStatementComparison(
  statements: FinancialStatements,
  activeYears: string[],
  presetKey: StatementComparisonPresetKey
): StatementComparisonResult {
  const balance = tableOf(statements, 'balance');
  const income = tableOf(statements, 'income');
  const cashflow = tableOf(statements, 'cashflow');
  const requestedYears = activeYears.length ? activeYears : statements.years;
  const years = requestedYears.filter((year) => statements.years.includes(year));
  const preset = STATEMENT_COMPARISON_PRESETS.find((item) => item.key === presetKey)
    ?? STATEMENT_COMPARISON_PRESETS[0];

  const valueGetters: Record<StatementComparisonPresetKey, Array<{
    key: string;
    label: string;
    value: (year: string) => number | null;
  }>> = {
    profitCash: [
      {
        key: 'netProfit',
        label: '净利润',
        value: (year) => rowValue(income, year, NET_PROFIT_ALIASES)
      },
      {
        key: 'operatingCashflow',
        label: '经营现金流净额',
        value: (year) => rowValue(cashflow, year, OPERATING_CASHFLOW_ALIASES)
      }
    ],
    cashRevenue: [
      {
        key: 'customerCashReceipts',
        label: '销售商品、提供劳务收到现金',
        value: (year) => rowValue(cashflow, year, CUSTOMER_CASH_RECEIPTS_ALIASES)
      },
      {
        key: 'revenue',
        label: '营业收入',
        value: (year) => rowValue(income, year, REVENUE_ALIASES)
      }
    ],
    capitalAllocation: [
      {
        key: 'cashBalance',
        label: '现金余额',
        value: (year) => (
          rowValue(cashflow, year, END_CASH_EQUIVALENT_ALIASES)
          ?? rowValue(balance, year, CASH_ALIASES)
        )
      },
      {
        key: 'capitalExpenditure',
        label: '投资支出',
        value: (year) => capitalExpenditureValue(cashflow, year)
      },
      {
        key: 'cashDividend',
        label: '现金分红',
        value: (year) => absoluteValue(rowValue(cashflow, year, CASH_DIVIDEND_ALIASES))
      },
      {
        key: 'interestBearingDebt',
        label: '有息负债',
        value: (year) => sumRows(balance, year, INTEREST_BEARING_DEBT_GROUPS).total
      }
    ]
  };

  const series = valueGetters[preset.key].map((definition) => ({
    key: definition.key,
    label: definition.label,
    points: years.map((year) => ({ year, value: definition.value(year) }))
  }));

  return {
    preset,
    series,
    missing: series
      .filter((item) => item.points.every((point) => point.value === null))
      .map((item) => item.label)
  };
}
