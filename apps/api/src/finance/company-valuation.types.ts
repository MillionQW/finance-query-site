import type { Market } from './types';

export interface CompanyPeHistory {
  market: Market;
  symbol: string;
  points: Array<{ date: string; pe: number | null }>;
  fetchedAt: string;
  source: string;
}

export interface CompanyPeWindow {
  years: number;
  percentile: number | null;
  referenceLevels: Array<{ percentile: 20 | 50 | 80; pe: number | null }>;
  sampleCount: number;
  startDate: string;
  firstSampleDate: string | null;
  lastSampleDate: string | null;
  historyComplete: boolean;
}

export interface CompanyValuation {
  market: Market;
  symbol: string;
  currentPe: number | null;
  dataDate: string | null;
  history: Array<{ date: string; pe: number | null }>;
  windows: CompanyPeWindow[];
  unavailableReason: string | null;
  fetchedAt: string;
  source: string;
  cache: { hit: boolean; stale: boolean };
}
