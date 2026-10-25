import type { PerformanceEntry, PerformanceResult } from './performance.types';

const day = (at: string) => Date.parse(at.slice(0, 10) + 'T00:00:00Z') / 86400000;

// Investor-perspective flows. Solve in log(1+r) space with scaled exponentials.
// Multiple detected roots or a root outside the bounded search are not reported.
export function calculateXirr(flows: Array<{ at: string; amount: number }>): { value: number | null; reason: string | null } {
  const grouped = new Map<number, number>();
  for (const f of flows) grouped.set(day(f.at), (grouped.get(day(f.at)) ?? 0) + f.amount);
  const dates = [...grouped.keys()].sort((a, b) => a - b);
  if (dates.length < 2 || dates.at(-1)! <= dates[0]) return { value: null, reason: '记录不足一天，暂不计算年化收益率' };
  const points = dates.map(d => ({ t: (d - dates[0]) / 365, value: grouped.get(d)! })).filter(p => p.value !== 0);
  if (!points.some(p => p.value > 0)) return { value: null, reason: '缺少正向回收现金流，XIRR无法求解' };
  if (!points.some(p => p.value < 0)) return { value: null, reason: '缺少投入现金流，XIRR无法求解' };
  const scale = Math.max(...points.map(p => Math.abs(p.value)));
  const f = (y: number) => {
    const maxExp = Math.max(...points.map(p => -y * p.t));
    return points.reduce((sum, p) => sum + p.value / scale * Math.exp(-y * p.t - maxExp), 0);
  };
  const roots: number[] = [];
  const add = (root: number) => { if (!roots.some(r => Math.abs(r - root) < 1e-6)) roots.push(root); };
  let left = -30, leftValue = f(left);
  for (let i = 1; i <= 1200; i++) {
    const right = -30 + i * .05, rightValue = f(right);
    if (rightValue === 0) add(right);
    if (leftValue * rightValue < 0) {
      let lo = left, hi = right, flo = leftValue;
      for (let j = 0; j < 100; j++) {
        const mid = (lo + hi) / 2, fm = f(mid);
        if (fm === 0) { lo = hi = mid; break; }
        if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
      }
      add((lo + hi) / 2);
    }
    left = right; leftValue = rightValue;
  }
  if (roots.length !== 1) return { value: null, reason: roots.length > 1 ? '现金流存在多个XIRR解，无法给出唯一收益率' : 'XIRR未找到可靠解，请核对现金流' };
  const value = Math.expm1(roots[0]);
  return Number.isFinite(value) && Math.abs(f(roots[0])) < 1e-8 ? { value, reason: null } : { value: null, reason: 'XIRR数值未收敛' };
}

export function calculatePerformance(entries: PerformanceEntry[]): PerformanceResult {
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const initial = sorted[0];
  const empty: PerformanceResult = { asOf: null, initialValue: null, endingValue: null, netContributions: 0, profit: null,
    nav: null, twr: null, twrReason: '请先填写起始账户净资产', xirr: null, xirrReason: '请先填写起始账户净资产', days: 0 };
  if (!initial || initial.kind !== 'initial') return empty;
  let units = initial.amount, nav = 1, ending: number | null = initial.amount, net = 0;
  let reason: string | null = null;
  const flows = [{ at: initial.at, amount: -initial.amount }];
  for (const e of sorted.slice(1)) {
    if (e.kind === 'snapshot') {
      ending = e.amount;
      if (!reason && units > 0) nav = ending / units;
      else if (!reason && ending !== 0) reason = '份额已归零但账户仍有资产，请核对快照和流水';
      continue;
    }
    const change = e.amount * e.fx * (e.kind === 'deposit' ? 1 : -1);
    net += change;
    flows.push({ at: e.at, amount: -change });
    ending = e.beforeValue === null ? null : Math.max(0, e.beforeValue + change);
    if (e.beforeValue === null) { reason ??= '有出入金缺少转账前账户净资产，补齐后才能计算基金净值'; continue; }
    if (reason) continue;
    if (units > 0) nav = e.beforeValue / units;
    else if (e.beforeValue !== 0) { reason = '份额已归零但转账前仍有资产，请核对流水'; continue; }
    if (nav <= 0) { reason = '净值已归零后发生出入金，当前份额法无法继续计算'; continue; }
    units += change / nav;
    if (Math.abs(units) < 1e-8) units = 0;
  }
  const last = sorted.at(-1)!;
  let irr = ending === null ? { value: null, reason: '最新出入金缺少转账前资产，请补录或新增之后的资产快照' }
    : calculateXirr([...flows, { at: last.at, amount: ending }]);
  if (ending === 0 && flows.every(f => f.amount <= 0) && day(last.at) > day(initial.at)) irr = { value: -1, reason: null };
  return { asOf: last.at, initialValue: initial.amount, endingValue: ending, netContributions: net,
    profit: ending === null ? null : ending - initial.amount - net, nav: reason ? null : nav,
    twr: reason ? null : nav - 1, twrReason: reason, xirr: irr.value, xirrReason: irr.reason, days: day(last.at) - day(initial.at) };
}
