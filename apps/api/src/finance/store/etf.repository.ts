import type { EtfHistoryPayload, EtfHistoryPoint, EtfQuote, EtfValuation, FavoriteEtf } from '../etf.types';
import {
  fromSqliteDate,
  nullableNumber
} from './finance-store.utils';
import { SqliteRepository } from './sqlite.repository';

export class EtfStoreRepository extends SqliteRepository {
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
}
