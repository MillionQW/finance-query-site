import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeStatementStream } from './statement-stream';
import type { FinancialStatements } from '../types/finance';

const partial = { company: { name: '山西汾酒' }, partial: true } as FinancialStatements;
const complete = { ...partial, partial: false };

test('publishes partial data before end of stream and handles split UTF-8', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const seen: FinancialStatements[] = [];
  let finished = false;
  const task = consumeStatementStream(new Response(stream), (data) => seen.push(data)).then((data) => { finished = true; return data; });
  const bytes = new TextEncoder().encode(JSON.stringify({ type: 'progress', data: partial }) + '\n');
  for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [partial]);
  assert.equal(finished, false);
  controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'complete', data: complete }) + '\n'));
  controller.close();
  assert.deepEqual(await task, complete);
});

test('reports timeout after partial data without retracting that data', async () => {
  const seen: FinancialStatements[] = [];
  const body = JSON.stringify({ type: 'progress', data: partial }) + '\n' + JSON.stringify({ type: 'error', message: 'timeout' });
  await assert.rejects(consumeStatementStream(new Response(body), (data) => seen.push(data)), /timeout/);
  assert.deepEqual(seen, [partial]);
});

test('does not mistake a disconnected partial stream for completion', async () => {
  await assert.rejects(consumeStatementStream(new Response(JSON.stringify({ type: 'progress', data: partial }) + '\n'), () => {}), /连接中断/);
});
