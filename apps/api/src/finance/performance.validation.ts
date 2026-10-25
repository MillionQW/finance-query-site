import { BadRequestException } from '@nestjs/common';
import type { PerformanceEntry, PerformanceEntryInput } from './performance.types';

export function shanghaiDateTime(now = new Date()): string { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 16); }
export function cleanPerformance(value: unknown, startDate: string): { input: PerformanceEntryInput; version: number } {
  if (!value || typeof value !== 'object') throw new BadRequestException('收益记录无效');
  const v = value as Record<string, unknown>;
  if (!['initial', 'snapshot', 'deposit', 'withdrawal'].includes(String(v.kind))) throw new BadRequestException('记录类型无效');
  if (typeof v.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.at) ||
    !Number.isFinite(Date.parse(v.at + '+08:00')) || shanghaiDateTime(new Date(v.at + '+08:00')) !== v.at || v.at < startDate + 'T00:00' || v.at > shanghaiDateTime()) {
    throw new BadRequestException('请填写起算日之后、不晚于当前时间的有效北京时间');
  }
  const amount = v.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1e12 || (v.kind !== 'snapshot' && amount === 0)) throw new BadRequestException('金额无效；起始资产和出入金须大于0，资产快照可为0');
  const flow = v.kind === 'deposit' || v.kind === 'withdrawal';
  if (v.currency !== 'CNY' && v.currency !== 'HKD') throw new BadRequestException('币种无效');
  if (!flow && v.currency !== 'CNY') throw new BadRequestException('账户资产快照请统一填写折合人民币金额');
  if (typeof v.fx !== 'number' || !Number.isFinite(v.fx) || v.fx <= 0 || v.fx > 100 || (v.currency === 'CNY' && v.fx !== 1)) throw new BadRequestException('请填写流水当日的有效汇率，人民币汇率为1');
  if (amount * v.fx > 1e12) throw new BadRequestException('折合人民币金额过大');
  if (v.beforeValue !== null && (typeof v.beforeValue !== 'number' || !Number.isFinite(v.beforeValue) || v.beforeValue < 0 || v.beforeValue > 1e12)) throw new BadRequestException('转账前账户净资产无效');
  if (v.kind === 'withdrawal' && v.beforeValue !== null && amount * v.fx > Number(v.beforeValue) + 1e-8) throw new BadRequestException('取出金额不能超过转账前账户净资产');
  if (typeof v.note !== 'string' || v.note.length > 1000) throw new BadRequestException('备注过长或无效');
  if (!Number.isInteger(v.expectedVersion) || Number(v.expectedVersion) < 0) throw new BadRequestException('记录版本无效，请重新载入');
  return { version: Number(v.expectedVersion), input: { kind: v.kind as PerformanceEntryInput['kind'], at: v.at, amount,
    currency: v.currency, fx: v.fx, beforeValue: flow ? v.beforeValue as number | null : null, note: v.note.trim() } };
}

export function validatePerformanceTimeline(entries: PerformanceEntry[], startDate: string) {
  if (!entries.length) return;
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  if (sorted.filter(e => e.kind === 'initial').length !== 1 || sorted[0].kind !== 'initial') throw new BadRequestException('必须先有唯一的起始资产，后续记录不能早于起始时刻');
  if (sorted[0].at.slice(0, 10) !== startDate) throw new BadRequestException(`起始资产须填写 ${startDate} 当天的数据`);
  if (new Set(sorted.map(e => e.at)).size !== sorted.length) throw new BadRequestException('已有相同时刻的记录，请编辑原记录，或用不同分钟区分先后顺序');
}
