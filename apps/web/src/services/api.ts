import type { CompanySearchResult, FinancialStatements, Market, MarketFilter } from '../types/finance';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
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
