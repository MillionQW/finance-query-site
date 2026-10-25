import assert from 'node:assert/strict';
import test from 'node:test';
import { progressiveSearch } from './progressive-search';
import type { CompanySearchResult } from '../types/finance';

const company: CompanySearchResult = { market: 'a', symbol: '000707', displaySymbol: '000707.SZ', name: '双环科技', source: 'test', latestPrice: null, changePercent: null };

test('fast results appear while another exchange is pending; failures preserve them', async () => {
  let finishSlow!: (value: CompanySearchResult[]) => void;
  const slow = new Promise<CompanySearchResult[]>((resolve) => { finishSlow = resolve; });
  const batches: CompanySearchResult[][] = [];
  let completed = false;
  const task = progressiveSearch('a', async (source) => {
    if (source === 'bj') return slow;
    if (source === 'sh') throw new Error('offline');
    return source === 'sz' || source === 'local' ? [company] : [];
  }, (batch) => batches.push(batch)).then((result) => { completed = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.deepEqual(batches.at(-1), [company]);
  finishSlow([]);
  assert.deepEqual(await task, [company]);
});

test('cancelled searches never publish late results', async () => {
  const controller = new AbortController();
  let finish!: (value: CompanySearchResult[]) => void;
  const pending = new Promise<CompanySearchResult[]>((resolve) => { finish = resolve; });
  const batches: CompanySearchResult[][] = [];
  const task = progressiveSearch('hk', () => pending, (batch) => batches.push(batch), controller.signal);
  controller.abort();
  finish([company]);
  await assert.rejects(task, { name: 'AbortError' });
  assert.deepEqual(batches, []);
});

test('empty local cache does not hide remote failures', async () => {
  await assert.rejects(progressiveSearch('hk', async (source) => {
    if (source === 'local') return [];
    throw new Error('offline');
  }, () => {}), /搜索数据源暂不可用/);
});
