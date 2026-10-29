/**
 * Loads the built extension into Chromium and checks that the parts which only
 * exist inside a browser actually work: the service worker, the toolbar badge,
 * the popup and the on-page banner.
 *
 * Needs Playwright, which is not a dependency of this project:
 *   npm install --no-save playwright && npx playwright install chromium
 *   npm run smoke
 * Set PLAYWRIGHT_MODULE to point at an existing Playwright install elsewhere.
 * Set SMOKE_SCREENSHOT_DIR to also write screenshots of the two pages.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '../dist');
const SHOTS = process.env.SMOKE_SCREENSHOT_DIR;
const PORT = 8123;

const imported = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { chromium } = imported.default ?? imported;

const passed = [];
const failed = [];
const check = (name, condition, detail = '') => {
  (condition ? passed : failed).push(detail ? `${name} — ${detail}` : name);
};

const settings = {
  version: 1,
  showBadge: true,
  showBanner: true,
  bannerCorner: 'bottom-right',
  preservePath: true,
  openInNewTab: false,
  projects: [
    {
      id: 'prj_smoke',
      name: 'Billing app',
      envs: [
        { id: 'env_local', label: 'Local', badge: 'LOC', color: '#64748b', baseUrl: `http://localhost:${PORT}`, guard: false },
        { id: 'env_mirror', label: 'Loopback', badge: 'MIR', color: '#0ea5e9', baseUrl: `http://127.0.0.1:${PORT}`, guard: false },
        { id: 'env_prod', label: 'Production', badge: 'PRD', color: '#dc2626', baseUrl: 'https://example.com', guard: true },
      ],
    },
  ],
};

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end(`<!doctype html><title>Fixture</title><h1>fixture ${request.url}</h1>`);
});
await new Promise((ready) => server.listen(PORT, ready));

const profile = await mkdtemp(join(tmpdir(), 'environaut-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  check('service worker registers', Boolean(extensionId), extensionId);

  const options = await context.newPage();
  const optionsErrors = [];
  options.on('pageerror', (error) => optionsErrors.push(String(error)));
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.evaluate((value) => chrome.storage.sync.set({ settings: value }), settings);
  await options.reload();
  await options.waitForSelector('#name-prj_smoke', { timeout: 5000 });
  const projectName = await options.inputValue('#name-prj_smoke');
  const envRows = await options.$$eval('.env-edit', (nodes) => nodes.length);
  check('settings page renders stored projects', projectName === 'Billing app' && envRows === 3,
    `"${projectName}", ${envRows} rows`);
  check('settings page raises no errors', optionsErrors.length === 0, optionsErrors.join('; '));
  if (SHOTS) {
    await options.setViewportSize({ width: 900, height: 1250 });
    await options.screenshot({ path: join(SHOTS, 'options.png'), fullPage: true });
  }

  const tab = await context.newPage();
  await tab.goto(`http://localhost:${PORT}/invoices/7?tab=lines`);
  const badge = await worker.evaluate(async () => {
    const [found] = await chrome.tabs.query({ url: 'http://localhost/*' });
    return found ? chrome.action.getBadgeText({ tabId: found.id }) : null;
  });
  check('badge names the environment of the tab', badge === 'LOC', `got "${badge}"`);

  await tab.goto(`http://127.0.0.1:${PORT}/invoices/7`);
  await tab.waitForTimeout(400);
  const moved = await worker.evaluate(async () => {
    const [found] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
    return found ? chrome.action.getBadgeText({ tabId: found.id }) : null;
  });
  check('badge follows a navigation into another environment', moved === 'MIR', `got "${moved}"`);

  // The popup reads the active tab of its own window, which is the popup page
  // itself when it is opened as a tab, so that one call is stubbed.
  const popup = await context.newPage();
  const popupErrors = [];
  popup.on('pageerror', (error) => popupErrors.push(String(error)));
  await popup.addInitScript((port) => {
    const original = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (query) =>
      query.active
        ? [{ id: 99, index: 0, active: true, url: `http://localhost:${port}/invoices/7?tab=lines` }]
        : original(query);
  }, PORT);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForSelector('.env-row', { timeout: 5000 });
  const rows = await popup.$$eval('.env-row', (nodes) => nodes.length);
  check('popup offers the other environments', rows === 2, `${rows} rows`);
  check('popup raises no errors', popupErrors.length === 0, popupErrors.join('; '));

  await popup.click('.env-row:has-text("Production")');
  const confirming = await popup.$$eval('.env-row[data-confirming="true"]', (nodes) => nodes.length);
  check('a guarded environment asks first', confirming === 1, `${confirming} rows confirming`);
  if (SHOTS) {
    await popup.setViewportSize({ width: 340, height: 260 });
    await popup.screenshot({ path: join(SHOTS, 'popup.png') });
  }

  await popup.keyboard.press('Escape');
  const stillConfirming = await popup.$$eval('.env-row[data-confirming="true"]', (n) => n.length);
  check('Escape cancels the confirmation', stillConfirming === 0);

  // The banner needs host access, which cannot be granted without a user
  // gesture, so the built script runs against a stubbed chrome.storage.
  const page = await context.newPage();
  await page.addInitScript((value) => {
    window.chrome = {
      storage: {
        sync: { get: async () => ({ settings: value }) },
        onChanged: { addListener() {}, removeListener() {} },
      },
    };
  }, settings);
  await page.goto(`http://localhost:${PORT}/invoices/7`);
  await page.addScriptTag({ path: join(DIST, 'content/banner.js') });
  await page.waitForTimeout(300);
  const mounted = await page.evaluate(() => Boolean(document.getElementById('environaut-banner-host')));
  check('banner mounts on a matched page', mounted);
} catch (error) {
  failed.push(`threw: ${error.message}`);
} finally {
  await context.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}

for (const line of passed) console.log(`  ok   ${line}`);
for (const line of failed) console.log(`  FAIL ${line}`);
console.log(`\n${passed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
