import type {
  CacheEntry,
  AnnouncementFeed,
  CompanySearchResult,
  FavoriteCompany,
  FinancialStatements,
  Market,
  MarketFilter,
  PeerComparison,
  PeerMetricComparison,
  StatementRefreshRun,
  StatementRefreshRuntimeStatus
} from '../types/finance';

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
  years = 10,
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
