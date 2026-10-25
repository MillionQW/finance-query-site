import type { Market } from './finance';

export interface Holding {
  id: number;
  market: Market;
  symbol: string;
  name: string;
  holdingValue: number | null;
  holdingCurrency: 'CNY' | 'HKD';
  valuation: string;
  buyPoint: string;
  sellPoint: string;
  note: string;
  version: number;
  valuationUpdatedAt: string | null;
  updatedAt: string;
}
export type HoldingInput = Omit<Holding, 'id' | 'version' | 'valuationUpdatedAt' | 'updatedAt'> & {
  expectedVersion: number;
  confirmValuation: boolean;
};
export interface PortfolioQuote {
  price: number | null;
  marketCap: number | null;
  currency: string;
  quoteAt: string;
  year: number;
  ytd: number | null;
  baseDate: string | null;
  source: string;
  fetchedAt: string;
  warning: string | null;
}
export interface QuoteResult { quote: PortfolioQuote | null; stale: boolean; error: string | null }
