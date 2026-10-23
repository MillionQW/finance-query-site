import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { SingleFlight } from './single-flight';
import { calculateCompanyValuation } from './company-valuation';
import type { CompanyPeHistory, CompanyValuation } from './company-valuation.types';
import type { Market } from './types';

@Injectable()
export class CompanyValuationService {
  private readonly requests = new SingleFlight();
  constructor(
    @Inject(PythonAkshareService) private readonly akshare: PythonAkshareService,
    @Inject(FinanceStoreService) private readonly store: FinanceStoreService
  ) {}

  async get(market: Market, rawSymbol: string, refresh = false): Promise<CompanyValuation> {
    const trimmed = rawSymbol.trim();
    const digits = market === 'hk' ? 5 : 6;
    if (!new RegExp(`^\\d{1,${digits}}$`).test(trimmed)) {
      throw new BadRequestException('股票代码格式不正确');
    }
    const symbol = trimmed.padStart(digits, '0');
    const cached = this.store.getCompanyPeHistory(market, symbol);
    const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
    if (!refresh && cached && age >= 0 && age < 24 * 60 * 60 * 1000) {
      return { ...calculateCompanyValuation(cached), cache: { hit: true, stale: false } };
    }
    try {
      return await this.requests.run(`${market}:${symbol}`, async () => {
        const payload = await this.akshare.run<CompanyPeHistory>([
          'company-valuation', '--market', market, '--symbol', symbol
        ], 45_000);
        const result = calculateCompanyValuation(payload);
        if (!result.dataDate) throw new Error('PE（TTM）历史数据为空');
        this.store.saveCompanyPeHistory(payload);
        return result;
      });
    } catch (error) {
      if (cached) return { ...calculateCompanyValuation(cached), cache: { hit: true, stale: true } };
      throw error;
    }
  }
}
