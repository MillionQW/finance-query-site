import type { Market } from './finance';

export interface CompanyValuation {
  market: Market;
  symbol: string;
  currentPe: number | null;
  dataDate: string | null;
  history: Array<{ date: string; pe: number | null }>;
  windows: Array<{
    years: number;
    percentile: number | null;
    referenceLevels: Array<{ percentile: 20 | 50 | 80; pe: number | null }>;
    sampleCount: number;
    startDate: string;
    firstSampleDate: string | null;
    lastSampleDate: string | null;
    historyComplete: boolean;
  }>;
  unavailableReason: string | null;
  fetchedAt: string;
  source: string;
  cache: { hit: boolean; stale: boolean };
}
