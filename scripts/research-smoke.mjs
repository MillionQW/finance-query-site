// Run after npm run build. Uses an isolated SQLite database and deterministic statements.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { verifyResearchTracking } from './research-tracking-smoke.mjs';
import { verifyAutomaticBusiness } from './business-auto-smoke.mjs';

const root = resolve(import.meta.dirname, '..');
const port = 3107;
const origin = `http://127.0.0.1:${port}`;
mkdirSync(resolve(root, 'data'), { recursive: true });
const server = spawn(process.execPath, ['apps/api/dist/main.js'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), FINANCE_DB_PATH: resolve(root, `data/research-smoke-${Date.now()}.sqlite`),
    FINANCE_REFRESH_ENABLED: 'false', ANNOUNCEMENT_REFRESH_ENABLED: 'false', REQUEST_ERROR_LOG_ENABLED: 'false' }
});
let log = '';
server.stdout.on('data', b => { log += b; }); server.stderr.on('data', b => { log += b; });
let browser;
const companies = [
  { market: 'a', symbol: '600519', displaySymbol: '600519.SH', name: 'A股验证公司', source: 'fixture' },
  { market: 'hk', symbol: '00700', displaySymbol: '00700.HK', name: '港股验证公司', source: 'fixture' }
];
function statements(company) {
  const hk = company.market === 'hk';
  const periods = hk ? ['2025-03-31','2024-09-30','2024-03-31','2023-09-30'] : ['2025-12-31','2025-09-30','2025-06-30','2025-03-31','2024-12-31','2024-09-30','2024-06-30','2024-03-31'];
  const values = hk ? [250,100,200,80] : [500,300,210,100,400,240,160,80];
  const names = { balance: ['资产总计','负债合计','所有者权益合计'], income: ['营业收入','归属于母公司股东的净利润'], cashflow: ['经营活动现金流量净额','购建固定资产、无形资产和其他长期资产支付的现金'] };
  const tables = Object.entries(names).map(([type, items]) => ({ type, title: type, years: ['2025','2024'], rows: items.map((item, i) => ({ item, sourceItem: item, values: { '2025': (i + 1) * 1e9, '2024': (i + 1) * 8e8 } })) }));
  return { company, schemaVersion: 2, years: ['2025','2024'], unit: '元', reportingCurrency: hk ? null : 'CNY', amountScale: hk ? null : 1, tables, highlights: [],
    reportPeriods: periods.map(key => ({ key, label: key, fiscalYear: Number(key.slice(0,4)), type: 'quarter', annual: key.endsWith('12-31') })),
    periodTables: ['income','cashflow'].map(type => ({ type, title: type, periods,
      periodStarts: hk ? { '2025-03-31':'2024-04-01','2024-09-30':'2024-04-01','2024-03-31':'2023-04-01','2023-09-30':'2023-04-01' } : {},
      rows: names[type].map(item => ({ item, values: Object.fromEntries(periods.map((p,i) => [p,values[i] * 1e8])) })) })),
    fetchedAt: '2026-10-23T00:00:00Z', source: 'fixture', version: { count:1, currentHash:'test-v1', firstSeenAt:null,lastChangedAt:null }, cache: {hit:true,refreshedAt:'2026-10-23T00:00:00Z'} };
}
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(log);
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path.includes('/valuation-models/')) return route.continue();
    if (path.endsWith('/business-sync')) {
      const state=await (await fetch(`${origin}${path.replace('/business-sync','')}`)).json();
      return route.fulfill({contentType:'application/json',body:JSON.stringify({state,sync:{status:'empty',attemptedAt:new Date().toISOString(),lastSuccessAt:null,message:'测试源暂无分部数据',added:0,updated:0,protected:0,missing:0,sourceRows:0,skipped:0}})});
    }
    const company = companies.find(c => c.market === url.searchParams.get('market')) ?? companies[0];
    let body;
    if (path === '/api/favorites') body = companies.map(c => ({ ...c, favoritedAt: '', updatedAt:'', hasUnreadAnnouncements: false, unreadAnnouncementCount:0 }));
    else if (path === '/api/finance/statements') body = statements(company);
    else if (path === '/api/finance/peers') body = { company, peers: [], rankings: [], fetchedAt:'', source:'fixture' };
    else if (path.includes('/announcements') && path.endsWith('/viewed')) body = companies;
    else if (path === '/api/finance/announcements') body = { company, items:[], unreadCount:0, refreshedAt:'', source:'fixture' };
    else if (path === '/api/finance/company-valuation') body = { ...company, currentPe:null, dataDate:null, windows:[], history:[], fetchedAt:'2026-10-23',source:'fixture',cache:{hit:true,stale:false} };
    else if (path.includes('/insights/')) body = { ...company, note:'',thesis:'',risks:'',catalysts:'',questions:'',buyPointRange:'',updatedAt:null,buyPointUpdatedAt:null };
    else return route.continue();
    return route.fulfill({ contentType:'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${origin}/?market=a&symbol=600519`);
  const panel = page.getByRole('region', { name:'三情景估值', exact:true });
  await panel.getByRole('button', {name:'导入最新年报利润'}).waitFor();
  await panel.getByRole('button', {name:'导入最新年报利润'}).click();
  assert.equal(await panel.getByLabel('基准利润（亿元）', {exact:true}).inputValue(), '20');
  await panel.getByLabel('总股本（亿股）', {exact:true}).fill('10');
  await panel.getByLabel('测算价格（报价币种／股）', {exact:true}).fill('20');
  for (const input of await panel.getByLabel('假设依据', {exact:true}).all()) await input.fill('测试：增长与现金分红假设');
  await panel.getByRole('button', {name:'保存估值快照'}).click();
  await panel.getByText('已保存到本地数据库，历史快照保留。').waitFor();
  const saved = await (await fetch(`${origin}/api/finance/valuation-models/a/600519`)).json();
  assert.equal(saved.length, 1); assert.equal(saved[0].model.baseProfit, 20);
  const reject = await fetch(`${origin}/api/finance/valuation-models/a/600519`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...saved[0].model,baseProfit:-10})});
  assert.equal(reject.status, 400);
  await panel.screenshot({ path: resolve(root, 'data/research-valuation.png') });
  await page.reload();
  await panel.getByRole('button', {name:'保存估值快照'}).waitFor();
  assert.equal(await panel.getByLabel('基准利润（亿元）', {exact:true}).inputValue(), '20');
  await panel.getByLabel(/^利润口径/).selectOption('扣非归母净利润');
  assert.equal(await panel.getByLabel('基准利润（亿元）', {exact:true}).inputValue(), '');
  assert.equal(await panel.getByRole('button', {name:'保存估值快照'}).isDisabled(), true);
  const operating = page.getByRole('region', {name:'最新经营变化',exact:true});
  assert.ok((await operating.innerText()).includes('2025-10-01—2025-12-31（单季）'));
  await operating.screenshot({path:resolve(root,'data/research-operating.png')});
  await page.getByRole('button', {name:/港股验证公司/}).first().click();
  await panel.getByRole('button', {name:'导入最新年报利润'}).waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="最新经营变化"]')?.textContent.includes('2024-10-01—2025-03-31（半年）'));
  assert.equal(await panel.getByLabel('基准利润（亿元）', {exact:true}).inputValue(), '');
  assert.equal(await panel.getByRole('button', {name:'导入最新年报利润'}).isDisabled(), true);
  await verifyResearchTracking(page,origin,root);
  await verifyAutomaticBusiness(page,origin,root);
  assert.deepEqual(errors, []);
  console.log('PASS: quarterly/half-year display, import, validation, SQLite save/reload, company isolation, basis reset, no browser errors.');
} finally { await browser?.close(); server.kill(); }
