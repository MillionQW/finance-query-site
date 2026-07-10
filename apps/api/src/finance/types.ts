export type Market = 'a' | 'hk';

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
  unreadAnnouncementCount: number;
  hasUnreadAnnouncements: boolean;
}

export type AnnouncementCategory = '年报' | '业绩预告' | '权益分派' | '董事会' | '风险提示' | '其他';

export interface CompanyAnnouncement {
  key: string;
  market: Market;
  symbol: string;
  displaySymbol: string;
  companyName: string;
  title: string;
  category: AnnouncementCategory;
  publishedAt: string;
  url: string;
  source: string;
  discoveredAt?: string;
  isUnread?: boolean;
}

export interface AnnouncementFeed {
  company: {
    market: Market;
    symbol: string;
    displaySymbol: string;
    name: string;
  };
  items: CompanyAnnouncement[];
  refreshedAt: string | null;
  unreadCount: number;
  source: string;
}

export interface AnnouncementRefreshTarget extends CompanySearchResult {
  refreshedAt?: string | null;
}

export interface StatementRow {
  item: string;
  sourceItem?: string | null;
  values: Record<string, number | string | null>;
}

export interface StatementTable {
  type: 'balance' | 'income' | 'cashflow';
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

export interface PeerCompany {
  market: Market;
  symbol: string;
  displaySymbol: string;
  name: string;
  source: string;
  latestPrice?: number | null;
  changePercent?: number | null;
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
  cache?: {
    hit: boolean;
    refreshedAt: string;
  };
}

export interface StatementRefreshTarget {
  market: Market;
  symbol: string;
  displaySymbol: string;
  name?: string | null;
  years: number;
  refreshedAt?: string | null;
  reason: 'cached' | 'favorite-missing-cache';
}

export type StatementRefreshTrigger = 'manual' | 'scheduled';
export type StatementRefreshStatus = 'running' | 'completed' | 'failed' | 'skipped';

export interface StatementRefreshError {
  market: Market;
  symbol: string;
  displaySymbol: string;
  years: number;
  message: string;
}

export interface StatementRefreshRun {
  id: number;
  trigger: StatementRefreshTrigger;
  status: StatementRefreshStatus;
  startedAt: string;
  finishedAt?: string | null;
  totalTargets: number;
  succeeded: number;
  failed: number;
  message?: string | null;
  errors: StatementRefreshError[];
}

export interface StatementRefreshRuntimeStatus {
  enabled: boolean;
  running: boolean;
  intervalDays: number;
  checkEveryMinutes: number;
  nextRunAt: string | null;
  staleBefore: string;
  pendingTargets: number;
  currentRun: StatementRefreshRun | null;
  latestRun: StatementRefreshRun | null;
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
  cache?: {
    hit: boolean;
    refreshedAt: string;
  };
}

export interface CacheEntry {
  kind: 'statements' | 'peers';
  market: Market;
  symbol: string;
  displaySymbol: string;
  name?: string | null;
  years?: number | null;
  peerCount?: number | null;
  refreshedAt: string;
  source: string;
  payloadBytes: number;
}

export interface PeerMetricSeries {
  market: Market;
  symbol: string;
  displaySymbol: string;
  name: string;
  points: MetricPoint[];
  cached: boolean;
  isSelected?: boolean;
}

export interface PeerMetricComparison {
  metricKey: string;
  metricLabel: string;
  years: string[];
  companies: PeerMetricSeries[];
  missingCompanies: Array<{
    market: Market;
    symbol: string;
    displaySymbol: string;
    name: string;
  }>;
}
