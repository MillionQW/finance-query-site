import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.PROFILE_ORIGIN ?? 'http://127.0.0.1:3001';
const payload = await (await fetch(`${origin}/api/finance/statements?market=a&symbol=600809&years=0`)).json();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (['/api/favorites', '/api/finance/cache'].includes(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 503, json: { message: 'Unrelated request disabled for smoke test' } });
  });
  await page.addInitScript(({ payload }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (!String(input).includes('/finance/statements/stream')) return original(input, init);
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        setTimeout(() => controller.enqueue(encoder.encode(JSON.stringify({
          type: 'progress', data: { ...payload, loading: true, partial: true }
        }) + '\n')), 100);
        setTimeout(() => {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: '模拟慢接口超时' }) + '\n'));
          controller.close();
        }, 2500);
      } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
    };
  }, { payload });
  await page.goto(`${origin}/?market=a&symbol=600809`);
  await page.getByText('已收到部分财报，可先查看报表；其余历史数据正在补齐，分析指标将在加载完成后显示。').waitFor();
  assert.equal(await page.locator('.company-loading-panel').count(), 0);
  assert.ok(await page.locator('.year-strip button').count() > 0);
  await page.getByText('模拟慢接口超时').waitFor();
  assert.ok(await page.locator('.year-strip button').count() > 0);
  assert.equal(await page.locator('.insight-grid').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: progressive display, retained data after timeout, incomplete metrics hidden, no page errors');
} finally { await browser.close(); }
