#!/usr/bin/env node
/**
 * End-to-end check in a real Chromium with the unpacked extension loaded.
 * Listing pages are served from apps/extension/test/fixtures (network routed),
 * so the run is repeatable. Screenshots go to apps/extension/dist-e2e/screens/.
 *
 *   npm run build:e2e && npm run e2e            # fixtures
 *   E2E_LIVE=1 npm run e2e                     # also try the live AutoScout24 URLs
 *   CHROMIUM_PATH=/path/to/chrome npm run e2e  # custom browser
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const ext = join(root, 'apps/extension/dist-e2e');
const fixtures = join(root, 'apps/extension/test/fixtures');
const shots = join(ext, 'screens');
mkdirSync(shots, { recursive: true });
if (!existsSync(join(ext, 'manifest.json'))) throw new Error('Run `npm run build:e2e` first');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const dir = existsSync(base) ? readdirSync(base).find((d) => /^chromium-\d+$/.test(d)) : null;
  if (dir) return join(base, dir, 'chrome-linux/chrome');
  return undefined; // let playwright decide
}

const pages = Object.fromEntries(
  readdirSync(fixtures)
    .filter((f) => f.endsWith('.url.txt'))
    .map((f) => [readFileSync(join(fixtures, f), 'utf8').trim(), join(fixtures, f.replace('.url.txt', '.html'))]),
);
const byName = (prefix) => Object.entries(pages).find(([, file]) => file.includes(`/${prefix}_`))[0];

const context = await chromium.launchPersistentContext(join(tmpdir(), `timoula-e2e-${Date.now()}`), {
  executablePath: findChromium(),
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new', '--lang=el-GR'],
  locale: 'el-GR',
  viewport: { width: 1280, height: 900 },
});

const live = process.env.E2E_LIVE === '1';
if (!live) {
  await context.route(/^https:\/\/www\.car\.gr\//, (route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(join(fixtures, 'cargr_audi_a3_results.html'), 'utf8') })
      : route.fulfill({ status: 204, body: '' }),
  );
  await context.route(/^https:\/\/(suchen\.mobile\.de|www\.autoscout24\.[a-z]+)\//, async (route) => {
    const url = route.request().url();
    const file = pages[url];
    if (file && route.request().resourceType() === 'document') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(file, 'utf8') });
    return route.fulfill({ status: 204, body: '' });
  });
}
await context.route(/^https:\/\/(prod\.pictures\.autoscout24\.net|img\.classistatic\.de)\//, (route) => route.fulfill({ status: 204, body: '' }));

let [worker] = context.serviceWorkers();
worker ??= await context.waitForEvent('serviceworker');
const extId = new URL(worker.url()).host;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function openPopupFor(url, shotName) {
  const listing = await context.newPage();
  await listing.goto(url, { waitUntil: 'domcontentloaded' });
  const tabId = await worker.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 780, height: 1600 });
  await popup.goto(`chrome-extension://${extId}/popup/index.html?tabId=${tabId}`);
  await popup.waitForSelector('.state, .listing-head', { timeout: 15000 });
  await popup.waitForTimeout(600);
  await popup.screenshot({ path: join(shots, `${shotName}.png`), fullPage: true });
  return { listing, popup };
}

const text = (p) => p.evaluate(() => document.body.innerText);

if (!live) {
// 01: official ΛΤΠΦ, Euro class missing → choose 5b → tax as in tax-cases/01
{
  const { popup } = await openPopupFor(byName('01'), '01-initial');
  const t = await text(popup);
  check('01 shows official ΛΤΠΦ 21.620,81 €', t.includes('Επίσημη τιμή') && t.includes('21.620,81'));
  check('01 asks for the missing Euro class', t.includes('κλάση Euro'));
  await popup.selectOption('label:has-text("Κλάση Euro") select', '5b');
  await popup.fill('label:has-text("Αναμενόμενη ταξινόμηση") input', '2026-11-11'); // fixed date → same tax as tax-cases/01
  await popup.waitForTimeout(300);
  const t2 = await text(popup);
  check('01 registration tax 1.237,34 € after choosing Euro 5b', t2.includes('1.237,34'), t2.match(/Τέλος ταξινόμησης\s+([\d.,]+ €)/)?.[1] ?? '');
  check('01 environmental fee 1.000 €', t2.includes('Περιβαλλοντικό τέλος'));
  check('01 shows options A and B', t2.includes('Α. Μεταφορά με νταλίκα') && t2.includes('Β. Οδήγηση μέχρι την Ελλάδα'));
  await popup.fill('textarea[placeholder]', '9.500\n11.000\n10.200');
  await popup.waitForTimeout(300);
  const t3 = await text(popup);
  check('01 market median 10.200 € and verdict', t3.includes('10.200') && /Συμφέρει|Οριακό|Δεν συμφέρει/.test(t3));
  await popup.click('text=Δες τον υπολογισμό');
  await popup.waitForTimeout(1200); // autosave debounce
  await popup.screenshot({ path: join(shots, '01-complete.png'), fullPage: true });
}

// 02: several versions → choose
{
  const { popup } = await openPopupFor(byName('02'), '02-choose');
  const t = await text(popup);
  check('02 offers a choice of versions (Active not in Greek list)', t.includes('Ταιριάζουν 2 εκδόσεις'));
}

// 03: gap in the price lists → estimate (γ), mild hybrid needs confirmation
{
  const { popup } = await openPopupFor(byName('03'), '03-estimate');
  const t = await text(popup);
  check('03 offers the MHEV versions of another period (criterion γ) as estimates', t.includes('Ταιριάζουν 3 εκδόσεις') && t.includes('κριτήριο γ') && t.includes('Εκτίμηση'));
  await popup.click('.candidate:has-text("PREMIUM") button');
  await popup.click('label:has-text("Επιβεβαιώνω τον τύπο κινητήρα") input');
  await popup.waitForTimeout(300);
  const t2 = await text(popup);
  check('03 after choosing PREMIUM: ΛΤΠΦ 33.812,77 € as estimate, tax calculated', t2.includes('33.812,77') && /Τέλος ταξινόμησης\s+[\d.,]+\s€/.test(t2));
  await popup.screenshot({ path: join(shots, '03-chosen.png'), fullPage: true });
  check('03 mild hybrid needs confirmation', t.includes('Ήπιο υβριδικό') && t.includes('Επιβεβαιώνω τον τύπο κινητήρα'));
}

// 06: BMW 330e → PHEV suggested, CO2 missing
{
  const { popup } = await openPopupFor(byName('06'), '06-phev');
  const t = await text(popup);
  check('06 suggests plug-in hybrid', /330E → PHEV/i.test(t) && t.includes('Plug-in υβριδικό'));
  check('06 asks for CO2', t.includes('CO2'));
}

// 08: new means of transport
{
  const { popup } = await openPopupFor(byName('08'), '08-nmt');
  await popup.fill('label:has-text("ΛΤΠΦ (λιανική") input', '20000');
  await popup.waitForTimeout(300);
  const t = await text(popup);
  check('08 flags new means of transport (24% VAT)', t.includes('Καινούργιο μεταφορικό μέσο'));
}

// 16: Swiss seller → blocked
{
  const { popup } = await openPopupFor(byName('16'), '16-non-eu');
  const t = await text(popup);
  check('16 non-EU listing is not calculated', t.includes('Δεν μπορούμε να υπολογίσουμε το κόστος εισαγωγής για αυτή την αγγελία, επειδή δεν βρίσκεται στην ΕΕ.'));
}

// 17: results page
{
  const { popup } = await openPopupFor(byName('17'), '17-not-listing');
  check('17 search page → "not a single listing"', (await text(popup)).includes('δεν είναι μία αγγελία'));
}

// 18: van
{
  const { popup } = await openPopupFor(byName('18'), '18-commercial');
  check('18 VW T6 Kasten flagged as commercial', (await text(popup)).includes('Μάλλον επαγγελματικό όχημα'));
}

// Unsupported page
{
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extId}/popup/index.html?tabId=999999`);
  await p.waitForSelector('.state');
  check('unknown tab → friendly message', (await text(p)).includes('Άνοιξε μια αγγελία'));
}

// Reopen 01 three times → same entry continues, earlier choices kept, no duplicates
{
  for (let i = 0; i < 3; i++) {
    const { popup } = await openPopupFor(byName('01'), '01-reopened');
    const t = await text(popup);
    if (i === 0) {
      check('01 reopened continues the earlier calculation', t.includes('Συνέχεια του υπολογισμού'));
      check('01 reopened keeps the Euro 5b choice (tax 1.237,34 €)', t.includes('1.237,34'));
      check('01 reopened keeps the market prices (median 10.200 €)', t.includes('10.200'));
    }
    await popup.waitForTimeout(1200);
    await popup.close();
  }
}

// car.gr: search link format and the (d) page reader
{
  const { popup } = await openPopupFor(byName('01'), '01-cargr');
  const [searchTab] = await Promise.all([context.waitForEvent('page'), popup.click('text=Άνοιγμα αναζήτησης car.gr')]);
  await searchTab.waitForLoadState('domcontentloaded');
  const u = new URL(searchTab.url());
  check('car.gr search link: /used-cars/subaru/xv.html with years and km', u.pathname === '/used-cars/subaru/xv.html' && u.searchParams.get('registration-from') === '2013' && u.searchParams.get('mileage-to') === '188000' && !u.searchParams.has('mileage-from'), searchTab.url());
  const s = await context.newPage();
  await s.goto(`chrome-extension://${extId}/pages/settings/index.html`);
  await s.click('label:has-text("Ανάγνωση τιμών από τη σελίδα car.gr") input');
  await s.waitForTimeout(300);
  await s.close();
  // Tabs opened by the extension bypass Playwright routing (they would hit Cloudflare), so load the
  // same URL in a tab the test controls, served from the saved car.gr page.
  const searchUrl = searchTab.url();
  await searchTab.close();
  const cargr = await context.newPage();
  await cargr.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  const { popup: p2 } = await openPopupFor(byName('01'), '01-cargr-reader');
  await cargr.bringToFront();
  if (process.env.E2E_DEBUG) console.log(await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'https://www.car.gr/*' });
    const out = [];
    for (const t of tabs) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['extract.js'] });
        const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => globalThis.__timoulaReadCarGr?.() ?? 'no-fn' });
        out.push({ url: t.url, status: t.status, r: JSON.stringify(r?.result).slice(0, 200) });
      } catch (e) { out.push({ url: t.url, err: String(e) }); }
    }
    return out;
  }));
  await p2.click('text=Ανάγνωση τιμών από την καρτέλα car.gr');
  await p2.waitForTimeout(500);
  const t = await text(p2);
  check('car.gr reader reads 16.900 € from the results page', t.includes('Διαβάστηκαν 1 τιμές') && t.includes('16.900'), t.match(/Διαβάστηκαν[^\n]*/)?.[0] ?? '');
  await p2.screenshot({ path: join(shots, '01-cargr-reader.png'), fullPage: true });
}

// History page
{
  const h = await context.newPage();
  await h.goto(`chrome-extension://${extId}/pages/history/index.html`);
  await h.waitForSelector('table.history, .muted');
  await h.waitForTimeout(500);
  await h.screenshot({ path: join(shots, 'history.png'), fullPage: true });
  const t = await text(h);
  check('history lists the Subaru XV calculation', t.includes('Subaru XV'));
  const xvRows = await h.locator('table.history tbody tr', { hasText: 'Subaru XV' }).count();
  check('history has ONE entry for the listing opened 4 times', xvRows === 1, `${xvRows} rows`);
  const [download] = await Promise.all([h.waitForEvent('download'), h.click('text=Εξαγωγή CSV')]);
  const csvPath = join(shots, 'history.csv');
  await download.saveAs(csvPath);
  const csv = readFileSync(csvPath, 'utf8');
  check('CSV export contains the calculation', csv.includes('registration_tax_eur') && csv.includes('1237.34'));
}

// Settings page
{
  const s = await context.newPage();
  await s.goto(`chrome-extension://${extId}/pages/settings/index.html`);
  await s.waitForSelector('h1');
  await s.screenshot({ path: join(shots, 'settings.png'), fullPage: true });
  check('settings show rules and ΛΤΠΦ table', (await text(s)).includes('311 εγγραφές'));
  await s.click('text=English');
  await s.waitForTimeout(300);
  check('language switch to English', (await text(s)).includes('Settings'));
}

}

if (live) {
  // Live pages change or disappear; this reports what parses today. mobile.de blocks automated browsers.
  for (const [url] of Object.entries(pages).filter(([u]) => u.includes('autoscout24'))) {
    const name = Object.entries(pages).find(([u]) => u === url)[1].split('/').pop().replace('.html', '');
    try {
      const { popup } = await openPopupFor(url, `live-${name}`);
      const t = (await text(popup)).replace(/\s+/g, ' ');
      const ok = /Αυτοκίνητο|δεν είναι μία αγγελία|Εκτός ΕΕ/.test(t);
      check(`LIVE ${name}`, ok, t.slice(0, 140));
    } catch (e) {
      check(`LIVE ${name}`, false, String(e).slice(0, 140));
    }
  }
}

await context.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
