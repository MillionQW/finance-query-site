import type {
  CompanySearchResult,
  FavoriteCompany,
  FinancialStatements,
  Market,
  MarketFilter,
  PeerComparison,
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

export function getPeerComparison(
  market: Market,
  symbol: string,
  limit = 20
): Promise<PeerComparison> {
  const params = new URLSearchParams({ market, symbol, limit: String(limit) });
  return request<PeerComparison>(`/finance/peers?${params.toString()}`);
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

export function triggerRefresh(): Promise<StatementRefreshRun> {
  return request<StatementRefreshRun>('/cache/refresh', {
    method: 'POST'
  });
}
