import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize, resolve } from 'node:path';
import {
  CompanySearchResult,
  FavoriteCompany,
  FinancialStatements,
  Market,
  StatementRefreshError,
  StatementRefreshRun,
  StatementRefreshStatus,
  StatementRefreshTarget,
  StatementRefreshTrigger
} from './types';

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
        SELECT market, symbol, display_symbol, name, source, latest_price, change_percent,
               favorited_at, updated_at
        FROM favorite_companies
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
            pinned_order, favorited_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
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

  getStatements(market: Market, symbol: string, years: number): FinancialStatements | null {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const row = this.db
      .prepare(
        `
        SELECT payload_json
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
    return payload;
  }

  saveStatements(payload: FinancialStatements, yearsRequested: number): void {
    const market = payload.company.market;
    const symbol = normalizeSymbol(market, payload.company.symbol);
    const displaySymbol = payload.company.displaySymbol || makeDisplaySymbol(market, symbol);
    const yearsKey = payload.years.join(',');
    const payloadJson = JSON.stringify(payload);
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

  getStats() {
    const companies = this.db.prepare('SELECT COUNT(*) AS count FROM companies').get().count;
    const favorites = this.db.prepare('SELECT COUNT(*) AS count FROM favorite_companies').get().count;
    const snapshots = this.db.prepare('SELECT COUNT(*) AS count FROM financial_statement_cache').get().count;
    const values = this.db.prepare('SELECT COUNT(*) AS count FROM financial_statement_values').get().count;
    const metrics = this.db.prepare('SELECT COUNT(*) AS count FROM financial_metric_values').get().count;
    return {
      dbPath: this.dbPath,
      companies,
      favorites,
      statementSnapshots: snapshots,
      statementValues: values,
      metricValues: metrics
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
          years_requested AS years,
          refreshed_at,
          'cached' AS reason
        FROM financial_statement_cache

        UNION ALL

        SELECT
          f.market,
          f.symbol,
          f.display_symbol,
          f.name,
          10 AS years,
          NULL AS refreshed_at,
          'favorite-missing-cache' AS reason
        FROM favorite_companies f
        WHERE NOT EXISTS (
          SELECT 1
          FROM financial_statement_cache c
          WHERE c.market = f.market
            AND c.symbol = f.symbol
            AND c.years_requested = 10
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
        PRIMARY KEY (market, symbol),
        FOREIGN KEY (market, symbol) REFERENCES companies(market, symbol)
          ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_favorite_companies_order
        ON favorite_companies(pinned_order DESC, favorited_at DESC);
      CREATE INDEX IF NOT EXISTS idx_favorite_companies_name
        ON favorite_companies(name);

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
    `);

    this.ensureColumn('financial_statement_rows', 'source_item', 'TEXT');
    this.ensureColumn('financial_statement_values', 'source_item', 'TEXT');
  }

  private normalizeCompany(company: CompanySearchResult): CompanySearchResult {
    const symbol = normalizeSymbol(company.market, company.symbol);
    return {
      ...company,
      symbol,
      displaySymbol: company.displaySymbol || makeDisplaySymbol(company.market, symbol)
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
    return {
      ...this.toCompany(row),
      favoritedAt: row.favorited_at,
      updatedAt: row.updated_at
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
