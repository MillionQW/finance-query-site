export type ResearchKind = 'business' | 'hypotheses';
export interface MetricIdentity {
  dimension: string; segment: string; metric: string; unit: string; currency: string; basis: string;
  periodStart: string; periodEnd: string;
}
export interface BusinessData extends MetricIdentity {
  value: number; sourceText: string; sourceUrl: string; page: string; note: string; archived: boolean;
  origin?: BusinessOrigin;
}
export interface BusinessOrigin {
  provider: string; key: string; fetchedAt: string; rawField: string; rawValue: unknown;
  rawUnit: string; rawRecord: Record<string, unknown>; managed: boolean; missing: boolean;
}
export interface BusinessSyncStatus {
  status: 'ready' | 'empty' | 'unsupported' | 'error'; attemptedAt: string; lastSuccessAt: string | null;
  message: string; added: number; updated: number; protected: number; missing: number; sourceRows: number; skipped: number;
}
export interface HypothesisReview {
  businessId: string; businessVersion: number; actual: number; outcome: 'met' | 'missed';
  reviewedAt: string; note: string; valuationImpact: string;
}
export interface HypothesisData extends MetricIdentity {
  thesis: string; rationale: string; expectedMin: number | null; expectedMax: number | null;
  dueDate: string; valuationSnapshotId: number | null; archived: boolean; review?: HypothesisReview;
}
export interface ResearchEntry<T> { id: string; version: number; updatedAt: string; data: T }
export interface TrackingState { business: ResearchEntry<BusinessData>[]; hypotheses: ResearchEntry<HypothesisData>[] }
export const metricKeys = ['dimension','segment','metric','unit','currency','basis','periodStart','periodEnd'] as const;
export function sameObservation(a: MetricIdentity, b: MetricIdentity): boolean {
  return metricKeys.every(key => a[key] === b[key]);
}
