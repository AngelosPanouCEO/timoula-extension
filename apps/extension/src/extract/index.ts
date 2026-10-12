/**
 * Entry point injected into the listing tab (chrome.scripting.executeScript).
 * It only reads the page; it never changes it and never sends anything anywhere.
 * Seller names, phone numbers and free-text descriptions are not extracted (GDPR data minimisation).
 */
import type { ExtractionResult } from '@timoula/core';
import { parseAutoScout24 } from './autoscout24';
import { parseMobileDe } from './mobilede';
import { matchSite } from './sites';

export function extractListing(doc: Document, url: string): ExtractionResult {
  const site = matchSite(url);
  if (!site) return { ok: false, kind: 'unsupported-site' };
  try {
    return site.site === 'autoscout24' ? parseAutoScout24(doc, url, site.host) : parseMobileDe(doc, url, site.host);
  } catch (e) {
    return { ok: false, kind: 'parse-error', message: e instanceof Error ? e.message : String(e) };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __timoulaExtract: (() => ExtractionResult) | undefined;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  globalThis.__timoulaExtract = () => extractListing(document, location.href);
}
