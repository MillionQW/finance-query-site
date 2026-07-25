import {
  isCriticalMetric,
  isGrowthGapMetric,
  isPositiveMetric,
  isWarningMetric
} from './financial-metric-alerts';
import type { MetricResult } from './financial-metric-types';

export type ThresholdTone = 'danger' | 'warning' | 'positive';

export interface MetricThresholdBand {
  tone: ThresholdTone;
  label: '风险' | '关注' | '较强';
  condition: string;
}

export interface MetricThresholdGuide {
  bands: MetricThresholdBand[];
  activeTone: ThresholdTone | 'neutral';
}

const DANGER = (condition: string): MetricThresholdBand => ({
  tone: 'danger',
  label: '风险',
  condition
});

const WARNING = (condition: string): MetricThresholdBand => ({
  tone: 'warning',
  label: '关注',
  condition
});

const POSITIVE = (condition: string): MetricThresholdBand => ({
  tone: 'positive',
  label: '较强',
  condition
});

const THRESHOLDS: Record<string, MetricThresholdBand[]> = {
  roic: [DANGER('< 0%'), WARNING('0%–5%'), POSITIVE('≥ 12%')],
  netMargin: [DANGER('< 0%'), WARNING('0%–3%'), POSITIVE('≥ 10%')],
  revenueGrowth: [DANGER('< -20%'), WARNING('-20%至0%'), POSITIVE('≥ 10%')],
  operatingProfitGrowth: [DANGER('< -30%'), WARNING('-30%至0%'), POSITIVE('≥ 10%')],
  cashDebtRatio: [DANGER('< 1.00倍')],
  currentRatio: [DANGER('< 1.50倍'), WARNING('> 2.50倍，需检查资金效率')],
  quickRatio: [DANGER('< 0.80倍'), WARNING('> 1.20倍，需检查资金效率')],
  receivablesToAssets: [DANGER('> 30%')],
  debtRatio: [DANGER('> 50%')],
  assetLiabilityRatio: [DANGER('> 80%'), WARNING('> 70%且≤ 80%')],
  operatingCashConversion: [DANGER('< 0.70倍'), WARNING('0.70–1.00倍'), POSITIVE('≥ 1.00倍')],
  cumulativeCashConversion3y: [DANGER('< 0.80倍'), WARNING('0.80–1.00倍'), POSITIVE('≥ 1.00倍')],
  cashCollectionRatio: [DANGER('< 0.80倍'), WARNING('0.80–1.00倍'), POSITIVE('≥ 1.00倍')],
  freeCashFlow: [DANGER('< 0')],
  freeCashFlowMargin: [DANGER('< 0%'), WARNING('0%–5%'), POSITIVE('≥ 10%')],
  accrualRatio: [DANGER('> 10%'), WARNING('> 5%且≤ 10%'), POSITIVE('≤ 0%')],
  deductedProfitRatio: [DANGER('≥ 0%且< 50%'), WARNING('50%–90%'), POSITIVE('≥ 90%')],
  interestCoverage: [DANGER('< 1.00倍'), WARNING('1.00–3.00倍'), POSITIVE('≥ 5.00倍')],
  netDebtToOperatingCash: [DANGER('> 5.00倍'), WARNING('3.00–5.00倍'), POSITIVE('< 2.00倍')],
  incrementalRoic3y: [DANGER('< 0%'), WARNING('0%–8%'), POSITIVE('≥ 15%')],
  averageRoic5y: [DANGER('< 0%'), WARNING('0%–8%'), POSITIVE('≥ 15%')],
  roicVolatility5y: [DANGER('> 10%'), WARNING('> 5%且≤ 10%'), POSITIVE('≤ 3%')],
  grossMarginVolatility5y: [DANGER('> 10%'), WARNING('> 5%且≤ 10%'), POSITIVE('≤ 3%')],
  operatingMarginVolatility5y: [DANGER('> 10%'), WARNING('> 5%且≤ 10%'), POSITIVE('≤ 3%')],
  developmentCapitalizationProxy: [DANGER('> 50%'), WARNING('> 30%且≤ 50%')],
  developmentToEquity: [DANGER('> 20%'), WARNING('> 10%且≤ 20%')],
  goodwillToEquity: [DANGER('> 60%'), WARNING('> 30%且≤ 60%')],
  intangibleGoodwillToAssets: [DANGER('> 50%'), WARNING('> 30%且≤ 50%')],
  impairmentToOperatingProfit: [DANGER('> 50%'), WARNING('> 20%且≤ 50%')]
};

const GROWTH_GAP_THRESHOLDS = [
  DANGER('> 20个百分点'),
  WARNING('> 10且≤ 20个百分点'),
  POSITIVE('≤ 0个百分点')
];

export function metricThresholdGuide(result: MetricResult): MetricThresholdGuide | null {
  const bands = result.definition.kind === 'judgment'
    ? [DANGER('未通过'), POSITIVE('通过')]
    : isGrowthGapMetric(result.definition.key)
      ? GROWTH_GAP_THRESHOLDS
      : THRESHOLDS[result.definition.key];
  if (!bands) return null;

  return {
    bands,
    activeTone: isCriticalMetric(result)
      ? 'danger'
      : isWarningMetric(result)
        ? 'warning'
        : isPositiveMetric(result)
          ? 'positive'
          : 'neutral'
  };
}
