// Isolated SQLite and fixture market data; never changes the user's portfolio.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:3119';
const dbPath = resolve(root, `data/portfolio-smoke-${Date.now()}.sqlite`);
mkdirSync(resolve(root, 'data'), { recursive: true });
const server = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '3119', FINANCE_DB_PATH: dbPath, FINANCE_REFRESH_ENABLED: 'false', ANNOUNCEMENT_REFRESH_ENABLED: 'false', REQUEST_ERROR_LOG_ENABLED: 'false' } });
let logs = '', browser, page;
server.stdout.on('data', b => logs += b); server.stderr.on('data', b => logs += b);
const companies = [
  { market: 'hk', symbol: '00700', name: '腾讯控股', displaySymbol: '00700.HK' },
  { market: 'a', symbol: '600519', name: '贵州茅台', displaySymbol: '600519.SH' },
  { market: 'a', symbol: '002027', name: '分众传媒', displaySymbol: '002027.SZ' },
  { market: 'a', symbol: '002304', name: '洋河股份', displaySymbol: '002304.SZ' },
  { market: 'a', symbol: '000596', name: '古井贡酒', displaySymbol: '000596.SZ' }
];
async function api(path, body, method = 'POST') {
  const response = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  assert.ok(response.ok, `${response.status} ${await response.clone().text()}`);
  return response.json();
}
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.setDefaultTimeout(15_000);
  await page.clock.install({ time: new Date() });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let fail = false, fxMissing = false, fxRate = .90;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/portfolio/quote/')) {
      const fx = url.pathname.endsWith('HKDCNY'), index = url.pathname.includes('/index/'), hk = url.pathname.includes('/hk/');
      if (fx && fxMissing) return route.fulfill({ json: { quote: null, stale: true, error: '汇率暂不可用' } });
      const body = { quote: { price: fx ? fxRate : index ? 4100 : hk ? 386 : 1335, marketCap: fx || index ? null : hk ? 35097 : 16688,
        currency: hk ? 'HKD' : 'CNY', quoteAt: '2026-10-23T16:00:00+08:00', year: 2026, ytd: -3.25, baseDate: '2025-12-31',
        source: '浏览器验证固定数据', fetchedAt: new Date().toISOString(), warning: null }, stale: fail, error: fail ? '行情更新失败，显示上次成功数据' : null };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.pathname === '/api/companies/search') return route.fulfill({ json: [...companies, { market: 'a', symbol: '200596', name: '古井贡B' }] });
    return route.continue();
  });
  await page.goto(`${origin}/?view=portfolio`);
  await page.getByText('从第一家公司开始').waitFor();
  await page.getByLabel('搜索持仓企业').fill('腾讯');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('button', { name: /腾讯控股.*添加/ }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByLabel('持仓金额币种', { exact: true }).inputValue(), 'HKD');
  await page.getByLabel('当前持仓总市值（元）', { exact: true }).fill('100000');
  await page.getByLabel('三年后估值（亿元人民币）', { exact: true }).fill('60000 ±10%');
  await page.getByLabel('理想买点（亿元人民币）', { exact: true }).fill('30000');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const first = (await api('/portfolio', undefined, 'GET'))[0];
  assert.equal(first.holdingValue, 100000); assert.equal(first.holdingCurrency, 'HKD'); assert.ok(first.valuationUpdatedAt);
  for (const [index, company] of companies.slice(1).entries()) {
    await api('/portfolio', { ...company, holdingValue: [100000, 0, 0, 0][index], holdingCurrency: 'CNY', valuation: '35000 ±10%', buyPoint: '17500',
      sellPoint: '44000', note: '', confirmValuation: false, expectedVersion: 0 });
  }
  const db = new DatabaseSync(dbPath);
  const old = { ...first, valuationUpdatedAt: '2025-12-31T12:00:00Z' };
  db.prepare('UPDATE portfolio_holdings SET payload_json=? WHERE id=?').run(JSON.stringify(old), first.id);
  db.close();
  await page.reload();
  const row = page.locator('tbody tr').filter({ hasText: '腾讯控股' });
  const maotai = page.locator('tbody tr').filter({ hasText: '贵州茅台' });
  await row.getByText('47.37%', { exact: true }).waitFor();
  await maotai.getByText('52.63%', { exact: true }).waitFor();
  await row.getByText(`约 ${(30000 / (35097 * .9) * 386).toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} 港币/股`, { exact: true }).waitFor();
  await maotai.getByText(`约 ${(17500 / 16688 * 1335).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 人民币/股`, { exact: true }).waitFor();
  await page.locator('.portfolio-summary').getByText('190,000.00', { exact: false }).waitFor();
  fxRate = 1;
  await page.getByRole('button', { name: '刷新行情', exact: true }).click();
  await row.getByText('50.00%', { exact: true }).waitFor();
  fxMissing = true;
  await page.getByRole('button', { name: '刷新行情', exact: true }).click();
  await page.getByText('港币汇率暂不可用，暂不计算总额和比例', { exact: true }).waitFor();
  assert.equal(await row.getByTestId('holding-weight').innerText(), '—');
  fxMissing = false; fxRate = .9;
  await page.getByRole('button', { name: '刷新行情', exact: true }).click();
  await row.getByText('47.37%', { exact: true }).waitFor();
  await maotai.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('当前持仓总市值（元）', { exact: true }).fill('');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByText('1家公司尚未填写金额，补齐后计算比例（无持仓可填0）', { exact: true }).waitFor();
  assert.equal(await row.getByTestId('holding-weight').innerText(), '—');
  await maotai.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('当前持仓总市值（元）', { exact: true }).fill('100000');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await row.getByText('47.37%', { exact: true }).waitFor();
  await row.getByText('过期数据，需要更新', { exact: true }).waitFor();
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.getByLabel('当前持仓总市值（元）', { exact: true }).inputValue(), '100000');
  assert.equal(await page.getByLabel('持仓金额币种', { exact: true }).inputValue(), 'HKD');
  await page.getByLabel('备注', { exact: true }).fill('只修改备注，不更新估值年份');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await row.getByText('过期数据，需要更新', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(root, 'data/portfolio-desktop.png'), fullPage: true });
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await row.getByText('过期数据，需要更新', { exact: true }).count(), 0);
  fail = true;
  await page.getByRole('button', { name: '刷新行情', exact: true }).click();
  await page.getByRole('button', { name: '刷新行情', exact: true }).waitFor();
  await row.getByText('行情更新失败，显示上次成功数据', { exact: true }).waitFor();
  assert.match(await row.innerText(), /386.000/);
  await page.clock.setSystemTime(new Date('2026-12-31T15:59:50Z'));
  await page.clock.runFor(40_000);
  await row.getByText('过期数据，需要更新', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(root, 'data/portfolio-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await row.getByRole('button', { name: '移除', exact: true }).click();
  await row.getByRole('button', { name: '确认移除', exact: true }).click();
  await row.waitFor({ state: 'detached' });
  assert.equal((await api('/portfolio', undefined, 'GET')).length, 4);
  const rejected = await fetch(`${origin}/api/portfolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...first, market: 'a', symbol: '200596', expectedVersion: 0, confirmValuation: false }) });
  assert.equal(rejected.status, 400);
  assert.deepEqual(errors, []);
  console.log('PASS: amount/currency save/reload, HKD default for HK stocks, mixed-currency weights, FX refresh/missing, annual expiry, unchanged valuation confirmation, market failure, A/HK only, mobile overflow, no browser errors.');
} catch (error) {
  if (page) { await page.screenshot({ path: resolve(root, 'data/portfolio-failure.png'), fullPage: true }); console.error(await page.locator('body').innerText()); }
  throw error;
} finally { await browser?.close(); server.kill(); }
