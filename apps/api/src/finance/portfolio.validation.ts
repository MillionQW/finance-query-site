import { BadRequestException } from '@nestjs/common';
import type { HoldingInput } from './portfolio.types';

export function holdingIdentity(market: unknown, symbol: unknown): asserts market is 'a' | 'hk' {
  if (typeof symbol !== 'string' || !(
    (market === 'hk' && /^\d{5}$/.test(symbol)) ||
    (market === 'a' && /^(?:60|68|00|30|43|83|87|88|92)\d{4}$/.test(symbol))
  )) throw new BadRequestException('仅支持A股和港股，请从搜索结果添加公司');
}

export function cleanHolding(value: unknown): HoldingInput {
  if (!value || typeof value !== 'object') throw new BadRequestException('持仓数据无效');
  const v = value as Record<string, unknown>;
  holdingIdentity(v.market, v.symbol);
  const text = (key: string, max: number) => {
    if (typeof v[key] !== 'string' || (v[key] as string).length > max) throw new BadRequestException(`${key} 内容无效或过长`);
    return (v[key] as string).trim();
  };
  const name = text('name', 100);
  const pricePoint = (key: string, label: string) => {
    const value = text(key, 150);
    if (value && (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) {
      throw new BadRequestException(`${label}只能填写非负数字（可含小数），不能包含比较符号、区间或文字`);
    }
    return value;
  };
  if (!name) throw new BadRequestException('公司名称不能为空');
  if (v.holdingValue !== null && (typeof v.holdingValue !== 'number' || !Number.isFinite(v.holdingValue) || v.holdingValue < 0 || v.holdingValue > 1e12)) {
    throw new BadRequestException('当前持仓总市值应为0到1万亿之间的金额，可留空；旧页面请刷新后填写金额');
  }
  const holdingCurrency = v.holdingCurrency ?? (v.market === 'hk' ? 'HKD' : 'CNY');
  if (holdingCurrency !== 'CNY' && holdingCurrency !== 'HKD') throw new BadRequestException('持仓金额币种仅支持人民币或港币');
  if (!Number.isInteger(v.expectedVersion) || Number(v.expectedVersion) < 0) throw new BadRequestException('版本无效');
  if (typeof v.confirmValuation !== 'boolean') throw new BadRequestException('估值确认状态无效');
  const buyPoint = pricePoint('buyPoint', '理想买点下限');
  const buyPointUpper = v.buyPointUpper === undefined ? buyPoint : pricePoint('buyPointUpper', '理想买点上限');
  if (Boolean(buyPoint) !== Boolean(buyPointUpper)) throw new BadRequestException('理想买点的下限和上限须同时填写，或同时留空');
  if (buyPoint && Number(buyPoint) > Number(buyPointUpper)) throw new BadRequestException('理想买点下限不能大于上限');
  return { market: v.market, symbol: v.symbol as string, name, holdingValue: v.holdingValue as number | null, holdingCurrency,
    valuation: text('valuation', 150), buyPoint, buyPointUpper, sellPoint: pricePoint('sellPoint', '1年内卖点'),
    note: text('note', 2000), confirmValuation: v.confirmValuation, expectedVersion: Number(v.expectedVersion) };
}
