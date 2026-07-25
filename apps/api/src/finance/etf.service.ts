import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { EtfListQueryDto } from './etf.dto';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { SingleFlight } from './single-flight';
import {
  EtfDetailResponse,
  EtfHistoryPayload,
  EtfHistoryPoint,
  EtfMarketResponse,
  EtfQuote,
  EtfRiskMetrics,
  EtfValuation,
  FavoriteEtf
} from './etf.types';

@Injectable()
export class EtfService {
  private readonly marketCacheMinutes = this.readPositiveNumber(process.env.ETF_MARKET_CACHE_MINUTES, 3);
  private readonly historyCacheHours = this.readPositiveNumber(process.env.ETF_HISTORY_CACHE_HOURS, 24);
  private marketRefreshPromise: Promise<void> | null = null;
  private readonly remoteRequests = new SingleFlight();

  constructor(
    @Inject(PythonAkshareService) private readonly akshare: PythonAkshareService,
    @Inject(FinanceStoreService) private readonly store: FinanceStoreService
  ) {}

  async list(query: EtfListQueryDto): Promise<EtfMarketResponse> {
    const marketState = await this.ensureMarket(query.refresh);
    const items = this.store.listEtfQuotes(query.q, query.limit, query.sort, query.order, query.exchange);
    return {
      items,
      total: this.store.countEtfQuotes(query.q, query.exchange),
      refreshedAt: marketState.refreshedAt,
      source: 'AKShare fund_etf_spot_em',
      cache: {
        hit: marketState.hit,
        stale: marketState.stale
      }
    };
  }

  async getDetail(rawSymbol: string, years: number, refresh = false): Promise<EtfDetailResponse> {
    const symbol = normalizeEtfSymbol(rawSymbol);
    const marketState = await this.ensureMarket(refresh);
    const quote = this.store.getEtfQuote(symbol);
    if (!quote) {
      throw new HttpException(`未找到 ETF：${symbol}`, HttpStatus.NOT_FOUND);
    }

    const startDate = startDateForYears(years);
    const historyStateBefore = this.store.getEtfRefreshState(`history:${symbol}`);
    const historyFreshAfter = new Date(Date.now() - this.historyCacheHours * 60 * 60 * 1000);
    let history = this.store.getEtfHistory(symbol, startDate);
    let historyHit = !refresh && history.length > 0 && Boolean(
      historyStateBefore && new Date(historyStateBefore).getTime() >= historyFreshAfter.getTime()
    );
    let historyStale = false;

    if (!historyHit) {
      try {
        await this.remoteRequests.run(`history:${symbol}:${years}`, async () => {
          const payload = await this.akshare.run<EtfHistoryPayload>([
            'etf-history',
            '--symbol',
            symbol,
            '--years',
            String(years)
          ]);
          this.store.saveEtfHistory(payload);
        });
        history = this.store.getEtfHistory(symbol, startDate);
        historyHit = false;
      } catch (error) {
        if (!history.length) throw error;
        historyStale = true;
        historyHit = true;
      }
    }

    const historyRefreshedAt = this.store.getEtfRefreshState(`history:${symbol}`);
    return {
      quote,
      history,
      metrics: calculateRiskMetrics(history),
      fetchedAt: new Date().toISOString(),
      source: `${quote.source} + ${this.store.getEtfHistorySource(symbol) ?? 'ETF history cache'}`,
      cache: {
        marketHit: marketState.hit,
        marketStale: marketState.stale,
        historyHit,
        historyStale,
        marketRefreshedAt: marketState.refreshedAt,
        historyRefreshedAt
      }
    };
  }

  async getFavorites(): Promise<FavoriteEtf[]> {
    return this.store.getFavoriteEtfs();
  }

  async getValuation(rawSymbol: string, refresh = false): Promise<EtfValuation> {
    const symbol = normalizeEtfSymbol(rawSymbol);
    const cached = this.store.getEtfValuation(symbol);
    const freshAfter = Date.now() - 24 * 60 * 60 * 1000;
    if (!refresh && cached && new Date(cached.fetchedAt).getTime() >= freshAfter) return cached;

    try {
      return await this.remoteRequests.run(`valuation:${symbol}`, async () => {
        const valuation = await this.akshare.run<EtfValuation>(['etf-valuation', '--symbol', symbol]);
        this.store.saveEtfValuation(valuation);
        return valuation;
      });
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }

  async saveFavorite(rawSymbol: string): Promise<FavoriteEtf[]> {
    const symbol = normalizeEtfSymbol(rawSymbol);
    await this.ensureMarket(false);
    const quote = this.store.getEtfQuote(symbol);
    if (!quote) {
      throw new HttpException(`未找到 ETF：${symbol}`, HttpStatus.NOT_FOUND);
    }
    return this.store.saveFavoriteEtf(symbol);
  }

  async removeFavorite(rawSymbol: string): Promise<FavoriteEtf[]> {
    return this.store.removeFavoriteEtf(normalizeEtfSymbol(rawSymbol));
  }

  private async ensureMarket(forceRefresh: boolean): Promise<{ hit: boolean; stale: boolean; refreshedAt: string | null }> {
    const refreshedAt = this.store.getEtfRefreshState('market');
    const freshAfter = Date.now() - this.marketCacheMinutes * 60 * 1000;
    const cachedCount = this.store.countEtfQuotes('');
    const hasFreshCache = Boolean(
      refreshedAt && new Date(refreshedAt).getTime() >= freshAfter && cachedCount > 0
    );
    if (!forceRefresh && hasFreshCache) {
      return { hit: true, stale: false, refreshedAt };
    }
    if (!forceRefresh && cachedCount > 0) {
      void this.refreshMarket().catch(() => undefined);
      return { hit: true, stale: true, refreshedAt };
    }

    try {
      await this.refreshMarket();
      return { hit: false, stale: false, refreshedAt: this.store.getEtfRefreshState('market') };
    } catch (error) {
      if (this.store.countEtfQuotes('') === 0) throw error;
      return { hit: true, stale: true, refreshedAt };
    }
  }

  private refreshMarket(): Promise<void> {
    if (this.marketRefreshPromise) return this.marketRefreshPromise;
    this.marketRefreshPromise = this.akshare
      .run<EtfQuote[]>(['etf-market'])
      .then((quotes) => this.store.saveEtfQuotes(quotes))
      .finally(() => {
        this.marketRefreshPromise = null;
      });
    return this.marketRefreshPromise;
  }

  private readPositiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

export function normalizeEtfSymbol(value: string): string {
  return value.replace(/\D/g, '').padStart(6, '0').slice(-6);
}

function startDateForYears(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - Math.max(1, Math.min(years, 10)));
  return date.toISOString().slice(0, 10);
}

function calculateRiskMetrics(points: EtfHistoryPoint[]): EtfRiskMetrics {
  const valid = points.filter((point): point is EtfHistoryPoint & { close: number } =>
    typeof point.close === 'number' && Number.isFinite(point.close) && point.close > 0
  );
  if (!valid.length) {
    return emptyMetrics();
  }

  const closes = valid.map((point) => point.close);
  const returns = closes.slice(1).map((close, index) => close / closes[index] - 1);
  const first = closes[0];
  const latest = closes[closes.length - 1];
  const years = Math.max((valid.length - 1) / 252, 1 / 252);
  const annualizedReturn = first > 0 ? Math.pow(latest / first, 1 / years) - 1 : null;
  const averageReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
  const variance = averageReturn === null || returns.length < 2
    ? null
    : returns.reduce((sum, value) => sum + Math.pow(value - averageReturn, 2), 0) / (returns.length - 1);
  const annualizedVolatility = variance === null ? null : Math.sqrt(variance) * Math.sqrt(252);

  let peak = closes[0];
  let maxDrawdown = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
  }

  const latestYear = valid[valid.length - 1].date.slice(0, 4);
  const ytdStart = valid.find((point) => point.date.startsWith(latestYear))?.close ?? null;
  const periodHigh = Math.max(...valid.map((point) => point.high ?? point.close));
  const periodLow = Math.min(...valid.map((point) => point.low ?? point.close));
  const allTimePeak = Math.max(...closes);
  const sharpeRatio = annualizedReturn !== null && annualizedVolatility && annualizedVolatility > 0
    ? (annualizedReturn - 0.02) / annualizedVolatility
    : null;

  return {
    return20d: periodReturn(closes, 20),
    return60d: periodReturn(closes, 60),
    returnYtd: ytdStart ? latest / ytdStart - 1 : null,
    annualizedReturn,
    annualizedVolatility,
    maxDrawdown,
    currentDrawdown: latest / allTimePeak - 1,
    sharpeRatio,
    periodHigh,
    periodLow,
    tradingDays: valid.length
  };
}

function periodReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const previous = closes[closes.length - 1 - days];
  return previous > 0 ? closes[closes.length - 1] / previous - 1 : null;
}

function emptyMetrics(): EtfRiskMetrics {
  return {
    return20d: null,
    return60d: null,
    returnYtd: null,
    annualizedReturn: null,
    annualizedVolatility: null,
    maxDrawdown: null,
    currentDrawdown: null,
    sharpeRatio: null,
    periodHigh: null,
    periodLow: null,
    tradingDays: 0
  };
}
