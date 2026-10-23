import type {
  CacheEntry,
  AnnouncementFeed,
  CompanySearchResult,
  CompanyInsight,
  CompanyInsightDraft,
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
import { normalizeCompanyInsight } from './company-insight';
import type { CompanyValuation } from '../types/company-valuation';
import type { ValuationModel, ValuationSnapshot } from '../finance/scenario-valuation';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
const REQUEST_TIMEOUT_MS = 125_000;

export function getValuationModels(market: Market, symbol: string, signal?: AbortSignal) {
  return request<ValuationSnapshot[]>(`/finance/valuation-models/${market}/${encodeURIComponent(symbol)}`, { signal });
}
export function saveValuationModel(market: Market, symbol: string, model: ValuationModel) {
  return request<ValuationSnapshot>(`/finance/valuation-models/${market}/${encodeURIComponent(symbol)}`, { method: 'POST', body: JSON.stringify(model) });
}

export function getCompanyValuation(market: Market, symbol: string, refresh = false, signal?: AbortSignal) {
  const params = new URLSearchParams({ market, symbol, refresh: String(refresh) });
  return request<CompanyValuation>(`/finance/company-valuation?${params}`, { signal });
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const externalSignal = init?.signal;
  const relayAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    relayAbort();
  } else {
    externalSignal?.addEventListener('abort', relayAbort, { once: true });
  }
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal
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
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', relayAbort);
  }
}

export function isRequestAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function searchCompanies(
  q: string,
  market: MarketFilter,
  signal?: AbortSignal
): Promise<CompanySearchResult[]> {
  const params = new URLSearchParams({ q, market });
  return request<CompanySearchResult[]>(`/companies/search?${params.toString()}`, { signal });
}

export function getStatements(
  market: Market,
  symbol: string,
  years = 0,
  refresh = false,
  signal?: AbortSignal
): Promise<FinancialStatements> {
  const params = new URLSearchParams({ market, symbol, years: String(years) });
  if (refresh) {
    params.set('refresh', 'true');
  }
  return request<FinancialStatements>(`/finance/statements?${params.toString()}`, { signal });
}

export function getAnnouncements(market: Market, symbol: string, signal?: AbortSignal): Promise<AnnouncementFeed> {
  const params = new URLSearchParams({ market, symbol });
  return request<AnnouncementFeed>(`/finance/announcements?${params.toString()}`, { signal });
}

export function markAnnouncementsViewed(
  market: Market,
  symbol: string,
  signal?: AbortSignal
): Promise<FavoriteCompany[]> {
  return request<FavoriteCompany[]>(`/finance/announcements/${market}/${encodeURIComponent(symbol)}/viewed`, {
    method: 'POST',
    signal
  });
}

export function getPeerComparison(
  market: Market,
  symbol: string,
  limit = 20,
  signal?: AbortSignal
): Promise<PeerComparison> {
  const params = new URLSearchParams({ market, symbol, limit: String(limit) });
  return request<PeerComparison>(`/finance/peers?${params.toString()}`, { signal });
}

export function getPeerMetricComparison(
  market: Market,
  symbol: string,
  metricKey = 'revenue',
  limit = 12,
  signal?: AbortSignal
): Promise<PeerMetricComparison> {
  const params = new URLSearchParams({ market, symbol, metricKey, limit: String(limit) });
  return request<PeerMetricComparison>(`/finance/peer-metrics?${params.toString()}`, { signal });
}

export function getMetricComparison(
  metricKey: string,
  companies: Array<{ market: Market; symbol: string; name?: string | null }>,
  signal?: AbortSignal
): Promise<PeerMetricComparison> {
  const companyKeys = companies
    .map((company) => `${company.market}:${company.symbol}:${encodeURIComponent(company.name ?? '')}`)
    .join(',');
  const params = new URLSearchParams({ metricKey, companies: companyKeys });
  return request<PeerMetricComparison>(`/finance/metric-comparison?${params.toString()}`, { signal });
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

export function getCompanyInsight(
  market: Market,
  symbol: string,
  signal?: AbortSignal
): Promise<CompanyInsight> {
  return request<CompanyInsight>(`/finance/insights/${market}/${encodeURIComponent(symbol)}`, { signal })
    .then(normalizeCompanyInsight);
}

export function saveCompanyInsight(
  market: Market,
  symbol: string,
  insight: CompanyInsightDraft & Pick<CompanyInsight, 'buyPointRange'>
): Promise<CompanyInsight> {
  return request<CompanyInsight>(`/finance/insights/${market}/${encodeURIComponent(symbol)}`, {
    method: 'PUT',
    body: JSON.stringify(insight)
  }).then(normalizeCompanyInsight);
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
  signal?: AbortSignal;
} = {}): Promise<EtfMarketResponse> {
  const params = new URLSearchParams({
    q: options.q ?? '',
    limit: String(options.limit ?? 80),
    sort: options.sort ?? 'amount',
    order: options.order ?? 'desc',
    exchange: options.exchange ?? 'all'
  });
  if (options.refresh) params.set('refresh', 'true');
  return request<EtfMarketResponse>(`/etfs?${params.toString()}`, { signal: options.signal });
}

export function getEtfDetail(
  symbol: string,
  years = 10,
  refresh = false,
  signal?: AbortSignal
): Promise<EtfDetailResponse> {
  const params = new URLSearchParams({ years: String(years) });
  if (refresh) params.set('refresh', 'true');
  return request<EtfDetailResponse>(`/etfs/${encodeURIComponent(symbol)}?${params.toString()}`, { signal });
}

export function getEtfValuation(
  symbol: string,
  refresh = false,
  signal?: AbortSignal
): Promise<EtfValuation> {
  const suffix = refresh ? '?refresh=true' : '';
  return request<EtfValuation>(`/etfs/${encodeURIComponent(symbol)}/valuation${suffix}`, { signal });
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

export function getIndices(options:{
  q?:string;
  market?:'all'|IndexMarket;
  refresh?:boolean;
  signal?:AbortSignal;
}={}):Promise<IndexMarketResponse> {
  const params=new URLSearchParams({q:options.q??'',market:options.market??'all'}); if(options.refresh) params.set('refresh','true');
  return request<IndexMarketResponse>(`/indices?${params.toString()}`, { signal: options.signal });
}
export function getIndexDetail(market:IndexMarket,symbol:string,years=10,refresh=false,signal?:AbortSignal):Promise<IndexDetailResponse> {
  const params=new URLSearchParams({years:String(years)}); if(refresh) params.set('refresh','true');
  return request<IndexDetailResponse>(`/indices/${market}/${encodeURIComponent(symbol)}?${params.toString()}`, { signal });
}
export function getFavoriteIndices():Promise<FavoriteIndex[]> { return request<FavoriteIndex[]>('/indices/favorites'); }
export function saveFavoriteIndex(market:IndexMarket,symbol:string):Promise<FavoriteIndex[]> { return request<FavoriteIndex[]>(`/indices/favorites/${market}/${encodeURIComponent(symbol)}`,{method:'POST'}); }
export function removeFavoriteIndex(market:IndexMarket,symbol:string):Promise<FavoriteIndex[]> { return request<FavoriteIndex[]>(`/indices/favorites/${market}/${encodeURIComponent(symbol)}`,{method:'DELETE'}); }
export function getIndexValuation(market:IndexMarket,symbol:string,refresh=false,signal?:AbortSignal):Promise<IndexValuation> { const suffix=refresh?'?refresh=true':''; return request<IndexValuation>(`/indices/${market}/${encodeURIComponent(symbol)}/valuation${suffix}`, { signal }); }
