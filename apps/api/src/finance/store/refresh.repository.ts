import type {
  StatementRefreshError,
  StatementRefreshRun,
  StatementRefreshStatus,
  StatementRefreshTarget,
  StatementRefreshTrigger
} from '../types';
import { SqliteRepository } from './sqlite.repository';

export class RefreshStoreRepository extends SqliteRepository {
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

  markInterruptedRefreshRuns(): void {
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
}
