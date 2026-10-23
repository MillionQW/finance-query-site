import type { FinancialStatements, PeriodStatementTable, StatementTable } from '../types/finance';
import { rowValue, safeDivide } from './financial-metric-engine';
import { REVENUE_ALIASES, TOTAL_OPERATING_REVENUE_ALIASES, DEDUCTED_NET_PROFIT_ALIASES,
  OPERATING_CASHFLOW_ALIASES, GROSS_PROFIT_ALIASES, OPERATING_COST_ALIASES,
  SELLING_EXPENSE_ALIASES, ADMIN_EXPENSE_ALIASES, RESEARCH_EXPENSE_ALIASES,
  FINANCE_EXPENSE_ALIASES } from './financial-metric-fields';

// Consolidated net profit is deliberately not a fallback for parent earnings.
export const PARENT_PROFIT = ['归属于母公司股东的净利润', '归母净利润', '股东应占溢利', '股东应占盈利', 'PARENT NETPROFIT'];
export interface OperatingPeriod {
  end: string; start: string; months: 3 | 6; label: string;
  revenue: number | null; profit: number | null; deductedProfit: number | null; cash: number | null;
  grossMargin: number | null; netMargin: number | null; expenseRatio: number | null;
  revenueYoY: number | null; profitYoY: number | null; deductedYoY: number | null; cashYoY: number | null;
  grossMarginChange: number | null; netMarginChange: number | null; expenseRatioChange: number | null;
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dateOf = (date: string) => new Date(`${date}T00:00:00Z`);
function monthStart(end: string, months: number): string {
  const date = dateOf(end);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1 - months, 1)));
}
function previousDay(date: string): string { return iso(new Date(dateOf(date).getTime() - 86400000)); }
function priorYear(date: string): string {
  const d = dateOf(date);
  const y = d.getUTCFullYear() - 1, m = d.getUTCMonth();
  return iso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))));
}
function startOf(table: PeriodStatementTable | undefined, end: string, market: string): string | null {
  return table?.periodStarts?.[end] ?? (market === 'a' ? `${end.slice(0, 4)}-01-01` : null);
}
function asTable(table: PeriodStatementTable): StatementTable { return { ...table, years: table.periods }; }
function amount(table: PeriodStatementTable | undefined, end: string, aliases: string[]): number | null {
  return table ? rowValue(asTable(table), end, aliases) : null;
}
function standalone(table: PeriodStatementTable | undefined, end: string, start: string, aliases: string[], market: string): number | null {
  const fiscalStart = startOf(table, end, market);
  const current = amount(table, end, aliases);
  if (!fiscalStart || current === null || fiscalStart > start) return null;
  if (fiscalStart === start) return current;
  const prev = previousDay(start);
  if (startOf(table, prev, market) !== fiscalStart) return null;
  const previous = amount(table, prev, aliases);
  return previous === null ? null : current - previous;
}
export function comparableGrowth(current: number | null, previous: number | null): number | null {
  // Loss-to-profit/negative bases are explained separately, never labeled ordinary growth.
  return current === null || previous === null || previous <= 0 ? null : current / previous - 1;
}

export function buildOperatingPeriods(statements: FinancialStatements | null): OperatingPeriod[] {
  if (!statements) return [];
  const income = statements.periodTables?.find(t => t.type === 'income');
  const cashflow = statements.periodTables?.find(t => t.type === 'cashflow');
  const market = statements.company.market;
  if (!income) return [];
  const ends = [...income.periods].sort().reverse();
  const rows: OperatingPeriod[] = [];
  for (const end of ends) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(dateOf(end).getTime())) continue;
    const fiscalStart = startOf(income, end, market);
    if (!fiscalStart || !fiscalStart.endsWith('-01')) continue;
    const e = dateOf(end), s = dateOf(fiscalStart);
    if (e.getUTCDate() !== new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate()) continue;
    const duration = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth() + 1;
    if (![3, 6, 9, 12].includes(duration)) continue;
    const hasQuarter = market === 'a' || ends.some(other => {
      const otherStart = startOf(income, other, market);
      if (otherStart !== fiscalStart) return false;
      const o = dateOf(other);
      const n = (o.getUTCFullYear() - s.getUTCFullYear()) * 12 + o.getUTCMonth() - s.getUTCMonth() + 1;
      return n === 3 || n === 9;
    });
    const months: 3 | 6 = hasQuarter ? 3 : 6;
    const start = monthStart(end, months);
    const read = (aliases: string[], table = income) => standalone(table, end, start, aliases, market);
    const revenue = read(REVENUE_ALIASES) ?? read(TOTAL_OPERATING_REVENUE_ALIASES);
    const profit = read(PARENT_PROFIT);
    const gross = read(GROSS_PROFIT_ALIASES);
    // Expense signs may differ by market; take absolute only AFTER differencing cumulative amounts.
    const cost = read(OPERATING_COST_ALIASES);
    const expenses = [SELLING_EXPENSE_ALIASES, ADMIN_EXPENSE_ALIASES, RESEARCH_EXPENSE_ALIASES, FINANCE_EXPENSE_ALIASES].map(a => read(a));
    const expenseTotal = expenses.every(v => v !== null) ? expenses.reduce<number>((a, v) => a + v!, 0) : null;
    rows.push({ end, start, months, label: `${start}—${end}（${months === 3 ? '单季' : '半年'}）`,
      revenue, profit, deductedProfit: read(DEDUCTED_NET_PROFIT_ALIASES),
      cash: standalone(cashflow, end, start, OPERATING_CASHFLOW_ALIASES, market),
      grossMargin: revenue !== null && revenue > 0 ? safeDivide(gross ?? (cost === null ? null : revenue - Math.abs(cost)), revenue) : null,
      netMargin: revenue !== null && revenue > 0 ? safeDivide(profit, revenue) : null,
      expenseRatio: market === 'a' && revenue !== null && revenue > 0 ? safeDivide(expenseTotal, revenue) : null,
      revenueYoY: null, profitYoY: null, deductedYoY: null, cashYoY: null,
      grossMarginChange: null, netMarginChange: null, expenseRatioChange: null });
  }
  for (const row of rows) {
    const previous = rows.find(p => p.end === priorYear(row.end) && p.start === priorYear(row.start) && p.months === row.months);
    if (!previous) continue;
    row.revenueYoY = comparableGrowth(row.revenue, previous.revenue);
    row.profitYoY = comparableGrowth(row.profit, previous.profit);
    row.deductedYoY = comparableGrowth(row.deductedProfit, previous.deductedProfit);
    row.cashYoY = comparableGrowth(row.cash, previous.cash);
    for (const [metric, change] of [['grossMargin', 'grossMarginChange'], ['netMargin', 'netMarginChange'], ['expenseRatio', 'expenseRatioChange']] as const) {
      row[change] = row[metric] !== null && previous[metric] !== null ? row[metric]! - previous[metric]! : null;
    }
  }
  return rows.slice(0, 12);
}

export function operatingSignals(rows: OperatingPeriod[]): string[] {
  const r = rows[0];
  if (!r) return [];
  const signals: string[] = [];
  if (r.revenueYoY !== null) signals.push(`收入同比${r.revenueYoY >= 0 ? '增长' : '下降'} ${Math.abs(r.revenueYoY * 100).toFixed(1)}%。`);
  if (r.profitYoY !== null) signals.push(`归母利润同比${r.profitYoY >= 0 ? '增长' : '下降'} ${Math.abs(r.profitYoY * 100).toFixed(1)}%。`);
  if (r.grossMarginChange !== null) signals.push(`毛利率同比${r.grossMarginChange >= 0 ? '上升' : '下降'} ${Math.abs(r.grossMarginChange * 100).toFixed(2)} 个百分点；需核对售价、成本与业务结构。`);
  if (r.profit !== null && r.profit > 0 && r.cash !== null && r.cash < 0) signals.push('本期盈利但经营现金净流出，需检查回款、存货及季节性。');
  else if (r.profitYoY !== null && r.profitYoY > 0 && r.cashYoY !== null && r.cashYoY < 0) signals.push('利润增长与经营现金流下降背离，需结合营运资本核查。');
  if (r.expenseRatioChange !== null) signals.push(`期间费用率同比变化 ${(r.expenseRatioChange * 100).toFixed(2)} 个百分点。`);
  return signals.slice(0, 5);
}
