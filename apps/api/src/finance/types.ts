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

export interface ScreenerCompany extends CompanySearchResult {
  pe: number | null;
  roa: number | null;
  reportDate: string | null;
}

export interface ScreenerResult {
  items: ScreenerCompany[];
  params: {
    markets: Market[];
    minRoa: number;
    maxPe: number;
    limit: number;
    maxCandidates: number;
    scope?: string;
    minMarketCapBillion?: number;
    requestGapMs?: number;
    annualOnly: boolean;
    peOnly?: boolean;
    excludeBanks?: boolean;
  };
  summary: {
    matched: number;
    scannedCandidates: number;
    warnings: number;
  };
  warnings: string[];
  fetchedAt: string;
  source: string;
  cache?: {
    hit: boolean;
    refreshedAt: string;
    expiresAt: string;
  };
}

export interface FavoriteCompany extends CompanySearchResult {
  favoritedAt: string;
  updatedAt: string;
  unreadAnnouncementCount: number;
  hasUnreadAnnouncements: boolean;
}

export interface CompanyInsight {
  market: Market;
  symbol: string;
  note: string;
  thesis: string;
  risks: string;
  catalysts: string;
  questions: string;
  buyPointRange: string;
  buyPointUpdatedAt: string | null;
  updatedAt: string | null;
}

export type AnnouncementCategory =
  | '定期报告'
  | '业绩预告'
  | '分红回购'
  | '股权变动'
  | '融资债务'
  | '并购投资'
  | '关联交易'
  | '经营事项'
  | '治理人事'
  | '风险事项'
  | '例行披露'
  | '其他'
  | '年报'
  | '权益分派'
  | '董事会'
  | '风险提示';
export type AnnouncementImportance = 'high' | 'medium' | 'routine';

export interface CompanyAnnouncement {
  key: string;
  market: Market;
  symbol: string;
  displaySymbol: string;
  companyName: string;
  title: string;
  category: AnnouncementCategory;
  importance?: AnnouncementImportance;
  isRoutine?: boolean;
  impactHint?: string;
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

export type ReportPeriodType = 'annual' | 'half-year' | 'quarter' | 'other';

export interface ReportPeriod {
  key: string;
  label: string;
  fiscalYear: number;
  type: ReportPeriodType;
  annual: boolean;
  priorYearKey?: string | null;
}

export interface PeriodStatementTable {
  type: StatementTable['type'];
  title: string;
  periods: string[];
  rows: StatementRow[];
}

export interface PeriodMetricPoint {
  period: string;
  value: number | null;
}

export interface PeriodMetricSeries {
  key: string;
  label: string;
  points: PeriodMetricPoint[];
}

export type StatementQualityStatus = 'pass' | 'warning' | 'fail' | 'unavailable';

export interface StatementQualityCheck {
  key: string;
  label: string;
  status: StatementQualityStatus;
  detail: string;
}

export interface StatementQualitySummary {
  score: number;
  tone: 'good' | 'attention' | 'risk';
  coveragePercent: number;
  checks: StatementQualityCheck[];
}

export interface StatementRevisionChange {
  scope: 'annual' | 'reporting-period';
  statementType: StatementTable['type'];
  item: string;
  sourceItem: string;
  period: string;
  previousValue: number;
  currentValue: number;
  changeAmount: number;
  changePercent: number | null;
  material: boolean;
}

export interface StatementRevisionSummary {
  detectedAt: string;
  previousFetchedAt: string;
  currentFetchedAt: string;
  changedCount: number;
  materialChangeCount: number;
  changes: StatementRevisionChange[];
}

export interface StatementVersionSummary {
  count: number;
  currentHash: string;
  firstSeenAt: string | null;
  lastChangedAt: string | null;
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
  schemaVersion?: number;
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
  reportPeriods?: ReportPeriod[];
  periodTables?: PeriodStatementTable[];
  periodHighlights?: PeriodMetricSeries[];
  ttmHighlights?: PeriodMetricSeries[];
  quality?: StatementQualitySummary;
  revision?: StatementRevisionSummary | null;
  version?: StatementVersionSummary;
  fetchedAt: string;
  source: string;
  listingYear?: number | null;
  partial?: boolean;
  fetchWarnings?: string[];
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
