import { request } from './api';
import type { PerformanceInput, PerformanceState } from '../types/performance';

export const getPerformance = (signal?: AbortSignal) => request<PerformanceState>('/portfolio-performance', { signal });
export const savePerformance = (id: string | null, input: PerformanceInput, expectedVersion: number) => request<PerformanceState>(
  `/portfolio-performance${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ ...input, expectedVersion }) });
export const deletePerformance = (id: string, version: number) => request<PerformanceState>(`/portfolio-performance/${id}?version=${version}`, { method: 'DELETE' });
