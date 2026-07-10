import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FinanceStoreService, normalizeSymbol } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { AnnouncementFeed, CompanyAnnouncement, CompanySearchResult, Market } from './types';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

interface BridgeAnnouncementPayload {
  company: { market: Market; symbol: string; displaySymbol: string; name: string };
  items: CompanyAnnouncement[];
  fetchedAt: string;
  source: string;
}

@Injectable()
export class AnnouncementRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementRefreshService.name);
  private readonly enabled = process.env.ANNOUNCEMENT_REFRESH_ENABLED !== 'false';
  private readonly intervalHours = this.readPositiveNumber(process.env.ANNOUNCEMENT_REFRESH_HOURS, 12);
  private readonly checkMinutes = this.readPositiveNumber(process.env.ANNOUNCEMENT_CHECK_MINUTES, 15);
  private readonly batchSize = Math.max(1, Math.floor(this.readPositiveNumber(process.env.ANNOUNCEMENT_BATCH_SIZE, 2)));
  private readonly requestGapMs = Math.max(0, this.readPositiveNumber(process.env.ANNOUNCEMENT_REQUEST_GAP_MS, 3000));
  private timer: NodeJS.Timeout | null = null;
  private scheduledRun: Promise<void> | null = null;
  private readonly companyRequests = new Map<string, Promise<AnnouncementFeed>>();

  constructor(
    private readonly akshare: PythonAkshareService,
    private readonly store: FinanceStoreService
  ) {}

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.runScheduledBatch(), this.checkMinutes * MINUTE_MS);
    this.timer.unref?.();
    void this.runScheduledBatch();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getFeed(market: Market, symbol: string, limit = 100): Promise<AnnouncementFeed> {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const cached = this.store.getAnnouncementFeed(market, normalizedSymbol, limit);
    if (cached.refreshedAt && Date.now() - new Date(cached.refreshedAt).getTime() < this.intervalHours * HOUR_MS) {
      return cached;
    }
    return this.refreshCompany({
      market,
      symbol: normalizedSymbol,
      displaySymbol: cached.company.displaySymbol,
      name: cached.company.name,
      source: 'announcement-request'
    }, limit);
  }

  markViewed(market: Market, symbol: string) {
    return this.store.markAnnouncementsViewed(market, symbol);
  }

  private runScheduledBatch(): Promise<void> {
    if (!this.enabled || this.scheduledRun) return this.scheduledRun ?? Promise.resolve();
    this.scheduledRun = this.executeScheduledBatch().finally(() => {
      this.scheduledRun = null;
    });
    return this.scheduledRun;
  }

  private async executeScheduledBatch(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.intervalHours * HOUR_MS);
    const targets = this.store.listAnnouncementRefreshTargets(staleBefore, this.batchSize);
    for (let index = 0; index < targets.length; index += 1) {
      if (index > 0 && this.requestGapMs > 0) await this.delay(this.requestGapMs);
      try {
        await this.refreshCompany(targets[index]);
      } catch (error) {
        this.logger.warn(`Announcement refresh failed for ${targets[index].displaySymbol}: ${this.errorMessage(error)}`);
      }
    }
  }

  private refreshCompany(company: CompanySearchResult, limit = 100): Promise<AnnouncementFeed> {
    const key = `${company.market}:${normalizeSymbol(company.market, company.symbol)}`;
    const running = this.companyRequests.get(key);
    if (running) return running;
    const request = this.fetchAndStore(company, limit).finally(() => this.companyRequests.delete(key));
    this.companyRequests.set(key, request);
    return request;
  }

  private async fetchAndStore(company: CompanySearchResult, limit: number): Promise<AnnouncementFeed> {
    const normalizedSymbol = normalizeSymbol(company.market, company.symbol);
    try {
      const payload = await this.akshare.run<BridgeAnnouncementPayload>([
        'announcements', '--market', company.market, '--symbol', normalizedSymbol, '--days', '60'
      ]);
      this.store.saveAnnouncements({
        ...company,
        symbol: normalizedSymbol,
        displaySymbol: payload.company.displaySymbol || company.displaySymbol,
        name: payload.company.name || company.name
      }, payload.items);
      return this.store.getAnnouncementFeed(company.market, normalizedSymbol, limit);
    } catch (error) {
      this.store.saveAnnouncementRefreshError(company.market, normalizedSymbol, this.errorMessage(error));
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private readPositiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
