export type Market = 'a' | 'hk';
export type MarketFilter = 'all' | Market;
export type StatementType = 'balance' | 'income' | 'cashflow';

export interface CompanySearchResult {
  market: Market;
  symbol: string;
  displaySymbol: string;
  name: string;
  source: string;
  latestPrice?: number | null;
  changePercent?: number | null;
}

export interface StatementRow {
  item: string;
  values: Record<string, number | string | null>;
}

export interface StatementTable {
  type: StatementType;
  title: string;
  years: string[];
  rows: StatementRow[];
}

export interface MetricPoint {
  year: string;
  value: number | null;
}

export interface MetricSeries {
  key: string;
  label: string;
  points: MetricPoint[];
}

export interface FinancialStatements {
  company: {
    market: Market;
    symbol: string;
    displaySymbol: string;
    name?: string | null;
  };
  years: string[];
  unit: string;
  tables: StatementTable[];
  highlights: MetricSeries[];
  fetchedAt: string;
  source: string;
}
