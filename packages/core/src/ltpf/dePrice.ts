/**
 * Customs criterion ε (art. 9 Α.1203/2019): price in the country of origin without VAT.
 * German base prices per version ("Grundpreis", incl. 19% VAT) from the ADAC Autokatalog,
 * built by ltpf/tools/adac_crawl.py. A version matches on make, model, fuel, power (kW ±2)
 * and a production period that covers the date of first registration (±3 months).
 * The result is shaped as ΛΤΠΦ records with source_type "foreign_price_estimate", so the
 * popup shows them like any other candidate, always as an estimate.
 * VERIFY: ADAC terms of use before publishing; prices listed 7–12/2020 may include 16% VAT.
 */
import type { Fuel } from '../types';
import { compact, normName, tokens } from '../util/text';
import type { LtpfQuery } from './lookup';
import type { LtpfRecord } from './schema';

export interface DePriceTable {
  source: string;
  makes: string[];
  models: string[];
  /** [make, model, name, fuel, kw, from YYYY-MM, to YYYY-MM | null, price DE gross €, adac id] */
  rows: [number, number, string, Fuel | null, number | null, string, string | null, number, number][];
}

export const DE_VAT_RATE = 0.19;
const ADAC_URL = 'https://www.adac.de/rund-ums-fahrzeug/autokatalog/marken-modelle/';
const MAKE_SLUGS: Record<string, string> = { VOLKSWAGEN: 'VW', 'MERCEDES-BENZ': 'MERCEDES-BENZ', 'MERCEDES BENZ': 'MERCEDES-BENZ', MERCEDES: 'MERCEDES-BENZ', 'ALFA ROMEO': 'ALFA-ROMEO', 'LAND ROVER': 'LAND-ROVER', 'ROLLS ROYCE': 'ROLLS-ROYCE', 'ASTON MARTIN': 'ASTON-MARTIN' };

const ym = (iso: string) => iso.slice(0, 7);
const monthIndex = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;

function makeSlug(make: string): string {
  const n = normName(make).replace(/Š/g, 'S');
  return (MAKE_SLUGS[n] ?? n).replace(/\s+/g, '-');
}

/** Name without the make: "Audi A4 3.0 TDI quattro" → "A4 3.0 TDI quattro" ("VW Golf" → "Golf"). */
function withoutMake(name: string, slug: string): string {
  const words = name.split(/\s+/);
  const target = compact(slug);
  for (let n = 1; n <= Math.min(3, words.length - 1); n++) {
    if (compact(words.slice(0, n).join('')) === target) return words.slice(n).join(' ');
  }
  return name;
}

function modelMatches(slug: string, nameTok: string[], listingModel: string): boolean {
  const lm = compact(listingModel);
  const lt = tokens(listingModel);
  if (!lm) return false;
  const s = compact(slug);
  if (s === lm || s.startsWith(lm) || (lm.startsWith(s) && s.length >= 2)) return true;
  // BMW "3er-reihe" vs listing "320": compare with the first word of the version name ("320D").
  const first = nameTok[0] ?? '';
  if (!first || !lt[0]) return false;
  if (first === lt[0]) return true;
  const [short, long] = first.length < lt[0].length ? [first, lt[0]] : [lt[0], first];
  return /\d/.test(short) && long.startsWith(short) && /^[A-Z]{1,3}$/.test(long.slice(short.length));
}

function fuelFits(row: Fuel | null, q: Fuel | null): boolean {
  if (!row || !q || q === 'other') return true;
  const base = (f: Fuel) => (f === 'petrol_electric' ? 'petrol' : f === 'diesel_electric' ? 'diesel' : f);
  return base(row) === base(q);
}

function transmissionOf(name: string): string | null {
  const n = normName(name);
  if (/S TRONIC|DSG|DKG|DCT|EDC|POWERSHIFT|DOPPELKUPPLUNG/.test(n)) return 'DCT';
  if (/TIPTRONIC|STEPTRONIC|AUTOMATIK|AUTOMATIC|\bAT\b|G-TRONIC|\d+G-TRONIC|SPEEDSHIFT|EAT\d|AISIN/.test(n)) return 'AT';
  if (/MULTITRONIC|CVT|E-CVT|XTRONIC|LINEARTRONIC/.test(n)) return 'CVT';
  return null;
}

/** Records for the versions sold in Germany when the car was first registered. */
export function dePriceCandidates(table: DePriceTable, q: LtpfQuery): LtpfRecord[] {
  if (!q.make || !q.model || !q.firstRegistration) return [];
  const mi = table.makes.indexOf(makeSlug(q.make));
  if (mi < 0) return [];
  const when = monthIndex(ym(q.firstRegistration));
  const make = table.makes[mi]!;
  const qkw = q.powerKw ?? (q.powerHp !== null ? q.powerHp / 1.36 : null);
  const designation = compact(q.model);
  const exact: LtpfRecord[] = [];
  const near: LtpfRecord[] = [];
  for (const r of table.rows) {
    if (r[0] !== mi) continue;
    const [, mo, name, fuel, kw, from, to, price, id] = r;
    if (!fuelFits(fuel, q.fuel)) continue;
    if (when < monthIndex(from) - 3 || (to && when > monthIndex(to) + 3)) continue;
    const rest = withoutMake(name, make);
    const nt = tokens(rest);
    if (!modelMatches(table.models[mo]!, nt, q.model)) continue;
    // Power: ±2 kW; or, for the same designation ("C 200"), ±15% — ADAC gives mild hybrids'
    // system power (C 200 W206: 165 kW), listings the engine's (150 kW).
    let tier: 'exact' | 'near' | null = qkw === null ? 'exact' : null;
    if (qkw !== null && kw !== null) {
      if (Math.abs(kw - qkw) <= 2) tier = 'exact';
      else if (Math.abs(kw - qkw) / qkw <= 0.15 && designation.length >= 2 && compact(rest).startsWith(designation)) tier = 'near';
    }
    if (!tier) continue;
    const [modelWord, ...versionWords] = rest.split(/\s+/);
    (tier === 'exact' ? exact : near).push({
      id: `adac-${id}`,
      brand: normName(q.make),
      model: modelWord ?? normName(q.model),
      model_year_tag: null,
      version: versionWords.join(' '),
      engine_label: null,
      displacement_l: null,
      displacement_cc: null,
      fuel: fuel === 'petrol_electric' ? 'petrol' : fuel === 'diesel_electric' ? 'diesel' : (fuel as LtpfRecord['fuel']),
      powertrain: null,
      power_ps: kw !== null ? Math.round(kw * 1.36) : null,
      // Near matches keep the car's power so the power check does not exclude them.
      power_kw: tier === 'near' ? q.powerKw : kw,
      transmission: transmissionOf(name),
      drive: /QUATTRO|4MATIC|XDRIVE|4MOTION|ALLRAD|AWD|4X4/.test(normName(name)) ? 'AWD' : null,
      body_type: null,
      co2_g_km: null,
      co2_cycle: null,
      ltpf_eur: Math.round((price / (1 + DE_VAT_RATE)) * 100) / 100,
      retail_incl_tax_eur: price,
      valid_from: `${from}-01`,
      valid_to: to ? `${to}-28` : null,
      source_type: 'foreign_price_estimate',
      confidence: tier === 'exact' ? 'medium' : 'low',
      importer: null,
      protocol_no: null,
      list_label: `ADAC ${from.slice(5)}/${from.slice(2, 4)}–${to ? `${to.slice(5)}/${to.slice(2, 4)}` : ''}`,
      source_url: ADAC_URL,
      source_page: null,
      source_sha256: null,
      extraction_method: 'html',
      verified: false,
      notes: `Τιμή βάσης Γερμανίας ${price.toLocaleString('el-GR')} € με ΦΠΑ 19% (ADAC), χωρίς ΦΠΑ${tier === 'near' ? `· η ADAC δίνει ${kw} kW` : ''}.`,
    });
  }
  return exact.length ? exact : near;
}
