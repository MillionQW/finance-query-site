import type {
  FinancialStatements,
  Market,
  StatementRevisionSummary,
  StatementVersionSummary
} from '../types';
import {
  diffFinancialStatements,
  hashStatementData
} from '../statement-analysis';
import { SqliteRepository } from './sqlite.repository';

interface StoredStatementPayload {
  payload: FinancialStatements;
  source: string;
  fetchedAt: string;
}

export class StatementVersionRepository extends SqliteRepository {
  captureTransition(
    market: Market,
    symbol: string,
    yearsRequested: number,
    previous: StoredStatementPayload | null,
    current: StoredStatementPayload
  ): string {
    const currentHash = hashStatementData(current.payload);
    const currentVersionId = this.insertVersion(
      market,
      symbol,
      yearsRequested,
      currentHash,
      current
    );
    if (!previous) return currentHash;

    const previousHash = hashStatementData(previous.payload);
    const previousVersionId = this.insertVersion(
      market,
      symbol,
      yearsRequested,
      previousHash,
      previous
    );
    if (previousHash === currentHash) return currentHash;

    const changes = diffFinancialStatements(previous.payload, current.payload);
    if (!changes.length) return currentHash;
    this.db.prepare(`
      INSERT OR IGNORE INTO statement_revision_events (
        market, symbol, years_requested, previous_version_id, current_version_id,
        changed_count, material_change_count, changes_json, detected_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      market,
      symbol,
      yearsRequested,
      previousVersionId,
      currentVersionId,
      changes.length,
      changes.filter((change) => change.material).length,
      JSON.stringify(changes.slice(0, 100))
    );
    return currentHash;
  }

  getSummary(
    market: Market,
    symbol: string,
    yearsRequested: number,
    currentHash: string
  ): StatementVersionSummary {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS version_count,
        MIN(created_at) AS first_seen_at,
        MAX(created_at) AS last_changed_at
      FROM financial_statement_versions
      WHERE market = ? AND symbol = ? AND years_requested = ?
    `).get(market, symbol, yearsRequested);
    const storedCount = Number(row?.version_count ?? 0);
    const count = Math.max(1, storedCount);
    return {
      count,
      currentHash,
      firstSeenAt: row?.first_seen_at ?? null,
      lastChangedAt: storedCount > 1 ? row?.last_changed_at ?? null : null
    };
  }

  getLatestRevision(
    market: Market,
    symbol: string,
    yearsRequested: number
  ): StatementRevisionSummary | null {
    const row = this.db.prepare(`
      SELECT
        event.detected_at,
        previous.fetched_at AS previous_fetched_at,
        current.fetched_at AS current_fetched_at,
        event.changed_count,
        event.material_change_count,
        event.changes_json
      FROM statement_revision_events event
      JOIN financial_statement_versions previous ON previous.id = event.previous_version_id
      JOIN financial_statement_versions current ON current.id = event.current_version_id
      WHERE event.market = ? AND event.symbol = ? AND event.years_requested = ?
      ORDER BY event.detected_at DESC, event.id DESC
      LIMIT 1
    `).get(market, symbol, yearsRequested);
    if (!row) return null;
    return {
      detectedAt: row.detected_at,
      previousFetchedAt: row.previous_fetched_at,
      currentFetchedAt: row.current_fetched_at,
      changedCount: Number(row.changed_count),
      materialChangeCount: Number(row.material_change_count),
      changes: JSON.parse(row.changes_json)
    };
  }

  private insertVersion(
    market: Market,
    symbol: string,
    yearsRequested: number,
    payloadHash: string,
    stored: StoredStatementPayload
  ): number {
    this.db.prepare(`
      INSERT OR IGNORE INTO financial_statement_versions (
        market, symbol, years_requested, schema_version, payload_hash,
        source, fetched_at, payload_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      market,
      symbol,
      yearsRequested,
      stored.payload.schemaVersion ?? 1,
      payloadHash,
      stored.source,
      stored.fetchedAt,
      JSON.stringify(stored.payload)
    );
    const row = this.db.prepare(`
      SELECT id
      FROM financial_statement_versions
      WHERE market = ? AND symbol = ? AND years_requested = ? AND payload_hash = ?
      LIMIT 1
    `).get(market, symbol, yearsRequested, payloadHash);
    return Number(row.id);
  }
}
