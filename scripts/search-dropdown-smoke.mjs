import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.PROFILE_ORIGIN ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/companies/search') {
      requests++;
      await pending;
      return route.fulfill({ json: url.searchParams.get('source') === 'sz' ? [{
        market: 'a', symbol: '000707', displaySymbol: '000707.SZ', name: '双环科技', source: 'fixture'
      }] : [] });
    }
    return route.fulfill({ status: 503, json: { message: 'Unrelated endpoint disabled for test' } });
  });
  await page.goto(origin);
  const input = page.getByRole('combobox', { name: '搜索公司或股票代码' });
  await input.fill('双环科技');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('.search-dropdown-state.searching').waitFor();
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: '搜索中', exact: true }).click({ force: true });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-busy') === 'true');
  assert.equal(requests, 6, 'Loading click must not start another search');
  release();
  await page.getByRole('option').filter({ hasText: '双环科技' }).waitFor();
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('.search-dropdown-state.searching').count(), 0);
  await input.focus();
  await input.press('Escape');
  assert.equal(await page.locator('.search-dropdown').count(), 0);
  console.log('PASS: click keeps dropdown open, loading then results, duplicate submission blocked, Escape closes');
} finally { await browser.close(); }
