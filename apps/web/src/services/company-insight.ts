import type { CompanyInsight } from '../types/finance';

type CompanyInsightPayload = Pick<CompanyInsight, 'market' | 'symbol'> & Partial<CompanyInsight>;

export function isBuyPointDue(range: string, updatedAt: string | null, now = Date.now()): boolean {
  if (!range || !updatedAt) return false;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 6);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return now >= date.getTime();
}

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
