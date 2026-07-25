import assert from 'node:assert/strict';
import test from 'node:test';
import {
  companyFromUrl,
  displaySymbolFor,
  mergeCompanyList,
  normalizeUrlSymbol,
  viewFromUrl
} from './app-navigation';

test('URL symbols are normalized for A-share and Hong Kong markets', () => {
  assert.equal(normalizeUrlSymbol('700.HK', 'hk'), '00700');
  assert.equal(normalizeUrlSymbol('600519.SH', 'a'), '600519');
  assert.equal(displaySymbolFor('a', '600519'), '600519.SH');
  assert.equal(displaySymbolFor('a', '430047'), '430047.BJ');
});

test('URL parsing restores seeded and unknown companies', () => {
  assert.equal(companyFromUrl('?market=hk&symbol=00700')?.name, '腾讯控股');
  assert.deepEqual(companyFromUrl('?market=a&symbol=000001'), {
    market: 'a',
    symbol: '000001',
    displaySymbol: '000001.SZ',
    name: '000001.SZ',
    source: 'url'
  });
  assert.equal(companyFromUrl('?market=all&symbol=000001'), null);
});

test('view parsing and company merging have stable fallbacks', () => {
  assert.equal(viewFromUrl('?view=index'), 'index');
  assert.equal(viewFromUrl('?view=unknown'), 'company');
  const company = companyFromUrl('?market=hk&symbol=00700')!;
  assert.deepEqual(mergeCompanyList([company], [company]), [company]);
});
