import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FinanceStoreService, normalizeSymbol } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { CompanyInsight, CompanySearchResult, FavoriteCompany, FinancialStatements, PeerComparison, PeerMetricComparison, ScreenerResult } from './types';
import { Market } from './dto';

@Injectable()
export class FinanceService {
  private readonly peerCacheDays = this.readPositiveNumber(process.env.FINANCE_PEER_CACHE_DAYS, 7);
  private readonly screenerCacheDays = this.readPositiveNumber(process.env.FINANCE_SCREENER_CACHE_DAYS, 7);
  private readonly statementRequests = new Map<string, Promise<FinancialStatements>>();
  private readonly peerRequests = new Map<string, Promise<PeerComparison>>();
  private readonly screenerRequests = new Map<string, Promise<ScreenerResult>>();

  constructor(
    @Inject(PythonAkshareService) private readonly akshare: PythonAkshareService,
    @Inject(FinanceStoreService) private readonly store: FinanceStoreService
  ) {}

  async searchCompanies(query: string, market: Market): Promise<CompanySearchResult[]> {
    const localResults = this.store.findCompanies(query, market);
    if (localResults.length > 0) {
      return localResults;
    }

    const remoteResults = await this.akshare.run<CompanySearchResult[]>([
      'search',
      '--q',
      query,
      '--market',
      market
    ]);
    this.store.upsertCompanies(remoteResults);
    return remoteResults;
  }

  async getStatements(
    market: 'a' | 'hk',
    symbol: string,
    years: number,
    refresh = false
  ): Promise<FinancialStatements> {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    if (!refresh) {
      const cached = this.store.getStatements(market, normalizedSymbol, years);
      if (cached) {
        return cached;
      }
    }

    const requestKey = `${market}:${normalizedSymbol}:${years}`;
    const running = this.statementRequests.get(requestKey);
    if (running) {
      return running;
    }

    const request = this.akshare
      .run<FinancialStatements>([
        'statements',
        '--market',
        market,
        '--symbol',
        normalizedSymbol,
        '--years',
        String(years)
      ])
      .then((payload) => {
        this.store.saveStatements(payload, years);
        return {
          ...payload,
          cache: {
            hit: false,
            refreshedAt: new Date().toISOString()
          }
        };
      })
      .finally(() => {
        this.statementRequests.delete(requestKey);
      });

    this.statementRequests.set(requestKey, request);
    return request;
  }

  async getPeerComparison(
    market: 'a' | 'hk',
    symbol: string,
    limit: number
  ): Promise<PeerComparison> {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const refreshedAfter = new Date(Date.now() - this.peerCacheDays * 24 * 60 * 60 * 1000);
    const cached = this.store.getPeerComparison(market, normalizedSymbol, refreshedAfter);
    if (cached) {
      return this.limitPeerComparison(cached, limit);
    }

    const requestKey = `${market}:${normalizedSymbol}`;
    let request = this.peerRequests.get(requestKey);
    if (!request) {
      request = this.akshare
        .run<PeerComparison>([
          'peers',
          '--market',
          market,
          '--symbol',
          normalizedSymbol,
          '--limit',
          '50'
        ])
        .then((payload) => {
          this.store.savePeerComparison(payload);
          return {
            ...payload,
            cache: {
              hit: false,
              refreshedAt: new Date().toISOString()
            }
          };
        })
        .finally(() => {
          this.peerRequests.delete(requestKey);
        });
      this.peerRequests.set(requestKey, request);
    }

    return this.limitPeerComparison(await request, limit);
  }

  async getPeerMetricComparison(
    market: 'a' | 'hk',
    symbol: string,
    metricKey: string,
    limit: number
  ): Promise<PeerMetricComparison> {
    const peerComparison = await this.getPeerComparison(market, symbol, limit);
    return this.store.getPeerMetricComparison(peerComparison, metricKey, limit);
  }

  async screenCompanies(options: {
    markets: string;
    scope: string;
    minRoa: number;
    maxPe: number;
    minMarketCapBillion: number;
    limit: number;
    maxCandidates: number;
    requestGapMs: number;
    latestPeriod: boolean;
    peOnly: boolean;
    excludeBanks: boolean;
    refresh: boolean;
  }): Promise<ScreenerResult> {
    const cacheParams = this.normalizeScreenerCacheParams(options);
    const cacheKey = this.screenerCacheKey(cacheParams);
    const refreshedAfter = new Date(Date.now() - this.screenerCacheDays * 24 * 60 * 60 * 1000);
    if (!options.refresh) {
      const cached = this.store.getScreenerCache(cacheKey, refreshedAfter);
      if (cached) {
        return cached;
      }
    }

    const running = this.screenerRequests.get(cacheKey);
    if (running) {
      return running;
    }

    const args = [
      'screener',
      '--markets',
      cacheParams.markets,
      '--scope',
      cacheParams.scope,
      '--min-roa',
      String(cacheParams.minRoa),
      '--max-pe',
      String(cacheParams.maxPe),
      '--min-market-cap-billion',
      String(cacheParams.minMarketCapBillion),
      '--limit',
      String(cacheParams.limit),
      '--max-candidates',
      String(cacheParams.maxCandidates),
      '--request-gap-ms',
      String(cacheParams.requestGapMs)
    ];
    if (cacheParams.latestPeriod) {
      args.push('--latest-period');
    }
    if (cacheParams.peOnly) {
      args.push('--pe-only');
    }
    if (cacheParams.excludeBanks) {
      args.push('--exclude-banks');
    }
    const request = this.akshare
      .run<ScreenerResult>(args, 120_000)
      .then((payload) =>
        this.store.saveScreenerCache(
          cacheKey,
          JSON.stringify(cacheParams),
          payload,
          this.screenerCacheDays
        )
      )
      .finally(() => {
        this.screenerRequests.delete(cacheKey);
      });
    this.screenerRequests.set(cacheKey, request);
    return request;
  }

  getMetricComparison(companyKeys: string, metricKey: string): PeerMetricComparison {
    const companies = companyKeys
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((item) => {
        const [market, symbol, encodedName] = item.split(':');
        if ((market !== 'a' && market !== 'hk') || !symbol) {
          return null;
        }
        const normalizedSymbol = normalizeSymbol(market, symbol);
        const displaySymbol = this.displaySymbolFor(market, normalizedSymbol);
        const name = encodedName ? decodeURIComponent(encodedName) : displaySymbol;
        return {
          market,
          symbol: normalizedSymbol,
          displaySymbol,
          name
        };
      })
      .filter((company): company is { market: 'a' | 'hk'; symbol: string; displaySymbol: string; name: string } =>
        Boolean(company)
      );

    return this.store.getMetricComparison(companies, metricKey);
  }

  getFavorites(): FavoriteCompany[] {
    return this.store.getFavorites();
  }

  saveFavorite(company: CompanySearchResult): FavoriteCompany[] {
    return this.store.saveFavorite(company);
  }

  removeFavorite(market: 'a' | 'hk', symbol: string): FavoriteCompany[] {
    return this.store.removeFavorite(market, symbol);
  }

  getCompanyInsight(market: 'a' | 'hk', symbol: string): CompanyInsight {
    return this.store.getCompanyInsight(market, symbol);
  }

  saveCompanyInsight(
    market: 'a' | 'hk',
    symbol: string,
    input: { note: string; buyPointRange: string }
  ): CompanyInsight {
    return this.store.saveCompanyInsight(market, symbol, input);
  }

  getCacheStats() {
    return this.store.getStats();
  }

  getCacheEntries() {
    return this.store.listCacheEntries();
  }

  private limitPeerComparison(payload: PeerComparison, limit: number): PeerComparison {
    const safeLimit = Math.max(5, Math.min(limit, 50));
    const selectedPeer = payload.peers.find((peer) => peer.isSelected);
    const peers = selectedPeer
      ? [
          selectedPeer,
          ...payload.peers
            .filter((peer) => peer.market !== selectedPeer.market || peer.symbol !== selectedPeer.symbol)
            .slice(0, safeLimit - 1)
        ]
      : payload.peers.slice(0, safeLimit);

    return {
      ...payload,
      peers
    };
  }

  private readPositiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private normalizeScreenerCacheParams(options: {
    markets: string;
    scope: string;
    minRoa: number;
    maxPe: number;
    minMarketCapBillion: number;
    limit: number;
    maxCandidates: number;
    requestGapMs: number;
    latestPeriod: boolean;
    peOnly: boolean;
    excludeBanks: boolean;
  }) {
    return {
      markets: options.markets || 'all',
      scope: options.scope || 'all',
      minRoa: Number(options.minRoa) || 0,
      maxPe: Number(options.maxPe) || 0,
      minMarketCapBillion: Number(options.minMarketCapBillion) || 0,
      limit: Math.max(1, Math.min(Number(options.limit) || 80, 300)),
      maxCandidates: Math.max(1, Math.min(Number(options.maxCandidates) || 30, 800)),
      requestGapMs: Math.max(0, Math.min(Number(options.requestGapMs) || 0, 10000)),
      latestPeriod: Boolean(options.latestPeriod),
      peOnly: Boolean(options.peOnly),
      excludeBanks: Boolean(options.excludeBanks),
      algorithmVersion: 3
    };
  }

  private screenerCacheKey(params: ReturnType<FinanceService['normalizeScreenerCacheParams']>): string {
    const serialized = JSON.stringify(params);
    return createHash('sha256').update(serialized).digest('hex');
  }

  private displaySymbolFor(market: 'a' | 'hk', symbol: string): string {
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
}
