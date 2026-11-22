import type { MacroId, MacroJob, MacroPoint, MacroRelease, MacroSyncState, MacroValue } from '../macro.types';
import { SqliteRepository } from './sqlite.repository';

export class MacroRepository extends SqliteRepository {
  history(id: MacroId, limit = -1): MacroPoint[] {
    const rows: MacroPoint[] = this.db.prepare(`
      SELECT o.period, o.period_label AS periodLabel, o.value,
        COALESCE(r.released_on, headline.released_on, o.released_on) AS releasedOn,
        o.source, o.source_url AS sourceUrl, COALESCE(r.release_url, headline.release_url) AS releaseUrl
      FROM macro_observations o
      LEFT JOIN macro_releases r ON r.indicator = o.indicator AND r.period = o.period
      LEFT JOIN macro_releases headline
        ON o.indicator = 'pmi-orders' AND headline.indicator = 'pmi' AND headline.period = o.period
      WHERE o.indicator = ? ORDER BY o.period DESC LIMIT ?
    `).all(id, limit);
    return rows.reverse();
  }

  latestPeriod(id: MacroId): string | null {
    return this.db.prepare('SELECT MAX(period) AS period FROM macro_observations WHERE indicator = ?').get(id).period;
  }

  observationCount(id: MacroId): number {
    return this.db.prepare('SELECT COUNT(*) AS total FROM macro_observations WHERE indicator = ?').get(id).total;
  }

  state(id: MacroJob): MacroSyncState | undefined {
    return this.db.prepare(`
      SELECT attempted_at AS attemptedAt, synced_at AS syncedAt, failed FROM macro_sync_state WHERE indicator = ?
    `).get(id);
  }

  saveValues(id: MacroId, values: MacroValue[], at: string): void {
    const upsert = this.db.prepare(`
      INSERT INTO macro_observations (indicator, period, period_label, value, released_on, source, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (indicator, period) DO UPDATE SET period_label = excluded.period_label,
        value = excluded.value, released_on = COALESCE(excluded.released_on, macro_observations.released_on),
        source = excluded.source, source_url = excluded.source_url
      WHERE macro_observations.indicator <> 'cn10y'
        OR macro_observations.released_on IS NULL OR excluded.released_on IS NOT NULL
    `);
    this.withTransaction(() => {
      const releaseUpsert = this.prepareReleaseUpsert();
      for (const { period, periodLabel, value, releasedOn, source, sourceUrl, releaseUrl } of values) {
        upsert.run(id, period, periodLabel, value, releasedOn, source, sourceUrl);
        if (releasedOn && releaseUrl) releaseUpsert.run(id, period, releasedOn, releaseUrl);
      }
      this.recordAttempt(id, at, false);
    });
  }

  saveReleases(releases: MacroRelease[], at: string): void {
    const upsert = this.prepareReleaseUpsert();
    this.withTransaction(() => {
      for (const { id, period, releasedOn, releaseUrl } of releases) upsert.run(id, period, releasedOn, releaseUrl);
      this.recordAttempt('releases', at, false);
    });
  }

  private prepareReleaseUpsert() {
    return this.db.prepare(`
      INSERT INTO macro_releases (indicator, period, released_on, release_url) VALUES (?, ?, ?, ?)
      ON CONFLICT (indicator, period) DO UPDATE SET released_on = excluded.released_on, release_url = excluded.release_url
      WHERE excluded.released_on < macro_releases.released_on
    `);
  }

  recordAttempt(id: MacroJob, at: string, failed: boolean): void {
    this.db.prepare(`
      INSERT INTO macro_sync_state (indicator, attempted_at, synced_at, failed) VALUES (?, ?, ?, ?)
      ON CONFLICT (indicator) DO UPDATE SET attempted_at = excluded.attempted_at,
        synced_at = COALESCE(excluded.synced_at, macro_sync_state.synced_at), failed = excluded.failed
    `).run(id, at, failed ? null : at, Number(failed));
  }
}
