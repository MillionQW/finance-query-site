import type { CompanySearchResult } from '../types/finance';
import { mergeCompanyList } from './app-navigation';

const STORAGE_KEY = 'finance-query:recent-companies';

function storageSafeCompany(company: CompanySearchResult): CompanySearchResult {
  return {
    market: company.market,
    symbol: company.symbol,
    displaySymbol: company.displaySymbol,
    name: company.name,
    source: company.source || 'recent',
    latestPrice: company.latestPrice ?? null,
    changePercent: company.changePercent ?? null
  };
}

export function loadRecentCompanies(): CompanySearchResult[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CompanySearchResult[]) : [];
    return mergeCompanyList(parsed.filter(Boolean), []).slice(0, 8);
  } catch {
    return [];
  }
}

export function rememberRecentCompany(
  company: CompanySearchResult,
  current: CompanySearchResult[]
): CompanySearchResult[] {
  const next = mergeCompanyList([storageSafeCompany(company)], current).slice(0, 8);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
