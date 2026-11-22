export interface MacroPoint {
  period: string;
  periodLabel: string | null;
  value: number;
  releasedOn: string | null;
  releaseUrl: string | null;
  source: string;
  sourceUrl: string;
}

export interface MacroIndicator {
  id: string;
  name: string;
  shortName: string;
  frequency: 'daily' | 'monthly';
  unit: string;
  benchmark: number | null;
  latest: MacroPoint | null;
  syncedAt: string | null;
  failed: boolean;
}

export interface MacroOverview {
  syncing: boolean;
  indicators: MacroIndicator[];
  releasesSyncedAt: string | null;
  releasesFailed: boolean;
}

export interface MacroTrendSeries {
  indicator: MacroIndicator;
  points: MacroPoint[];
}
