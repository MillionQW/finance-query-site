import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize, resolve } from 'node:path';
import {
  CompanySearchResult,
  AnnouncementFeed,
  AnnouncementRefreshTarget,
  CompanyAnnouncement,
  CacheEntry,
  FavoriteCompany,
  FinancialStatements,
  Market,
  PeerComparison,
  PeerMetricComparison,
  PeerMetricSeries,
  StatementRefreshError,
  StatementRefreshRun,
  StatementRefreshStatus,
  StatementRefreshTarget,
  StatementRefreshTrigger
} from './types';
import { EtfHistoryPayload, EtfHistoryPoint, EtfQuote, EtfValuation, FavoriteEtf } from './etf.types';

const nodeRequire = createRequire(__filename);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (path: string) => any;
};

@Injectable()
export class FinanceStoreService implements OnModuleDestroy {
  private readonly dbPath = this.resolveDbPath();
  private readonly db: any;

  constructor() {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.initializeSchema();
    this.markInterruptedRefreshRuns();
  }

  onModuleDestroy() {
    this.db.close();
  }

  findCompanies(query: string, market: 'all' | Market): CompanySearchResult[] {
    const normalizedQuery = `%${query.trim()}%`;
    if (!query.trim()) {
      return [];
    }

    const rows = this.db
      .prepare(
        `
        SELECT market, symbol, display_symbol, name, source, latest_price, change_percent
        FROM companies
        WHERE (:market = 'all' OR market = :market)
          AND (
            symbol LIKE :query
            OR display_symbol LIKE :query
            OR name LIKE :query
          )
        ORDER BY updated_at DESC, market ASC, symbol ASC
        LIMIT 30
      `
      )
      .all({ market, query: normalizedQuery });

    return rows.map((row: any) => this.toCompany(row));
  }

  upsertCompanies(companies: CompanySearchResult[]): void {
    if (!companies.length) {
      return;
    }

    const statement = this.db.prepare(
      `
      INSERT INTO companies (
        market, symbol, display_symbol, name, source, latest_price, change_percent, first_seen_at, updated_at
      )
      VALUES (:market, :symbol, :displaySymbol, :name, :source, :latestPrice, :changePercent, datetime('now'), datetime('now'))
      ON CONFLICT(market, symbol) DO UPDATE SET
        display_symbol = excluded.display_symbol,
        name = excluded.name,
        source = excluded.source,
        latest_price = excluded.latest_price,
        change_percent = excluded.change_percent,
        updated_at = datetime('now')
    `
    );

    this.withTransaction(() => {
      for (const company of companies) {
        const normalized = this.normalizeCompany(company);
        statement.run({
          market: normalized.market,
          symbol: normalized.symbol,
          displaySymbol: normalized.displaySymbol,
          name: normalized.name,
          source: normalized.source,
          latestPrice: normalized.latestPrice ?? null,
          changePercent: normalized.changePercent ?? null
        });
      }
    });
  }

  getFavorites(): FavoriteCompany[] {
    const rows = this.db
      .prepare(
        `
        SELECT f.market, f.symbol, f.display_symbol, f.name, f.source, f.latest_price, f.change_percent,
               f.favorited_at, f.updated_at,
               (
                 SELECT COUNT(*)
                 FROM company_announcements a
                 WHERE a.market = f.market
                   AND a.symbol = f.symbol
                   AND a.discovered_at > COALESCE(f.announcement_viewed_at, f.favorited_at)
               ) AS unread_announcement_count
        FROM favorite_companies f
        ORDER BY pinned_order DESC, favorited_at DESC
      `
      )
      .all();

    return rows.map((row: any) => this.toFavoriteCompany(row));
  }

  saveFavorite(company: CompanySearchResult): FavoriteCompany[] {
    const normalized = this.normalizeCompany({
      ...company,
      source: company.source || 'favorite'
    });

    this.withTransaction(() => {
      this.upsertCompanies([normalized]);
      this.db
        .prepare(
          `
          INSERT INTO favorite_companies (
            market, symbol, display_symbol, name, source, latest_price, change_percent,
            pinned_order, favorited_at, updated_at, announcement_viewed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), datetime('now'))
          ON CONFLICT(market, symbol) DO UPDATE SET
            display_symbol = excluded.display_symbol,
            name = excluded.name,
            source = excluded.source,
            latest_price = excluded.latest_price,
            change_percent = excluded.change_percent,
            updated_at = datetime('now')
        `
        )
        .run(
          normalized.market,
          normalized.symbol,
          normalized.displaySymbol,
          normalized.name,
          normalized.source,
          normalized.latestPrice ?? null,
          normalized.changePercent ?? null
        );
    });

    return this.getFavorites();
  }

  removeFavorite(market: Market, symbol: string): FavoriteCompany[] {
    this.db
      .prepare(
        `
        DELETE FROM favorite_companies
        WHERE market = ? AND symbol = ?
      `
      )
      .run(market, normalizeSymbol(market, symbol));

    return this.getFavorites();
  }

  listAnnouncementRefreshTargets(staleBefore: Date, limit: number): AnnouncementRefreshTarget[] {
    const rows = this.db.prepare(`
      SELECT f.market, f.symbol, f.display_symbol, f.name, f.source,
             f.latest_price, f.change_percent, s.last_refreshed_at
      FROM favorite_companies f
      LEFT JOIN announcement_refresh_state s
        ON s.market = f.market AND s.symbol = f.symbol
      WHERE s.last_refreshed_at IS NULL OR s.last_refreshed_at <= ?
      ORDER BY COALESCE(s.last_refreshed_at, '1970-01-01') ASC, f.favorited_at ASC
      LIMIT ?
    `).all(staleBefore.toISOString(), Math.max(1, limit));

    return rows.map((row: any) => ({
      ...this.toCompany(row),
      refreshedAt: row.last_refreshed_at ? fromSqliteDate(row.last_refreshed_at) : null
    }));
  }

  getAnnouncementFeed(market: Market, symbol: string, limit = 100): AnnouncementFeed {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const company = this.db.prepare(`
      SELECT market, symbol, display_symbol, name
      FROM companies
      WHERE market = ? AND symbol = ?
      LIMIT 1
    `).get(market, normalizedSymbol);
    const state = this.db.prepare(`
      SELECT last_refreshed_at
      FROM announcement_refresh_state
      WHERE market = ? AND symbol = ?
      LIMIT 1
    `).get(market, normalizedSymbol);
    const favorite = this.db.prepare(`
      SELECT announcement_viewed_at, favorited_at
      FROM favorite_companies
      WHERE market = ? AND symbol = ?
      LIMIT 1
    `).get(market, normalizedSymbol);
    const viewedAt = favorite?.announcement_viewed_at ?? favorite?.favorited_at ?? null;
    const rows = this.db.prepare(`
      SELECT announcement_key, market, symbol, display_symbol, company_name, title,
             category, published_at, url, source, discovered_at
      FROM company_announcements
      WHERE market = ? AND symbol = ?
      ORDER BY published_at DESC, id DESC
      LIMIT ?
    `).all(market, normalizedSymbol, Math.max(1, Math.min(limit, 200)));
    const items = rows.map((row: any) => this.toAnnouncement(row, viewedAt));
    return {
      company: {
        market,
        symbol: normalizedSymbol,
        displaySymbol: company?.display_symbol ?? makeDisplaySymbol(market, normalizedSymbol),
        name: company?.name ?? makeDisplaySymbol(market, normalizedSymbol)
      },
      items,
      refreshedAt: state?.last_refreshed_at ? fromSqliteDate(state.last_refreshed_at) : null,
      unreadCount: items.filter((item: CompanyAnnouncement) => item.isUnread).length,
      source: 'AKShare CNInfo disclosure API'
    };
  }

  saveAnnouncements(target: CompanySearchResult, items: CompanyAnnouncement[]): void {
    const normalized = this.normalizeCompany(target);
    const existingState = this.db.prepare(`
      SELECT last_error FROM announcement_refresh_state WHERE market = ? AND symbol = ? LIMIT 1
    `).get(normalized.market, normalized.symbol);
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO company_announcements (
        announcement_key, market, symbol, display_symbol, company_name, title,
        category, published_at, url, source, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.withTransaction(() => {
      this.upsertCompanies([normalized]);
      for (const item of items) {
        insert.run(
          item.key,
          normalized.market,
          normalized.symbol,
          normalized.displaySymbol,
          item.companyName || normalized.name,
          item.title,
          item.category,
          item.publishedAt,
          item.url,
          item.source
        );
      }
      this.db.prepare(`
        INSERT INTO announcement_refresh_state (market, symbol, last_refreshed_at, last_error)
        VALUES (?, ?, datetime('now'), NULL)
        ON CONFLICT(market, symbol) DO UPDATE SET
          last_refreshed_at = datetime('now'),
          last_error = NULL
      `).run(normalized.market, normalized.symbol);
      if (!existingState || existingState.last_error) {
        this.db.prepare(`
          UPDATE favorite_companies
          SET announcement_viewed_at = datetime('now')
          WHERE market = ? AND symbol = ?
        `).run(normalized.market, normalized.symbol);
      }
    });
  }

  saveAnnouncementRefreshError(market: Market, symbol: string, message: string): void {
    this.db.prepare(`
      INSERT INTO announcement_refresh_state (market, symbol, last_refreshed_at, last_error)
      VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(market, symbol) DO UPDATE SET
        last_refreshed_at = datetime('now'),
        last_error = excluded.last_error
    `).run(market, normalizeSymbol(market, symbol), message.slice(0, 1000));
  }

  markAnnouncementsViewed(market: Market, symbol: string): FavoriteCompany[] {
    this.db.prepare(`
      UPDATE favorite_companies
      SET announcement_viewed_at = datetime('now')
      WHERE market = ? AND symbol = ?
    `).run(market, normalizeSymbol(market, symbol));
    return this.getFavorites();
  }

  getStatements(market: Market, symbol: string, years: number): FinancialStatements | null {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const row = this.db
      .prepare(
        `
        SELECT payload_json, refreshed_at
        FROM financial_statement_cache
        WHERE market = ? AND symbol = ? AND years_requested = ?
        LIMIT 1
      `
      )
      .get(market, normalizedSymbol, years);

    if (!row?.payload_json) {
      return null;
    }

    const payload = JSON.parse(row.payload_json) as FinancialStatements;
    if (!this.hasStatementSourceItems(payload)) {
      return null;
    }
    return {
      ...payload,
      cache: {
        hit: true,
        refreshedAt: fromSqliteDate(row.refreshed_at)
      }
    };
  }

  saveStatements(payload: FinancialStatements, yearsRequested: number): void {
    const market = payload.company.market;
    const symbol = normalizeSymbol(market, payload.company.symbol);
    if (payload.partial) {
      const cached = this.getStatements(market, symbol, yearsRequested);
      if (cached) {
        payload = mergePartialStatements(cached, payload);
      }
    }
    const displaySymbol = payload.company.displaySymbol || makeDisplaySymbol(market, symbol);
    const yearsKey = payload.years.join(',');
    const payloadForStorage = withoutStatementCache(payload);
    const payloadJson = JSON.stringify(payloadForStorage);
    const payloadHash = createHash('sha256').update(payloadJson).digest('hex');

    this.withTransaction(() => {
      this.upsertCompanies([
        {
          market,
          symbol,
          displaySymbol,
          name: payload.company.name ?? displaySymbol,
          source: payload.source,
          latestPrice: null,
          changePercent: null
        }
      ]);

      const existing = this.db
        .prepare(
          `
          SELECT id
          FROM financial_statement_cache
          WHERE market = ? AND symbol = ? AND years_requested = ?
          LIMIT 1
        `
        )
        .get(market, symbol, yearsRequested);

      let snapshotId: number;
      if (existing?.id) {
        snapshotId = Number(existing.id);
        this.db
          .prepare(
            `
            UPDATE financial_statement_cache
            SET display_symbol = ?, company_name = ?, years_key = ?, source = ?, fetched_at = ?,
                payload_json = ?, payload_hash = ?, refreshed_at = datetime('now')
            WHERE id = ?
          `
          )
          .run(
            displaySymbol,
            payload.company.name ?? null,
            yearsKey,
            payload.source,
            payload.fetchedAt,
            payloadJson,
            payloadHash,
            snapshotId
          );
      } else {
        const result = this.db
          .prepare(
            `
            INSERT INTO financial_statement_cache (
              market, symbol, display_symbol, company_name, years_requested, years_key,
              source, fetched_at, payload_json, payload_hash, created_at, refreshed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `
          )
          .run(
            market,
            symbol,
            displaySymbol,
            payload.company.name ?? null,
            yearsRequested,
            yearsKey,
            payload.source,
            payload.fetchedAt,
            payloadJson,
            payloadHash
          );
        snapshotId = Number(result.lastInsertRowid);
      }

      this.replaceStatementDetails(snapshotId, payload, yearsRequested);
    });
  }

  saveEtfQuotes(quotes: EtfQuote[]): void {
    if (!quotes.length) return;
    const statement = this.db.prepare(`
      INSERT INTO etfs (
        symbol, display_symbol, name, exchange, latest_price, iopv, premium_rate,
        change_amount, change_percent, volume, amount, open_price, high_price, low_price,
        previous_close, amplitude, turnover_rate, latest_shares, market_cap, data_date,
        quote_updated_at, source, first_seen_at, updated_at
      ) VALUES (
        :symbol, :displaySymbol, :name, :exchange, :latestPrice, :iopv, :premiumRate,
        :changeAmount, :changePercent, :volume, :amount, :open, :high, :low,
        :previousClose, :amplitude, :turnoverRate, :latestShares, :marketCap, :dataDate,
        :quoteUpdatedAt, :source, datetime('now'), datetime('now')
      )
      ON CONFLICT(symbol) DO UPDATE SET
        display_symbol = excluded.display_symbol,
        name = excluded.name,
        exchange = excluded.exchange,
        latest_price = excluded.latest_price,
        iopv = excluded.iopv,
        premium_rate = excluded.premium_rate,
        change_amount = excluded.change_amount,
        change_percent = excluded.change_percent,
        volume = excluded.volume,
        amount = excluded.amount,
        open_price = excluded.open_price,
        high_price = excluded.high_price,
        low_price = excluded.low_price,
        previous_close = excluded.previous_close,
        amplitude = excluded.amplitude,
        turnover_rate = excluded.turnover_rate,
        latest_shares = excluded.latest_shares,
        market_cap = excluded.market_cap,
        data_date = excluded.data_date,
        quote_updated_at = excluded.quote_updated_at,
        source = excluded.source,
        updated_at = datetime('now')
    `);

    this.withTransaction(() => {
      for (const quote of quotes) {
        statement.run(quote);
      }
      this.saveEtfRefreshState('market');
    });
  }

  listEtfQuotes(
    query: string,
    limit: number,
    sort: 'amount' | 'changePercent' | 'marketCap' | 'turnoverRate' | 'premiumRate' | 'symbol',
    order: 'asc' | 'desc',
    exchange: 'all' | 'sh' | 'sz'
  ): EtfQuote[] {
    const sortColumns = {
      amount: 'amount',
      changePercent: 'change_percent',
      marketCap: 'market_cap',
      turnoverRate: 'turnover_rate',
      premiumRate: 'premium_rate',
      symbol: 'symbol'
    } as const;
    const sortColumn = sortColumns[sort];
    const direction = order === 'asc' ? 'ASC' : 'DESC';
    const normalizedQuery = `%${query.trim()}%`;
    const rows = this.db.prepare(`
      SELECT *
      FROM etfs
      WHERE (:exchange = 'all' OR exchange = :exchange)
        AND (symbol LIKE :query OR display_symbol LIKE :query OR name LIKE :query)
      ORDER BY ${sortColumn} IS NULL ASC, ${sortColumn} ${direction}, symbol ASC
      LIMIT :limit
    `).all({ query: normalizedQuery, exchange, limit: Math.max(1, Math.min(limit, 200)) });
    return rows.map((row: any) => this.toEtfQuote(row));
  }

  countEtfQuotes(query: string, exchange: 'all' | 'sh' | 'sz' = 'all'): number {
    const normalizedQuery = `%${query.trim()}%`;
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM etfs
      WHERE (? = 'all' OR exchange = ?)
        AND (symbol LIKE ? OR display_symbol LIKE ? OR name LIKE ?)
    `).get(exchange, exchange, normalizedQuery, normalizedQuery, normalizedQuery);
    return Number(row?.count ?? 0);
  }

  getEtfQuote(symbol: string): EtfQuote | null {
    const row = this.db.prepare('SELECT * FROM etfs WHERE symbol = ? LIMIT 1').get(symbol);
    return row ? this.toEtfQuote(row) : null;
  }

  saveEtfHistory(payload: EtfHistoryPayload): void {
    const statement = this.db.prepare(`
      INSERT INTO etf_daily_prices (
        symbol, trade_date, open_price, close_price, high_price, low_price, volume, amount,
        amplitude, change_percent, change_amount, turnover_rate, source, fetched_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(symbol, trade_date) DO UPDATE SET
        open_price = excluded.open_price,
        close_price = excluded.close_price,
        high_price = excluded.high_price,
        low_price = excluded.low_price,
        volume = excluded.volume,
        amount = excluded.amount,
        amplitude = excluded.amplitude,
        change_percent = excluded.change_percent,
        change_amount = excluded.change_amount,
        turnover_rate = excluded.turnover_rate,
        source = excluded.source,
        fetched_at = excluded.fetched_at,
        updated_at = datetime('now')
    `);

    this.withTransaction(() => {
      for (const point of payload.points) {
        statement.run(
          payload.symbol,
          point.date,
          point.open,
          point.close,
          point.high,
          point.low,
          point.volume,
          point.amount,
          point.amplitude,
          point.changePercent,
          point.changeAmount,
          point.turnoverRate,
          payload.source,
          payload.fetchedAt
        );
      }
      this.saveEtfRefreshState(`history:${payload.symbol}`);
    });
  }

  getEtfHistory(symbol: string, startDate: string): EtfHistoryPoint[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM etf_daily_prices
      WHERE symbol = ? AND trade_date >= ?
      ORDER BY trade_date ASC
    `).all(symbol, startDate);
    return rows.map((row: any) => ({
      date: row.trade_date,
      open: nullableNumber(row.open_price),
      close: nullableNumber(row.close_price),
      high: nullableNumber(row.high_price),
      low: nullableNumber(row.low_price),
      volume: nullableNumber(row.volume),
      amount: nullableNumber(row.amount),
      amplitude: nullableNumber(row.amplitude),
      changePercent: nullableNumber(row.change_percent),
      changeAmount: nullableNumber(row.change_amount),
      turnoverRate: nullableNumber(row.turnover_rate)
    }));
  }

  getEtfHistorySource(symbol: string): string | null {
    const row = this.db.prepare(`
      SELECT source
      FROM etf_daily_prices
      WHERE symbol = ?
      ORDER BY trade_date DESC
      LIMIT 1
    `).get(symbol);
    return row?.source ?? null;
  }

  getEtfRefreshState(key: string): string | null {
    const row = this.db.prepare(`
      SELECT refreshed_at FROM etf_refresh_state WHERE cache_key = ? LIMIT 1
    `).get(key);
    return row?.refreshed_at ? fromSqliteDate(row.refreshed_at) : null;
  }

  saveEtfValuation(value: EtfValuation): void {
    this.db.prepare(`
      INSERT INTO etf_valuations (
        symbol, tracking_index_name, tracking_index_code, pe_total_shares,
        pe_calculated_shares, valuation_date, available, unavailable_reason, fetched_at, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        tracking_index_name = excluded.tracking_index_name,
        tracking_index_code = excluded.tracking_index_code,
        pe_total_shares = excluded.pe_total_shares,
        pe_calculated_shares = excluded.pe_calculated_shares,
        valuation_date = excluded.valuation_date,
        available = excluded.available,
        unavailable_reason = excluded.unavailable_reason,
        fetched_at = excluded.fetched_at,
        source = excluded.source
    `).run(
      value.symbol, value.trackingIndexName, value.trackingIndexCode, value.peTotalShares,
      value.peCalculatedShares, value.valuationDate, value.available ? 1 : 0,
      value.unavailableReason, value.fetchedAt, value.source
    );
  }

  getEtfValuation(symbol: string): EtfValuation | null {
    const row = this.db.prepare('SELECT * FROM etf_valuations WHERE symbol = ? LIMIT 1').get(symbol);
    if (!row) return null;
    return {
      symbol: row.symbol,
      trackingIndexName: row.tracking_index_name ?? null,
      trackingIndexCode: row.tracking_index_code ?? null,
      peTotalShares: nullableNumber(row.pe_total_shares),
      peCalculatedShares: nullableNumber(row.pe_calculated_shares),
      valuationDate: row.valuation_date ?? null,
      available: Boolean(row.available),
      unavailableReason: row.unavailable_reason ?? null,
      fetchedAt: row.fetched_at,
      source: row.source
    };
  }

  getFavoriteEtfs(): FavoriteEtf[] {
    const rows = this.db.prepare(`
      SELECT e.*, f.favorited_at
      FROM favorite_etfs f
      JOIN etfs e ON e.symbol = f.symbol
      ORDER BY f.favorited_at DESC
    `).all();
    return rows.map((row: any) => ({ ...this.toEtfQuote(row), favoritedAt: fromSqliteDate(row.favorited_at) }));
  }

  saveFavoriteEtf(symbol: string): FavoriteEtf[] {
    this.db.prepare(`
      INSERT INTO favorite_etfs (symbol, favorited_at)
      VALUES (?, datetime('now'))
      ON CONFLICT(symbol) DO NOTHING
    `).run(symbol);
    return this.getFavoriteEtfs();
  }

  removeFavoriteEtf(symbol: string): FavoriteEtf[] {
    this.db.prepare('DELETE FROM favorite_etfs WHERE symbol = ?').run(symbol);
    return this.getFavoriteEtfs();
  }

  getStats() {
    const companies = this.db.prepare('SELECT COUNT(*) AS count FROM companies').get().count;
    const favorites = this.db.prepare('SELECT COUNT(*) AS count FROM favorite_companies').get().count;
    const snapshots = this.db.prepare('SELECT COUNT(*) AS count FROM financial_statement_cache').get().count;
    const peerComparisons = this.db.prepare('SELECT COUNT(*) AS count FROM peer_comparison_cache').get().count;
    const values = this.db.prepare('SELECT COUNT(*) AS count FROM financial_statement_values').get().count;
    const metrics = this.db.prepare('SELECT COUNT(*) AS count FROM financial_metric_values').get().count;
    return {
      dbPath: this.dbPath,
      companies,
      favorites,
      statementSnapshots: snapshots,
      peerComparisons,
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
      this.upsertCompanies([
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
    const metricRows = this.db
      .prepare(
        `
        SELECT
          market,
          symbol,
          display_symbol,
          name,
          metric_label,
          year,
          value_num
        FROM (
          SELECT
            m.market,
            m.symbol,
            COALESCE(c.display_symbol, m.symbol) AS display_symbol,
            COALESCE(c.name, m.symbol) AS name,
            m.metric_label,
            m.year,
            m.value_num
          FROM financial_metric_values m
          LEFT JOIN companies c
            ON c.market = m.market
           AND c.symbol = m.symbol
          WHERE m.metric_key = ?
        )
        ORDER BY year ASC
      `
      )
      .all(metricKey);

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

  listStatementRefreshTargets(options: { staleBefore?: Date; includeFresh?: boolean } = {}): StatementRefreshTarget[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          market,
          symbol,
          display_symbol,
          company_name AS name,
          0 AS years,
          refreshed_at,
          'cached' AS reason
        FROM financial_statement_cache

        UNION ALL

        SELECT
          f.market,
          f.symbol,
          f.display_symbol,
          f.name,
          0 AS years,
          NULL AS refreshed_at,
          'favorite-missing-cache' AS reason
        FROM favorite_companies f
        WHERE NOT EXISTS (
          SELECT 1
          FROM financial_statement_cache c
          WHERE c.market = f.market
            AND c.symbol = f.symbol
            AND c.years_requested = 0
        )
      `
      )
      .all();

    const targets = new Map<string, StatementRefreshTarget>();
    for (const row of rows) {
      const target: StatementRefreshTarget = {
        market: row.market,
        symbol: row.symbol,
        displaySymbol: row.display_symbol,
        name: row.name,
        years: Number(row.years),
        refreshedAt: row.refreshed_at,
        reason: row.reason
      };

      const isMissingCache = target.reason === 'favorite-missing-cache';
      const isStale =
        !target.refreshedAt ||
        (options.staleBefore ? new Date(target.refreshedAt).getTime() <= options.staleBefore.getTime() : true);
      if (!options.includeFresh && !isMissingCache && !isStale) {
        continue;
      }

      targets.set(`${target.market}:${target.symbol}:${target.years}`, target);
    }

    return [...targets.values()].sort((a, b) => {
      const left = `${a.market}:${a.symbol}:${a.years}`;
      const right = `${b.market}:${b.symbol}:${b.years}`;
      return left.localeCompare(right);
    });
  }

  createStatementRefreshRun(trigger: StatementRefreshTrigger, totalTargets: number): StatementRefreshRun {
    const result = this.db
      .prepare(
        `
        INSERT INTO statement_refresh_jobs (
          trigger, status, started_at, total_targets, succeeded, failed, errors_json
        )
        VALUES (?, 'running', datetime('now'), ?, 0, 0, '[]')
      `
      )
      .run(trigger, totalTargets);

    return this.getStatementRefreshRun(Number(result.lastInsertRowid))!;
  }

  finishStatementRefreshRun(
    id: number,
    status: Exclude<StatementRefreshStatus, 'running'>,
    result: {
      succeeded: number;
      failed: number;
      message?: string | null;
      errors?: StatementRefreshError[];
    }
  ): StatementRefreshRun {
    this.db
      .prepare(
        `
        UPDATE statement_refresh_jobs
        SET status = ?,
            finished_at = datetime('now'),
            succeeded = ?,
            failed = ?,
            message = ?,
            errors_json = ?
        WHERE id = ?
      `
      )
      .run(
        status,
        result.succeeded,
        result.failed,
        result.message ?? null,
        JSON.stringify(result.errors ?? []),
        id
      );

    return this.getStatementRefreshRun(id)!;
  }

  getLatestStatementRefreshRun(): StatementRefreshRun | null {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM statement_refresh_jobs
        ORDER BY started_at DESC, id DESC
        LIMIT 1
      `
      )
      .get();

    return row ? this.toStatementRefreshRun(row) : null;
  }

  getLatestCompletedStatementRefreshRun(): StatementRefreshRun | null {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM statement_refresh_jobs
        WHERE status IN ('completed', 'failed', 'skipped')
        ORDER BY finished_at DESC, id DESC
        LIMIT 1
      `
      )
      .get();

    return row ? this.toStatementRefreshRun(row) : null;
  }

  private replaceStatementDetails(
    snapshotId: number,
    payload: FinancialStatements,
    yearsRequested: number
  ): void {
    this.db.prepare('DELETE FROM financial_statement_rows WHERE snapshot_id = ?').run(snapshotId);
    this.db.prepare('DELETE FROM financial_statement_values WHERE snapshot_id = ?').run(snapshotId);
    this.db.prepare('DELETE FROM financial_metric_values WHERE snapshot_id = ?').run(snapshotId);

    const insertRow = this.db.prepare(
      `
      INSERT INTO financial_statement_rows (
        snapshot_id, market, symbol, statement_type, item, source_item, item_order, values_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    const insertValue = this.db.prepare(
      `
      INSERT INTO financial_statement_values (
        snapshot_id, market, symbol, statement_type, item, source_item, year, value_num, value_text, unit, source, fetched_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    const insertMetric = this.db.prepare(
      `
      INSERT INTO financial_metric_values (
        snapshot_id, market, symbol, metric_key, metric_label, year, value_num, source, fetched_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    const market = payload.company.market;
    const symbol = normalizeSymbol(market, payload.company.symbol);
    for (const table of payload.tables) {
      table.rows.forEach((row, rowIndex) => {
        insertRow.run(
          snapshotId,
          market,
          symbol,
          table.type,
          row.item,
          row.sourceItem ?? row.item,
          rowIndex,
          JSON.stringify(row.values)
        );

        for (const year of table.years) {
          const value = row.values[year];
          insertValue.run(
            snapshotId,
            market,
            symbol,
            table.type,
            row.item,
            row.sourceItem ?? row.item,
            year,
            typeof value === 'number' ? value : null,
            typeof value === 'string' ? value : null,
            payload.unit,
            payload.source,
            payload.fetchedAt
          );
        }
      });
    }

    for (const metric of payload.highlights) {
      for (const point of metric.points) {
        insertMetric.run(
          snapshotId,
          market,
          symbol,
          metric.key,
          metric.label,
          point.year,
          point.value,
          payload.source,
          payload.fetchedAt
        );
      }
    }

    this.db
      .prepare(
        `
        INSERT INTO statement_refresh_log (
          snapshot_id, market, symbol, years_requested, source, fetched_at, stored_at
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `
      )
      .run(snapshotId, market, symbol, yearsRequested, payload.source, payload.fetchedAt);
  }

  private hasStatementSourceItems(payload: FinancialStatements): boolean {
    return payload.tables.every((table) =>
      table.rows.every((row) => typeof row.sourceItem === 'string' && row.sourceItem.length > 0)
    );
  }

  private initializeSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS companies (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        latest_price REAL,
        change_percent REAL,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (market, symbol)
      );

      CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
      CREATE INDEX IF NOT EXISTS idx_companies_display_symbol ON companies(display_symbol);

      CREATE TABLE IF NOT EXISTS favorite_companies (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        latest_price REAL,
        change_percent REAL,
        pinned_order INTEGER NOT NULL DEFAULT 0,
        favorited_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        announcement_viewed_at TEXT,
        PRIMARY KEY (market, symbol),
        FOREIGN KEY (market, symbol) REFERENCES companies(market, symbol)
          ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_favorite_companies_order
        ON favorite_companies(pinned_order DESC, favorited_at DESC);
      CREATE INDEX IF NOT EXISTS idx_favorite_companies_name
        ON favorite_companies(name);

      CREATE TABLE IF NOT EXISTS company_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        announcement_key TEXT NOT NULL,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        company_name TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        published_at TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        UNIQUE (market, symbol, announcement_key)
      );

      CREATE INDEX IF NOT EXISTS idx_company_announcements_feed
        ON company_announcements(market, symbol, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_company_announcements_unread
        ON company_announcements(market, symbol, discovered_at);

      CREATE TABLE IF NOT EXISTS announcement_refresh_state (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        last_refreshed_at TEXT NOT NULL,
        last_error TEXT,
        PRIMARY KEY (market, symbol)
      );

      CREATE TABLE IF NOT EXISTS financial_statement_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        company_name TEXT,
        years_requested INTEGER NOT NULL,
        years_key TEXT NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        refreshed_at TEXT NOT NULL,
        UNIQUE (market, symbol, years_requested)
      );

      CREATE INDEX IF NOT EXISTS idx_statement_cache_lookup
        ON financial_statement_cache(market, symbol, years_requested);

      CREATE TABLE IF NOT EXISTS financial_statement_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES financial_statement_cache(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        statement_type TEXT NOT NULL,
        item TEXT NOT NULL,
        source_item TEXT,
        item_order INTEGER NOT NULL,
        values_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_statement_rows_item
        ON financial_statement_rows(market, symbol, statement_type, item);

      CREATE TABLE IF NOT EXISTS financial_statement_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES financial_statement_cache(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        statement_type TEXT NOT NULL,
        item TEXT NOT NULL,
        source_item TEXT,
        year TEXT NOT NULL,
        value_num REAL,
        value_text TEXT,
        unit TEXT NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_statement_values_chart
        ON financial_statement_values(statement_type, item, year);
      CREATE INDEX IF NOT EXISTS idx_statement_values_company
        ON financial_statement_values(market, symbol, statement_type, year);

      CREATE TABLE IF NOT EXISTS financial_metric_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES financial_statement_cache(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        metric_label TEXT NOT NULL,
        year TEXT NOT NULL,
        value_num REAL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_metric_values_chart
        ON financial_metric_values(metric_key, year);
      CREATE INDEX IF NOT EXISTS idx_metric_values_company
        ON financial_metric_values(market, symbol, metric_key, year);

      CREATE TABLE IF NOT EXISTS statement_refresh_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        years_requested INTEGER NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        stored_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS statement_refresh_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        total_targets INTEGER NOT NULL DEFAULT 0,
        succeeded INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        errors_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_statement_refresh_jobs_started
        ON statement_refresh_jobs(started_at DESC);

      CREATE TABLE IF NOT EXISTS peer_comparison_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        company_name TEXT,
        industry_name TEXT,
        industry_source TEXT,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        peer_count INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        refreshed_at TEXT NOT NULL,
        UNIQUE (market, symbol)
      );

      CREATE INDEX IF NOT EXISTS idx_peer_comparison_cache_lookup
        ON peer_comparison_cache(market, symbol, refreshed_at);

      CREATE TABLE IF NOT EXISTS etfs (
        symbol TEXT PRIMARY KEY,
        display_symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        exchange TEXT NOT NULL,
        latest_price REAL,
        iopv REAL,
        premium_rate REAL,
        change_amount REAL,
        change_percent REAL,
        volume REAL,
        amount REAL,
        open_price REAL,
        high_price REAL,
        low_price REAL,
        previous_close REAL,
        amplitude REAL,
        turnover_rate REAL,
        latest_shares REAL,
        market_cap REAL,
        data_date TEXT,
        quote_updated_at TEXT,
        source TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_etfs_name ON etfs(name);
      CREATE INDEX IF NOT EXISTS idx_etfs_amount ON etfs(amount DESC);
      CREATE INDEX IF NOT EXISTS idx_etfs_market_cap ON etfs(market_cap DESC);

      CREATE TABLE IF NOT EXISTS etf_daily_prices (
        symbol TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        open_price REAL,
        close_price REAL,
        high_price REAL,
        low_price REAL,
        volume REAL,
        amount REAL,
        amplitude REAL,
        change_percent REAL,
        change_amount REAL,
        turnover_rate REAL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (symbol, trade_date),
        FOREIGN KEY (symbol) REFERENCES etfs(symbol) ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_etf_daily_prices_lookup
        ON etf_daily_prices(symbol, trade_date DESC);

      CREATE TABLE IF NOT EXISTS etf_refresh_state (
        cache_key TEXT PRIMARY KEY,
        refreshed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS favorite_etfs (
        symbol TEXT PRIMARY KEY,
        favorited_at TEXT NOT NULL,
        FOREIGN KEY (symbol) REFERENCES etfs(symbol) ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS etf_valuations (
        symbol TEXT PRIMARY KEY,
        tracking_index_name TEXT,
        tracking_index_code TEXT,
        pe_total_shares REAL,
        pe_calculated_shares REAL,
        valuation_date TEXT,
        available INTEGER NOT NULL,
        unavailable_reason TEXT,
        fetched_at TEXT NOT NULL,
        source TEXT NOT NULL,
        FOREIGN KEY (symbol) REFERENCES etfs(symbol) ON UPDATE CASCADE ON DELETE CASCADE
      );
    `);

    this.ensureColumn('financial_statement_rows', 'source_item', 'TEXT');
    this.ensureColumn('financial_statement_values', 'source_item', 'TEXT');
    this.ensureColumn('favorite_companies', 'announcement_viewed_at', 'TEXT');
    this.db.prepare(`
      UPDATE favorite_companies
      SET announcement_viewed_at = datetime('now')
      WHERE announcement_viewed_at IS NULL
    `).run();
  }

  private normalizeCompany(company: CompanySearchResult): CompanySearchResult {
    const symbol = normalizeSymbol(company.market, company.symbol);
    return {
      ...company,
      symbol,
      displaySymbol: company.displaySymbol || makeDisplaySymbol(company.market, symbol)
    };
  }

  private saveEtfRefreshState(key: string): void {
    this.db.prepare(`
      INSERT INTO etf_refresh_state (cache_key, refreshed_at)
      VALUES (?, datetime('now'))
      ON CONFLICT(cache_key) DO UPDATE SET refreshed_at = datetime('now')
    `).run(key);
  }

  private toEtfQuote(row: any): EtfQuote {
    return {
      symbol: row.symbol,
      displaySymbol: row.display_symbol,
      name: row.name,
      exchange: row.exchange,
      latestPrice: nullableNumber(row.latest_price),
      iopv: nullableNumber(row.iopv),
      premiumRate: nullableNumber(row.premium_rate),
      changeAmount: nullableNumber(row.change_amount),
      changePercent: nullableNumber(row.change_percent),
      volume: nullableNumber(row.volume),
      amount: nullableNumber(row.amount),
      open: nullableNumber(row.open_price),
      high: nullableNumber(row.high_price),
      low: nullableNumber(row.low_price),
      previousClose: nullableNumber(row.previous_close),
      amplitude: nullableNumber(row.amplitude),
      turnoverRate: nullableNumber(row.turnover_rate),
      latestShares: nullableNumber(row.latest_shares),
      marketCap: nullableNumber(row.market_cap),
      dataDate: row.data_date ?? null,
      quoteUpdatedAt: row.quote_updated_at ?? null,
      source: row.source
    };
  }

  private resolveDbPath(): string {
    if (process.env.FINANCE_DB_PATH) {
      return resolve(process.env.FINANCE_DB_PATH);
    }

    const cwd = normalize(process.cwd());
    const projectRoot = cwd.endsWith(normalize(join('apps', 'api')))
      ? resolve(cwd, '..', '..')
      : cwd;
    return resolve(projectRoot, 'data', 'finance.sqlite');
  }

  private toCompany(row: any): CompanySearchResult {
    return {
      market: row.market,
      symbol: row.symbol,
      displaySymbol: row.display_symbol,
      name: row.name,
      source: row.source,
      latestPrice: row.latest_price,
      changePercent: row.change_percent
    };
  }

  private toFavoriteCompany(row: any): FavoriteCompany {
    const unreadAnnouncementCount = Number(row.unread_announcement_count ?? 0);
    return {
      ...this.toCompany(row),
      favoritedAt: row.favorited_at,
      updatedAt: row.updated_at,
      unreadAnnouncementCount,
      hasUnreadAnnouncements: unreadAnnouncementCount > 0
    };
  }

  private toAnnouncement(row: any, viewedAt: string | null): CompanyAnnouncement {
    return {
      key: row.announcement_key,
      market: row.market,
      symbol: row.symbol,
      displaySymbol: row.display_symbol,
      companyName: row.company_name,
      title: row.title,
      category: row.category,
      publishedAt: row.published_at,
      url: row.url,
      source: row.source,
      discoveredAt: fromSqliteDate(row.discovered_at),
      isUnread: Boolean(viewedAt && new Date(row.discovered_at).getTime() > new Date(viewedAt).getTime())
    };
  }

  private getStatementRefreshRun(id: number): StatementRefreshRun | null {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM statement_refresh_jobs
        WHERE id = ?
        LIMIT 1
      `
      )
      .get(id);

    return row ? this.toStatementRefreshRun(row) : null;
  }

  private toStatementRefreshRun(row: any): StatementRefreshRun {
    let errors: StatementRefreshError[] = [];
    try {
      errors = JSON.parse(row.errors_json ?? '[]') as StatementRefreshError[];
    } catch {
      errors = [];
    }

    return {
      id: Number(row.id),
      trigger: row.trigger,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      totalTargets: Number(row.total_targets ?? 0),
      succeeded: Number(row.succeeded ?? 0),
      failed: Number(row.failed ?? 0),
      message: row.message,
      errors
    };
  }

  private markInterruptedRefreshRuns(): void {
    this.db
      .prepare(
        `
        UPDATE statement_refresh_jobs
        SET status = 'failed',
            finished_at = COALESCE(finished_at, datetime('now')),
            message = COALESCE(message, '服务重启，刷新任务已中断。')
        WHERE status = 'running'
      `
      )
      .run();
  }

  private ensureColumn(tableName: string, columnName: string, declaration: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some((column: any) => column.name === columnName);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${declaration}`);
    }
  }

  private withTransaction<T>(callback: () => T): T {
    const alreadyInTransaction = this.db.isTransaction;
    if (alreadyInTransaction) {
      return callback();
    }

    this.db.exec('BEGIN');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function normalizeSymbol(market: Market, symbol: string): string {
  const digits = symbol.replace(/\D/g, '');
  if (market === 'hk') {
    return digits.padStart(5, '0');
  }
  return digits;
}

function makeDisplaySymbol(market: Market, symbol: string): string {
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

function toSqliteDate(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function fromSqliteDate(value: string): string {
  return value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function withoutStatementCache(payload: FinancialStatements): FinancialStatements {
  const { cache: _cache, ...rest } = payload;
  return rest;
}

function mergePartialStatements(
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

  return {
    ...incoming,
    company: {
      ...incoming.company,
      name: incoming.company.name || cached.company.name
    },
    years,
    tables,
    fetchWarnings: [...new Set([...(cached.fetchWarnings ?? []), ...(incoming.fetchWarnings ?? [])])]
  };
}

function withoutPeerCache(payload: PeerComparison): PeerComparison {
  const { cache: _cache, ...rest } = payload;
  return rest;
}
