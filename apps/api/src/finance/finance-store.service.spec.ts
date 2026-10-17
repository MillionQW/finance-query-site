import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FinanceStoreService } from './finance-store.service';
import { DatabaseSync } from 'node:sqlite';

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
      thesis: '品牌和渠道形成长期壁垒',
      risks: '需求波动',
      catalysts: '渠道改革',
      questions: '批价能否稳定',
      buyPointRange: '1300-1400'
    });
    const insight = store.getCompanyInsight('a', '600519');
    assert.equal(insight.note, '关注现金流');
    assert.equal(insight.thesis, '品牌和渠道形成长期壁垒');
    assert.equal(insight.risks, '需求波动');
    assert.equal(insight.catalysts, '渠道改革');
    assert.equal(insight.questions, '批价能否稳定');
    assert.ok(insight.buyPointUpdatedAt);
    const db = new DatabaseSync(join(directory, 'test.sqlite'));
    try {
      db.prepare("UPDATE company_insights SET buy_point_updated_at = '2025-01-01 00:00:00' WHERE market = 'a' AND symbol = '600519'").run();
      const unchanged = store.saveCompanyInsight('a', '600519', {
        ...insight, note: '更新备注', buyPointRange: ' 1300-1400 '
      });
      assert.equal(unchanged.buyPointUpdatedAt, '2025-01-01T00:00:00Z');
      const changed = store.saveCompanyInsight('a', '600519', {
        ...unchanged, buyPointRange: '1200-1300'
      });
      assert.ok(changed.buyPointUpdatedAt);
      assert.notEqual(changed.buyPointUpdatedAt, unchanged.buyPointUpdatedAt);
      const cleared = store.saveCompanyInsight('a', '600519', {
        ...changed, buyPointRange: ''
      });
      assert.equal(cleared.buyPointUpdatedAt, null);
    } finally {
      db.close();
    }
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
