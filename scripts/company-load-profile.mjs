// Read-only browser benchmark against the running site; suppresses automatic writes.
import { chromium } from 'playwright-core';
import { performance } from 'node:perf_hooks';

const origin = process.env.PROFILE_ORIGIN ?? 'http://127.0.0.1:3000';
const favorites = await (await fetch(`${origin}/api/favorites`)).json();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/**', route => {
    if (route.request().method() === 'GET') return route.continue();
    if (new URL(route.request().url()).pathname.endsWith('/viewed')) {
      return route.fulfill({ json: favorites });
    }
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    window.profileLongTasks = [];
    new PerformanceObserver(list => {
      window.profileLongTasks.push(...list.getEntries().map(entry => entry.duration));
    }).observe({ type: 'longtask', buffered: true });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function measure(label, action) {
    await page.evaluate(() => { window.profileLongTasks = []; });
    const start = performance.now();
    await action();
    await page.waitForFunction(() =>
      !document.querySelector('.company-loading-panel') &&
      document.querySelectorAll('.year-strip button').length > 0 &&
      document.querySelector('.custom-metric-panel canvas')
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    console.log(JSON.stringify({ label, readyMs: Math.round(performance.now() - start),
      longTasksMs: await page.evaluate(() => window.profileLongTasks) }));
  }
  await measure('initial:600519', () => page.goto(`${origin}/?market=a&symbol=600519`, { waitUntil: 'domcontentloaded' }));
  for (const name of ['腾讯控股', '贵州茅台', '腾讯控股', '贵州茅台']) {
    await measure(name, () => page.getByRole('button', { name: new RegExp(name) }).first().click());
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
