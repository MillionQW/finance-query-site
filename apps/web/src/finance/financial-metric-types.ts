import type { FinancialStatements, StatementTable } from '../types/finance';

export type MetricKind = 'percent' | 'times' | 'amount' | 'days' | 'judgment' | 'classification';
export type MetricGroupKey = 'profitability' | 'cashQuality' | 'growth' | 'solvency' | 'efficiency' | 'assetQuality' | 'judgment';

export interface FormulaDetail {
  label: string;
  value: number | null;
  kind?: MetricKind | 'number';
  note?: string;
  displayValue?: string;
}

export interface FormulaDetails {
  rows: FormulaDetail[];
  expression: string;
}

export interface MetricPoint {
  year: string;
  value: number | null;
  details: FormulaDetail[];
  expression: string;
}

export interface MetricRequirement {
  label: string;
  table: 'balance' | 'income' | 'cashflow';
  aliases: string[];
}

export interface MetricContext {
  statements: FinancialStatements;
  balance: StatementTable | undefined;
  income: StatementTable | undefined;
  cashflow: StatementTable | undefined;
}

export interface MetricDefinition {
  key: string;
  label: string;
  group: MetricGroupKey;
  formula: string;
  kind: MetricKind;
  description: string;
  calculate: (context: MetricContext, year: string, yearIndex: number) => number | null;
  requirements: MetricRequirement[];
}

export interface MetricAlert {
  year?: string;
  message: string;
  tone: 'warning' | 'danger';
}

export interface MetricResult {
  definition: MetricDefinition;
  points: MetricPoint[];
  latest: number | null;
  missing: string[];
  alerts: MetricAlert[];
}
