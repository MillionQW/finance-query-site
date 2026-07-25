import type { MarketFilter } from '../types/finance';

export function marketLabel(value?: MarketFilter): string {
  if (value === 'hk') return '港股';
  if (value === 'a') return 'A股';
  return '全部市场';
}

export function formatNumber(value: number | null): string {
  if (value === null) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function refreshRunLabel(status?: string): string {
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  if (status === 'skipped') return '已跳过';
  if (status === 'running') return '运行中';
  return '-';
}
