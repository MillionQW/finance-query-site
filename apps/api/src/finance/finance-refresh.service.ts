import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FinanceStoreService, normalizeSymbol } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import {
  FinancialStatements,
  StatementRefreshError,
  StatementRefreshRun,
  StatementRefreshRuntimeStatus,
  StatementRefreshTarget,
  StatementRefreshTrigger
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

@Injectable()
export class FinanceRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceRefreshService.name);
  private readonly enabled = process.env.FINANCE_REFRESH_ENABLED !== 'false';
  private readonly intervalDays = this.readPositiveNumber(process.env.FINANCE_REFRESH_INTERVAL_DAYS, 7);
  private readonly checkEveryMinutes = this.readPositiveNumber(process.env.FINANCE_REFRESH_CHECK_MINUTES, 60);
  private timer: NodeJS.Timeout | null = null;
  private runningPromise: Promise<StatementRefreshRun> | null = null;
  private currentRun: StatementRefreshRun | null = null;

  constructor(
    @Inject(PythonAkshareService) private readonly akshare: PythonAkshareService,
    @Inject(FinanceStoreService) private readonly store: FinanceStoreService
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Weekly statement refresh is disabled.');
      return;
    }

    this.timer = setInterval(() => {
      void this.runScheduledRefreshIfDue();
    }, this.checkEveryMinutes * MINUTE_MS);
    this.timer.unref?.();

    void this.runScheduledRefreshIfDue();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus(): StatementRefreshRuntimeStatus {
    const staleBefore = this.getStaleBefore();
    const pendingTargets = this.store.listStatementRefreshTargets({ staleBefore }).length;
    return {
      enabled: this.enabled,
      running: Boolean(this.runningPromise),
      intervalDays: this.intervalDays,
      checkEveryMinutes: this.checkEveryMinutes,
      nextRunAt: this.getNextRunAt(),
      staleBefore: staleBefore.toISOString(),
      pendingTargets,
      currentRun: this.currentRun,
      latestRun: this.store.getLatestStatementRefreshRun()
    };
  }

  triggerManualRefresh(): Promise<StatementRefreshRun> {
    return this.runRefresh('manual', this.store.listStatementRefreshTargets({ includeFresh: true }));
  }

  private async runScheduledRefreshIfDue(): Promise<void> {
    if (!this.enabled || this.runningPromise) {
      return;
    }

    const targets = this.store.listStatementRefreshTargets({ staleBefore: this.getStaleBefore() });
    if (!targets.length) {
      return;
    }

    try {
      await this.runRefresh('scheduled', targets);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  private runRefresh(
    trigger: StatementRefreshTrigger,
    targets: StatementRefreshTarget[]
  ): Promise<StatementRefreshRun> {
    if (this.runningPromise) {
      return this.runningPromise;
    }

    this.runningPromise = this.executeRefresh(trigger, targets).finally(() => {
      this.runningPromise = null;
      this.currentRun = null;
    });
    return this.runningPromise;
  }

  private async executeRefresh(
    trigger: StatementRefreshTrigger,
    targets: StatementRefreshTarget[]
  ): Promise<StatementRefreshRun> {
    let run = this.store.createStatementRefreshRun(trigger, targets.length);
    this.currentRun = run;

    if (!targets.length) {
      run = this.store.finishStatementRefreshRun(run.id, 'skipped', {
        succeeded: 0,
        failed: 0,
        message: '没有需要刷新的财报缓存。'
      });
      this.currentRun = run;
      return run;
    }

    const errors: StatementRefreshError[] = [];
    let succeeded = 0;
    for (const target of targets) {
      try {
        const payload = await this.akshare.run<FinancialStatements>([
          'statements',
          '--market',
          target.market,
          '--symbol',
          normalizeSymbol(target.market, target.symbol),
          '--years',
          String(target.years)
        ]);
        this.store.saveStatements(payload, target.years);
        succeeded += 1;
      } catch (error) {
        errors.push({
          market: target.market,
          symbol: target.symbol,
          displaySymbol: target.displaySymbol,
          years: target.years,
          message: error instanceof Error ? error.message : String(error)
        });
      }

      this.currentRun = {
        ...run,
        succeeded,
        failed: errors.length,
        errors
      };
    }

    const failed = errors.length;
    const status = failed === targets.length ? 'failed' : 'completed';
    run = this.store.finishStatementRefreshRun(run.id, status, {
      succeeded,
      failed,
      errors,
      message: failed ? `刷新完成，${failed} 个目标失败。` : '刷新完成。'
    });
    this.currentRun = run;
    return run;
  }

  private getStaleBefore(): Date {
    return new Date(Date.now() - this.intervalDays * DAY_MS);
  }

  private getNextRunAt(): string | null {
    if (!this.enabled) {
      return null;
    }

    const latest = this.store.getLatestCompletedStatementRefreshRun();
    if (!latest?.finishedAt) {
      return new Date(Date.now() + this.checkEveryMinutes * MINUTE_MS).toISOString();
    }

    const nextTime = new Date(latest.finishedAt).getTime() + this.intervalDays * DAY_MS;
    return new Date(Math.max(nextTime, Date.now() + this.checkEveryMinutes * MINUTE_MS)).toISOString();
  }

  private readPositiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
