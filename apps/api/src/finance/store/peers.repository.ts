import { createHash } from 'node:crypto';
import type {
  Market,
  PeerComparison,
  PeerMetricComparison,
  PeerMetricSeries
} from '../types';
import { CompanyStoreRepository } from './company.repository';
import {
  fromSqliteDate,
  makeDisplaySymbol,
  normalizeSymbol,
  toSqliteDate,
  withoutPeerCache
} from './finance-store.utils';
import { SqliteRepository } from './sqlite.repository';
import {
  calculatePeerMetricRows,
  peerMetricDependencies,
  type StoredPeerMetricRow
} from './peer-metric-calculations';

export class PeerStoreRepository extends SqliteRepository {
  constructor(db: any, private readonly companies: CompanyStoreRepository) {
    super(db);
  }

  getPeerComparison(market: Market, symbol: string, refreshedAfter: Date): PeerComparison | null {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const row = this.db
      .prepare(
        `
        SELECT payload_json, refreshed_at
        FROM peer_comparison_cache
        WHERE market = ?
          AND symbol = ?
          AND refreshed_at >= ?
        LIMIT 1
      `
      )
      .get(market, normalizedSymbol, toSqliteDate(refreshedAfter));

    if (!row?.payload_json) {
      return null;
    }

    const payload = JSON.parse(row.payload_json) as PeerComparison;
    return {
      ...payload,
      cache: {
        hit: true,
        refreshedAt: fromSqliteDate(row.refreshed_at)
      }
    };
  }

  savePeerComparison(payload: PeerComparison): void {
    const market = payload.company.market;
    const symbol = normalizeSymbol(market, payload.company.symbol);
    const displaySymbol = payload.company.displaySymbol || makeDisplaySymbol(market, symbol);
    const payloadForStorage = withoutPeerCache(payload);
    const payloadJson = JSON.stringify(payloadForStorage);
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex');

    this.withTransaction(() => {
      this.companies.upsertCompanies([
        {
          market,
          symbol,
          displaySymbol,
          name: payload.company.name ?? displaySymbol,
          source: payload.source,
          latestPrice: null,
          changePercent: null
        },
        ...payload.peers
      ]);

      this.db
        .prepare(
          `
          INSERT INTO peer_comparison_cache (
            market, symbol, display_symbol, company_name, industry_name, industry_source,
            source, fetched_at, peer_count, payload_json, payload_hash, created_at, refreshed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(market, symbol) DO UPDATE SET
            display_symbol = excluded.display_symbol,
            company_name = excluded.company_name,
            industry_name = excluded.industry_name,
            industry_source = excluded.industry_source,
            source = excluded.source,
            fetched_at = excluded.fetched_at,
            peer_count = excluded.peer_count,
            payload_json = excluded.payload_json,
            payload_hash = excluded.payload_hash,
            refreshed_at = datetime('now')
        `
        )
        .run(
          market,
          symbol,
          displaySymbol,
          payload.company.name ?? null,
          payload.industry?.name ?? null,
          payload.industry?.source ?? null,
          payload.source,
          payload.fetchedAt,
          payload.peers.length,
          payloadJson,
          payloadHash
        );
    });
  }

  getPeerMetricComparison(peerComparison: PeerComparison, metricKey: string, limit: number): PeerMetricComparison {
    const safeLimit = Math.max(5, Math.min(limit, 20));
    const peers = peerComparison.peers.slice(0, safeLimit);
    const companies = peers.map((peer) => ({
      ...peer,
      symbol: normalizeSymbol(peer.market, peer.symbol)
    }));
    return this.getMetricComparison(companies, metricKey);
  }

  getMetricComparison(
    companies: Array<{
      market: Market;
      symbol: string;
      displaySymbol: string;
      name: string;
      isSelected?: boolean;
    }>,
    metricKey: string
  ): PeerMetricComparison {
    const normalizedCompanies = companies.map((company) => ({
      ...company,
      symbol: normalizeSymbol(company.market, company.symbol)
    }));
    const metricKeys = peerMetricDependencies(metricKey);
    const placeholders = metricKeys.map(() => '?').join(', ');
    const storedRows = this.db
      .prepare(
        `
        SELECT
          market,
          symbol,
          display_symbol,
          name,
          metric_key,
          metric_label,
          year,
          value_num
        FROM (
          SELECT
            m.market,
            m.symbol,
            COALESCE(c.display_symbol, m.symbol) AS display_symbol,
            COALESCE(c.name, m.symbol) AS name,
            m.metric_key,
            m.metric_label,
            m.year,
            m.value_num
          FROM financial_metric_values m
          LEFT JOIN companies c
            ON c.market = m.market
           AND c.symbol = m.symbol
          WHERE m.metric_key IN (${placeholders})
        )
        ORDER BY year ASC
      `
      )
      .all(...metricKeys) as StoredPeerMetricRow[];
    const metricRows = calculatePeerMetricRows(storedRows, metricKey);

    const allowed = new Set(normalizedCompanies.map((company) => `${company.market}:${company.symbol}`));
    const byCompany = new Map<string, PeerMetricSeries>();
    const years = new Set<string>();
    let metricLabel = metricKey;

    for (const row of metricRows) {
      const key = `${row.market}:${row.symbol}`;
      if (!allowed.has(key)) continue;
      metricLabel = row.metric_label || metricLabel;
      years.add(String(row.year));
      if (!byCompany.has(key)) {
        const peer = normalizedCompanies.find((company) => `${company.market}:${company.symbol}` === key)!;
        byCompany.set(key, {
          market: row.market,
          symbol: row.symbol,
          displaySymbol: row.display_symbol,
          name: row.name,
          points: [],
          cached: true,
          isSelected: peer.isSelected
        });
      }
      byCompany.get(key)!.points.push({
        year: String(row.year),
        value: row.value_num === null || row.value_num === undefined ? null : Number(row.value_num)
      });
    }

    const sortedYears = [...years].sort();
    const series = normalizedCompanies
      .map((company) => {
        const key = `${company.market}:${company.symbol}`;
        const cached = byCompany.get(key);
        if (!cached) return null;
        const pointMap = new Map(cached.points.map((point) => [point.year, point.value]));
        return {
          ...cached,
          points: sortedYears.map((year) => ({ year, value: pointMap.get(year) ?? null }))
        };
      })
      .filter((company): company is PeerMetricSeries => Boolean(company));

    const cachedKeys = new Set(series.map((company) => `${company.market}:${company.symbol}`));
    return {
      metricKey,
      metricLabel,
      years: sortedYears,
      companies: series,
      missingCompanies: normalizedCompanies
        .filter((company) => !cachedKeys.has(`${company.market}:${company.symbol}`))
        .map((company) => ({
          market: company.market,
          symbol: company.symbol,
          displaySymbol: company.displaySymbol,
          name: company.name
        }))
    };
  }
}
