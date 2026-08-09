import type { PeerMetricComparison } from '../types/finance';

export type PeerMetricKind = 'amount' | 'percent';
export type PeerMetricGroupKey = 'profitability' | 'growth' | 'quality' | 'scale';

export interface PeerMetricOption {
  key: string;
  label: string;
  shortLabel: string;
  group: PeerMetricGroupKey;
  kind: PeerMetricKind;
  description: string;
}

export const peerMetricGroups: Array<{ key: PeerMetricGroupKey; label: string }> = [
  { key: 'profitability', label: '盈利' },
  { key: 'growth', label: '成长' },
  { key: 'quality', label: '质量' },
  { key: 'scale', label: '规模' }
];

export const peerMetricOptions: PeerMetricOption[] = [
  {
    key: 'netMargin', label: '净利率', shortLabel: '净利率', group: 'profitability', kind: 'percent',
    description: '净利润 / 营业收入，观察同业盈利转化水平。'
  },
  {
    key: 'revenueGrowth', label: '营业收入同比增长', shortLabel: '营收增长', group: 'growth', kind: 'percent',
    description: '与上一可比年度相比的营业收入增长率。'
  },
  {
    key: 'netProfitGrowth', label: '净利润同比增长', shortLabel: '利润增长', group: 'growth', kind: 'percent',
    description: '与上一可比年度相比的净利润增长率。'
  },
  {
    key: 'operatingCashConversion', label: '经营现金含金量', shortLabel: '现金含金量', group: 'quality', kind: 'percent',
    description: '经营现金流 / 净利润，观察利润兑现为现金的程度。'
  },
  {
    key: 'assetLiabilityRatio', label: '资产负债率', shortLabel: '资产负债率', group: 'quality', kind: 'percent',
    description: '总负债 / 总资产，合理区间随行业而异。'
  },
  {
    key: 'revenue', label: '营业收入', shortLabel: '营业收入', group: 'scale', kind: 'amount',
    description: '比较本地缓存财报中的营业收入规模。'
  },
  {
    key: 'netProfit', label: '净利润', shortLabel: '净利润', group: 'scale', kind: 'amount',
    description: '比较本地缓存财报中的净利润规模。'
  },
  {
    key: 'operatingCashflow', label: '经营现金流', shortLabel: '经营现金流', group: 'scale', kind: 'amount',
    description: '比较经营活动产生现金的绝对规模。'
  },
  {
    key: 'assets', label: '总资产', shortLabel: '总资产', group: 'scale', kind: 'amount',
    description: '比较资产规模，不直接代表经营质量。'
  },
  {
    key: 'liabilities', label: '总负债', shortLabel: '总负债', group: 'scale', kind: 'amount',
    description: '比较负债绝对规模，应结合资产负债率判断。'
  }
];

export function peerMetricOption(metricKey: string): PeerMetricOption {
  return peerMetricOptions.find((option) => option.key === metricKey) ?? peerMetricOptions[0];
}

export function formatPeerMetricValue(value: number | null | undefined, kind: PeerMetricKind): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (kind === 'percent') return `${(value * 100).toFixed(1)}%`;
  const absolute = Math.abs(value);
  if (absolute >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (absolute >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function latestPeerMetricSnapshot(
  comparison: PeerMetricComparison | null,
  selectedMarket?: string,
  selectedSymbol?: string,
  year?: string
) {
  const activeYear = year ?? comparison?.years.at(-1) ?? '';
  const values = (comparison?.companies ?? [])
    .map((company) => ({
      company,
      value: company.points.find((point) => point.year === activeYear)?.value ?? null
    }))
    .filter((item): item is typeof item & { value: number } => item.value !== null && Number.isFinite(item.value));
  const selected = values.find((item) => (
    item.company.market === selectedMarket && item.company.symbol === selectedSymbol
  )) ?? values.find((item) => item.company.isSelected);
  const sorted = [...values].sort((left, right) => right.value - left.value);
  return {
    year: activeYear,
    sampleCount: values.length,
    median: median(values.map((item) => item.value)),
    selectedValue: selected?.value ?? null,
    selectedRank: selected ? sorted.findIndex((item) => item.company === selected.company) + 1 : null,
    values
  };
}
