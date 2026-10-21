/**
 * Customs criterion ε (art. 9 Α.1203/2019): price in the country of origin without VAT.
 * German base prices per version ("Grundpreis", incl. 19% VAT) from the ADAC Autokatalog,
 * built by ltpf/tools/adac_crawl.py. A version matches on make, model, fuel, power (kW ±2)
 * and a production period that covers the date of first registration (±3 months). Failing
 * that: the closest power of the same model (±25%), in period, else sold up to 18 months away.
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
/**
 * Price ∝ power^0.45 between versions of the same model: median over 4.757 pairs of base versions
 * (same model, fuel and launch date, power 8–30% apart) in the ADAC table.
 */
export const POWER_ELASTICITY = 0.45;
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

/** Listing model names that ADAC files under another model (generation codes, model families). */
const MODEL_ALIASES: Record<string, Record<string, string>> = {
  PORSCHE: { '930': '911', '964': '911', '993': '911', '996': '911', '997': '911', '991': '911', '992': '911', '718BOXSTER': 'BOXSTER', '718CAYMAN': 'CAYMAN', '718SPYDER': 'BOXSTER' },
};

function modelMatches(slug: string, nameTok: string[], listingModel: string, make: string): boolean {
  const alias = MODEL_ALIASES[make]?.[compact(listingModel)];
  if (alias) listingModel = alias;
  const lm = compact(listingModel);
  const lt = tokens(listingModel);
  if (!lm) return false;
  const s = compact(slug);
  if (s === lm || s.startsWith(lm) || (lm.startsWith(s) && s.length >= 2)) return true;
  // BMW listings give the version number ("325"), ADAC the series ("3er-reihe").
  const series = make === 'BMW' ? /^([1-8])\d\d[A-Z]{0,3}$/.exec(lm) : null;
  if (series && s.startsWith(`${series[1]}ER`)) return true;
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
  // Engine designation: the listing's model when it carries one ("C 200"), else the first version
  // word with a digit ("M50d", "xDrive40d"). The model family alone ("X5") is not one.
  const designation = compact(q.model);
  const versionDesignation = tokens(q.versionText).find((w) => /\d/.test(w) && /[A-Z]/.test(w) && w.length >= 3) ?? '';
  const exact: LtpfRecord[] = [];
  const near: LtpfRecord[] = [];
  const otherSame: LtpfRecord[] = []; // the same version, sold up to 18 months before or after
  const other: LtpfRecord[] = []; // closest versions sold up to 18 months before or after
  const sameDesignation = (rest: string) => {
    const c = compact(rest);
    const modelWord = compact(rest.split(/\s+/)[0]);
    if (designation.length > modelWord.length && c.startsWith(designation)) return true;
    return versionDesignation !== '' && tokens(rest).includes(versionDesignation);
  };
  for (const r of table.rows) {
    if (r[0] !== mi) continue;
    const [, mo, name, fuel, kw, from, to, price, id] = r;
    if (!fuelFits(fuel, q.fuel)) continue;
    const away = Math.max(0, monthIndex(from) - when, to ? when - monthIndex(to) : 0);
    if (away > 18) continue;
    const rest = withoutMake(name, make);
    const nt = tokens(rest);
    if (!modelMatches(table.models[mo]!, nt, q.model, make)) continue;
    // Power: ±2 kW; or, for the same designation ("C 200"), ±15% — ADAC gives mild hybrids'
    // system power (C 200 W206: 165 kW), listings the engine's (150 kW).
    let tier: 'exact' | 'designation' | 'near' | null = qkw === null ? 'exact' : null;
    if (qkw !== null && kw !== null) {
      const rel = Math.abs(kw - qkw) / qkw;
      if (Math.abs(kw - qkw) <= 2) tier = 'exact';
      else if (rel <= 0.15 && sameDesignation(rest)) tier = 'designation';
      else if (rel <= 0.25) tier = 'near'; // closest version of the same model (other power)
    }
    if (!tier) continue;
    const otherPeriod = away > 3;
    const sameVersion = tier !== 'near';
    if (otherPeriod) tier = sameVersion ? 'designation' : 'near';
    // Another version must also have the same fuel: a petrol car is not priced as its plug-in.
    if (tier === 'near' && fuel && q.fuel && fuel !== q.fuel) continue;
    const [modelWord, ...versionWords] = rest.split(/\s+/);
    // Another version's price, adjusted for the power difference (see POWER_ELASTICITY).
    const factor = tier === 'near' && qkw !== null && kw ? Math.pow(qkw / kw, POWER_ELASTICITY) : 1;
    const adjusted = Math.round(price * factor);
    (otherPeriod ? (sameVersion ? otherSame : other) : tier === 'near' ? near : exact).push({
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
      // Inexact power matches keep the car's power so the power check does not exclude them.
      power_kw: tier === 'exact' ? kw : q.powerKw,
      transmission: transmissionOf(name),
      drive: /QUATTRO|4MATIC|XDRIVE|4MOTION|ALLRAD|AWD|4X4/.test(normName(name)) ? 'AWD' : null,
      body_type: null,
      co2_g_km: null,
      co2_cycle: null,
      ltpf_eur: Math.round((adjusted / (1 + DE_VAT_RATE)) * 100) / 100,
      retail_incl_tax_eur: adjusted,
      valid_from: `${from}-01`,
      valid_to: to ? `${to}-28` : null,
      source_type: 'foreign_price_estimate',
      confidence: tier === 'near' || otherPeriod ? 'low' : 'medium',
      importer: null,
      protocol_no: null,
      list_label: `ADAC ${from.slice(5)}/${from.slice(2, 4)}–${to ? `${to.slice(5)}/${to.slice(2, 4)}` : ''}`,
      source_url: ADAC_URL,
      source_page: null,
      source_sha256: null,
      extraction_method: 'html',
      verified: false,
      notes: `Τιμή βάσης Γερμανίας ${price.toLocaleString('el-GR')} € με ΦΠΑ 19% (ADAC), χωρίς ΦΠΑ${otherPeriod && sameVersion ? ` · ίδια έκδοση, πωλήθηκε ${from.slice(5)}/${from.slice(0, 4)}–${to ? `${to.slice(5)}/${to.slice(0, 4)}` : ''}` : otherPeriod ? ` · κοντινότερη έκδοση του μοντέλου (${kw} kW), πωλήθηκε ${from.slice(5)}/${from.slice(0, 4)}–${to ? `${to.slice(5)}/${to.slice(0, 4)}` : ''}` : tier === 'near' ? ` · κοντινότερη έκδοση του μοντέλου (${kw} kW)` : tier === 'designation' ? ` · η ADAC δίνει ${kw} kW` : ''}${factor !== 1 ? ` · προσαρμογή για την ισχύ ${qkw!.toFixed(0)}/${kw} kW: ×${factor.toLocaleString('el-GR', { maximumFractionDigits: 3 })} → ${adjusted.toLocaleString('el-GR')} €` : ''}.`,
    });
  }
  if (exact.length) return exact;
  // Closest power first (then closest in time), a few at most.
  const k = (r: LtpfRecord) => Math.abs(Number(/\((\d+) kW\)/.exec(r.notes ?? '')?.[1] ?? 0) - (qkw ?? 0));
  const t = (r: LtpfRecord) => Math.abs(monthIndex(r.valid_from) - when);
  if (otherSame.length) return otherSame.sort((a, b) => t(a) - t(b)).slice(0, 4);
  return (near.length ? near : other).sort((a, b) => k(a) - k(b) || t(a) - t(b)).slice(0, 4);
}

/**
 * Last resort: median German base price (without VAT) of new cars with similar power and the same
 * fuel, sold around the date of first registration — same make first (≥ 3 versions, kW ±10%),
 * else all makes (≥ 5 versions, kW ±5%). Bounded, but only a rough estimate.
 */
export function deMarketEstimate(table: DePriceTable, q: LtpfQuery): LtpfRecord | null {
  const qkw = q.powerKw ?? (q.powerHp !== null ? q.powerHp / 1.36 : null);
  if (qkw === null || !q.firstRegistration || !q.make) return null;
  const when = monthIndex(ym(q.firstRegistration));
  const mi = table.makes.indexOf(makeSlug(q.make));
  const inPeriod = (from: string, to: string | null) => when >= monthIndex(from) - 12 && (!to || when <= monthIndex(to) + 12);
  const pick = (sameMake: boolean, tol: number, min: number) => {
    const prices = table.rows
      .filter((r) => (!sameMake || r[0] === mi) && fuelFits(r[3], q.fuel) && r[4] !== null && Math.abs(r[4] - qkw) / qkw <= tol && inPeriod(r[5], r[6]))
      .map((r) => r[7])
      .sort((a, b) => a - b);
    return prices.length >= min ? { median: prices[Math.floor(prices.length / 2)]!, n: prices.length } : null;
  };
  const make = mi >= 0 ? pick(true, 0.1, 3) : null;
  const res = make ?? pick(false, 0.05, 5);
  if (!res) return null;
  const scope = make ? `ίδιας μάρκας` : `όλων των μαρκών`;
  return {
    id: make ? 'market-make' : 'market-all',
    brand: normName(q.make),
    model: q.model ?? '',
    model_year_tag: null,
    version: q.versionText ?? '',
    engine_label: null,
    displacement_l: null,
    displacement_cc: q.displacementCc,
    fuel: null,
    powertrain: null,
    power_ps: q.powerHp,
    power_kw: q.powerKw,
    transmission: null,
    drive: null,
    body_type: null,
    co2_g_km: null,
    co2_cycle: null,
    ltpf_eur: Math.round((res.median / (1 + DE_VAT_RATE)) * 100) / 100,
    retail_incl_tax_eur: res.median,
    valid_from: q.firstRegistration,
    valid_to: null,
    source_type: 'foreign_price_estimate',
    confidence: 'low',
    importer: null,
    protocol_no: null,
    list_label: null,
    source_url: ADAC_URL,
    source_page: null,
    source_sha256: null,
    extraction_method: 'html',
    verified: false,
    notes: `Διάμεσος ${res.n} καινούργιων ${scope} με παρόμοια ισχύ και καύσιμο στη Γερμανία (ADAC): ${res.median.toLocaleString('el-GR')} € με ΦΠΑ 19%, χωρίς ΦΠΑ.`,
  };
}
