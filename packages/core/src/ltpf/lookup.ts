/**
 * ΛΤΠΦ lookup following ltpf/SPEC.md:
 *  1. brand + model (with synonyms)
 *  2. the price list in force at the car's FIRST registration date
 *  3. version match on cc / power / CO2 (cumulative, art. 6 §2 Α.1203/2019),
 *     narrowed by fuel, gearbox and version name; several matches → client picks
 *  4. no match → customs fallback order (art. 9): sister version in the same list (β),
 *     same model in another year's list (γ), origin-country price (ε)
 * Only gr_official_pricelist + verified, matched in the list of the era, is "official".
 * Everything else is an estimate and is labelled with its criterion.
 */
import type { Fuel, Gearbox, Powertrain } from '../types';
import { compact, normName, tokens } from '../util/text';
import { isOfficialPrice, type LtpfRecord } from './schema';
import synonymsJson from '../../ltpf/synonyms.json';

export interface Synonyms {
  brands: Record<string, string>;
  models: Record<string, Record<string, string>>;
}

export const DEFAULT_SYNONYMS: Synonyms = { brands: synonymsJson.brands, models: synonymsJson.models };

export interface LtpfQuery {
  make: string | null;
  model: string | null;
  /** Trim/version text from the listing (and title), used to rank versions. */
  versionText: string | null;
  firstRegistration: string | null;
  displacementCc: number | null;
  powerKw: number | null;
  powerHp: number | null;
  co2GKm: number | null;
  fuel: Fuel | null;
  powertrain: Powertrain | null;
  gearbox: Gearbox | null;
}

export type CheckResult = 'match' | 'mismatch' | 'unknown';

export interface CandidateChecks {
  displacement: CheckResult;
  power: CheckResult;
  co2: CheckResult;
  fuel: CheckResult;
  gearbox: CheckResult;
  powertrain: CheckResult;
}

/** Art. 9 criterion that produced the value; 'exact' = same version in the list of the era. */
/** residual: estimate from the listing price and the customs depreciation (no price list matched). */
export type LtpfCriterion = 'exact' | 'beta' | 'gamma' | 'epsilon' | 'residual';

export interface LtpfCandidate {
  record: LtpfRecord;
  checks: CandidateChecks;
  /** 0..1: share of the record's version-name tokens found in the listing text. */
  versionScore: number;
  criterion: LtpfCriterion;
  /** true only for an exact match of a verified official price list record. */
  official: boolean;
}

export type LtpfLookupStatus =
  | 'single' // one candidate selected automatically
  | 'choose' // several candidates: the client picks (equipment card / VIN)
  | 'none'; // nothing usable: the client enters the ΛΤΠΦ

export interface LtpfLookupResult {
  status: LtpfLookupStatus;
  criterion: LtpfCriterion | null;
  candidates: LtpfCandidate[];
  selected: LtpfCandidate | null;
  /** Why the lookup could not run or found nothing. */
  reason?: 'missing-make-model' | 'missing-first-registration' | 'brand-not-in-table' | 'model-not-in-table' | 'no-match';
  /** Price lists of this brand known to the table (valid_from dates), for the UI. */
  knownLists: { validFrom: string; validTo: string | null; endUnknown: boolean }[];
}

export function normalizeBrand(make: string, syn: Synonyms = DEFAULT_SYNONYMS): string {
  const n = normName(make);
  return syn.brands[n] ?? n;
}

/** 0 = no match, 2 = record model starts with the listing model (e.g. FORESTER e-BOXER), 3 = same model. */
export function modelMatchScore(recordModel: string, listingModel: string, brand: string, syn: Synonyms = DEFAULT_SYNONYMS): number {
  const l = normName(listingModel);
  const mapped = syn.models[brand]?.[l] ?? l;
  const r = normName(recordModel);
  if (compact(r) === compact(mapped)) return 3;
  const rt = tokens(r);
  const lt = tokens(mapped);
  if (lt.length && lt.every((t, i) => rt[i] === t)) return 2;
  return 0;
}

const baseFuel = (f: Fuel | null): string | null => {
  if (!f) return null;
  if (f === 'petrol_electric') return 'petrol';
  if (f === 'diesel_electric') return 'diesel';
  return f;
};

const AUTOMATIC_CODES = /^(AT|CVT|DCT|DSG|AMT|AUTO|AUTOMATIC|E-CVT|ECVT|TIPTRONIC|STEPTRONIC|PDK)/;

function checkGearbox(recordTx: string | null, gearbox: Gearbox | null): CheckResult {
  if (!recordTx || !gearbox) return 'unknown';
  const t = normName(recordTx);
  const recordIsManual = /^(MT|M\/T|MANUAL|\dMT)/.test(t) || /\bMT\b/.test(t);
  const recordIsAuto = AUTOMATIC_CODES.test(t);
  if (!recordIsManual && !recordIsAuto) return 'unknown';
  return (gearbox === 'manual') === recordIsManual ? 'match' : 'mismatch';
}

function checkDisplacement(r: LtpfRecord, cc: number | null): CheckResult {
  if (cc === null) return 'unknown';
  if (r.displacement_cc !== null) return Math.abs(r.displacement_cc - cc) <= 5 ? 'match' : 'mismatch';
  if (r.displacement_l !== null) return Math.abs(Math.round(cc / 100) / 10 - r.displacement_l) < 0.051 ? 'match' : 'mismatch';
  return 'unknown';
}

function checkPower(r: LtpfRecord, kw: number | null, hp: number | null): CheckResult {
  if (r.power_kw !== null && kw !== null) return Math.abs(r.power_kw - kw) <= 1 ? 'match' : 'mismatch';
  if (r.power_ps !== null && hp !== null) return Math.abs(r.power_ps - hp) <= 2 ? 'match' : 'mismatch';
  return 'unknown';
}

function checkPowertrain(r: LtpfRecord, p: Powertrain | null): CheckResult {
  if (!r.powertrain || !p) return 'unknown';
  if (r.powertrain === p) return 'match';
  // MHEV is often invisible in listings; do not exclude on MHEV vs ICE.
  const soft = new Set(['ICE', 'MHEV']);
  if (soft.has(r.powertrain) && soft.has(p)) return 'unknown';
  return 'mismatch';
}

export function checkRecord(r: LtpfRecord, q: LtpfQuery): CandidateChecks {
  const rf = r.fuel;
  const qf = baseFuel(q.fuel);
  return {
    displacement: checkDisplacement(r, q.displacementCc),
    power: checkPower(r, q.powerKw, q.powerHp),
    co2: r.co2_g_km === null || q.co2GKm === null ? 'unknown' : r.co2_g_km === q.co2GKm ? 'match' : 'mismatch',
    fuel: !rf || !qf || qf === 'other' ? 'unknown' : rf === qf ? 'match' : 'mismatch',
    gearbox: checkGearbox(r.transmission, q.gearbox),
    powertrain: checkPowertrain(r, q.powertrain),
  };
}

export function versionScore(r: LtpfRecord, versionText: string | null): number {
  const recordTokens = tokens(r.version).filter((t) => t.length > 1 || /\d/.test(t));
  if (!recordTokens.length || !versionText) return 0;
  const listing = new Set(tokens(versionText));
  const hits = recordTokens.filter((t) => listing.has(t) || (t.endsWith('+') && listing.has(t.slice(0, -1)) && listing.has('PLUS'))).length;
  return hits / recordTokens.length;
}

interface PriceList {
  validFrom: string;
  /** Effective last day; null = open-ended (latest list). */
  validTo: string | null;
  /** valid_to is null but a later list exists, so the true end is unknown (gap in the archive). */
  endUnknown: boolean;
  records: LtpfRecord[];
}

function priceListsOf(records: LtpfRecord[]): PriceList[] {
  const byFrom = new Map<string, LtpfRecord[]>();
  for (const r of records) {
    const arr = byFrom.get(r.valid_from) ?? [];
    arr.push(r);
    byFrom.set(r.valid_from, arr);
  }
  const froms = [...byFrom.keys()].sort();
  return froms.map((from, i) => {
    const recs = byFrom.get(from)!;
    const explicitTo = recs.map((r) => r.valid_to).filter((x): x is string => !!x).sort().pop() ?? null;
    const hasLater = i < froms.length - 1;
    return { validFrom: from, validTo: explicitTo, endUnknown: explicitTo === null && hasLater, records: recs };
  });
}

/**
 * Whether one record is in force on a date. Validity is per record because importers file
 * partial lists (only new versions) and several lists per date (one per model year), so a
 * version stays valid until it is re-priced, not until the brand's next list.
 * An open end (valid_to null) counts only when no later list of the brand exists; otherwise the
 * end is unknown (a gap in the archive, e.g. Subaru 2020–2026).
 */
function recordCovers(r: LtpfRecord, date: string, latestListOfBrand: string): boolean {
  if (date < r.valid_from) return false;
  if (r.valid_to) return date <= r.valid_to;
  return r.valid_from >= latestListOfBrand;
}

/** Distance in days-ish (ISO string compare) between a date and a list window, for "nearest other list". */
function distanceToList(list: PriceList, date: string): number {
  const toDays = (iso: string) => Date.parse(iso + 'T00:00:00Z') / 86400000;
  const d = toDays(date);
  if (d < toDays(list.validFrom)) return toDays(list.validFrom) - d;
  const end = list.validTo ?? list.validFrom;
  return Math.max(0, d - toDays(end));
}

const hasMismatch = (c: CandidateChecks, keys: (keyof CandidateChecks)[]) => keys.some((k) => c[k] === 'mismatch');

const STRICT_KEYS: (keyof CandidateChecks)[] = ['displacement', 'power', 'co2', 'fuel', 'gearbox', 'powertrain'];
const SISTER_KEYS: (keyof CandidateChecks)[] = ['displacement', 'fuel', 'powertrain'];

function rank(cands: LtpfCandidate[]): LtpfCandidate[] {
  const matches = (c: LtpfCandidate) => Object.values(c.checks).filter((x) => x === 'match').length;
  return [...cands].sort((a, b) => b.versionScore - a.versionScore || matches(b) - matches(a) || a.record.ltpf_eur - b.record.ltpf_eur);
}

function pickSingle(cands: LtpfCandidate[]): LtpfCandidate | null {
  if (cands.length === 1) return cands[0]!;
  const full = cands.filter((c) => c.versionScore === 1);
  return full.length === 1 ? full[0]! : null;
}

export function lookupLtpf(records: LtpfRecord[], q: LtpfQuery, syn: Synonyms = DEFAULT_SYNONYMS): LtpfLookupResult {
  const empty = (reason: LtpfLookupResult['reason'], knownLists: LtpfLookupResult['knownLists'] = []): LtpfLookupResult => ({
    status: 'none',
    criterion: null,
    candidates: [],
    selected: null,
    reason,
    knownLists,
  });
  if (!q.make || !q.model) return empty('missing-make-model');
  if (!q.firstRegistration) return empty('missing-first-registration');

  const brand = normalizeBrand(q.make, syn);
  const brandRecords = records.filter((r) => normalizeBrand(r.brand, syn) === brand);
  if (!brandRecords.length) return empty('brand-not-in-table');
  const lists = priceListsOf(brandRecords);
  const knownLists = lists.map((l) => ({ validFrom: l.validFrom, validTo: l.validTo, endUnknown: l.endUnknown }));

  const modelScores = new Map<LtpfRecord, number>();
  for (const r of brandRecords) {
    const s = modelMatchScore(r.model, q.model, brand, syn);
    if (s > 0) modelScores.set(r, s);
  }
  if (!modelScores.size) return empty('model-not-in-table', knownLists);

  const date = q.firstRegistration;
  const toCandidate = (r: LtpfRecord, criterion: LtpfCriterion): LtpfCandidate => ({
    record: r,
    checks: checkRecord(r, q),
    versionScore: versionScore(r, q.versionText),
    criterion,
    official: criterion === 'exact' && isOfficialPrice(r),
  });
  /** Records of the requested model; electrified variants win when the car is electrified. */
  const modelRecordsOf = (records: LtpfRecord[]) => {
    const recs = records.filter((r) => modelScores.has(r));
    if (q.powertrain && q.powertrain !== 'ICE') {
      const same = recs.filter((r) => r.powertrain === q.powertrain);
      if (same.length) return same;
    }
    const exactName = recs.filter((r) => modelScores.get(r) === 3);
    return exactName.length ? exactName : recs;
  };

  // Step 2–3: the records in force on the date of first registration.
  const latestListOfBrand = lists.length ? lists[lists.length - 1]!.validFrom : '';
  const eraRecords = brandRecords.filter((r) => recordCovers(r, date, latestListOfBrand));
  if (eraRecords.length) {
    const inEra = modelRecordsOf(eraRecords);
    const exact = rank(inEra.map((r) => toCandidate(r, 'exact')).filter((c) => !hasMismatch(c.checks, STRICT_KEYS)));
    if (exact.length) {
      const single = pickSingle(exact);
      return { status: single ? 'single' : 'choose', criterion: 'exact', candidates: exact, selected: single, knownLists };
    }
    // (β) sister version of the same list: same cc/fuel, other specs may differ.
    const sister = rank(inEra.map((r) => toCandidate(r, 'beta')).filter((c) => !hasMismatch(c.checks, SISTER_KEYS)));
    if (sister.length) {
      return { status: sister.length === 1 ? 'single' : 'choose', criterion: 'beta', candidates: sister, selected: sister.length === 1 ? sister[0]! : null, knownLists };
    }
  }

  // (γ) same model in the nearest other list.
  const inForce = new Set(eraRecords);
  const others = [...lists].sort((a, b) => distanceToList(a, date) - distanceToList(b, date));
  for (const list of others) {
    const recs = modelRecordsOf(list.records.filter((r) => !inForce.has(r)));
    const strict = rank(recs.map((r) => toCandidate(r, 'gamma')).filter((c) => !hasMismatch(c.checks, STRICT_KEYS)));
    const loose = strict.length ? strict : rank(recs.map((r) => toCandidate(r, 'gamma')).filter((c) => !hasMismatch(c.checks, SISTER_KEYS)));
    if (loose.length) {
      const single = pickSingle(loose);
      return { status: single ? 'single' : 'choose', criterion: 'gamma', candidates: loose, selected: single, knownLists };
    }
  }

  // (ε) origin-country price estimates, if the table has any for this model.
  const foreign = rank(
    brandRecords
      .filter((r) => r.source_type === 'foreign_price_estimate' && modelScores.has(r))
      .map((r) => toCandidate(r, 'epsilon'))
      .filter((c) => !hasMismatch(c.checks, SISTER_KEYS)),
  );
  if (foreign.length) {
    return { status: foreign.length === 1 ? 'single' : 'choose', criterion: 'epsilon', candidates: foreign, selected: foreign.length === 1 ? foreign[0]! : null, knownLists };
  }
  return empty('no-match', knownLists);
}
