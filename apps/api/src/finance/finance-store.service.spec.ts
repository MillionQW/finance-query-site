import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FinanceStoreService } from './finance-store.service';

test('store facade coordinates company, favorite, and insight repositories', () => {
  const directory = mkdtempSync(join(tmpdir(), 'finance-store-'));
  const previousPath = process.env.FINANCE_DB_PATH;
  process.env.FINANCE_DB_PATH = join(directory, 'test.sqlite');
  let store: FinanceStoreService | undefined;

  try {
    store = new FinanceStoreService();
    const company = {
      market: 'a' as const,
      symbol: '600519',
      displaySymbol: '600519.SH',
      name: '贵州茅台',
      source: 'test',
      latestPrice: 1500,
      changePercent: 1.2
    };

    store.upsertCompanies([company]);
    assert.equal(store.findCompanies('茅台', 'a')[0]?.symbol, '600519');

    assert.equal(store.saveFavorite(company)[0]?.name, '贵州茅台');
    assert.equal(store.getFavorites()[0]?.hasUnreadAnnouncements, false);

    store.saveCompanyInsight('a', '600519', {
      note: '关注现金流',
      buyPointRange: '1300-1400'
    });
    assert.equal(store.getCompanyInsight('a', '600519').note, '关注现金流');
  } finally {
    store?.onModuleDestroy();
    if (previousPath === undefined) {
      delete process.env.FINANCE_DB_PATH;
    } else {
      process.env.FINANCE_DB_PATH = previousPath;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
