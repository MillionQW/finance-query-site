import { createHash } from 'node:crypto';
import type {
  FinancialStatements,
  Market
} from '../types';
import { CompanyStoreRepository } from './company.repository';
import {
  fromSqliteDate,
  makeDisplaySymbol,
  mergePartialStatements,
  normalizeSymbol,
  withoutStatementCache
} from './finance-store.utils';
import { SqliteRepository } from './sqlite.repository';

export class StatementStoreRepository extends SqliteRepository {
  constructor(db: any, private readonly companies: CompanyStoreRepository) {
    super(db);
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
      this.companies.upsertCompanies([
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
}
