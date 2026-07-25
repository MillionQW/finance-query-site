import assert from 'node:assert/strict';
import test from 'node:test';
import { EtfService } from './etf.service';
import { EtfHistoryPayload, EtfQuote, EtfValuation } from './etf.types';
import { FinanceStoreService } from './finance-store.service';
import { IndexService } from './index.service';
import { IndexStoreService } from './index-store.service';
import { IndexHistoryPayload, IndexQuote, IndexValuation } from './index.types';
import { PythonAkshareService } from './python-akshare.service';
import { SingleFlight } from './single-flight';

const NOW = '2026-07-25T00:00:00.000Z';
const FRESH_NOW = new Date().toISOString();

test('failed single-flight tasks are released for retry', async () => {
  const requests = new SingleFlight();
  let calls = 0;

  await assert.rejects(requests.run('valuation:510300', async () => {
    calls += 1;
    throw new Error('temporary failure');
  }));
  const result = await requests.run('valuation:510300', async () => {
    calls += 1;
    return 42;
  });

  assert.equal(result, 42);
  assert.equal(calls, 2);
});

test('concurrent ETF history requests share one bridge process', async () => {
  let bridgeCalls = 0;
  let saves = 0;
  let history: EtfHistoryPayload['points'] = [];
  let historyRefreshed = false;
  const quote = etfQuote();
  const payload: EtfHistoryPayload = {
    symbol: quote.symbol,
    points: [{
      date: '2026-07-24',
      open: 4,
      close: 4.1,
      high: 4.2,
      low: 3.9,
      volume: 100,
      amount: 410,
      amplitude: 0.03,
      changePercent: 0.02,
      changeAmount: 0.08,
      turnoverRate: 0.01
    }],
    fetchedAt: NOW,
    source: 'fixture'
  };
  const service = new EtfService(
    {
      run: async <T>() => {
        bridgeCalls += 1;
        await new Promise((resolve) => setImmediate(resolve));
        return payload as T;
      }
    } as unknown as PythonAkshareService,
    {
      getEtfRefreshState: (key: string) => key === 'market' || historyRefreshed ? FRESH_NOW : null,
      countEtfQuotes: () => 1,
      getEtfQuote: () => quote,
      getEtfHistory: () => history,
      saveEtfHistory: (value: EtfHistoryPayload) => {
        saves += 1;
        history = value.points;
        historyRefreshed = true;
      },
      getEtfHistorySource: () => 'fixture'
    } as unknown as FinanceStoreService
  );

  const [first, second] = await Promise.all([
    service.getDetail('510300', 10),
    service.getDetail('510300', 10)
  ]);

  assert.equal(bridgeCalls, 1);
  assert.equal(saves, 1);
  assert.deepEqual(first.history, second.history);
});

test('concurrent ETF valuation requests share one bridge process', async () => {
  let bridgeCalls = 0;
  let saves = 0;
  const valuation: EtfValuation = {
    symbol: '510300',
    trackingIndexName: '沪深300',
    trackingIndexCode: '000300',
    peTotalShares: 12,
    peCalculatedShares: 11.8,
    valuationDate: '2026-07-24',
    available: true,
    unavailableReason: null,
    fetchedAt: NOW,
    source: 'fixture'
  };
  const service = new EtfService(
    {
      run: async <T>() => {
        bridgeCalls += 1;
        await new Promise((resolve) => setImmediate(resolve));
        return valuation as T;
      }
    } as unknown as PythonAkshareService,
    {
      getEtfValuation: () => null,
      saveEtfValuation: () => {
        saves += 1;
      }
    } as unknown as FinanceStoreService
  );

  const [first, second] = await Promise.all([
    service.getValuation('510300'),
    service.getValuation('510300')
  ]);

  assert.equal(bridgeCalls, 1);
  assert.equal(saves, 1);
  assert.deepEqual(first, second);
});

test('concurrent index history requests share one bridge process', async () => {
  let bridgeCalls = 0;
  let saves = 0;
  let history: IndexHistoryPayload['points'] = [];
  let historyRefreshed = false;
  const quote = indexQuote();
  const payload: IndexHistoryPayload = {
    market: quote.market,
    symbol: quote.symbol,
    points: [{
      date: '2026-07-24',
      open: 4000,
      close: 4100,
      high: 4200,
      low: 3900,
      volume: 100,
      amount: 410_000,
      changePercent: 0.02,
      changeAmount: 80
    }],
    fetchedAt: NOW,
    source: 'fixture'
  };
  const service = new IndexService(
    {
      run: async <T>() => {
        bridgeCalls += 1;
        await new Promise((resolve) => setImmediate(resolve));
        return payload as T;
      }
    } as unknown as PythonAkshareService,
    {
      getRefresh: (key: string) => key === 'market' || historyRefreshed ? FRESH_NOW : null,
      countQuotes: () => 1,
      getQuote: () => quote,
      getHistory: () => history,
      saveHistory: (value: IndexHistoryPayload) => {
        saves += 1;
        history = value.points;
        historyRefreshed = true;
      }
    } as unknown as IndexStoreService
  );

  const [first, second] = await Promise.all([
    service.detail('cn', '000300', 10),
    service.detail('cn', '000300', 10)
  ]);

  assert.equal(bridgeCalls, 1);
  assert.equal(saves, 1);
  assert.deepEqual(first.history, second.history);
});

test('concurrent index valuation requests share one bridge process', async () => {
  let bridgeCalls = 0;
  let saves = 0;
  const valuation: IndexValuation = {
    market: 'cn',
    symbol: '000300',
    name: '沪深300',
    peTotalShares: 12,
    peCalculatedShares: 11.8,
    valuationDate: '2026-07-24',
    available: true,
    unavailableReason: null,
    fetchedAt: NOW,
    source: 'fixture'
  };
  const service = new IndexService(
    {
      run: async <T>() => {
        bridgeCalls += 1;
        await new Promise((resolve) => setImmediate(resolve));
        return valuation as T;
      }
    } as unknown as PythonAkshareService,
    {
      getValuation: () => null,
      saveValuation: () => {
        saves += 1;
      }
    } as unknown as IndexStoreService
  );

  const [first, second] = await Promise.all([
    service.valuation('cn', '000300'),
    service.valuation('cn', '000300')
  ]);

  assert.equal(bridgeCalls, 1);
  assert.equal(saves, 1);
  assert.deepEqual(first, second);
});

function etfQuote(): EtfQuote {
  return {
    symbol: '510300',
    displaySymbol: '510300.SH',
    name: '沪深300ETF',
    exchange: 'sh',
    latestPrice: 4.1,
    iopv: null,
    premiumRate: null,
    changeAmount: null,
    changePercent: null,
    volume: null,
    amount: null,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    amplitude: null,
    turnoverRate: null,
    latestShares: null,
    marketCap: null,
    dataDate: null,
    quoteUpdatedAt: NOW,
    source: 'fixture'
  };
}

function indexQuote(): IndexQuote {
  return {
    market: 'cn',
    symbol: '000300',
    key: 'cn:000300',
    displaySymbol: '000300.CSI',
    name: '沪深300',
    category: '核心宽基',
    latestPrice: 4100,
    changeAmount: null,
    changePercent: null,
    volume: null,
    amount: null,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    quoteUpdatedAt: NOW,
    source: 'fixture'
  };
}
