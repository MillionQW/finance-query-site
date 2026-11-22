import type { MacroIndicator, MacroPoint } from '../types/macro';

const decimals = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const exchangeRate = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const chinaYield = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

export function macroValue(value: number, indicator: MacroIndicator): string {
  const number = macroNumber(value, indicator);
  return indicator.unit === '%' ? `${number}%` : `${number} ${indicator.unit}`;
}

export function macroNumber(value: number, indicator: MacroIndicator): string {
  if (indicator.id === 'cn10y') return chinaYield.format(value);
  return (indicator.id === 'usdcny' ? exchangeRate : decimals).format(value);
}

export function macroPeriod(point: MacroPoint): string {
  return point.periodLabel ?? point.period;
}
