import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { MACRO_INDICATORS, type MacroId, type MacroJob, type MacroRelease, type MacroValue } from './macro.types';

const HOUR = 60 * 60 * 1000;
const JOBS: MacroJob[] = [...MACRO_INDICATORS.map(({ id }) => id), 'releases'];
const INCREMENTAL_JOBS: MacroJob[] = ['cn10y', 'us10y', 'credit-stock-yoy', 'pmi-orders'];

@Injectable()
export class MacroService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MacroService.name);
  private readonly abort = new AbortController();
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(
    @Inject(FinanceStoreService) private readonly store: FinanceStoreService,
    @Inject(PythonAkshareService) private readonly akshare: PythonAkshareService
  ) {}

  onModuleInit(): void {
    if (process.env.MACRO_REFRESH_ENABLED === 'false') return;
    this.refresh(false);
    this.timer = setInterval(() => this.refresh(false), HOUR);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.abort.abort();
  }

  read() {
    const indicators = MACRO_INDICATORS.map(indicator => {
      const state = this.store.macro.state(indicator.id);
      return {
        ...indicator,
        latest: this.store.macro.history(indicator.id, 1)[0] ?? null,
        syncedAt: state?.syncedAt ?? null,
        failed: Boolean(state?.failed)
      };
    });
    const releases = this.store.macro.state('releases');
    return {
      syncing: this.syncing,
      indicators,
      releasesSyncedAt: releases?.syncedAt ?? null,
      releasesFailed: Boolean(releases?.failed)
    };
  }

  history(id: MacroId) {
    return this.store.macro.history(id);
  }

  refresh(force = true): boolean {
    if (this.syncing || this.abort.signal.aborted) return this.syncing;
    const now = Date.now();
    const jobs = JOBS.filter(id => {
      const state = this.store.macro.state(id);
      const needsStockDates = id === 'releases' && !this.store.macro.state('credit-stock-yoy')?.attemptedAt;
      return force || needsStockDates || !state || now - Date.parse(state.attemptedAt) >= (state.failed ? HOUR : 12 * HOUR);
    });
    if (!jobs.length) return false;
    this.syncing = true;
    void this.run(jobs).catch(error => this.logger.error(String(error))).finally(() => {
      this.syncing = false;
    });
    return true;
  }

  private async run(jobs: MacroJob[]): Promise<void> {
    for (let start = 0; start < jobs.length && !this.abort.signal.aborted; start += 3) {
      await Promise.all(jobs.slice(start, start + 3).map(id => this.sync(id)));
    }
  }

  private async sync(id: MacroJob): Promise<void> {
    const args = ['macro', '--indicator', id];
    try {
      if (id === 'releases') {
        if (!this.store.macro.state(id)?.syncedAt) args.push('--release-pages', '12');
        const releases = await this.akshare.run<MacroRelease[]>(args, 60_000, this.abort.signal);
        if (!this.abort.signal.aborted) this.store.macro.saveReleases(releases, new Date().toISOString());
        return;
      }

      const last = INCREMENTAL_JOBS.includes(id) ? this.store.macro.latestPeriod(id) : null;
      // A recent bulletin can fill the latest year while the official archive is unavailable.
      const needsOrderBackfill = id === 'pmi-orders' && this.store.macro.observationCount(id) < 60;
      if (last && !needsOrderBackfill) {
        const overlap = new Date(Date.parse(last) - 30 * 24 * HOUR).toISOString().slice(0, 10);
        args.push('--start-date', overlap);
      }
      const values = await this.akshare.run<MacroValue[]>(args, 80_000, this.abort.signal);
      if (!this.abort.signal.aborted) this.store.macro.saveValues(id, values, new Date().toISOString());
    } catch (error) {
      if (this.abort.signal.aborted) return;
      this.store.macro.recordAttempt(id, new Date().toISOString(), true);
      this.logger.warn(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
