import { Injectable } from '@nestjs/common';
import { FinanceStoreService, normalizeSymbol } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { CompanySearchResult, FavoriteCompany, FinancialStatements, PeerComparison } from './types';
import { Market } from './dto';

@Injectable()
export class FinanceService {
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
    return payload;
  }

  async getPeerComparison(
    market: 'a' | 'hk',
    symbol: string,
    limit: number
  ): Promise<PeerComparison> {
    const normalizedSymbol = normalizeSymbol(market, symbol);
    const payload = await this.akshare.run<PeerComparison>([
      'peers',
      '--market',
      market,
      '--symbol',
      normalizedSymbol,
      '--limit',
      String(limit)
    ]);
    this.store.upsertCompanies(payload.peers);
    return payload;
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
}
