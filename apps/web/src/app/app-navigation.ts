import type { CompanySearchResult, Market } from '../types/finance';

export type UrlMode = 'push' | 'replace' | 'none';
export type AppView = 'company' | 'settings' | 'etf' | 'index' | 'screener';

export const seedCompanies: CompanySearchResult[] = [
  { market: 'hk', symbol: '00700', displaySymbol: '00700.HK', name: '腾讯控股', source: 'seed' },
  { market: 'a', symbol: '600519', displaySymbol: '600519.SH', name: '贵州茅台', source: 'seed' },
  { market: 'hk', symbol: '09988', displaySymbol: '09988.HK', name: '阿里巴巴-W', source: 'seed' },
  { market: 'a', symbol: '601398', displaySymbol: '601398.SH', name: '工商银行', source: 'seed' },
  { market: 'hk', symbol: '03690', displaySymbol: '03690.HK', name: '美团-W', source: 'seed' }
];

export function companyKey(company: Pick<CompanySearchResult, 'market' | 'symbol'>): string {
  return `${company.market}:${company.symbol}`;
}

export function sameCompany(
  left: Pick<CompanySearchResult, 'market' | 'symbol'> | null,
  right: Pick<CompanySearchResult, 'market' | 'symbol'> | null
): boolean {
  return Boolean(left && right && left.market === right.market && left.symbol === right.symbol);
}

export function normalizeUrlSymbol(value: string, selectedMarket: Market): string {
  const digits = value.replace(/\D/g, '');
  return selectedMarket === 'hk' ? digits.padStart(5, '0') : digits;
}

export function displaySymbolFor(selectedMarket: Market, symbol: string): string {
  if (selectedMarket === 'hk') return `${symbol}.HK`;
  if (symbol.startsWith('6')) return `${symbol}.SH`;
  if (symbol.startsWith('4') || symbol.startsWith('8') || symbol.startsWith('9')) {
    return `${symbol}.BJ`;
  }
  return `${symbol}.SZ`;
}

export function companyFromUrl(search = window.location.search): CompanySearchResult | null {
  const params = new URLSearchParams(search);
  const urlMarket = params.get('market');
  const rawSymbol = params.get('symbol') ?? params.get('code') ?? '';
  if (urlMarket !== 'a' && urlMarket !== 'hk') return null;

  const symbol = normalizeUrlSymbol(rawSymbol, urlMarket);
  if (!symbol) return null;

  return seedCompanies.find(
    (company) => company.market === urlMarket && company.symbol === symbol
  ) ?? {
    market: urlMarket,
    symbol,
    displaySymbol: displaySymbolFor(urlMarket, symbol),
    name: displaySymbolFor(urlMarket, symbol),
    source: 'url'
  };
}

export function viewFromUrl(search = window.location.search): AppView {
  const view = new URLSearchParams(search).get('view');
  return view === 'settings' || view === 'etf' || view === 'index' || view === 'screener'
    ? view
    : 'company';
}

export function mergeCompanyList(
  additions: CompanySearchResult[],
  base: CompanySearchResult[]
): CompanySearchResult[] {
  const seen = new Set<string>();
  return [...additions, ...base].filter((company) => {
    const key = companyKey(company);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function syncCompanyUrl(
  company: CompanySearchResult,
  mode: Exclude<UrlMode, 'none'>
): void {
  const params = new URLSearchParams(window.location.search);
  const alreadySynced =
    params.get('market') === company.market &&
    normalizeUrlSymbol(params.get('symbol') ?? '', company.market) === company.symbol;
  if (alreadySynced && mode === 'push') return;

  params.set('market', company.market);
  params.set('symbol', company.symbol);
  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history[mode === 'replace' ? 'replaceState' : 'pushState'](
    { market: company.market, symbol: company.symbol },
    '',
    nextUrl
  );
}

export function writeViewUrl(view: AppView, mode: 'push' | 'replace' = 'push'): void {
  const params = new URLSearchParams(window.location.search);
  if (view === 'settings') {
    params.set('view', 'settings');
  } else if (view === 'etf') {
    params.set('view', 'etf');
    if (!params.get('etf')) params.set('etf', '510300');
  } else if (view === 'index') {
    params.set('view', 'index');
    params.delete('etf');
    if (!params.get('index')) params.set('index', 'cn:000300');
  } else if (view === 'screener') {
    params.set('view', 'screener');
    params.delete('etf');
    params.delete('index');
  } else {
    params.delete('view');
    params.delete('etf');
    params.delete('index');
  }

  const queryString = params.toString();
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({ view }, '', nextUrl);
}

export function searchOptionId(company: CompanySearchResult): string {
  return `company-search-option-${company.market}-${company.symbol.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
