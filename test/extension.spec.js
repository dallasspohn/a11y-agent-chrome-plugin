import { test, expect } from 'playwright/test';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)); // /…/test
const DIST = join(ROOT, '..', 'dist');
const FIXTURES = join(ROOT, 'fixtures');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

// FIXME(extension): content scripts do not run on file:// without the
// "Allow access to file URLs" toggle, so fixtures are served over HTTP.
function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = join(FIXTURES, path === '/' ? 'bad-page.html' : path.replace(/^\/+/, ''));
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* The axe 4.13 rules our nine fixers cover. video-autoplay and
 * click-events-have-key-events were removed from axe-core, so they get
 * plain-DOM assertions instead of axe assertions. select-name is axe's
 * rule for unnamed <select> (the label fixer's select axis). */
const COVERED_RULES = [
  'html-has-lang', 'image-alt', 'color-contrast', 'label', 'select-name',
  'link-name', 'heading-order', 'td-has-header', 'th-has-data-cells',
];

async function extensionContext() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'a11y-autofix-'));
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: process.env.A11Y_HEADED === '1' ? false : true,
    background: 'wait',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
    ],
  });
}

async function waitForDone(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute('data-a11y-autofix-done') === 'true');
}


let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { server.close(); });

test.describe('a11y-autofix extension', () => {
  test("repairs bad-page.html and stays idempotent", async () => {
    const context = await extensionContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/bad-page.html`);
    await waitForDone(page);

    // --- DOM-level repairs that axe 4.13 cannot observe ---------------------
    await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}([-_][A-Za-z]{2,4})?$/);

    const div = page.locator('div[onclick="showDetails()"]');
    await expect(div).toHaveAttribute('role', 'button');
    await expect(div).toHaveAttribute('tabindex', '0');

    const video = page.locator('video');
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('muted', '');
    await expect(video).toHaveAttribute('aria-label', 'Video');

    await expect(page.locator('img[src="logo.png"]')).toHaveAttribute('alt', /^[A-Za-z ]+$/);
    await expect(page.locator('img[src="banner.jpg"]')).toHaveAttribute('alt', 'Banner');

    // --- axe-verifiable repairs on the nine rule axes -----------------------
    // The Recent Orders table isn't visually distinct, so the fixer infers a
    // header row (role only, flagged for review) rather than scope="col".
    const firstRowCells = page.locator('table tr').first().locator('td');
    await expect(firstRowCells.first()).toHaveAttribute('role', 'columnheader');

    const link = page.locator('a[href="/home"]');
    const linkName = await link.evaluate((el) => (el.getAttribute('aria-label') || el.querySelector('img')?.getAttribute('alt') || '').trim());
    expect(linkName.length).toBeGreaterThan(0);

    const selectLabel = await page.locator('select').getAttribute('aria-label');
    expect(selectLabel?.length).toBeGreaterThan(0);

    await expect(page.locator('h3')).toHaveAttribute('aria-level', '1');
    await expect(page.locator('.card h5').first()).toHaveAttribute('aria-level', '2');

    const contrastFixed = await page.locator('p.low-contrast').evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.color !== 'rgb(170, 170, 170)';
    });
    expect(contrastFixed).toBe(true);

    // --- axe says zero for every covered rule ------------------------------
    const results = await new AxeBuilder({ page }).withRules(COVERED_RULES).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

    // The domain-specific fix is not in the fixture (axe marks it inapplicable)
    // without a ≥3×3 bordered data table — covered by the table-page test.

    // --- badge matches report ------------------------------------------------
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const fixedCount = await page.locator('[data-a11y-fixed]').count();
    expect(fixedCount).toBeGreaterThan(0);
    await expect.poll(async () => {
      const text = await sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return chrome.action.getBadgeText({ tabId: tab.id });
      });
      return Number(text);
    }).toBe(fixedCount);

    // --- idempotency: explicit re-run must fix nothing new ------------------
    // Send straight to the fixture tab (same call the SW makes on RERUN).
    const tab = await sw.evaluate(async () => {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { id: t.id };
    });
    const badgeText = async () => sw.evaluate((t) => chrome.action.getBadgeText({ tabId: t }), tab.id);
    const before = await page.locator('[data-a11y-fixed]').count();
    // Resolves with the content script's {status:'reran'} once the run completes.
    await sw.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'A11Y_RERUN' }), tab.id);
    // The rerun's report shows zero new fixes, so the badge falls back to 0.
    await expect.poll(async () => Number(await badgeText())).toBe(0);
    const after = await page.locator('[data-a11y-fixed]').count();
    expect(after).toBe(before);

    await context.close();
  });

  test("repairs a header-less data table so td-has-header passes", async () => {
    const context = await extensionContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/table-page.html`);
    await waitForDone(page);

    const headerCells = page.locator('table.data-table tr').first().locator('td');
    await expect(headerCells.first()).toHaveAttribute('scope', 'col');
    await expect(headerCells.first()).toHaveAttribute('role', 'columnheader');
    await expect(page.locator('table.data-table caption')).toHaveText('Quarterly Sales');

    const results = await new AxeBuilder({ page }).withRules(['td-has-header', 'th-has-data-cells']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await context.close();
  });

  test("popup and options pages render without axe violations", async () => {
    const context = await extensionContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/bad-page.html`);
    await waitForDone(page);

    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = new URL(sw.url()).host;

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const popupResults = await new AxeBuilder({ page: popup }).analyze();
    expect(popupResults.violations, JSON.stringify(popupResults.violations, null, 2)).toEqual([]);
    await expect(popup.locator('body')).toContainText('a11y-autofix');

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const optionsResults = await new AxeBuilder({ page: options }).analyze();
    expect(optionsResults.violations, JSON.stringify(optionsResults.violations, null, 2)).toEqual([]);
    await expect(options.locator('body')).toContainText('a11y-autofix options');

    await context.close();
  });
});