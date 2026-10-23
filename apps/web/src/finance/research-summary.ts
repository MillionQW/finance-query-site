import type { FinancialStatements } from '../types/finance';
import {
  buildFinancialDiagnostics,
  type DiagnosticTone,
  type FinancialDiagnostic
} from './financial-diagnostics';
import {
  definitions,
  definitionForMarket
} from './financial-metric-definitions';
import { evaluateFinancialMetrics } from './financial-metric-evaluator';

export interface ResearchSummary {
  tone: DiagnosticTone;
  status: '已覆盖指标未触发风险' | '存在关注项' | '存在风险项' | '数据不足';
  headline: string;
  diagnostics: FinancialDiagnostic[];
  prioritySignals: Array<{
    title: string;
    message: string;
    tone: 'warning' | 'danger';
  }>;
}

export function buildResearchSummary(
  statements: FinancialStatements | null
): ResearchSummary {
  if (!statements) {
    return {
      tone: 'neutral',
      status: '数据不足',
      headline: '等待财报数据后生成可解释的研究结论。',
      diagnostics: [],
      prioritySignals: []
    };
  }
  const marketDefinitions = definitions
    .filter((definition) => statements.company.market !== 'hk' || definition.key !== 'tangOperatingMargin')
    .map((definition) => definitionForMarket(definition, statements.company.market));
  const results = evaluateFinancialMetrics(statements, statements.years, marketDefinitions);
  const diagnostics = buildFinancialDiagnostics(results);
  const danger = diagnostics.filter((diagnostic) => diagnostic.tone === 'danger');
  const warning = diagnostics.filter((diagnostic) => diagnostic.tone === 'warning');
  const positive = diagnostics.filter((diagnostic) => diagnostic.tone === 'positive');
  const tone: DiagnosticTone = danger.length
    ? 'danger'
    : warning.length
      ? 'warning'
      : positive.length >= 2
        ? 'positive'
        : 'neutral';
  const prioritySignals = diagnostics
    .flatMap((diagnostic) => {
      const explicitSignals = diagnostic.signals.map((signal) => ({
        title: diagnostic.title,
        message: signal.message,
        tone: signal.tone
      }));
      if (explicitSignals.length) return explicitSignals;
      if (diagnostic.tone === 'danger' || diagnostic.tone === 'warning') {
        return [{
          title: diagnostic.title,
          message: diagnostic.summary,
          tone: diagnostic.tone
        }];
      }
      return [];
    })
    .sort((left, right) => Number(right.tone === 'danger') - Number(left.tone === 'danger'))
    .slice(0, 4);
  const latestPeriod = statements.reportPeriods?.[0]?.label;
  const context = `本结论仅基于 ${statements.years[0] ?? '未知'} 年度数据；缺失指标不沿用往年值。`
    + (latestPeriod ? `另有 ${latestPeriod} 数据，请在经营变化面板查看。` : '');
  const headline = tone === 'danger'
    ? `${danger.map((item) => item.title).join('、')}出现风险信号；${context}`
    : tone === 'warning'
      ? `${warning.map((item) => item.title).join('、')}需要继续跟踪；${context}`
      : tone === 'positive'
        ? `${positive.length}/4 个分析维度暂未触发明显风险；${context}`
        : `可计算指标仍不足；${context}`;

  return {
    tone,
    status: tone === 'danger'
      ? '存在风险项'
      : tone === 'warning'
        ? '存在关注项'
        : tone === 'positive'
          ? '已覆盖指标未触发风险'
          : '数据不足',
    headline,
    diagnostics,
    prioritySignals
  };
}
