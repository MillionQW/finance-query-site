export interface PerformanceEntryInput {
  kind: 'initial' | 'snapshot' | 'deposit' | 'withdrawal';
  at: string;
  amount: number;
  currency: 'CNY' | 'HKD';
  fx: number;
  beforeValue: number | null;
  note: string;
}
export interface PerformanceEntry extends PerformanceEntryInput { id: string; updatedAt: string }
export interface PerformanceState { startDate: string; version: number; entries: PerformanceEntry[] }
export interface PerformanceResult {
  asOf: string | null;
  initialValue: number | null;
  endingValue: number | null;
  netContributions: number;
  profit: number | null;
  nav: number | null;
  twr: number | null;
  twrReason: string | null;
  xirr: number | null;
  xirrReason: string | null;
  days: number;
}
