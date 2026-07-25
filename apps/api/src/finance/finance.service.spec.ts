import assert from 'node:assert/strict';
import test from 'node:test';
import { FinanceService } from './finance.service';
import { FinanceStoreService } from './finance-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { FinancialStatements, PeerComparison } from './types';

function createService(
  run: <T>(args: string[]) => Promise<T>,
  storeOverrides: Partial<FinanceStoreService>
): FinanceService {
  const akshare = { run } as PythonAkshareService;
  const store = storeOverrides as FinanceStoreService;
  return new FinanceService(akshare, store);
}

test('concurrent statement requests for the same company share one bridge process', async () => {
  let bridgeCalls = 0;
  let saves = 0;
  const payload: FinancialStatements = {
    company: {
      market: 'hk',
      symbol: '00700',
      displaySymbol: '00700.HK',
      name: '腾讯控股'
    },
    years: ['2025'],
    unit: '元',
    tables: [],
    highlights: [],
    fetchedAt: '2026-07-25T00:00:00.000Z',
    source: 'fixture'
  };
  const service = createService(
    async <T>() => {
      bridgeCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return payload as T;
    },
    {
      getStatements: () => null,
      saveStatements: () => {
        saves += 1;
      }
    }
  );

  const [first, second] = await Promise.all([
    service.getStatements('hk', '700', 0),
    service.getStatements('hk', '00700', 0)
  ]);

  assert.equal(bridgeCalls, 1);
  assert.equal(saves, 1);
  assert.deepEqual(first, second);
});

test('peer summary and peer metric requests share one remote peer lookup', async () => {
  let bridgeCalls = 0;
  let saves = 0;
  const payload: PeerComparison = {
    company: {
      market: 'a',
      symbol: '600519',
      displaySymbol: '600519.SH',
      name: '贵州茅台'
    },
    industry: null,
    peers: [
      {
        market: 'a',
        symbol: '600519',
        displaySymbol: '600519.SH',
        name: '贵州茅台',
        source: 'fixture',
        isSelected: true
      }
    ],
    rankings: [],
    fetchedAt: '2026-07-25T00:00:00.000Z',
    source: 'fixture'
  };
  const service = createService(
    async <T>() => {
      bridgeCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return payload as T;
    },
    {
      getPeerComparison: () => null,
      savePeerComparison: () => {
        saves += 1;
      },
      getPeerMetricComparison: (comparison) => ({
        metricKey: 'revenue',
        metricLabel: '营业收入',
        years: [],
        companies: comparison.peers.map((company) => ({
          market: company.market,
          symbol: company.symbol,
          displaySymbol: company.displaySymbol,
          name: company.name,
          points: [],
          cached: true,
          isSelected: company.isSelected
        })),
        missingCompanies: []
      })
    }
  );

  await Promise.all([
    service.getPeerComparison('a', '600519', 20),
    service.getPeerMetricComparison('a', '600519', 'revenue', 12)
  ]);

  assert.equal(bridgeCalls, 1);
  assert.equal(saves, 1);
});
