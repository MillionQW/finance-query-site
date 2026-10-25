export function shanghaiYear(date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(date));
}

export function valuationExpired(value: string, updatedAt: string | null, now = new Date()): boolean {
  if (!value.trim()) return false;
  if (!updatedAt || !Number.isFinite(Date.parse(updatedAt))) return true;
  return shanghaiYear(new Date(updatedAt)) < shanghaiYear(now);
}

export function holdingAllocation(
  holdings: Array<{ id: number; holdingValue: number | null; holdingCurrency: 'CNY' | 'HKD' }>,
  hkdCny: number | null | undefined
): { total: number | null; weights: Record<number, number | null>; cnyValues: Record<number, number | null>; message: string; complete: boolean } {
  const validFx = typeof hkdCny === 'number' && Number.isFinite(hkdCny) && hkdCny > 0;
  const cnyValues: Record<number, number | null> = {};
  let missing = 0, missingFx = false, subtotal = 0;
  for (const h of holdings) {
    let value: number | null = null;
    if (h.holdingValue == null || !Number.isFinite(h.holdingValue) || h.holdingValue < 0) missing++;
    else if (h.holdingCurrency === 'HKD' && h.holdingValue > 0 && !validFx) missingFx = true;
    else value = h.holdingValue * (h.holdingCurrency === 'HKD' && h.holdingValue > 0 ? hkdCny! : 1);
    cnyValues[h.id] = value;
    subtotal += value ?? 0;
  }
  const complete = !missing && !missingFx;
  const canCalculate = complete && subtotal > 0;
  const weights = Object.fromEntries(holdings.map(h => [h.id, canCalculate ? cnyValues[h.id]! / subtotal * 100 : null]));
  const messages = [];
  if (missing) messages.push(`${missing}家公司尚未填写金额，补齐后计算比例（无持仓可填0）`);
  if (missingFx) messages.push('港币汇率暂不可用，暂不计算总额和比例');
  if (complete) messages.push(subtotal > 0 ? '各公司折合人民币金额 ÷ 总持仓金额；显示比例可能有四舍五入差异' : '填写持仓金额后自动计算比例');
  return { total: missingFx ? null : subtotal, weights, cnyValues, message: messages.join('；'), complete };
}

export function holdingSupported(market: string, symbol: string): boolean {
  return market === 'hk' ? /^\d{5}$/.test(symbol) : market === 'a' && /^(?:60|68|00|30|43|83|87|88|92)\d{4}$/.test(symbol);
}

export function impliedSharePrice(target: string, price: number | null | undefined, capCny: number | null | undefined): number | null {
  if (!/^\d+(\.\d+)?$/.test(target.trim()) || price == null || capCny == null || !Number.isFinite(price) || !Number.isFinite(capCny) || price <= 0 || capCny <= 0) return null;
  const result = Number(target) / capCny * price;
  return Number.isFinite(result) ? result : null;
}

export function portfolioDate(value: string | null): string {
  if (!value) return '未填写';
  if (value.length === 10) return value;
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
