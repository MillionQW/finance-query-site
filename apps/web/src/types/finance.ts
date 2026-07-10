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

export interface FavoriteCompany extends CompanySearchResult {
  favoritedAt: string;
  updatedAt: string;
}

export interface StatementRow {
  item: string;
  sourceItem?: string | null;
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

export interface PeerCompany extends CompanySearchResult {
  turnoverRate?: number | null;
  pe?: number | null;
  pb?: number | null;
  isSelected?: boolean;
}

export interface PeerRanking {
  key: string;
  label: string;
  rank: number | null;
  total: number;
  value: number | null;
  unit?: string;
  direction: 'asc' | 'desc';
}

export interface PeerComparison {
  company: {
    market: Market;
    symbol: string;
    displaySymbol: string;
    name?: string | null;
  };
  industry?: {
    name: string;
    code?: string | null;
    source: string;
  } | null;
  peers: PeerCompany[];
  rankings: PeerRanking[];
  fetchedAt: string;
  source: string;
  note?: string | null;
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
