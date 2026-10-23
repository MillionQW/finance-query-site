import type { FinancialStatements, Market, PeerComparison, ScreenerResult } from '../types';

export function normalizeSymbol(market: Market, symbol: string): string {
  const digits = symbol.replace(/\D/g, '');
  if (market === 'hk') {
    return digits.padStart(5, '0');
  }
  return digits;
}

export function makeDisplaySymbol(market: Market, symbol: string): string {
  if (market === 'hk') {
    return `${symbol}.HK`;
  }
  if (symbol.startsWith('6')) {
    return `${symbol}.SH`;
  }
  if (symbol.startsWith('4') || symbol.startsWith('8') || symbol.startsWith('9')) {
    return `${symbol}.BJ`;
  }
  return `${symbol}.SZ`;
}

export function toSqliteDate(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

export function fromSqliteDate(value: string): string {
  return value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
}

export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function withoutStatementCache(payload: FinancialStatements): FinancialStatements {
  const {
    cache: _cache,
    quality: _quality,
    revision: _revision,
    version: _version,
    ...rest
  } = payload;
  return rest;
}

export function mergePartialStatements(
  cached: FinancialStatements,
  incoming: FinancialStatements
): FinancialStatements {
  const years = [...new Set([...cached.years, ...incoming.years])].sort((a, b) => b.localeCompare(a));
  const tables = incoming.tables.map((incomingTable) => {
    const cachedTable = cached.tables.find((table) => table.type === incomingTable.type);
    if (!cachedTable) return incomingTable;
    const rows = new Map(
      cachedTable.rows.map((row) => [row.sourceItem || row.item, { ...row, values: { ...row.values } }])
    );
    for (const row of incomingTable.rows) {
      const key = row.sourceItem || row.item;
      const previous = rows.get(key);
      rows.set(key, {
        ...previous,
        ...row,
        values: { ...previous?.values, ...row.values }
      });
    }
    return {
      ...incomingTable,
      years: [...new Set([...cachedTable.years, ...incomingTable.years])].sort((a, b) => b.localeCompare(a)),
      rows: [...rows.values()]
    };
  });
  const reportPeriods = [
    ...(incoming.reportPeriods ?? []),
    ...(cached.reportPeriods ?? []).filter(
      (cachedPeriod) => !(incoming.reportPeriods ?? []).some((period) => period.key === cachedPeriod.key)
    )
  ].sort((a, b) => b.key.localeCompare(a.key));
  const periodTables = (incoming.periodTables ?? []).map((incomingTable) => {
    const cachedTable = cached.periodTables?.find((table) => table.type === incomingTable.type);
    if (!cachedTable) return incomingTable;
    const rows = new Map(
      cachedTable.rows.map((row) => [row.sourceItem || row.item, { ...row, values: { ...row.values } }])
    );
    for (const row of incomingTable.rows) {
      const key = row.sourceItem || row.item;
      const previous = rows.get(key);
      rows.set(key, {
        ...previous,
        ...row,
        values: { ...previous?.values, ...row.values }
      });
    }
    return {
      ...incomingTable,
      periods: [...new Set([...cachedTable.periods, ...incomingTable.periods])]
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 20),
      periodStarts: { ...cachedTable.periodStarts, ...incomingTable.periodStarts },
      rows: [...rows.values()]
    };
  });

  return {
    ...incoming,
    company: {
      ...incoming.company,
      name: incoming.company.name || cached.company.name
    },
    years,
    tables,
    reportPeriods: reportPeriods.slice(0, 20),
    periodTables,
    periodHighlights: incoming.periodHighlights ?? cached.periodHighlights,
    ttmHighlights: incoming.ttmHighlights ?? cached.ttmHighlights,
    fetchWarnings: [...new Set([...(cached.fetchWarnings ?? []), ...(incoming.fetchWarnings ?? [])])]
  };
}

export function withoutPeerCache(payload: PeerComparison): PeerComparison {
  const { cache: _cache, ...rest } = payload;
  return rest;
}

export function withoutScreenerCache(payload: ScreenerResult): ScreenerResult {
  const { cache: _cache, ...rest } = payload;
  return rest;
}
