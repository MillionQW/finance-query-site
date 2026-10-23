import type { CompanyPeHistory, CompanyValuation } from './company-valuation.types';

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

function positivePe(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function yearsBefore(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year - years, month, 0)).getUTCDate();
  return new Date(Date.UTC(year - years, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function calculateCompanyValuation(history: CompanyPeHistory): CompanyValuation {
  // One observation per date; the provider's last record wins, including missing PE.
  const byDate = new Map(history.points.filter(p => validDate(p.date)).map(p => [p.date, p]));
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const latest = points.at(-1);
  const currentPe = latest && positivePe(latest.pe) ? latest.pe : null;
  const dataDate = latest?.date ?? null;
  return {
    market: history.market, symbol: history.symbol, currentPe, dataDate,
    history: points
      .filter(p => dataDate && p.date >= yearsBefore(dataDate, 10))
      .map(p => ({ date: p.date, pe: positivePe(p.pe) ? p.pe : null })),
    fetchedAt: history.fetchedAt, source: history.source,
    cache: { hit: false, stale: false },
    unavailableReason: !latest ? '暂无有效日期的 PE（TTM）历史数据'
      : currentPe === null ? '最新 PE（TTM）缺失或非正值，暂不计算历史分位' : null,
    windows: [3, 5, 10].map(years => {
      const startDate = dataDate ? yearsBefore(dataDate, years) : '';
      const sample = points.filter(p => p.date >= startDate && positivePe(p.pe));
      const sortedPe = sample.map(p => p.pe!).sort((a, b) => a - b);
      // Linear interpolation at (n - 1) * p, equivalent to PERCENTILE.INC.
      const referenceLevels = ([20, 50, 80] as const).map(level => {
        const index = (sortedPe.length - 1) * level / 100;
        const lower = Math.floor(index);
        const pe = sortedPe.length < 2 ? null
          : sortedPe[lower] + (sortedPe[Math.ceil(index)] - sortedPe[lower]) * (index - lower);
        return { percentile: level, pe };
      });
      // Empirical CDF: proportion of valid observations <= latest PE, including latest.
      const percentile = currentPe !== null && sample.length >= 2
        ? Math.round(sample.filter(p => p.pe! <= currentPe).length / sample.length * 10000) / 100
        : null;
      return {
        years, percentile, referenceLevels, sampleCount: sample.length, startDate,
        firstSampleDate: sample[0]?.date ?? null,
        lastSampleDate: sample.at(-1)?.date ?? null,
        historyComplete: Boolean(dataDate && points[0].date <= startDate)
      };
    })
  };
}
