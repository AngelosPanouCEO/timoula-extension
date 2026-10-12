/**
 * car.gr search URL builder. The URL format lives in settings as a template so it
 * can be corrected without a release: run a search on car.gr, copy the URL and
 * replace the values with placeholders.
 * Placeholders: {make} {model} {yearFrom} {yearTo} {kmFrom} {kmTo} {fuel}
 * Query parameters whose placeholder has no value are dropped; a path segment
 * whose placeholder has no value is removed (/used-cars/audi/{model}.html → /used-cars/audi.html).
 *
 * Format confirmed from a real search (12/10/2026):
 *   /used-cars/audi/a3.html?make=14093&model=15197&registration-to=2022&mileage-to=150000&…
 * car.gr also sends numeric make/model ids; we rely on the slugs in the path (VERIFY that
 * the path alone filters). Fuel parameter values are not known yet, so fuel is left out.
 */
import type { Fuel } from '../types';
import type { MarketQuery, MarketValueProvider } from './provider';

export interface CarGrSettings {
  /** VERIFY: parameter names were not checked against the live site (Cloudflare blocks automated access). */
  urlTemplate: string;
  fuelCodes: Partial<Record<Fuel, string>>;
  yearSpan: number;
  /** Mileage window around the listing, ± percent. */
  mileageSpanPct: number;
  /** (d) Read prices from the open car.gr page. Off by default. */
  pageReaderEnabled: boolean;
}

export const DEFAULT_CARGR_SETTINGS: CarGrSettings = {
  urlTemplate:
    'https://www.car.gr/used-cars/{make}/{model}.html?offer_type=sale&registration-from={yearFrom}&registration-to={yearTo}&mileage-from={kmFrom}&mileage-to={kmTo}',
  fuelCodes: { petrol: 'petrol', diesel: 'diesel', electric: 'electric', lpg: 'lpg', cng: 'cng', petrol_electric: 'hybrid', diesel_electric: 'hybrid' },
  yearSpan: 1,
  mileageSpanPct: 25,
  pageReaderEnabled: false,
};

export function buildCarGrUrl(q: MarketQuery, s: CarGrSettings): string | null {
  if (!q.make) return null;
  const roundKm = (n: number) => Math.round(n / 1000) * 1000;
  const values: Record<string, string | null> = {
    make: q.make,
    model: q.model,
    yearFrom: q.firstRegistrationYear !== null ? String(q.firstRegistrationYear - s.yearSpan) : null,
    yearTo: q.firstRegistrationYear !== null ? String(q.firstRegistrationYear + s.yearSpan) : null,
    kmFrom: q.mileageKm !== null ? String(Math.max(0, roundKm(q.mileageKm * (1 - s.mileageSpanPct / 100)))) : null,
    kmTo: q.mileageKm !== null ? String(roundKm(q.mileageKm * (1 + s.mileageSpanPct / 100))) : null,
    fuel: q.fuel ? (s.fuelCodes[q.fuel] ?? null) : null,
  };
  let url: URL;
  try {
    url = new URL(s.urlTemplate.replace(/\{(\w+)\}/g, (_, k: string) => `__${k}__`));
  } catch {
    return null;
  }
  const params = new URLSearchParams();
  for (const [key, val] of url.searchParams) {
    const m = /^__(\w+)__$/.exec(val);
    if (!m) params.append(key, val);
    else if (values[m[1]!]) params.append(key, values[m[1]!]!);
  }
  url.search = params.toString();
  // Path placeholders become slugs; an empty one removes its path segment.
  let path = decodeURIComponent(url.pathname);
  for (const [k, val] of Object.entries(values)) {
    const slug = val ? carGrSlug(val) : '';
    path = slug ? path.replace(`__${k}__`, slug) : path.replace(new RegExp(`/__${k}__`), '');
  }
  url.pathname = path.replace(/\/{2,}/g, '/');
  return url.toString();
}

/** "Mercedes-Benz" → "mercedes-benz", "C 200" → "c-200", "Škoda" → "skoda". */
export function carGrSlug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Earlier default templates, replaced automatically when a client still has them saved. */
export const OUTDATED_CARGR_TEMPLATES = [
  'https://www.car.gr/classifieds/cars/?make={make}&model={model}&registration-from={yearFrom}&registration-to={yearTo}&mileage-from={kmFrom}&mileage-to={kmTo}&fuel_type={fuel}',
];

export const carGrAssistedProvider = (s: CarGrSettings): MarketValueProvider => ({
  id: 'cargr-assisted',
  mode: 'assisted',
  buildSearchUrl: (q) => buildCarGrUrl(q, s),
});
