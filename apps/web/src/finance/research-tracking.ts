import { sameObservation, type BusinessData, type HypothesisData, type MetricIdentity, type ResearchEntry } from '../types/research-tracking';
import { validDate } from './scenario-valuation';
export const dimensions = ['业务','产品','地区','渠道','整体'];
export const standardMetrics = ['收入','毛利','经营利润','销量','平均售价','用户数','付费率','产能利用率','订单金额'];
export function emptyIdentity(): MetricIdentity {
  return { dimension:'业务', segment:'', metric:'收入', unit:'亿元', currency:'CNY', basis:'公司披露口径', periodStart:'', periodEnd:'' };
}
export type BusinessDraft = Omit<BusinessData,'value'> & { value:number|null };
export function emptyBusiness(): BusinessDraft { return { ...emptyIdentity(), value:null, sourceText:'',sourceUrl:'',page:'',note:'',archived:false }; }
export function emptyHypothesis(identity?: MetricIdentity): HypothesisData {
  const base = identity ? Object.fromEntries(Object.keys(emptyIdentity()).map(k => [k, identity[k as keyof MetricIdentity]])) as unknown as MetricIdentity : emptyIdentity();
  return { ...base, thesis:'',rationale:'',expectedMin:null,expectedMax:null,dueDate:'',valuationSnapshotId:null,archived:false };
}
export function identityErrors(data: MetricIdentity): string[] {
  const errors: string[] = [];
  if (![data.segment,data.metric,data.unit,data.basis].every(v => v.trim())) errors.push('请填写业务名称、指标、单位与口径。');
  if (!validDate(data.periodStart) || !validDate(data.periodEnd) || data.periodStart > data.periodEnd) errors.push('请填写有效的起止报告日期。');
  if (['元','万元','亿元'].includes(data.unit) && !/^[A-Z]{3}$/.test(data.currency)) errors.push('金额指标需要明确的报告币种。');
  return errors;
}
export function businessErrors(data: BusinessDraft): string[] {
  const errors = identityErrors(data);
  if (typeof data.value !== 'number' || !Number.isFinite(data.value)) errors.push('请输入有效数值；未披露的数据不要按零录入。');
  if (!data.sourceText.trim()) errors.push('请填写原始报告来源。');
  if (data.sourceUrl) {
    try { if (!['https:', 'http:'].includes(new URL(data.sourceUrl).protocol)) throw new Error(); }
    catch { errors.push('来源链接须为完整的http或https网址。'); }
  }
  return errors;
}
export function hypothesisErrors(data: HypothesisData): string[] {
  const errors = identityErrors(data);
  if (!data.thesis.trim() || !data.rationale.trim()) errors.push('请填写研究假设及依据。');
  if (!validDate(data.dueDate) || data.dueDate < data.periodEnd) errors.push('验证日期不得早于目标报告期末。');
  if (data.expectedMin === null && data.expectedMax === null) errors.push('至少填写一个预期边界。');
  if ([data.expectedMin,data.expectedMax].some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v)))) errors.push('预期边界必须为有效数值或留空。');
  if (data.expectedMin !== null && data.expectedMax !== null && data.expectedMin > data.expectedMax) errors.push('预期下限不能超过上限。');
  return errors;
}
function previousYear(value: string): string {
  const date = new Date(`${value}T00:00:00Z`), year = date.getUTCFullYear() - 1, month = date.getUTCMonth();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), new Date(Date.UTC(year,month+1,0)).getUTCDate()))).toISOString().slice(0,10);
}
export function businessComparison(entry: ResearchEntry<BusinessData>, all: ResearchEntry<BusinessData>[]) {
  if (entry.data.origin?.missing) return { previous:null, growth:null, ppChange:null, share:null, grossMargin:null };
  const d = entry.data, active = all.filter(e => !e.data.archived && !e.data.origin?.missing);
  const prior = active.find(e => sameObservation(e.data, { ...d,periodStart:previousYear(d.periodStart),periodEnd:previousYear(d.periodEnd) }));
  const total = d.dimension === '整体' ? null : active.find(e => sameObservation(e.data, { ...d,dimension:'整体',segment:'公司整体' }));
  const revenue = active.find(e => sameObservation(e.data, { ...d, metric:'收入' }));
  const gross = active.find(e => sameObservation(e.data, { ...d,metric:'毛利' }));
  return { previous:prior?.data.value ?? null,
    growth: prior && prior.data.value > 0 && d.unit !== '%' ? d.value / prior.data.value - 1 : null,
    ppChange: prior && d.unit === '%' ? d.value - prior.data.value : null,
    share: ['收入','毛利','经营利润'].includes(d.metric) && total && total.data.value > 0 ? d.value / total.data.value : null,
    grossMargin: ['收入','毛利'].includes(d.metric) && revenue && gross && revenue.data.value > 0 ? gross.data.value / revenue.data.value : null };
}
export function hypothesisState(h: HypothesisData, business: ResearchEntry<BusinessData>[], today: string) {
  const actual = business.find(e => !e.data.archived && !e.data.origin?.missing && sameObservation(e.data,h));
  const met = actual ? (h.expectedMin === null || actual.data.value >= h.expectedMin) && (h.expectedMax === null || actual.data.value <= h.expectedMax) : null;
  const revised = Boolean(h.review && (!actual || h.review.businessId !== actual.id || h.review.businessVersion !== actual.version));
  const due = h.dueDate < today;
  const label = h.archived ? '已归档' : revised ? '数据已修订·需重验' : actual ? (h.review ? (met ? '已验证·指标达标' : '已验证·指标偏离') : (met ? '指标达标·待验证' : '指标偏离·待验证')) : due ? '已到期·待数据' : '待数据';
  return { actual,met,revised,label,attention: !h.archived && (revised || met === false || due && !h.review), due };
}
export const researchNumber = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('zh-CN',{maximumFractionDigits:4});
export const researchPercent = (n: number | null | undefined) => n == null ? '—' : `${(n*100).toFixed(2)}%`;
