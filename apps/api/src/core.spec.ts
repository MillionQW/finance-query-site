import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedWebOrigins, apiHost, apiPort } from './config';
import { normalizeEtfSymbol } from './finance/etf.service';
import { normalizeSymbol } from './finance/finance-store.service';
import { calculateIndexMetrics } from './finance/index.service';
import { IndexHistoryPoint } from './finance/index.types';

test('API defaults stay local and only allow the local development UI', () => {
  assert.equal(apiHost({}), '127.0.0.1');
  assert.equal(apiPort({ PORT: 'invalid' }), 3000);
  assert.deepEqual(allowedWebOrigins({}), [
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]);
});

test('configured web origins are trimmed and deduplicated', () => {
  assert.deepEqual(
    allowedWebOrigins({
      WEB_ORIGIN: 'https://finance.example, https://finance.example, http://localhost:5173'
    }),
    ['https://finance.example', 'http://localhost:5173']
  );
});

test('security symbols are normalized consistently', () => {
  assert.equal(normalizeSymbol('hk', '700.HK'), '00700');
  assert.equal(normalizeSymbol('a', 'SH600519'), '600519');
  assert.equal(normalizeEtfSymbol('510300.SH'), '510300');
});

test('index metrics calculate period return and drawdown', () => {
  const points: IndexHistoryPoint[] = Array.from({ length: 21 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    open: 100 + index * 0.5,
    close: 100 + index * 0.5,
    high: 101 + index * 0.5,
    low: 99 + index * 0.5,
    volume: null,
    amount: null,
    changePercent: null,
    changeAmount: null
  }));

  const metrics = calculateIndexMetrics(points);
  assert.equal(metrics.tradingDays, 21);
  assert.ok(metrics.return20d !== null);
  assert.ok(Math.abs(metrics.return20d - 0.1) < 1e-12);
  assert.equal(metrics.maxDrawdown, 0);
  assert.equal(metrics.currentDrawdown, 0);
});
