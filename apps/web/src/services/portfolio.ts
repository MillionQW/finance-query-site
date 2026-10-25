import { request } from './api';
import type { Holding, HoldingInput, QuoteResult } from '../types/portfolio';

export const getHoldings = (signal?: AbortSignal) => request<Holding[]>('/portfolio', { signal });
export const saveHolding = (id: number | null, body: HoldingInput) => request<Holding>(`/portfolio${id === null ? '' : `/${id}`}`,
  { method: id === null ? 'POST' : 'PUT', body: JSON.stringify(body) });
export const removeHolding = (holding: Holding) => request<{ removed: boolean }>(`/portfolio/${holding.id}?version=${holding.version}`, { method: 'DELETE' });
export const getPortfolioQuote = (market: string, symbol: string, refresh = false, signal?: AbortSignal) =>
  request<QuoteResult>(`/portfolio/quote/${market}/${symbol}?refresh=${refresh}`, { signal });
