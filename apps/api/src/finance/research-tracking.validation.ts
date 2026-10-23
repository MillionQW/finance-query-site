import { BadRequestException } from '@nestjs/common';
import type { BusinessInputDto, HypothesisInputDto } from './research-tracking.dto';

export function validResearchDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function cleanResearchInput<T extends BusinessInputDto | HypothesisInputDto>(input: T): T {
  const data = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as T;
  if ([data.segment, data.metric, data.unit, data.basis].some(v => !v)) throw new BadRequestException('业务、指标、单位和口径不能为空');
  if (!validResearchDate(data.periodStart) || !validResearchDate(data.periodEnd) || data.periodStart > data.periodEnd) throw new BadRequestException('报告期间无效');
  if (data.currency && !/^[A-Z]{3}$/.test(data.currency)) throw new BadRequestException('币种使用三位大写代码');
  if (['元','万元','亿元'].includes(data.unit) && !data.currency) throw new BadRequestException('金额指标必须注明报告币种');
  if (data.dimension === '整体' && data.segment !== '公司整体') throw new BadRequestException('整体维度使用“公司整体”，避免与分部重复汇总');
  if ('value' in data) {
    if (!data.sourceText) throw new BadRequestException('请记录原报告来源');
    if (data.sourceUrl) {
      try { if (!['http:', 'https:'].includes(new URL(data.sourceUrl).protocol)) throw new Error(); }
      catch { throw new BadRequestException('来源链接须为完整的http或https网址'); }
    }
  } else {
    if (!data.thesis || !data.rationale) throw new BadRequestException('研究假设及依据不能为空');
    if (!validResearchDate(data.dueDate) || data.dueDate < data.periodEnd) throw new BadRequestException('验证日期不得早于目标报告期末');
    if (data.expectedMin === null && data.expectedMax === null) throw new BadRequestException('至少设置一个预期边界');
    if (data.expectedMin !== null && data.expectedMax !== null && data.expectedMin > data.expectedMax) throw new BadRequestException('预期下限不得超过上限');
  }
  return data;
}
