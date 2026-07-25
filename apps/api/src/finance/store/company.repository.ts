import type {
  AnnouncementFeed,
  AnnouncementRefreshTarget,
  CompanyAnnouncement,
  CompanyInsight,
  CompanySearchResult,
  FavoriteCompany,
  Market
} from '../types';
import {
  fromSqliteDate,
  makeDisplaySymbol,
  normalizeSymbol
} from './finance-store.utils';
import { SqliteRepository } from './sqlite.repository';

export class CompanyStoreRepository extends SqliteRepository {
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

  getCompanyInsight(market: Market, symbol: string): CompanyInsight {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const row = this.db.prepare(`
      SELECT market, symbol, note, thesis, risks, catalysts, questions,
             buy_point_range, buy_point_updated_at, updated_at
      FROM company_insights
      WHERE market = ? AND symbol = ?
      LIMIT 1
    `).get(market, normalizedSymbol);

    return row ? this.toCompanyInsight(row) : {
      market,
      symbol: normalizedSymbol,
      note: '',
      thesis: '',
      risks: '',
      catalysts: '',
      questions: '',
      buyPointRange: '',
      buyPointUpdatedAt: null,
      updatedAt: null
    };
  }

  saveCompanyInsight(
    market: Market,
    symbol: string,
    input: {
      note: string;
      buyPointRange: string;
      thesis?: string;
      risks?: string;
      catalysts?: string;
      questions?: string;
    }
  ): CompanyInsight {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const note = input.note.trim();
    const thesis = (input.thesis ?? '').trim();
    const risks = (input.risks ?? '').trim();
    const catalysts = (input.catalysts ?? '').trim();
    const questions = (input.questions ?? '').trim();
    const buyPointRange = input.buyPointRange.trim();
    this.db.prepare(`
      INSERT INTO company_insights (
        market, symbol, note, thesis, risks, catalysts, questions,
        buy_point_range, buy_point_updated_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = '' THEN NULL ELSE datetime('now') END, datetime('now'), datetime('now'))
      ON CONFLICT(market, symbol) DO UPDATE SET
        note = excluded.note,
        thesis = excluded.thesis,
        risks = excluded.risks,
        catalysts = excluded.catalysts,
        questions = excluded.questions,
        buy_point_range = excluded.buy_point_range,
        buy_point_updated_at = CASE
          WHEN company_insights.buy_point_range <> excluded.buy_point_range
            THEN CASE WHEN excluded.buy_point_range = '' THEN NULL ELSE datetime('now') END
          ELSE company_insights.buy_point_updated_at
        END,
        updated_at = datetime('now')
    `).run(
      market,
      normalizedSymbol,
      note,
      thesis,
      risks,
      catalysts,
      questions,
      buyPointRange,
      buyPointRange
    );
    return this.getCompanyInsight(market, normalizedSymbol);
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
             category, importance, is_routine, impact_hint, published_at, url, source, discovered_at
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
      INSERT INTO company_announcements (
        announcement_key, market, symbol, display_symbol, company_name, title,
        category, importance, is_routine, impact_hint, published_at, url, source, discovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(market, symbol, announcement_key) DO UPDATE SET
        display_symbol = excluded.display_symbol,
        company_name = excluded.company_name,
        title = excluded.title,
        category = excluded.category,
        importance = excluded.importance,
        is_routine = excluded.is_routine,
        impact_hint = excluded.impact_hint,
        published_at = excluded.published_at,
        url = excluded.url,
        source = excluded.source
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
          item.importance ?? 'medium',
          item.isRoutine ? 1 : 0,
          item.impactHint ?? null,
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

  private normalizeCompany(company: CompanySearchResult): CompanySearchResult {
    const symbol = normalizeSymbol(company.market, company.symbol);
    return {
      ...company,
      symbol,
      displaySymbol: company.displaySymbol || makeDisplaySymbol(company.market, symbol)
    };
  }

  private toCompanyInsight(row: any): CompanyInsight {
    return {
      market: row.market,
      symbol: row.symbol,
      note: row.note ?? '',
      thesis: row.thesis ?? '',
      risks: row.risks ?? '',
      catalysts: row.catalysts ?? '',
      questions: row.questions ?? '',
      buyPointRange: row.buy_point_range ?? '',
      buyPointUpdatedAt: row.buy_point_updated_at ? fromSqliteDate(row.buy_point_updated_at) : null,
      updatedAt: row.updated_at ? fromSqliteDate(row.updated_at) : null
    };
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
      importance: row.importance,
      isRoutine: Boolean(row.is_routine),
      impactHint: row.impact_hint ?? undefined,
      publishedAt: row.published_at,
      url: row.url,
      source: row.source,
      discoveredAt: fromSqliteDate(row.discovered_at),
      isUnread: Boolean(viewedAt && new Date(row.discovered_at).getTime() > new Date(viewedAt).getTime())
    };
  }
}
