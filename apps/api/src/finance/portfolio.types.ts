export interface HoldingInput {
  market: 'a' | 'hk';
  symbol: string;
  name: string;
  holdingValue: number | null;
  holdingCurrency: 'CNY' | 'HKD';
  valuation: string;
  buyPoint: string;
  buyPointUpper?: string;
  sellPoint: string;
  note: string;
  confirmValuation: boolean;
  expectedVersion: number;
}

export interface Holding extends Omit<HoldingInput, 'confirmValuation' | 'expectedVersion'> {
  id: number;
  version: number;
  valuationUpdatedAt: string | null;
  updatedAt: string;
}

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

export interface QuoteResult {
  quote: PortfolioQuote | null;
  stale: boolean;
  error: string | null;
}
