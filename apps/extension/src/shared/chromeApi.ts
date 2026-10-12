/** Thin wrappers over chrome.* used by the pages. */
import type { ExtractionResult } from '@timoula/core';
import type { CarGrResults } from '../extract/cargr';

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
 * Reads the results car.gr embeds in the results tab the client opened.
 */
export async function readCarGrPrices(): Promise<{ tabFound: boolean; results: CarGrResults | null }> {
  const tabs = await chrome.tabs.query({ url: CARGR_ORIGIN });
  const tab = tabs.find((t) => t.active) ?? tabs[0];
  if (!tab?.id) return { tabFound: false, results: null };
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__timoulaReadCarGr?.() ?? null });
  return { tabFound: true, results: (res?.result as CarGrResults | null | undefined) ?? null };
}
