import { Injectable } from '@nestjs/common';
import { FinanceStoreService, normalizeSymbol } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { CompanySearchResult, FavoriteCompany, FinancialStatements, PeerComparison, PeerMetricComparison } from './types';
import { Market } from './dto';

@Injectable()
export class FinanceService {
  private readonly peerCacheDays = this.readPositiveNumber(process.env.FINANCE_PEER_CACHE_DAYS, 7);

  constructor(
    private readonly akshare: PythonAkshareService,
    private readonly store: FinanceStoreService
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

    const payload = await this.akshare.run<FinancialStatements>([
      'statements',
      '--market',
      market,
      '--symbol',
      normalizedSymbol,
      '--years',
      String(years)
    ]);
    this.store.saveStatements(payload, years);
    return {
      ...payload,
      cache: {
        hit: false,
        refreshedAt: new Date().toISOString()
      }
    };
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

    const payload = await this.akshare.run<PeerComparison>([
      'peers',
      '--market',
      market,
      '--symbol',
      normalizedSymbol,
      '--limit',
      '50'
    ]);
    this.store.savePeerComparison(payload);
    return this.limitPeerComparison(
      {
        ...payload,
        cache: {
          hit: false,
          refreshedAt: new Date().toISOString()
        }
      },
      limit
    );
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
