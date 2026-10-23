import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize, resolve } from 'node:path';
import type { EtfHistoryPayload, EtfHistoryPoint, EtfQuote, EtfValuation, FavoriteEtf } from './etf.types';
import { CacheStoreRepository } from './store/cache.repository';
import { CompanyStoreRepository } from './store/company.repository';
import { EtfStoreRepository } from './store/etf.repository';
import { initializeFinanceStoreSchema } from './store/finance-store.schema';
import { PeerStoreRepository } from './store/peers.repository';
import { RefreshStoreRepository } from './store/refresh.repository';
import { CompanyValuationRepository } from './store/company-valuation.repository';
import type { CompanyPeHistory } from './company-valuation.types';
import { StatementStoreRepository } from './store/statements.repository';
import type {
  AnnouncementFeed,
  AnnouncementRefreshTarget,
  CacheEntry,
  CompanyAnnouncement,
  CompanyInsight,
  CompanySearchResult,
  FavoriteCompany,
  FinancialStatements,
  Market,
  PeerComparison,
  PeerMetricComparison,
  ScreenerResult,
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
  private readonly companyRepository: CompanyStoreRepository;
  private readonly statementsRepository: StatementStoreRepository;
  private readonly etfRepository: EtfStoreRepository;
  private readonly cacheRepository: CacheStoreRepository;
  private readonly peersRepository: PeerStoreRepository;
  private readonly refreshRepository: RefreshStoreRepository;
  private readonly valuationRepository: CompanyValuationRepository;

  constructor() {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.configureDatabase();
    initializeFinanceStoreSchema(this.db);
    this.companyRepository = new CompanyStoreRepository(this.db);
    this.statementsRepository = new StatementStoreRepository(this.db, this.companyRepository);
    this.etfRepository = new EtfStoreRepository(this.db);
    this.cacheRepository = new CacheStoreRepository(this.db, this.dbPath);
    this.peersRepository = new PeerStoreRepository(this.db, this.companyRepository);
    this.refreshRepository = new RefreshStoreRepository(this.db);
    this.valuationRepository = new CompanyValuationRepository(this.db);
    this.refreshRepository.markInterruptedRefreshRuns();
  }

  onModuleDestroy() {
    this.db.close();
  }

  getCompanyPeHistory(market: Market, symbol: string): CompanyPeHistory | null {
    return this.valuationRepository.get(market, symbol);
  }

  saveCompanyPeHistory(payload: CompanyPeHistory): void {
    this.valuationRepository.save(payload);
  }

  findCompanies(query: string, market: 'all' | Market): CompanySearchResult[] {
    return this.companyRepository.findCompanies(query, market);
  }

  upsertCompanies(companies: CompanySearchResult[]): void {
    return this.companyRepository.upsertCompanies(companies);
  }

  getFavorites(): FavoriteCompany[] {
    return this.companyRepository.getFavorites();
  }

  saveFavorite(company: CompanySearchResult): FavoriteCompany[] {
    return this.companyRepository.saveFavorite(company);
  }

  removeFavorite(market: Market, symbol: string): FavoriteCompany[] {
    return this.companyRepository.removeFavorite(market, symbol);
  }

  getCompanyInsight(market: Market, symbol: string): CompanyInsight {
    return this.companyRepository.getCompanyInsight(market, symbol);
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
    return this.companyRepository.saveCompanyInsight(market, symbol, input);
  }

  listAnnouncementRefreshTargets(staleBefore: Date, limit: number): AnnouncementRefreshTarget[] {
    return this.companyRepository.listAnnouncementRefreshTargets(staleBefore, limit);
  }

  getAnnouncementFeed(market: Market, symbol: string, limit = 100): AnnouncementFeed {
    return this.companyRepository.getAnnouncementFeed(market, symbol, limit);
  }

  saveAnnouncements(target: CompanySearchResult, items: CompanyAnnouncement[]): void {
    return this.companyRepository.saveAnnouncements(target, items);
  }

  saveAnnouncementRefreshError(market: Market, symbol: string, message: string): void {
    return this.companyRepository.saveAnnouncementRefreshError(market, symbol, message);
  }

  markAnnouncementsViewed(market: Market, symbol: string): FavoriteCompany[] {
    return this.companyRepository.markAnnouncementsViewed(market, symbol);
  }

  getStatements(market: Market, symbol: string, years: number): FinancialStatements | null {
    return this.statementsRepository.getStatements(market, symbol, years);
  }

  saveStatements(payload: FinancialStatements, yearsRequested: number): void {
    return this.statementsRepository.saveStatements(payload, yearsRequested);
  }

  saveEtfQuotes(quotes: EtfQuote[]): void {
    return this.etfRepository.saveEtfQuotes(quotes);
  }

  listEtfQuotes(
    query: string,
    limit: number,
    sort: 'amount' | 'changePercent' | 'marketCap' | 'turnoverRate' | 'premiumRate' | 'symbol',
    order: 'asc' | 'desc',
    exchange: 'all' | 'sh' | 'sz'
  ): EtfQuote[] {
    return this.etfRepository.listEtfQuotes(query, limit, sort, order, exchange);
  }

  countEtfQuotes(query: string, exchange: 'all' | 'sh' | 'sz' = 'all'): number {
    return this.etfRepository.countEtfQuotes(query, exchange);
  }

  getEtfQuote(symbol: string): EtfQuote | null {
    return this.etfRepository.getEtfQuote(symbol);
  }

  saveEtfHistory(payload: EtfHistoryPayload): void {
    return this.etfRepository.saveEtfHistory(payload);
  }

  getEtfHistory(symbol: string, startDate: string): EtfHistoryPoint[] {
    return this.etfRepository.getEtfHistory(symbol, startDate);
  }

  getEtfHistorySource(symbol: string): string | null {
    return this.etfRepository.getEtfHistorySource(symbol);
  }

  getEtfRefreshState(key: string): string | null {
    return this.etfRepository.getEtfRefreshState(key);
  }

  saveEtfValuation(value: EtfValuation): void {
    return this.etfRepository.saveEtfValuation(value);
  }

  getEtfValuation(symbol: string): EtfValuation | null {
    return this.etfRepository.getEtfValuation(symbol);
  }

  getFavoriteEtfs(): FavoriteEtf[] {
    return this.etfRepository.getFavoriteEtfs();
  }

  saveFavoriteEtf(symbol: string): FavoriteEtf[] {
    return this.etfRepository.saveFavoriteEtf(symbol);
  }

  removeFavoriteEtf(symbol: string): FavoriteEtf[] {
    return this.etfRepository.removeFavoriteEtf(symbol);
  }

  getScreenerCache(cacheKey: string, refreshedAfter: Date): ScreenerResult | null {
    return this.cacheRepository.getScreenerCache(cacheKey, refreshedAfter);
  }

  saveScreenerCache(cacheKey: string, paramsJson: string, payload: ScreenerResult, ttlDays: number): ScreenerResult {
    return this.cacheRepository.saveScreenerCache(cacheKey, paramsJson, payload, ttlDays);
  }

  getStats() {
    return this.cacheRepository.getStats();
  }

  listCacheEntries(): CacheEntry[] {
    return this.cacheRepository.listCacheEntries();
  }

  getPeerComparison(market: Market, symbol: string, refreshedAfter: Date): PeerComparison | null {
    return this.peersRepository.getPeerComparison(market, symbol, refreshedAfter);
  }

  savePeerComparison(payload: PeerComparison): void {
    return this.peersRepository.savePeerComparison(payload);
  }

  getPeerMetricComparison(peerComparison: PeerComparison, metricKey: string, limit: number): PeerMetricComparison {
    return this.peersRepository.getPeerMetricComparison(peerComparison, metricKey, limit);
  }

  getMetricComparison(
    companies: Array<{
      market: Market;
      symbol: string;
      displaySymbol: string;
      name: string;
      isSelected?: boolean;
    }>,
    metricKey: string
  ): PeerMetricComparison {
    return this.peersRepository.getMetricComparison(companies, metricKey);
  }

  listStatementRefreshTargets(
    options: { staleBefore?: Date; includeFresh?: boolean } = {}
  ): StatementRefreshTarget[] {
    return this.refreshRepository.listStatementRefreshTargets(options);
  }

  createStatementRefreshRun(trigger: StatementRefreshTrigger, totalTargets: number): StatementRefreshRun {
    return this.refreshRepository.createStatementRefreshRun(trigger, totalTargets);
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
    return this.refreshRepository.finishStatementRefreshRun(id, status, result);
  }

  getLatestStatementRefreshRun(): StatementRefreshRun | null {
    return this.refreshRepository.getLatestStatementRefreshRun();
  }

  getLatestCompletedStatementRefreshRun(): StatementRefreshRun | null {
    return this.refreshRepository.getLatestCompletedStatementRefreshRun();
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

  private configureDatabase(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
    `);
  }
}

export { normalizeSymbol } from './store/finance-store.utils';
