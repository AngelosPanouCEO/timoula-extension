/**
 * Domain model shared by the extension and (later) the backend.
 * Money is stored in whole euro cents (integers) to avoid float drift.
 */

/** Where a value came from. Shown next to every field in the UI. */
export type FieldSource =
  | 'jsonld' // schema.org JSON-LD on the page
  | 'embedded-json' // site JSON (__NEXT_DATA__, RSC payload)
  | 'dom' // visible page text
  | 'derived' // computed from other fields (e.g. hp from kW)
  | 'user'; // entered or corrected by the client

export interface Field<T> {
  value: T | null;
  source: FieldSource | null;
  /** Raw text as found on the page, for transparency. */
  raw?: string | null;
}

export const emptyField = <T>(): Field<T> => ({ value: null, source: null });

export type Site = 'mobile.de' | 'autoscout24';

/** Fuel as stated by the listing (not a tax category). */
export type Fuel = 'petrol' | 'diesel' | 'electric' | 'lpg' | 'cng' | 'hydrogen' | 'petrol_electric' | 'diesel_electric' | 'other';

/** Powertrain, which drives hybrid/BEV exemptions. Never inferred silently. */
export type Powertrain = 'ICE' | 'MHEV' | 'HEV' | 'PHEV' | 'BEV' | 'FCEV';

/** Customs depreciation categories (ΦΕΚ Β' 4618/2017). */
export type BodyCategory = 'suv_atv' | 'hatchback' | 'sedan' | 'cabrio' | 'coupe_roadster' | 'mpv';

export const BODY_CATEGORIES: readonly BodyCategory[] = ['suv_atv', 'hatchback', 'sedan', 'cabrio', 'coupe_roadster', 'mpv'];

/** Euro emission standard. 'none' = conventional technology (pre-Euro). */
export type EuroClass = 'none' | '1' | '2' | '3' | '4' | '5' | '5a' | '5b' | '6' | '6a' | '6b' | '6c' | '6d-temp' | '6d' | '6e' | '7';

export const EURO_CLASSES: readonly EuroClass[] = ['none', '1', '2', '3', '4', '5', '5a', '5b', '6', '6a', '6b', '6c', '6d-temp', '6d', '6e', '7'];

export type Co2Cycle = 'NEDC' | 'WLTP';
export type Gearbox = 'manual' | 'automatic';
export type SellerType = 'dealer' | 'private';
export type PriceBasis = 'gross' | 'net';

/** Everything we read from (or the client corrected on) a single listing. */
export interface ListingData {
  site: Site;
  /** Hostname the listing was read from, e.g. www.autoscout24.de */
  host: string;
  /** Site-specific stable listing id. */
  listingId: string;
  url: string;
  title: Field<string>;
  make: Field<string>;
  model: Field<string>;
  version: Field<string>;
  /** Listed price in EUR cents. Treated as gross (see priceBasis). */
  priceCents: Field<number>;
  /** Net price (without VAT) if the listing shows one, EUR cents. */
  priceNetCents: Field<number>;
  /** VAT rate shown by the listing, percent (e.g. 19). */
  vatRatePct: Field<number>;
  /** ISO currency of the listed price. Only EUR is calculated in phase 1. */
  currency: Field<string>;
  /** First registration date as ISO date (YYYY-MM-DD). */
  firstRegistration: Field<string>;
  /** True when the listing gives month/year only and the day was filled in. */
  firstRegistrationDayAssumed: boolean;
  mileageKm: Field<number>;
  fuel: Field<Fuel>;
  /** Fuel text exactly as shown on the page. */
  fuelRaw: Field<string>;
  displacementCc: Field<number>;
  powerKw: Field<number>;
  powerHp: Field<number>;
  co2GKm: Field<number>;
  /** Only set when the listing states the cycle in a way we trust. */
  co2Cycle: Field<Co2Cycle>;
  euroClass: Field<EuroClass>;
  bodyTypeRaw: Field<string>;
  gearbox: Field<Gearbox>;
  sellerType: Field<SellerType>;
  /** ISO alpha-2 country where the car/seller is located. */
  countryCode: Field<string>;
  vin: Field<string>;
  photoUrl: Field<string>;
  /** Battery capacity in kWh, a PHEV/BEV signal. */
  batteryKwh: Field<number>;
  /** Listing says new / pre-registered (Tageszulassung). */
  isNewOrPreRegistered: Field<boolean>;
  /** Site's own vehicle category (e.g. "Car", "Van"). */
  siteCategory: Field<string>;
  /** Site's own powertrain flag (AutoScout24 vehicleType). Unreliable; only a signal. */
  sitePowertrainFlag: Field<string>;
}

export type ExtractionFailure =
  | { kind: 'unsupported-site' }
  | { kind: 'not-a-listing' }
  | { kind: 'parse-error'; message: string };

export type ExtractionResult = { ok: true; listing: ListingData; warnings: string[] } | ({ ok: false } & ExtractionFailure);
