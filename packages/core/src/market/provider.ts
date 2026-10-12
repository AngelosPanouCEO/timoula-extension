/**
 * Pluggable Greek market value providers. Phase 1 ships:
 *  - "cargr-assisted": opens a pre-filtered car.gr search; the client types the prices (default).
 *  - "cargr-page-reader": reads prices from the car.gr results page the client opened.
 *    Off by default pending a legal check of car.gr's terms (see docs/market-value.md).
 * Later providers (licensed valuation data, backend aggregation) implement the same interface.
 */
import type { Fuel } from '../types';
import { priceStats, type PriceStats } from './stats';

export interface MarketQuery {
  make: string | null;
  model: string | null;
  firstRegistrationYear: number | null;
  mileageKm: number | null;
  fuel: Fuel | null;
}

export interface Comparable {
  priceCents: number;
  /** Where the price came from: typed by the client or read from the page. */
  origin: 'manual' | 'page';
  label?: string | null;
}

export interface MarketComparison {
  providerId: string;
  query: MarketQuery;
  searchUrl: string | null;
  comparables: Comparable[];
  stats: PriceStats | null;
  collectedAt: string;
}

export interface MarketValueProvider {
  id: string;
  /** 'assisted' needs the client to enter prices; 'page' reads them from an open page. */
  mode: 'assisted' | 'page';
  buildSearchUrl(q: MarketQuery): string | null;
}

export function buildComparison(providerId: string, query: MarketQuery, searchUrl: string | null, comparables: Comparable[], nowIso: string): MarketComparison {
  return { providerId, query, searchUrl, comparables, stats: priceStats(comparables.map((c) => c.priceCents)), collectedAt: nowIso };
}
