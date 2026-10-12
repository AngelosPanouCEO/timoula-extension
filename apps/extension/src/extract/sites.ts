/** Which supported site a URL belongs to, and whether it looks like a single listing. */
import type { Site } from '@timoula/core';

export interface SiteMatch {
  site: Site;
  host: string;
  /** URL pattern of a single listing (the parser still confirms from page data). */
  looksLikeListing: boolean;
}

export function matchSite(rawUrl: string): SiteMatch | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'mobile.de' || host.endsWith('.mobile.de')) {
    const looksLikeListing = /\/fahrzeuge\/details\.html/.test(url.pathname) || /\/auto-inserat\//.test(url.pathname) || /\/(en|el)?\/?(fahrzeuge|vehicles)\/details/.test(url.pathname);
    return { site: 'mobile.de', host, looksLikeListing };
  }
  if (/(^|\.)autoscout24\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) {
    const looksLikeListing = /\/(angebote|offerte|offres|annonces|aanbod|ofertas|oferta|erbjudanden|nabidky|ponuky|oglasi|oferte|hirdetes|ads|offers)\//.test(url.pathname);
    return { site: 'autoscout24', host, looksLikeListing };
  }
  return null;
}
