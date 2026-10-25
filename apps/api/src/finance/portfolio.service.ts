import { Inject, Injectable } from '@nestjs/common';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { SingleFlight } from './single-flight';
import type { PortfolioQuote, QuoteResult } from './portfolio.types';

@Injectable()
export class PortfolioService {
  private readonly requests = new SingleFlight();
  constructor(@Inject(FinanceStoreService) private readonly store: FinanceStoreService,
    @Inject(PythonAkshareService) private readonly python: PythonAkshareService) {}

  async quote(market: string, symbol: string, refresh: boolean): Promise<QuoteResult> {
    const key = `${market}:${symbol}`;
    const cached = this.store.portfolio.getQuote(key);
    if (!refresh && cached && Date.now() - Date.parse(cached.fetchedAt) < 180_000) {
      return { quote: cached, stale: false, error: null };
    }
    return this.requests.run(key, async () => {
      try {
        const quote = await this.python.run<PortfolioQuote>(['portfolio-market', '--market', market, '--symbol', symbol], 40_000);
        if (!(quote.price && quote.price > 0) || !quote.quoteAt || !quote.source) throw new Error('Invalid quote');
        this.store.portfolio.saveQuote(key, quote);
        return { quote, stale: false, error: null };
      } catch {
        return { quote: cached, stale: true, error: cached ? '行情更新失败，显示上次成功数据' : '行情暂不可用，请稍后重试' };
      }
    });
  }
}
