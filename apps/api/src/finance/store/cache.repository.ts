import { createHash } from 'node:crypto';
import type {
  CacheEntry,
  ScreenerResult
} from '../types';
import {
  fromSqliteDate,
  toSqliteDate,
  withoutScreenerCache
} from './finance-store.utils';
import { SqliteRepository } from './sqlite.repository';

export class CacheStoreRepository extends SqliteRepository {
  constructor(db: any, private readonly dbPath: string) {
    super(db);
  }

  getScreenerCache(cacheKey: string, refreshedAfter: Date): ScreenerResult | null {
    const row = this.db.prepare(`
      SELECT payload_json, refreshed_at, expires_at
      FROM screener_cache
      WHERE cache_key = ? AND refreshed_at >= ?
      LIMIT 1
    `).get(cacheKey, toSqliteDate(refreshedAfter));
    if (!row?.payload_json) {
      return null;
    }

    const payload = JSON.parse(row.payload_json) as ScreenerResult;
    return {
      ...payload,
      cache: {
        hit: true,
        refreshedAt: fromSqliteDate(row.refreshed_at),
        expiresAt: fromSqliteDate(row.expires_at)
      }
    };
  }

  saveScreenerCache(cacheKey: string, paramsJson: string, payload: ScreenerResult, ttlDays: number): ScreenerResult {
    const payloadForStorage = withoutScreenerCache(payload);
    const payloadJson = JSON.stringify(payloadForStorage);
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    this.db.prepare(`
      INSERT INTO screener_cache (
        cache_key, params_json, source, fetched_at, payload_json, payload_hash,
        created_at, refreshed_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        params_json = excluded.params_json,
        source = excluded.source,
        fetched_at = excluded.fetched_at,
        payload_json = excluded.payload_json,
        payload_hash = excluded.payload_hash,
        refreshed_at = datetime('now'),
        expires_at = excluded.expires_at
    `).run(
      cacheKey,
      paramsJson,
      payloadForStorage.source,
      payloadForStorage.fetchedAt,
      payloadJson,
      payloadHash,
      toSqliteDate(expiresAt)
    );

    return {
      ...payloadForStorage,
      cache: {
        hit: false,
        refreshedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      }
    };
  }

  getStats() {
    const companies = this.db.prepare('SELECT COUNT(*) AS count FROM companies').get().count;
    const favorites = this.db.prepare('SELECT COUNT(*) AS count FROM favorite_companies').get().count;
    const snapshots = this.db.prepare('SELECT COUNT(*) AS count FROM financial_statement_cache').get().count;
    const peerComparisons = this.db.prepare('SELECT COUNT(*) AS count FROM peer_comparison_cache').get().count;
    const screeners = this.db.prepare('SELECT COUNT(*) AS count FROM screener_cache').get().count;
    const values = this.db.prepare('SELECT COUNT(*) AS count FROM financial_statement_values').get().count;
    const metrics = this.db.prepare('SELECT COUNT(*) AS count FROM financial_metric_values').get().count;
    return {
      dbPath: this.dbPath,
      companies,
      favorites,
      statementSnapshots: snapshots,
      peerComparisons,
      screeners,
      statementValues: values,
      metricValues: metrics
    };
  }

  listCacheEntries(): CacheEntry[] {
    const statementRows = this.db
      .prepare(
        `
        SELECT
          'statements' AS kind,
          market,
          symbol,
          display_symbol,
          company_name AS name,
          years_requested,
          NULL AS peer_count,
          refreshed_at,
          source,
          length(payload_json) AS payload_bytes
        FROM financial_statement_cache

        UNION ALL

        SELECT
          'peers' AS kind,
          market,
          symbol,
          display_symbol,
          company_name AS name,
          NULL AS years_requested,
          peer_count,
          refreshed_at,
          source,
          length(payload_json) AS payload_bytes
        FROM peer_comparison_cache
        ORDER BY refreshed_at DESC
      `
      )
      .all();

    return statementRows.map((row: any) => ({
      kind: row.kind,
      market: row.market,
      symbol: row.symbol,
      displaySymbol: row.display_symbol,
      name: row.name,
      years: row.years_requested === null || row.years_requested === undefined ? null : Number(row.years_requested),
      peerCount: row.peer_count === null || row.peer_count === undefined ? null : Number(row.peer_count),
      refreshedAt: fromSqliteDate(row.refreshed_at),
      source: row.source,
      payloadBytes: Number(row.payload_bytes ?? 0)
    }));
  }
}
