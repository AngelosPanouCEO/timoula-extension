/**
 * car.gr search URL builder. The URL format lives in settings as a template so it
 * can be corrected without a release: run a search on car.gr, copy the URL and
 * replace the values with placeholders.
 * Placeholders: {make} {model} {yearFrom} {yearTo} {kmFrom} {kmTo} {fuel}
 * Query parameters whose placeholder has no value are dropped.
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
    'https://www.car.gr/classifieds/cars/?make={make}&model={model}&registration-from={yearFrom}&registration-to={yearTo}&mileage-from={kmFrom}&mileage-to={kmTo}&fuel_type={fuel}',
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
  // Placeholders in the path (e.g. /cars/{make}/) are filled or the URL is rejected.
  let path = decodeURIComponent(url.pathname);
  for (const [k, val] of Object.entries(values)) path = path.replace(`__${k}__`, val ? encodeURIComponent(val.toLowerCase()) : '');
  url.pathname = path.replace(/\/{2,}/g, '/');
  return url.toString();
}

export const carGrAssistedProvider = (s: CarGrSettings): MarketValueProvider => ({
  id: 'cargr-assisted',
  mode: 'assisted',
  buildSearchUrl: (q) => buildCarGrUrl(q, s),
});
