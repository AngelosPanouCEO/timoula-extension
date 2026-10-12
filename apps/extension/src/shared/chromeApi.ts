/** Thin wrappers over chrome.* used by the pages. */
import type { ExtractionResult } from '@timoula/core';

export async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/**
 * Read the listing in the given tab. Uses the temporary activeTab grant that
 * Chrome gives when the client clicks the toolbar icon (no permanent host access).
 */
export async function extractFromTab(tabId: number): Promise<ExtractionResult> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['extract.js'] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.__timoulaExtract?.() ?? null });
  const value = res?.result as ExtractionResult | null | undefined;
  if (!value) return { ok: false, kind: 'parse-error', message: 'extractor did not run' };
  return value;
}

export function openTab(url: string): void {
  void chrome.tabs.create({ url });
}

export function openPage(path: 'pages/history/index.html' | 'pages/settings/index.html' | 'pages/privacy/index.html', hash = ''): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) + hash });
}

export const CARGR_ORIGIN = 'https://www.car.gr/*';

export async function hasCarGrPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [CARGR_ORIGIN] });
}

export async function requestCarGrPermission(): Promise<boolean> {
  return chrome.permissions.request({ origins: [CARGR_ORIGIN] });
}

export async function removeCarGrPermission(): Promise<void> {
  await chrome.permissions.remove({ origins: [CARGR_ORIGIN] });
}

/**
 * (d) car.gr page reader, OFF by default (see docs/market-value.md).
 * Reads the prices the client is looking at in an open car.gr results tab.
 * Untested against the live site (car.gr blocks automated access from our test
 * environment); it tries JSON-LD offers first, then price-like elements.
 */
export async function readCarGrPrices(): Promise<{ tabFound: boolean; pricesCents: number[] }> {
  const tabs = await chrome.tabs.query({ url: CARGR_ORIGIN });
  const tab = tabs.find((t) => t.active) ?? tabs[0];
  if (!tab?.id) return { tabFound: false, pricesCents: [] };
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const prices: number[] = [];
      const toCents = (v: unknown) => {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d]/g, ''));
        return Number.isFinite(n) && n >= 500 && n < 2_000_000 ? Math.round(n * 100) : null;
      };
      for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const walk = (o: unknown): void => {
            if (Array.isArray(o)) return o.forEach(walk);
            if (o && typeof o === 'object') {
              const rec = o as Record<string, unknown>;
              if (rec['@type'] === 'Offer' && rec.price !== undefined) {
                const c = toCents(rec.price);
                if (c) prices.push(c);
              }
              Object.values(rec).forEach(walk);
            }
          };
          walk(JSON.parse(s.textContent ?? ''));
        } catch {
          /* ignore */
        }
      }
      if (!prices.length) {
        const nodes = Array.from(document.querySelectorAll('[class*="price" i], [data-testid*="price" i], [itemprop="price"]'));
        const seen = new Set<Element>();
        for (const el of nodes) {
          if ([...seen].some((s) => s.contains(el) || el.contains(s))) continue;
          const text = (el.getAttribute('content') ?? el.textContent ?? '').replace(/\s+/g, ' ');
          const m = /(\d{1,3}(?:[.\s]\d{3})+|\d{3,7})\s*€|€\s*(\d{1,3}(?:[.\s]\d{3})+|\d{3,7})/.exec(text) ?? (el.getAttribute('itemprop') === 'price' ? [text, text] : null);
          const c = m ? toCents((m[1] ?? m[2] ?? '').replace(/[.\s]/g, '')) : null;
          if (c) {
            prices.push(c);
            seen.add(el);
          }
        }
      }
      return prices;
    },
  });
  return { tabFound: true, pricesCents: (res?.result as number[] | undefined) ?? [] };
}
