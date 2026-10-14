/**
 * Greek registration tax (τέλος ταξινόμησης) for used passenger cars brought in
 * from another EU member state. Every number comes from the rules version passed
 * in; this module contains no rates. Every intermediate step is returned so the
 * UI can show the calculation and tests can pin it down.
 */
import type { BodyCategory, EuroClass, Powertrain } from '../types';
import { monthsBetween } from '../util/dates';
import { roundCents } from '../util/money';
import type { TaxRules, TaxRulesVersion } from './rulesSchema';
import { selectRulesVersion } from './rulesSchema';

export interface RegistrationTaxInput {
  /** ΛΤΠΦ of the base version, EUR cents. */
  ltpfCents: number | null;
  /** Value of optional (EXTRA) equipment at ΛΤΠΦ level, EUR cents. */
  extrasCents: number;
  /** First registration anywhere (ISO date). Drives age, CO2 cycle and Euro rules. */
  firstRegistration: string | null;
  /** Expected registration date in Greece (ISO). Selects the rules version. */
  expectedRegistration: string;
  mileageKm: number | null;
  bodyCategory: BodyCategory | null;
  co2GKm: number | null;
  euroClass: EuroClass | null;
  powertrain: Powertrain | null;
  /** MHEV only: the COC marks it as a hybrid electric vehicle. */
  mhevCountsAsHybrid: boolean;
}

export type MissingInput =
  | 'ltpf'
  | 'firstRegistration'
  | 'mileage'
  | 'bodyCategory'
  | 'co2'
  | 'euroClass'
  | 'powertrain';

export type TaxWarning =
  /** First registered 9/2017–12/2020: customs uses the NEDC value from the COC, listings often show WLTP. */
  | 'co2-nedc-wltp-transition'
  /** Over 30 years: the historic-vehicle regime is not modelled. */
  | 'historic-vehicle'
  /** MHEV treated without hybrid exemption because the COC status is not confirmed. */
  | 'mhev-not-confirmed'
  /** Plain "Euro 5" mapped to 5a/5b by first-registration date. */
  | 'euro5-inferred'
  /** Expected registration date is in the past. */
  | 'expected-registration-in-past'
  /** First registration after the expected registration date. */
  | 'first-registration-after-expected';

export interface BracketLine {
  fromEur: number;
  toEur: number | null;
  baseRatePct: number;
  adjustedRatePct: number;
  /** Part of the pre-depreciation value in this bracket, cents. */
  sliceCents: number;
  /** Tax attributable to this bracket after scaling to the taxable value, cents (unrounded). */
  taxCents: number;
}

export interface RegistrationTaxBreakdown {
  ok: true;
  rulesVersionId: string;
  rulesSummary: string | null;
  ageMonths: number;
  baseValueCents: number;
  depreciation: { pct: number; bodyCategory: BodyCategory };
  mileage: { averageKm: number; excessKm: number; pct: number };
  totalDepreciationPct: number;
  depreciationCapped: boolean;
  taxableValueCents: number;
  co2: { cycle: 'NEDC' | 'WLTP' | null; gKm: number | null; adjustPct: number; notProven: boolean };
  euro: { declared: EuroClass | null; effective: EuroClass | null; adjustPct: number; ruleId: string | null };
  rateMultiplier: number;
  brackets: BracketLine[];
  /** Weighted rate applied to the taxable value, percent. */
  effectiveRatePct: number;
  taxBeforeExemptionCents: number;
  exemption: { id: string; pct: number; note: string } | null;
  registrationTaxCents: number;
  environmentalFeeCents: number;
  flags: {
    historic: boolean;
    registrationBanned: boolean;
    newMeansOfTransport: boolean;
  };
  newMeansOfTransport: { maxAgeMonths: number; maxKm: number; vatRatePct: number; vatBaseIncludesRegistrationTax: boolean };
  warnings: TaxWarning[];
}

export type RegistrationTaxResult =
  | RegistrationTaxBreakdown
  | { ok: false; reason: 'missing-input'; missing: MissingInput[] }
  | { ok: false; reason: 'no-rules-version'; date: string };

const ZERO_CO2: Powertrain[] = ['BEV', 'FCEV'];

/**
 * Depreciation percent for an age, interpolated monthly between the half-year rows.
 * Customs counts completed months (real clearance: 6 years and 15 days → the 6-year row).
 */
export function depreciationPct(ver: TaxRulesVersion, cat: BodyCategory, ageMonths: number): number {
  const dep = ver.taxableValue.depreciation;
  const table = dep.table;
  const months = Math.max(0, ageMonths);
  const age = (dep.interpolation === 'linear-completed-months' ? Math.floor(months + 1e-9) : months) / 12;
  const first = table[0]!;
  if (age <= first.ageYears) return (first[cat] * age) / first.ageYears;
  const last = table[table.length - 1]!;
  if (age >= last.ageYears) return last[cat];
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i]!;
    const b = table[i + 1]!;
    if (age >= a.ageYears && age < b.ageYears) {
      return a[cat] + ((b[cat] - a[cat]) * (age - a.ageYears)) / (b.ageYears - a.ageYears);
    }
  }
  return last[cat];
}

export function mileageReduction(ver: TaxRulesVersion, mileageKm: number, ageMonths: number) {
  const m = ver.taxableValue.mileage;
  const averageKm = (m.averageKmPerYear * Math.max(0, ageMonths)) / 12;
  const excessKm = Math.max(0, mileageKm - averageKm);
  const pct = Math.min(m.maxPct, Math.floor(excessKm / m.stepKm) * m.pctPerStep);
  return { averageKm: Math.round(averageKm), excessKm: Math.round(excessKm), pct: round6(pct) };
}

/** Which CO2 table applies, by first registration date. */
export function co2Table(ver: TaxRulesVersion, firstRegistration: string) {
  return (
    ver.co2.tables.find(
      (t) => (!t.firstRegistrationFrom || firstRegistration >= t.firstRegistrationFrom) && (!t.firstRegistrationTo || firstRegistration <= t.firstRegistrationTo),
    ) ?? null
  );
}

export function co2AdjustPct(bands: { upToGKm: number | null; adjustPct: number }[], gKm: number): number {
  for (const b of bands) if (b.upToGKm === null || gKm <= b.upToGKm) return b.adjustPct;
  return bands[bands.length - 1]!.adjustPct;
}

/** Resolve plain "Euro 5" to 5a/5b using the rules file's date mapping. */
export function effectiveEuroClass(ver: TaxRulesVersion, euro: EuroClass, firstRegistration: string): { cls: EuroClass; inferred: boolean } {
  if (euro !== '5') return { cls: euro, inferred: false };
  for (const m of ver.euro.plainEuro5) {
    if (m.firstRegistrationTo === null || firstRegistration <= m.firstRegistrationTo) return { cls: m.treatAs as EuroClass, inferred: true };
  }
  return { cls: euro, inferred: false };
}

export function euroAdjustment(ver: TaxRulesVersion, cls: EuroClass, firstRegistration: string): { adjustPct: number; ruleId: string | null } {
  for (const r of ver.euro.rules) {
    if (!r.euroClasses.includes(cls)) continue;
    if (r.firstRegistrationTo && firstRegistration > r.firstRegistrationTo) continue;
    return { adjustPct: r.adjustPct, ruleId: r.id };
  }
  return { adjustPct: 0, ruleId: null };
}

export function calculateRegistrationTax(rules: TaxRules, input: RegistrationTaxInput, todayIso?: string): RegistrationTaxResult {
  const ver = selectRulesVersion(rules, input.expectedRegistration);
  if (!ver) return { ok: false, reason: 'no-rules-version', date: input.expectedRegistration };
  return calculateWithVersion(ver, input, todayIso);
}

export function calculateWithVersion(ver: TaxRulesVersion, input: RegistrationTaxInput, todayIso?: string): RegistrationTaxResult {
  const zeroCo2 = input.powertrain !== null && ZERO_CO2.includes(input.powertrain);
  const missing: MissingInput[] = [];
  if (input.ltpfCents === null || input.ltpfCents <= 0) missing.push('ltpf');
  if (!input.firstRegistration) missing.push('firstRegistration');
  if (input.mileageKm === null || input.mileageKm < 0) missing.push('mileage');
  if (!input.bodyCategory) missing.push('bodyCategory');
  if (!input.powertrain) missing.push('powertrain');
  if (!zeroCo2) {
    if (!input.euroClass) missing.push('euroClass');
    if (input.co2GKm === null && input.euroClass !== 'none') missing.push('co2');
  }
  if (missing.length) return { ok: false, reason: 'missing-input', missing };

  const firstReg = input.firstRegistration!;
  const warnings: TaxWarning[] = [];
  if (todayIso && input.expectedRegistration < todayIso) warnings.push('expected-registration-in-past');
  if (firstReg > input.expectedRegistration) warnings.push('first-registration-after-expected');

  const ageMonths = firstReg <= input.expectedRegistration ? monthsBetween(firstReg, input.expectedRegistration) : 0;
  const ageYears = ageMonths / 12;
  const historic = ageYears >= ver.historic.minAgeYears;
  if (historic) warnings.push('historic-vehicle');

  // 1. Taxable value: ΛΤΠΦ + extras, less age/body depreciation, less excess-mileage reduction.
  const baseValueCents = input.ltpfCents! + Math.max(0, input.extrasCents);
  const cat = input.bodyCategory!;
  const depPct = round6(depreciationPct(ver, cat, ageMonths));
  const mileage = mileageReduction(ver, input.mileageKm!, ageMonths);
  let taxable = baseValueCents * (1 - depPct / 100) * (1 - mileage.pct / 100);
  const floor = baseValueCents * (1 - ver.taxableValue.maxTotalDepreciationPct / 100);
  const depreciationCapped = taxable < floor;
  if (depreciationCapped) taxable = floor;
  const taxableValueCents = roundCents(taxable);
  const totalDepreciationPct = round6(baseValueCents > 0 ? (1 - taxable / baseValueCents) * 100 : 0);

  // 2. Rate adjustments for CO2 and Euro class.
  let co2: RegistrationTaxBreakdown['co2'] = { cycle: null, gKm: input.co2GKm, adjustPct: 0, notProven: false };
  let euro: RegistrationTaxBreakdown['euro'] = { declared: input.euroClass, effective: input.euroClass, adjustPct: 0, ruleId: null };
  if (!zeroCo2) {
    const table = co2Table(ver, firstReg);
    if (input.co2GKm === null) {
      co2 = { cycle: table?.cycle ?? null, gKm: null, adjustPct: ver.co2.notProvenAdjustPct, notProven: true };
    } else if (table) {
      co2 = { cycle: table.cycle, gKm: input.co2GKm, adjustPct: co2AdjustPct(table.bands, input.co2GKm), notProven: false };
    }
    if (firstReg >= '2017-09-01' && firstReg <= '2020-12-31' && co2.cycle === 'NEDC') warnings.push('co2-nedc-wltp-transition');
    const eff = effectiveEuroClass(ver, input.euroClass!, firstReg);
    if (eff.inferred) warnings.push('euro5-inferred');
    const adj = euroAdjustment(ver, eff.cls, firstReg);
    euro = { declared: input.euroClass, effective: eff.cls, adjustPct: adj.adjustPct, ruleId: adj.ruleId };
  }
  const rateMultiplier =
    ver.co2.combineWithEuro === 'multiplicative'
      ? (1 + co2.adjustPct / 100) * (1 + euro.adjustPct / 100)
      : 1 + co2.adjustPct / 100 + euro.adjustPct / 100;

  // 3. Progressive brackets. For used cars the brackets are chosen on the value
  //    before depreciation; the resulting weighted rate applies to the taxable value.
  const bracketBasis = ver.brackets.mode === 'progressive-pre-depreciation-scaled' ? baseValueCents : taxableValueCents;
  const scale = bracketBasis > 0 ? taxableValueCents / bracketBasis : 0;
  const brackets: BracketLine[] = [];
  let lower = 0;
  for (const band of ver.brackets.bands) {
    const upperCents = band.upToEur === null ? Infinity : band.upToEur * 100;
    const slice = Math.max(0, Math.min(bracketBasis, upperCents) - lower);
    const adjustedRatePct = band.ratePct * rateMultiplier;
    brackets.push({
      fromEur: lower / 100,
      toEur: band.upToEur,
      baseRatePct: band.ratePct,
      adjustedRatePct: round6(adjustedRatePct),
      sliceCents: slice,
      taxCents: (slice * adjustedRatePct * scale) / 100,
    });
    if (upperCents === Infinity || bracketBasis <= upperCents) break;
    lower = upperCents;
  }
  const taxBefore = brackets.reduce((s, b) => s + b.taxCents, 0);
  const taxBeforeExemptionCents = roundCents(taxBefore);
  const effectiveRatePct = taxableValueCents > 0 ? round6((taxBefore / taxableValueCents) * 100) : 0;

  // 4. Exemptions (first matching rule wins).
  let powertrain = input.powertrain!;
  if (powertrain === 'MHEV') {
    if (input.mhevCountsAsHybrid) powertrain = 'HEV';
    else warnings.push('mhev-not-confirmed');
  }
  const exemptionRule = ver.exemptions.find(
    (e) =>
      e.powertrains.includes(powertrain) &&
      (e.co2MaxGKm === undefined || (input.co2GKm !== null && input.co2GKm <= e.co2MaxGKm)) &&
      (e.co2MinGKm === undefined || (input.co2GKm !== null && input.co2GKm >= e.co2MinGKm)) &&
      (!e.expectedRegistrationFrom || input.expectedRegistration >= e.expectedRegistrationFrom) &&
      (!e.expectedRegistrationTo || input.expectedRegistration <= e.expectedRegistrationTo),
  );
  const exemption = exemptionRule ? { id: exemptionRule.id, pct: exemptionRule.exemptPct, note: exemptionRule.note } : null;
  const registrationTaxCents = roundCents(taxBefore * (1 - (exemption?.pct ?? 0) / 100));

  // 5. Environmental fee, registration ban, new means of transport.
  const euroForFees = euro.effective;
  let environmentalFeeCents = 0;
  if (euroForFees && !(historic && ver.environmentalFee.historicExempt)) {
    const feeRule = ver.environmentalFee.rules.find((r) => r.euroClasses.includes(euroForFees) || (input.euroClass !== null && r.euroClasses.includes(input.euroClass)));
    if (feeRule) environmentalFeeCents = feeRule.amountEur * 100;
  }
  const registrationBanned =
    euroForFees !== null && ver.registrationBan.euroClasses.includes(euroForFees) && !(historic && ver.registrationBan.historicExempt);
  const nmt = ver.newMeansOfTransport;
  const newMeansOfTransport = ageMonths <= nmt.maxAgeMonths || input.mileageKm! <= nmt.maxKm;

  return {
    ok: true,
    rulesVersionId: ver.id,
    rulesSummary: ver.summary,
    ageMonths: round6(ageMonths),
    baseValueCents,
    depreciation: { pct: depPct, bodyCategory: cat },
    mileage,
    totalDepreciationPct,
    depreciationCapped,
    taxableValueCents,
    co2,
    euro,
    rateMultiplier: round6(rateMultiplier),
    brackets,
    effectiveRatePct,
    taxBeforeExemptionCents,
    exemption,
    registrationTaxCents,
    environmentalFeeCents,
    flags: { historic, registrationBanned, newMeansOfTransport },
    newMeansOfTransport: { maxAgeMonths: nmt.maxAgeMonths, maxKm: nmt.maxKm, vatRatePct: nmt.vatRatePct, vatBaseIncludesRegistrationTax: nmt.vatBaseIncludesRegistrationTax },
    warnings,
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
