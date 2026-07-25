import type { PeerComparison, PeerRanking } from '../types/finance';

export interface IndustryPosition {
  key: string;
  label: string;
  rankLabel: string;
  percentileLabel: string;
  band: 'leading' | 'upper' | 'middle' | 'lower';
  value: number | null;
  unit?: string;
  context: string;
}

function positionBand(rank: number, total: number): IndustryPosition['band'] {
  const share = rank / total;
  if (share <= 0.2) return 'leading';
  if (share <= 0.5) return 'upper';
  if (share <= 0.8) return 'middle';
  return 'lower';
}

function metricContext(ranking: PeerRanking): string {
  if (ranking.key === 'pe' || ranking.key === 'pb') {
    return ranking.direction === 'asc'
      ? '按较低估值排序，仅代表估值位置，不等同于投资吸引力。'
      : '按较高估值排序，仅代表估值位置，不等同于投资吸引力。';
  }
  if (ranking.key === 'turnoverRate') {
    return '按换手率由高到低排序，反映交易活跃度。';
  }
  return '按当前横截面数据排序，短期涨跌不代表基本面质量。';
}

export function buildIndustryPositions(comparison: PeerComparison | null): IndustryPosition[] {
  if (!comparison) return [];
  return comparison.rankings
    .filter((ranking) => (
      ranking.rank !== null &&
      ranking.rank > 0 &&
      ranking.total > 0 &&
      ranking.rank <= ranking.total
    ))
    .map((ranking) => {
      const rank = ranking.rank as number;
      const topPercent = Math.max(1, Math.ceil((rank / ranking.total) * 100));
      return {
        key: ranking.key,
        label: ranking.label,
        rankLabel: `${rank} / ${ranking.total}`,
        percentileLabel: `前 ${topPercent}%`,
        band: positionBand(rank, ranking.total),
        value: ranking.value,
        unit: ranking.unit,
        context: metricContext(ranking)
      };
    });
}
