// Isolated fixture account; no writes to the user's daily database.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..'), origin = 'http://127.0.0.1:3121';
const dbPath = resolve(root, `data/performance-smoke-${Date.now()}.sqlite`);
const server = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '3121', FINANCE_DB_PATH: dbPath, FINANCE_REFRESH_ENABLED: 'false', ANNOUNCEMENT_REFRESH_ENABLED: 'false', REQUEST_ERROR_LOG_ENABLED: 'false' } });
let browser, page, log = '';
server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(log);
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  const initial = await (await fetch(`${origin}/api/portfolio-performance`)).json();
  assert.equal(initial.startDate, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
  assert.equal(initial.result.xirr, null); assert.equal(initial.entries.length, 0);
  const db = new DatabaseSync(dbPath);
  db.prepare('UPDATE portfolio_performance SET payload_json=? WHERE id=1').run(JSON.stringify({ startDate: '2025-01-01', version: 0, entries: [] }));
  db.close();
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/portfolio/quote/**', route => route.fulfill({ json: { quote: null, stale: true, error: '验证场景无需行情' } }));
  await page.goto(`${origin}/?view=portfolio`);
  const panel = page.getByRole('region', { name: '账户收益统计', exact: true });
  const save = async () => { await page.getByRole('button', { name: '保存收益记录', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' }); };
  await panel.getByRole('button', { name: '设置起始资产', exact: true }).click();
  await page.getByLabel('记录时间（北京时间）', { exact: true }).fill('2025-01-01T09:00');
  await page.getByLabel('账户净资产（人民币元）', { exact: true }).fill('100000');
  await save();
  assert.equal(await panel.getByTestId('performance-twr').innerText(), '0.00%');
  assert.equal(await panel.getByTestId('performance-xirr').innerText(), '—');
  await panel.getByRole('button', { name: '记录转入资金', exact: true }).click();
  await page.getByLabel('记录时间（北京时间）', { exact: true }).fill('2025-07-01T12:00');
  await page.getByLabel('出入金金额（原币元）', { exact: true }).fill('100000');
  await page.getByLabel('流水币种', { exact: true }).selectOption('HKD');
  await page.getByLabel('当日汇率（1港币兑人民币）', { exact: true }).fill('0.9');
  await page.getByLabel('转账前账户净资产（人民币元）', { exact: true }).fill('100000');
  await save();
  assert.equal(await panel.getByTestId('performance-twr').innerText(), '0.00%');
  await panel.getByRole('button', { name: '添加资产快照', exact: true }).click();
  await page.getByLabel('记录时间（北京时间）', { exact: true }).fill('2026-01-01T16:00');
  await page.getByLabel('账户净资产（人民币元）', { exact: true }).fill('209000');
  await save();
  assert.equal(await panel.getByTestId('performance-twr').innerText(), '+10.00%');
  assert.equal(await panel.getByTestId('performance-profit').innerText(), '19,000.00');
  assert.notEqual(await panel.getByTestId('performance-xirr').innerText(), '—');
  await page.reload();
  await panel.getByText('+10.00%', { exact: true }).waitFor();
  await panel.locator('.performance-records summary').click();
  const flowRow = panel.locator('tbody tr').filter({ hasText: '资金转入' });
  await flowRow.getByRole('button', { name: '编辑记录', exact: true }).click();
  assert.equal(await page.getByLabel('当日汇率（1港币兑人民币）', { exact: true }).inputValue(), '0.9');
  await page.getByLabel('转账前账户净资产（人民币元）', { exact: true }).fill('');
  await save();
  assert.equal(await panel.getByTestId('performance-twr').innerText(), '—');
  assert.notEqual(await panel.getByTestId('performance-xirr').innerText(), '—');
  await flowRow.getByRole('button', { name: '编辑记录', exact: true }).click();
  await page.getByLabel('转账前账户净资产（人民币元）', { exact: true }).fill('100000');
  await save();
  await panel.screenshot({ path: resolve(root, 'data/performance-desktop.png') });
  const state = await (await fetch(`${origin}/api/portfolio-performance`)).json();
  assert.equal(state.entries[0].amount, 100000);
  const conflict = await fetch(`${origin}/api/portfolio-performance/${state.entries[1].id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...state.entries[1], expectedVersion: 1 }) });
  assert.equal(conflict.status, 409);
  const snapshot = panel.locator('tbody tr').filter({ hasText: '资产快照' });
  await snapshot.getByRole('button', { name: '删除记录', exact: true }).click();
  await snapshot.getByRole('button', { name: '确认删除记录', exact: true }).click();
  await snapshot.waitFor({ state: 'detached' });
  assert.equal(await panel.getByTestId('performance-twr').innerText(), '0.00%');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(root, 'data/performance-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('PASS: start date, initial/snapshot/FX flows, TWR/XIRR, missing input, edit/delete/reload, optimistic conflict and mobile layout.');
} catch (e) {
  if (page) { await page.screenshot({ path: resolve(root, 'data/performance-failure.png'), fullPage: true }); console.error(await page.locator('body').innerText()); }
  throw e;
} finally { await browser?.close(); server.kill(); }
