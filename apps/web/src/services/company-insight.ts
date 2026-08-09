import type { CompanyInsight } from '../types/finance';

type CompanyInsightPayload = Pick<CompanyInsight, 'market' | 'symbol'> & Partial<CompanyInsight>;

export function normalizeCompanyInsight(insight: CompanyInsightPayload): CompanyInsight {
  return {
    ...insight,
    note: typeof insight.note === 'string' ? insight.note : '',
    thesis: typeof insight.thesis === 'string' ? insight.thesis : '',
    risks: typeof insight.risks === 'string' ? insight.risks : '',
    catalysts: typeof insight.catalysts === 'string' ? insight.catalysts : '',
    questions: typeof insight.questions === 'string' ? insight.questions : '',
    buyPointRange: typeof insight.buyPointRange === 'string' ? insight.buyPointRange : '',
    buyPointUpdatedAt: insight.buyPointUpdatedAt ?? null,
    updatedAt: insight.updatedAt ?? null
  };
}
