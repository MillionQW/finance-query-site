import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { SingleFlight } from './single-flight';
import { BusinessInputDto } from './research-tracking.dto';
import { cleanResearchInput } from './research-tracking.validation';
import type { BusinessData, BusinessSyncStatus } from './research-tracking.types';
import type { Market } from './types';

interface BusinessFeed { observations: BusinessData[]; fetchedAt: string; sourceRows: number; skipped: number }
@Injectable()
export class BusinessSyncService {
  private readonly requests = new SingleFlight();
  constructor(
    @Inject(PythonAkshareService) private readonly python: PythonAkshareService,
    @Inject(FinanceStoreService) private readonly store: FinanceStoreService,
  ) {}
  async sync(market: Market, symbol: string, force = false) {
    return this.requests.run(`${market}:${symbol}`, async () => {
      const repo = this.store.researchTracking;
      const old = repo.getSyncStatus(market, symbol);
      const age = old ? Date.now() - Date.parse(old.attemptedAt) : Infinity;
      const ttl = old?.status === 'error' ? 5 * 60_000 : 24 * 60 * 60_000;
      if (!force && old && age >= 0 && age < ttl) return { state: repo.list(market, symbol), sync: old };
      const status: BusinessSyncStatus = { status: 'ready', attemptedAt: new Date().toISOString(), lastSuccessAt: old?.lastSuccessAt ?? null,
        message: '', added: 0, updated: 0, protected: 0, missing: 0, sourceRows: 0, skipped: 0 };
      if (market === 'hk') {
        status.status = 'unsupported'; status.message = '港股暂未接入可靠的结构化分部数据源，可保留手工报告摘录；不会套用A股口径。';
        repo.setSyncStatus(market, symbol, status);
      } else {
        try {
          const feed = await this.python.run<BusinessFeed>(['business-segments', '--market', market, '--symbol', symbol], 45_000);
          if (!Array.isArray(feed.observations) || feed.observations.length > 15000 || !Number.isFinite(Date.parse(feed.fetchedAt))) throw new Error('数据源返回格式异常');
          const keys = new Set<string>();
          const observations = feed.observations.map(row => {
            const { origin, ...data } = row;
            const dto = plainToInstance(BusinessInputDto, { ...data, expectedVersion: 0 });
            if (validateSync(dto).length || !origin || origin.provider !== 'eastmoney-zygc' || !origin.key || keys.has(origin.key)) throw new Error('数据源字段或记录身份校验失败');
            keys.add(origin.key);
            const { expectedVersion: unused, ...clean } = cleanResearchInput(dto);
            return { ...clean, origin: { ...origin, fetchedAt: feed.fetchedAt, managed: true, missing: false } };
          });
          status.sourceRows = feed.sourceRows; status.skipped = feed.skipped;
          if (observations.length) {
            status.lastSuccessAt = feed.fetchedAt;
            status.message = '已同步东方财富主营构成；原始字段、单位换算和来源已保存。';
          } else {
            status.status = 'empty'; status.message = '数据源本次未返回可用分部数据，原有记录保留；这不代表企业没有分部业务。';
          }
          repo.importBusiness(market, symbol, observations, status);
        } catch (error) {
          status.status = 'error';
          status.message = `自动抓取失败，原有数据保留。${error instanceof Error ? error.message : '请稍后重试。'}`;
          repo.setSyncStatus(market, symbol, status);
        }
      }
      return { state: repo.list(market, symbol), sync: status };
    });
  }
}
