import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { CompanyAnnouncement, CompanySearchResult } from '../types';
import { CompanyStoreRepository } from './company.repository';
import { initializeFinanceStoreSchema } from './finance-store.schema';

test('announcement refresh updates classification metadata for existing items', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  initializeFinanceStoreSchema(db);
  const repository = new CompanyStoreRepository(db);
  const company: CompanySearchResult = {
    market: 'hk',
    symbol: '00700',
    displaySymbol: '00700.HK',
    name: '腾讯控股',
    source: 'fixture'
  };
  const base: CompanyAnnouncement = {
    key: 'announcement-1',
    market: 'hk',
    symbol: '00700',
    displaySymbol: '00700.HK',
    companyName: '腾讯控股',
    title: '翌日披露报表',
    category: '其他',
    publishedAt: '2026-07-01',
    url: 'https://example.test/announcement-1',
    source: 'fixture'
  };

  repository.saveAnnouncements(company, [base]);
  repository.saveAnnouncements(company, [{
    ...base,
    category: '例行披露',
    importance: 'routine',
    isRoutine: true,
    impactHint: '例行披露，默认折叠。'
  }]);

  const stored = repository.getAnnouncementFeed('hk', '00700');
  assert.equal(stored.items[0]?.category, '例行披露');
  assert.equal(stored.items[0]?.importance, 'routine');
  assert.equal(stored.items[0]?.isRoutine, true);
  assert.match(stored.items[0]?.impactHint ?? '', /默认折叠/);

  db.close();
});
