export type EtfExchange = 'sh' | 'sz';
export type EtfSortKey = 'amount' | 'changePercent' | 'marketCap' | 'turnoverRate' | 'premiumRate' | 'symbol';

export interface EtfQuote {
  symbol: string;
  displaySymbol: string;
  name: string;
  exchange: EtfExchange;
  latestPrice: number | null;
  iopv: number | null;
  premiumRate: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  volume: number | null;
  amount: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  amplitude: number | null;
  turnoverRate: number | null;
  latestShares: number | null;
  marketCap: number | null;
  dataDate: string | null;
  quoteUpdatedAt: string | null;
  source: string;
}

export interface EtfHistoryPoint {
  date: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  amplitude: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  turnoverRate: number | null;
}

export interface EtfValuation {
  symbol: string;
  trackingIndexName: string | null;
  trackingIndexCode: string | null;
  peTotalShares: number | null;
  peCalculatedShares: number | null;
  valuationDate: string | null;
  available: boolean;
  unavailableReason: string | null;
  fetchedAt: string;
  source: string;
}

export interface EtfMarketResponse {
  items: EtfQuote[];
  total: number;
  refreshedAt: string | null;
  source: string;
  cache: {
    hit: boolean;
    stale: boolean;
  };
}

export interface EtfRiskMetrics {
  return20d: number | null;
  return60d: number | null;
  returnYtd: number | null;
  annualizedReturn: number | null;
  annualizedVolatility: number | null;
  maxDrawdown: number | null;
  currentDrawdown: number | null;
  sharpeRatio: number | null;
  periodHigh: number | null;
  periodLow: number | null;
  tradingDays: number;
}

export interface EtfDetailResponse {
  quote: EtfQuote;
  history: EtfHistoryPoint[];
  metrics: EtfRiskMetrics;
  fetchedAt: string;
  source: string;
  cache: {
    marketHit: boolean;
    marketStale: boolean;
    historyHit: boolean;
    historyStale: boolean;
    marketRefreshedAt: string | null;
    historyRefreshedAt: string | null;
  };
}

export interface FavoriteEtf extends EtfQuote {
  favoritedAt: string;
}
