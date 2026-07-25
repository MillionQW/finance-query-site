import {
  isCriticalMetric,
  isPositiveMetric,
  isWarningMetric
} from './financial-metric-alerts';
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
    const tone: DiagnosticTone = critical.length
      ? 'danger'
      : warning.length
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
    const prioritized = [...critical, ...warning, ...positive, ...neutral];
    const primaryRisk = [...critical, ...warning][0];
    const explicitAlert = primaryRisk?.alerts.find((alert) => alert.year)?.message;
    const summary = tone === 'neutral'
      ? '可计算指标不足，请检查财报科目或历史年限。'
      : explicitAlert ??
        (primaryRisk
          ? `${primaryRisk.definition.label}触发${tone === 'danger' ? '风险' : '关注'}条件，建议查看指标明细。`
          : config.stableSummary);

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
      }))
    };
  });
}

function metricTone(result: MetricResult): DiagnosticTone {
  if (isCriticalMetric(result)) return 'danger';
  if (isWarningMetric(result)) return 'warning';
  if (isPositiveMetric(result)) return 'positive';
  return 'neutral';
}
