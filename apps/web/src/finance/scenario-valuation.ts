export interface ValuationScenario {
  name: string; growth: number; exitPe: number; payout: number; shareChange: number; rationale: string;
}
export interface ValuationModel {
  version: 1; baseProfit: number | null; shares: number | null; price: number | null;
  reportCurrency: string; quoteCurrency: string; fx: number | null; fxDate: string;
  basePeriod: string; profitBasis: string; baseSource: string; statementHash: string;
  valuationDate: string; years: number; requiredReturn: number; safetyMargin: number;
  scenarios: ValuationScenario[];
}
export interface ValuationSnapshot { id: number; savedAt: string; model: ValuationModel }
export interface ScenarioResult {
  terminalProfit: number; terminalShares: number; terminalMarketCap: number;
  terminalPrice: number; dividends: number[]; fairPrice: number; watchPrice: number; annualReturn: number;
}
export function emptyValuationModel(): ValuationModel {
  return { version: 1, baseProfit: null, shares: null, price: null,
    reportCurrency: '', quoteCurrency: '', fx: 1, fxDate: '', basePeriod: '',
    profitBasis: '归母净利润', baseSource: '', statementHash: '',
    valuationDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    years: 3, requiredReturn: 10, safetyMargin: 25,
    scenarios: [
      { name: '悲观', growth: -5, exitPe: 12, payout: 30, shareChange: 0, rationale: '' },
      { name: '中性', growth: 5, exitPe: 18, payout: 30, shareChange: 0, rationale: '' },
      { name: '乐观', growth: 10, exitPe: 24, payout: 30, shareChange: 0, rationale: '' }
    ] };
}
const within = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
export function modelErrors(m: ValuationModel, saving = false): string[] {
  const errors: string[] = [];
  if (!within(m.baseProfit, 0.000001, 1e12)) errors.push('基准归母利润须为正数（亿元）；亏损公司不适用此PE模型。');
  if (!within(m.shares, 0.000001, 1e12)) errors.push('请输入总股本（亿股），不能使用流通股本。');
  if (!within(m.price, 0.000001, 1e9)) errors.push('请输入用于测算的每股价格。');
  if (![m.reportCurrency, m.quoteCurrency].every(c => /^[A-Z]{3}$/.test(c))) errors.push('请确认报告币种与报价币种。');
  if (m.reportCurrency !== m.quoteCurrency && (!within(m.fx, 0.000001, 1e6) || !validDate(m.fxDate))) errors.push('请填写汇率及日期：1报告币种兑换多少报价币种。');
  if (!validDate(m.valuationDate)) errors.push('请填写有效的估值／价格基准日期。');
  if (!m.basePeriod.trim() || !m.baseSource.trim() || !m.profitBasis.trim()) errors.push('请填写利润期间、口径和数据来源。');
  if (![3, 5].includes(m.years)) errors.push('预测期限仅支持3或5年。');
  if (!within(m.requiredReturn, 0, 100) || !within(m.safetyMargin, 0, 90)) errors.push('要求回报率应为0—100%，安全边际应为0—90%。');
  if (m.scenarios.length !== 3) errors.push('需要三个情景。');
  for (const s of m.scenarios) {
    if (!within(s.growth, -95, 100) || !within(s.exitPe, 1, 200) || !within(s.payout, 0, 100) || !within(s.shareChange, -20, 100)) errors.push(`${s.name}：增长率须为-95—100%，PE为1—200，分红率为0—100%，股本年变化为-20—100%。`);
    if (saving && !s.rationale.trim()) errors.push(`保存前请填写${s.name}情景的假设依据。`);
  }
  return errors;
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function calculateScenario(m: ValuationModel, s: ValuationScenario): ScenarioResult | null {
  if (modelErrors({ ...m, scenarios: [s, s, s] }).length) return null;
  const fx = m.reportCurrency === m.quoteCurrency ? 1 : m.fx!;
  const dividends: number[] = [];
  let profit = m.baseProfit!, shares = m.shares!;
  for (let t = 1; t <= m.years; t++) {
    profit *= 1 + s.growth / 100;
    shares *= 1 + s.shareChange / 100;
    dividends.push(profit / shares * s.payout / 100 * fx);
  }
  const terminalPrice = profit / shares * s.exitPe * fx;
  const valueAt = (rate: number) => dividends.reduce((sum, d, i) => sum + d / (1 + rate) ** (i + 1), 0) + terminalPrice / (1 + rate) ** m.years;
  const fairPrice = valueAt(m.requiredReturn / 100);
  let low = -0.999999, high = 1;
  while (valueAt(high) > m.price! && high < 1e18) high *= 2;
  for (let i = 0; i < 150; i++) {
    const mid = (low + high) / 2;
    if (valueAt(mid) > m.price!) low = mid; else high = mid;
  }
  return { terminalProfit: profit, terminalShares: shares, terminalMarketCap: profit * s.exitPe,
    terminalPrice, dividends, fairPrice, watchPrice: fairPrice * (1 - m.safetyMargin / 100), annualReturn: (low + high) / 2 };
}
export function impliedGrowth(m: ValuationModel, s: ValuationScenario): number | null {
  if (modelErrors(m).length) return null;
  const price = (growth: number) => calculateScenario(m, { ...s, growth })!.fairPrice;
  if (m.price! < price(-95) || m.price! > price(100)) return null;
  let low = -95, high = 100;
  for (let i = 0; i < 70; i++) { const mid = (low + high) / 2; if (price(mid) < m.price!) low = mid; else high = mid; }
  return (low + high) / 2;
}
