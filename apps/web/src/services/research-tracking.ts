import { request } from './api';
import type { CompanySearchResult } from '../types/finance';
import type { BusinessData, BusinessSyncStatus, HypothesisData, ResearchEntry, ResearchKind, TrackingState } from '../types/research-tracking';
const path = (c: CompanySearchResult) => `/finance/research/${c.market}/${encodeURIComponent(c.symbol)}`;
export function getResearchTracking(c: CompanySearchResult, signal?: AbortSignal) { return request<TrackingState>(path(c), { signal }); }
export function saveResearchEntry(c: CompanySearchResult, kind: ResearchKind, data: BusinessData | HypothesisData, id: string | null, expectedVersion: number) {
  const { origin: ignored, ...editable } = data as BusinessData;
  return request<ResearchEntry<any>>(`${path(c)}/${kind}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ ...editable, expectedVersion }) });
}
export function syncBusinessData(c: CompanySearchResult, refresh = false, signal?: AbortSignal) {
  return request<{ state: TrackingState; sync: BusinessSyncStatus }>(`${path(c)}/business-sync?refresh=${refresh}`, { method: 'POST', signal });
}
export function getResearchHistory(c: CompanySearchResult, kind: ResearchKind, id: string, signal?: AbortSignal) {
  return request<ResearchEntry<BusinessData | HypothesisData>[]>(`${path(c)}/${kind}/${id}/history`, { signal });
}
export function reviewHypothesis(c: CompanySearchResult, id: string, input: { expectedVersion: number; businessId: string; businessVersion: number; note: string; valuationImpact: string }) {
  return request<ResearchEntry<HypothesisData>>(`${path(c)}/hypotheses/${id}/review`, { method:'POST', body:JSON.stringify(input) });
}
