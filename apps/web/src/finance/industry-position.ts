import type { PeerBenchmark, PeerComparison, PeerRanking } from '../types/finance';

export interface IndustryPosition {
  key: string;
  label: string;
  rankLabel: string;
  percentileLabel: string;
  band: 'leading' | 'upper' | 'middle' | 'lower';
  value: number | null;
  unit?: string;
  context: string;
  benchmark: PeerBenchmark | null;
  sampleLabel: string;
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

function relativePosition(ranking: PeerRanking, rank: number): string {
  const otherCompanies = Math.max(0, ranking.total - 1);
  const companiesBehind = Math.max(0, ranking.total - rank);
  const share = otherCompanies > 0 ? Math.round((companiesBehind / otherCompanies) * 100) : 0;

  if (ranking.key === 'pe' || ranking.key === 'pb') {
    if (rank / ranking.total <= 0.25) return `估值低于约 ${share}% 同行`;
    if (rank / ranking.total >= 0.75) return `估值高于约 ${100 - share}% 同行`;
    return '估值处于行业中段';
  }
  return `高于约 ${share}% 同行`;
}

export function buildIndustryPositions(comparison: PeerComparison | null): IndustryPosition[] {
  if (!comparison) return [];
  const benchmarks = new Map((comparison.benchmarks ?? []).map((item) => [item.key, item]));
  return comparison.rankings
    .filter((ranking) => (
      ranking.rank !== null &&
      ranking.rank > 0 &&
      ranking.total > 0 &&
      ranking.rank <= ranking.total
    ))
    .map((ranking) => {
      const rank = ranking.rank as number;
      return {
        key: ranking.key,
        label: ranking.label,
        rankLabel: `${rank} / ${ranking.total}`,
        percentileLabel: relativePosition(ranking, rank),
        band: positionBand(rank, ranking.total),
        value: ranking.value,
        unit: ranking.unit,
        context: metricContext(ranking),
        benchmark: benchmarks.get(ranking.key) ?? null,
        sampleLabel: `${benchmarks.get(ranking.key)?.count ?? ranking.total} 家有效样本`
      };
    });
}
