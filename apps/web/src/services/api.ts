import type {
  CacheEntry,
  AnnouncementFeed,
  CompanySearchResult,
  CompanyInsight,
  FavoriteCompany,
  FinancialStatements,
  Market,
  MarketFilter,
  PeerComparison,
  PeerMetricComparison,
  ScreenerResult,
  StatementRefreshRun,
  StatementRefreshRuntimeStatus
} from '../types/finance';
import type { EtfDetailResponse, EtfMarketResponse, EtfSortKey, EtfValuation, FavoriteEtf } from '../types/etf';
import type { FavoriteIndex, IndexDetailResponse, IndexMarket, IndexMarketResponse, IndexValuation } from '../types/index';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });
  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const body = await response.json();
      message = body.message ?? body.error?.message ?? message;
    } catch {
      // Ignore non-JSON errors.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function searchCompanies(q: string, market: MarketFilter): Promise<CompanySearchResult[]> {
  const params = new URLSearchParams({ q, market });
  return request<CompanySearchResult[]>(`/companies/search?${params.toString()}`);
}

export function getStatements(
  market: Market,
  symbol: string,
  years = 0,
  refresh = false
): Promise<FinancialStatements> {
  const params = new URLSearchParams({ market, symbol, years: String(years) });
  if (refresh) {
    params.set('refresh', 'true');
  }
  return request<FinancialStatements>(`/finance/statements?${params.toString()}`);
}

export function getAnnouncements(market: Market, symbol: string): Promise<AnnouncementFeed> {
  const params = new URLSearchParams({ market, symbol });
  return request<AnnouncementFeed>(`/finance/announcements?${params.toString()}`);
}

export function markAnnouncementsViewed(market: Market, symbol: string): Promise<FavoriteCompany[]> {
  return request<FavoriteCompany[]>(`/finance/announcements/${market}/${encodeURIComponent(symbol)}/viewed`, {
    method: 'POST'
  });
}

export function getPeerComparison(
  market: Market,
  symbol: string,
  limit = 20
): Promise<PeerComparison> {
  const params = new URLSearchParams({ market, symbol, limit: String(limit) });
  return request<PeerComparison>(`/finance/peers?${params.toString()}`);
}

export function getPeerMetricComparison(
  market: Market,
  symbol: string,
  metricKey = 'revenue',
  limit = 12
): Promise<PeerMetricComparison> {
  const params = new URLSearchParams({ market, symbol, metricKey, limit: String(limit) });
  return request<PeerMetricComparison>(`/finance/peer-metrics?${params.toString()}`);
}

export function getMetricComparison(
  metricKey: string,
  companies: Array<{ market: Market; symbol: string; name?: string | null }>
): Promise<PeerMetricComparison> {
  const companyKeys = companies
    .map((company) => `${company.market}:${company.symbol}:${encodeURIComponent(company.name ?? '')}`)
    .join(',');
  const params = new URLSearchParams({ metricKey, companies: companyKeys });
  return request<PeerMetricComparison>(`/finance/metric-comparison?${params.toString()}`);
}

export function getScreenerResults(options: {
  markets?: string;
  scope?: string;
  minRoa?: number;
  maxPe?: number;
  minMarketCapBillion?: number;
  limit?: number;
  maxCandidates?: number;
  requestGapMs?: number;
  latestPeriod?: boolean;
  peOnly?: boolean;
  excludeBanks?: boolean;
  refresh?: boolean;
} = {}): Promise<ScreenerResult> {
  const params = new URLSearchParams({
    markets: options.markets ?? 'all',
    scope: options.scope ?? 'all',
    minRoa: String(options.minRoa ?? 25),
    maxPe: String(options.maxPe ?? 16),
    minMarketCapBillion: String(options.minMarketCapBillion ?? 0),
    limit: String(options.limit ?? 80),
    maxCandidates: String(options.maxCandidates ?? 30),
    requestGapMs: String(options.requestGapMs ?? 1000),
    peOnly: String(options.peOnly ?? true),
    excludeBanks: String(options.excludeBanks ?? true)
  });
  if (options.latestPeriod) {
    params.set('latestPeriod', 'true');
  }
  if (options.refresh) {
    params.set('refresh', 'true');
  }
  return request<ScreenerResult>(`/finance/screener?${params.toString()}`);
}

export function getFavorites(): Promise<FavoriteCompany[]> {
  return request<FavoriteCompany[]>('/favorites');
}

export function saveFavorite(company: CompanySearchResult): Promise<FavoriteCompany[]> {
  return request<FavoriteCompany[]>('/favorites', {
    method: 'POST',
    body: JSON.stringify(company)
  });
}

export function removeFavorite(market: Market, symbol: string): Promise<FavoriteCompany[]> {
  return request<FavoriteCompany[]>(`/favorites/${market}/${encodeURIComponent(symbol)}`, {
    method: 'DELETE'
  });
}

export function getCompanyInsight(market: Market, symbol: string): Promise<CompanyInsight> {
  return request<CompanyInsight>(`/finance/insights/${market}/${encodeURIComponent(symbol)}`);
}

export function saveCompanyInsight(
  market: Market,
  symbol: string,
  insight: Pick<CompanyInsight, 'note' | 'buyPointRange'>
): Promise<CompanyInsight> {
  return request<CompanyInsight>(`/finance/insights/${market}/${encodeURIComponent(symbol)}`, {
    method: 'PUT',
    body: JSON.stringify(insight)
  });
}

export function getRefreshStatus(): Promise<StatementRefreshRuntimeStatus> {
  return request<StatementRefreshRuntimeStatus>('/cache/refresh-status');
}

export function getCacheEntries(): Promise<CacheEntry[]> {
  return request<CacheEntry[]>('/cache/entries');
}

export function triggerRefresh(): Promise<StatementRefreshRun> {
  return request<StatementRefreshRun>('/cache/refresh', {
    method: 'POST'
  });
}

export function getEtfs(options: {
  q?: string;
  limit?: number;
  sort?: EtfSortKey;
  order?: 'asc' | 'desc';
  exchange?: 'all' | 'sh' | 'sz';
  refresh?: boolean;
} = {}): Promise<EtfMarketResponse> {
  const params = new URLSearchParams({
    q: options.q ?? '',
    limit: String(options.limit ?? 80),
    sort: options.sort ?? 'amount',
    order: options.order ?? 'desc',
    exchange: options.exchange ?? 'all'
  });
  if (options.refresh) params.set('refresh', 'true');
  return request<EtfMarketResponse>(`/etfs?${params.toString()}`);
}

export function getEtfDetail(symbol: string, years = 10, refresh = false): Promise<EtfDetailResponse> {
  const params = new URLSearchParams({ years: String(years) });
  if (refresh) params.set('refresh', 'true');
  return request<EtfDetailResponse>(`/etfs/${encodeURIComponent(symbol)}?${params.toString()}`);
}

export function getEtfValuation(symbol: string, refresh = false): Promise<EtfValuation> {
  const suffix = refresh ? '?refresh=true' : '';
  return request<EtfValuation>(`/etfs/${encodeURIComponent(symbol)}/valuation${suffix}`);
}

export function getFavoriteEtfs(): Promise<FavoriteEtf[]> {
  return request<FavoriteEtf[]>('/etfs/favorites');
}

export function saveFavoriteEtf(symbol: string): Promise<FavoriteEtf[]> {
  return request<FavoriteEtf[]>(`/etfs/favorites/${encodeURIComponent(symbol)}`, { method: 'POST' });
}

export function removeFavoriteEtf(symbol: string): Promise<FavoriteEtf[]> {
  return request<FavoriteEtf[]>(`/etfs/favorites/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
}

export function getIndices(options:{q?:string;market?:'all'|IndexMarket;refresh?:boolean}={}):Promise<IndexMarketResponse> {
  const params=new URLSearchParams({q:options.q??'',market:options.market??'all'}); if(options.refresh) params.set('refresh','true');
  return request<IndexMarketResponse>(`/indices?${params.toString()}`);
}
export function getIndexDetail(market:IndexMarket,symbol:string,years=10,refresh=false):Promise<IndexDetailResponse> {
  const params=new URLSearchParams({years:String(years)}); if(refresh) params.set('refresh','true');
  return request<IndexDetailResponse>(`/indices/${market}/${encodeURIComponent(symbol)}?${params.toString()}`);
}
export function getFavoriteIndices():Promise<FavoriteIndex[]> { return request<FavoriteIndex[]>('/indices/favorites'); }
export function saveFavoriteIndex(market:IndexMarket,symbol:string):Promise<FavoriteIndex[]> { return request<FavoriteIndex[]>(`/indices/favorites/${market}/${encodeURIComponent(symbol)}`,{method:'POST'}); }
export function removeFavoriteIndex(market:IndexMarket,symbol:string):Promise<FavoriteIndex[]> { return request<FavoriteIndex[]>(`/indices/favorites/${market}/${encodeURIComponent(symbol)}`,{method:'DELETE'}); }
export function getIndexValuation(market:IndexMarket,symbol:string,refresh=false):Promise<IndexValuation> { const suffix=refresh?'?refresh=true':''; return request<IndexValuation>(`/indices/${market}/${encodeURIComponent(symbol)}/valuation${suffix}`); }
