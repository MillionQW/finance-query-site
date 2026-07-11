export type IndexMarket = 'cn' | 'bj' | 'hk';

export interface IndexQuote {
  market: IndexMarket;
  symbol: string;
  key: string;
  displaySymbol: string;
  name: string;
  category: string;
  latestPrice: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  volume: number | null;
  amount: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  quoteUpdatedAt: string | null;
  source: string;
}

export interface IndexHistoryPoint {
  date: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  changePercent: number | null;
  changeAmount: number | null;
}

export interface IndexHistoryPayload {
  market: IndexMarket;
  symbol: string;
  points: IndexHistoryPoint[];
  fetchedAt: string;
  source: string;
}

export interface IndexMetrics {
  return20d: number | null;
  return60d: number | null;
  returnYtd: number | null;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  currentDrawdown: number | null;
  periodHigh: number | null;
  periodLow: number | null;
  tradingDays: number;
}

export interface IndexMarketResponse {
  items: IndexQuote[];
  refreshedAt: string | null;
  source: string;
  cache: { hit: boolean; stale: boolean };
}

export interface IndexDetailResponse {
  quote: IndexQuote;
  history: IndexHistoryPoint[];
  metrics: IndexMetrics;
  cache: {
    marketHit: boolean;
    marketStale: boolean;
    marketRefreshedAt: string | null;
    historyHit: boolean;
    historyStale: boolean;
    historyRefreshedAt: string | null;
  };
}

export interface FavoriteIndex extends IndexQuote { favoritedAt: string; }

export interface IndexValuation {
  market: IndexMarket;
  symbol: string;
  name: string;
  peTotalShares: number | null;
  peCalculatedShares: number | null;
  valuationDate: string | null;
  available: boolean;
  unavailableReason: string | null;
  fetchedAt: string;
  source: string;
}
