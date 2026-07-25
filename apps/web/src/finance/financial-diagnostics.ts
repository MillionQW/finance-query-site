import {
  isCriticalMetric,
  isPositiveMetric,
  isWarningMetric
} from './financial-metric-alerts';
import { formatMetricValue } from './financial-metric-engine';
import type {
  MetricGroupKey,
  MetricKind,
  MetricResult
} from './financial-metric-types';

export type DiagnosticTone = 'positive' | 'warning' | 'danger' | 'neutral';

export interface DiagnosticMetric {
  metricKey: string;
  label: string;
  value: number;
  kind: MetricKind;
  group: MetricGroupKey;
  tone: DiagnosticTone;
}

export interface FinancialDiagnostic {
  key: 'profitability' | 'growthQuality' | 'cashCreation' | 'financialRisk';
  title: string;
  eyebrow: string;
  status: '稳健' | '关注' | '风险' | '数据不足';
  tone: DiagnosticTone;
  summary: string;
  availableCount: number;
  totalCount: number;
  metrics: DiagnosticMetric[];
  signals: DiagnosticSignal[];
}

export interface DiagnosticSignal {
  metricKey: string;
  group: MetricGroupKey;
  message: string;
  tone: 'warning' | 'danger';
}

interface DiagnosticConfig {
  key: FinancialDiagnostic['key'];
  title: string;
  eyebrow: string;
  metricKeys: string[];
  stableSummary: string;
}

const DIAGNOSTIC_CONFIGS: DiagnosticConfig[] = [
  {
    key: 'profitability',
    title: '赚钱能力',
    eyebrow: '回报与稳定性',
    metricKeys: ['roic', 'averageRoic5y', 'incrementalRoic3y', 'netMargin', 'roicVolatility5y', 'grossMarginVolatility5y'],
    stableSummary: '资本回报和利润率暂未触发明显风险，继续结合同行水平判断竞争优势。'
  },
  {
    key: 'growthQuality',
    title: '增长质量',
    eyebrow: '增长与背离',
    metricKeys: ['revenueGrowth', 'operatingProfitGrowth', 'receivablesRevenueGrowthGap', 'inventoryRevenueGrowthGap', 'profitCashflowGrowthGap', 'assetRevenueGrowthGap'],
    stableSummary: '收入、利润与营运项目之间暂未发现明显增长背离。'
  },
  {
    key: 'cashCreation',
    title: '现金创造',
    eyebrow: '利润含金量',
    metricKeys: ['cumulativeCashConversion3y', 'operatingCashConversion', 'freeCashFlowMargin', 'accrualRatio', 'cashCollectionRatio'],
    stableSummary: '利润转现、自由现金流和应计项目暂未触发明显风险。'
  },
  {
    key: 'financialRisk',
    title: '财务风险',
    eyebrow: '偿债与资产质量',
    metricKeys: ['interestCoverage', 'netDebtToOperatingCash', 'assetLiabilityRatio', 'goodwillToEquity', 'impairmentToOperatingProfit', 'developmentToEquity'],
    stableSummary: '偿债压力、商誉、开发支出和减值指标暂未触发明显风险。'
  }
];

export function buildFinancialDiagnostics(results: MetricResult[]): FinancialDiagnostic[] {
  const resultByKey = new Map(results.map((result) => [result.definition.key, result]));
  return DIAGNOSTIC_CONFIGS.map((config) => {
    const configuredResults = config.metricKeys
      .map((key) => resultByKey.get(key))
      .filter((result): result is MetricResult => Boolean(result));
    const available = configuredResults.filter((result) => result.latest !== null);
    const critical = available.filter(isCriticalMetric);
    const warning = available.filter((result) => !isCriticalMetric(result) && isWarningMetric(result));
    const positive = available.filter((result) =>
      !isCriticalMetric(result) && !isWarningMetric(result) && isPositiveMetric(result)
    );
    const neutral = available.filter((result) =>
      !isCriticalMetric(result) && !isWarningMetric(result) && !isPositiveMetric(result)
    );
    const signals = configuredResults.flatMap(trendSignalsFor);
    const dangerSignals = signals.filter((signal) => signal.tone === 'danger');
    const warningSignals = signals.filter((signal) => signal.tone === 'warning');
    const orderedSignals = [...dangerSignals, ...warningSignals];
    const tone: DiagnosticTone = critical.length || dangerSignals.length
      ? 'danger'
      : warning.length || warningSignals.length
        ? 'warning'
        : available.length >= 2
          ? 'positive'
          : 'neutral';
    const status = tone === 'danger'
      ? '风险'
      : tone === 'warning'
        ? '关注'
        : tone === 'positive'
          ? '稳健'
          : '数据不足';
    const signalPriority = new Map(
      signals.map((signal) => [signal.metricKey, signal.tone === 'danger' ? 4 : 2])
    );
    const prioritized = [...available].sort((left, right) =>
      metricPriority(right, signalPriority) - metricPriority(left, signalPriority)
    );
    const primaryCritical = critical[0];
    const primaryWarning = warning[0];
    const criticalAlert = primaryCritical?.alerts.find((alert) => alert.year)?.message;
    const warningAlert = primaryWarning?.alerts.find((alert) => alert.year)?.message;
    const summary = tone === 'neutral'
      ? '可计算指标不足，请检查财报科目或历史年限。'
      : primaryCritical
        ? criticalAlert ??
          dangerSignals[0]?.message ??
          `${primaryCritical.definition.label}触发风险条件，建议查看指标明细。`
        : dangerSignals[0]?.message ??
          (primaryWarning
            ? warningAlert ??
              warningSignals[0]?.message ??
              `${primaryWarning.definition.label}触发关注条件，建议查看指标明细。`
            : warningSignals[0]?.message ?? config.stableSummary);

    return {
      key: config.key,
      title: config.title,
      eyebrow: config.eyebrow,
      status,
      tone,
      summary,
      availableCount: available.length,
      totalCount: configuredResults.length,
      metrics: prioritized.slice(0, 3).map((result) => ({
        metricKey: result.definition.key,
        label: result.definition.label,
        value: result.latest as number,
        kind: result.definition.kind,
        group: result.definition.group,
        tone: metricTone(result)
      })),
      signals: orderedSignals.slice(0, 3)
    };
  });
}

function metricPriority(result: MetricResult, signalPriority: Map<string, number>): number {
  if (isCriticalMetric(result)) return 5;
  const trendPriority = signalPriority.get(result.definition.key) ?? 0;
  if (trendPriority) return trendPriority;
  if (isWarningMetric(result)) return 3;
  if (isPositiveMetric(result)) return 1;
  return 0;
}

function metricTone(result: MetricResult): DiagnosticTone {
  if (isCriticalMetric(result)) return 'danger';
  if (isWarningMetric(result)) return 'warning';
  if (isPositiveMetric(result)) return 'positive';
  return 'neutral';
}

function trendSignalsFor(result: MetricResult): DiagnosticSignal[] {
  const threeYearValues = recentConsecutivePoints(result, 3);
  const twoYearValues = recentConsecutivePoints(result, 2);
  const signal = (
    message: string,
    tone: DiagnosticSignal['tone']
  ): DiagnosticSignal => ({
    metricKey: result.definition.key,
    group: result.definition.group,
    message,
    tone
  });

  if (
    (result.definition.key === 'roic' || result.definition.key === 'netMargin') &&
    threeYearValues &&
    threeYearValues[0].value < threeYearValues[1].value &&
    threeYearValues[1].value < threeYearValues[2].value
  ) {
    const decline = threeYearValues[2].value - threeYearValues[0].value;
    if (decline >= 0.03) {
      return [signal(
        `${threeYearValues[2].year}至${threeYearValues[0].year}，${result.definition.label}连续下降 ${formatMetricValue(decline, 'percent')}。`,
        decline >= 0.08 ? 'danger' : 'warning'
      )];
    }
  }

  if (
    (result.definition.key === 'revenueGrowth' || result.definition.key === 'operatingProfitGrowth') &&
    twoYearValues &&
    twoYearValues.every((point) => point.value < 0)
  ) {
    return [signal(
      `${twoYearValues[1].year}和${twoYearValues[0].year}，${result.definition.label}连续为负。`,
      'danger'
    )];
  }

  if (result.definition.key === 'operatingCashConversion') {
    if (threeYearValues?.every((point) => point.value < 1)) {
      return [signal(
        `${threeYearValues[2].year}至${threeYearValues[0].year}，利润连续三年未能等额转化为经营现金。`,
        'danger'
      )];
    }
    if (twoYearValues?.every((point) => point.value < 1)) {
      return [signal(
        `${twoYearValues[1].year}和${twoYearValues[0].year}，利润连续两年未能等额转化为经营现金。`,
        'warning'
      )];
    }
  }

  if (
    result.definition.key === 'freeCashFlowMargin' &&
    twoYearValues?.every((point) => point.value < 0)
  ) {
    return [signal(
      `${twoYearValues[1].year}和${twoYearValues[0].year}，自由现金流率连续为负。`,
      'danger'
    )];
  }

  if (
    (result.definition.key === 'assetLiabilityRatio' || result.definition.key === 'goodwillToEquity') &&
    threeYearValues
  ) {
    const increase = threeYearValues[0].value - threeYearValues[2].value;
    const warningThreshold = result.definition.key === 'assetLiabilityRatio' ? 0.1 : 0.15;
    const dangerThreshold = result.definition.key === 'assetLiabilityRatio' ? 0.2 : 0.3;
    if (increase >= warningThreshold) {
      return [signal(
        `${threeYearValues[2].year}至${threeYearValues[0].year}，${result.definition.label}上升 ${formatMetricValue(increase, 'percent')}。`,
        increase >= dangerThreshold ? 'danger' : 'warning'
      )];
    }
  }

  return [];
}

function recentConsecutivePoints(
  result: MetricResult,
  count: number
): Array<{ year: string; value: number }> | null {
  const points = result.points.slice(0, count);
  if (points.length < count || points.some((point) => point.value === null)) return null;
  const years = points.map((point) => Number.parseInt(point.year, 10));
  if (
    years.some((year) => !Number.isFinite(year)) ||
    years.slice(1).some((year, index) => years[index] - year !== 1)
  ) {
    return null;
  }
  return points.map((point) => ({ year: point.year, value: point.value as number }));
}
