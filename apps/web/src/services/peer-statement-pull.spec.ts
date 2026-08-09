import assert from 'node:assert/strict';
import test from 'node:test';
import { pullPeerStatements, type PeerStatementPullCompany } from './peer-statement-pull';

function company(symbol: string): PeerStatementPullCompany {
  return { market: 'a', symbol, displaySymbol: `${symbol}.SZ`, name: `公司${symbol}` };
}

test('peer statement pulls run sequentially and continue after an individual failure', async () => {
  const calls: string[] = [];
  const progress: number[] = [];
  const result = await pullPeerStatements({
    companies: [company('1'), company('2'), company('3')],
    signal: new AbortController().signal,
    pull: async (item) => {
      calls.push(item.symbol);
      if (item.symbol === '2') throw new Error('fixture failure');
    },
    onProgress: (item) => progress.push(item.completed)
  });

  assert.deepEqual(calls, ['1', '2', '3']);
  assert.deepEqual(result.succeeded.map((item) => item.symbol), ['1', '3']);
  assert.equal(result.failed[0]?.company.symbol, '2');
  assert.equal(result.completed, 3);
  assert.deepEqual(progress, [0, 1, 1, 2, 2, 3]);
});

test('peer statement pulls stop cleanly after cancellation', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const result = await pullPeerStatements({
    companies: [company('1'), company('2')],
    signal: controller.signal,
    pull: async (item) => {
      calls.push(item.symbol);
      controller.abort();
    }
  });

  assert.deepEqual(calls, ['1']);
  assert.equal(result.completed, 1);
  assert.equal(result.cancelled, true);
});
