/** Popup form state: what the client sees and edits, derived from the listing. */
import {
  addDaysIso, checkVehicleKind, euroFromFirstRegistration, type Co2FromPriceList, type EeaCo2Estimate, type EeaCo2Level, normalizeCountry, suggestBodyCategory, suggestPowertrain, todayIso, type BodyCategory, type CalculationInputs, type EuroClass,
  type Fuel, type Gearbox, type ListingData, type Powertrain, type PowertrainSuggestion,
} from '@timoula/core';
import type { FormMeta, HistoryEntry, LtpfChoice } from '../shared/db';
import type { AppSettings } from '../shared/settings';

export interface FormState {
  make: string | null;
  model: string | null;
  version: string | null;
  priceCents: number | null;
  priceNetCents: number | null;
  firstRegistration: string | null;
  mileageKm: number | null;
  displacementCc: number | null;
  powerKw: number | null;
  powerHp: number | null;
  co2GKm: number | null;
  /** co2GKm was copied from the chosen price-list version; the client should confirm it from the COC. */
  co2FromLtpf: boolean;
  /** Date of the other list the CO2 came from, when the chosen version's list prints none. */
  co2ListFrom: string | null;
  /** co2GKm is an estimate from the EEA registrations data (no listing or price-list value). */
  co2FromEea: { level: EeaCo2Level; cars: number } | null;
  fuel: Fuel | null;
  euroClass: EuroClass | null;
  /** euroClass was filled from the date of first registration (Euro 6 from 1/9/2015). */
  euroFromDate: boolean;
  bodyCategory: BodyCategory | null;
  gearbox: Gearbox | null;
  countryCode: string | null;
  vin: string | null;
  powertrain: Powertrain | null;
  powertrainConfirmed: boolean;
  mhevCountsAsHybrid: boolean;
  expectedRegistration: string;
  ltpfCents: number | null;
  extrasCents: number;
  ltpf: LtpfChoice;
  applyNmtVat: boolean;
  commercialOverride: boolean;
  pricesText: string;
  pagePricesCents: number[];
  notes: string;
  edited: string[];
}

export const NO_LTPF: LtpfChoice = { origin: 'table', recordId: null, criterion: null, official: false, label: null, listFrom: null, listTo: null };

export function powertrainSuggestionFor(l: ListingData, f: Pick<FormState, 'fuel' | 'make' | 'model' | 'version' | 'firstRegistration'>): PowertrainSuggestion {
  return suggestPowertrain({
    fuel: f.fuel,
    fuelRaw: l.fuelRaw.value,
    make: f.make,
    model: f.model,
    version: f.version,
    title: l.title.value,
    batteryKwh: l.batteryKwh.value,
    siteFlag: l.sitePowertrainFlag.value,
    firstRegistrationYear: f.firstRegistration ? Number(f.firstRegistration.slice(0, 4)) : null,
  });
}

export function initialForm(l: ListingData, settings: AppSettings, now = new Date()): FormState {
  const nonEur = l.currency.value !== null && l.currency.value !== 'EUR';
  const base = {
    make: l.make.value,
    model: l.model.value,
    version: l.version.value,
    firstRegistration: l.firstRegistration.value,
    fuel: l.fuel.value,
  };
  const pt = powertrainSuggestionFor(l, base);
  return withEuroFromDate({
    ...base,
    priceCents: nonEur ? null : l.priceCents.value,
    priceNetCents: nonEur ? null : l.priceNetCents.value,
    mileageKm: l.mileageKm.value,
    displacementCc: l.displacementCc.value,
    powerKw: l.powerKw.value,
    powerHp: l.powerHp.value,
    co2GKm: l.co2GKm.value,
    co2FromLtpf: false,
    co2ListFrom: null,
    co2FromEea: null,
    euroClass: l.euroClass.value,
    euroFromDate: false,
    bodyCategory: suggestBodyCategory(l.bodyTypeRaw.value).category,
    gearbox: l.gearbox.value,
    countryCode: normalizeCountry(l.countryCode.value),
    vin: l.vin.value,
    powertrain: pt.suggested,
    powertrainConfirmed: !pt.needsConfirmation && pt.suggested !== null,
    mhevCountsAsHybrid: false,
    expectedRegistration: addDaysIso(todayIso(now), settings.costs.expectedRegistrationOffsetDays),
    ltpfCents: null,
    extrasCents: 0,
    ltpf: NO_LTPF,
    applyNmtVat: false,
    commercialOverride: false,
    pricesText: '',
    pagePricesCents: [],
    notes: '',
    edited: [],
  });
}

/** Restore a previous calculation's inputs but keep today's price and the current listing data. */
export function formFromEntry(prev: HistoryEntry, current: FormState): FormState {
  const i = prev.inputs;
  const m = prev.meta;
  return withEuroFromDate({
    ...current,
    make: m.make,
    model: m.model,
    version: m.version,
    vin: m.vin ?? current.vin,
    fuel: (m.fuel as Fuel | null) ?? current.fuel,
    displacementCc: m.displacementCc ?? current.displacementCc,
    powerKw: m.powerKw ?? current.powerKw,
    gearbox: (m.gearbox as Gearbox | null) ?? current.gearbox,
    firstRegistration: i.firstRegistration,
    // A date the client set by hand is kept; otherwise it stays "today + N days".
    expectedRegistration: m.editedFields.includes('expectedRegistration') ? i.expectedRegistration : current.expectedRegistration,
    mileageKm: current.mileageKm ?? i.mileageKm,
    co2GKm: i.co2GKm,
    co2FromLtpf: m.co2FromLtpf ?? false,
    co2ListFrom: m.co2ListFrom ?? null,
    co2FromEea: m.co2FromEea ?? null,
    euroClass: i.euroClass,
    euroFromDate: m.euroFromDate ?? false,
    bodyCategory: i.bodyCategory,
    countryCode: i.countryCode,
    powertrain: i.powertrain,
    powertrainConfirmed: m.powertrainConfirmed,
    mhevCountsAsHybrid: i.mhevCountsAsHybrid,
    ltpfCents: i.ltpfCents,
    extrasCents: i.extrasCents,
    ltpf: m.ltpf,
    applyNmtVat: i.applyNewMeansOfTransportVat,
    commercialOverride: m.commercialOverride,
    pricesText: prev.market?.comparables.filter((c) => c.origin === 'manual').map((c) => String(c.priceCents / 100)).join('\n') ?? '',
    notes: prev.notes,
    edited: m.editedFields,
  });
}

/**
 * Powertrain for the calculation. Until the client confirms it, a provisional one is used so the
 * tax can still be estimated: an unconfirmed mild hybrid counts as conventional (no exemption,
 * the higher tax); other suggestions (plug-in, hybrid, electric) are used as suggested.
 */
export function calculationPowertrain(f: Pick<FormState, 'powertrain' | 'powertrainConfirmed'>): { powertrain: Powertrain; provisional: boolean } {
  if (f.powertrain && f.powertrainConfirmed) return { powertrain: f.powertrain, provisional: false };
  const p = f.powertrain ?? 'ICE';
  return { powertrain: p === 'MHEV' ? 'ICE' : p, provisional: true };
}

export function toInputs(f: FormState, settings: AppSettings, powertrain: Powertrain | null): CalculationInputs {
  return {
    priceBasis: settings.costs.priceBasis,
    priceCents: f.priceCents,
    priceNetCents: f.priceNetCents,
    ltpfCents: f.ltpfCents,
    extrasCents: f.extrasCents,
    firstRegistration: f.firstRegistration,
    expectedRegistration: f.expectedRegistration,
    mileageKm: f.mileageKm,
    bodyCategory: f.bodyCategory,
    co2GKm: f.co2GKm,
    euroClass: f.euroClass,
    powertrain,
    mhevCountsAsHybrid: f.mhevCountsAsHybrid,
    countryCode: f.countryCode,
    applyNewMeansOfTransportVat: f.applyNmtVat,
  };
}

export function toMeta(f: FormState): FormMeta {
  return {
    make: f.make,
    model: f.model,
    version: f.version,
    vin: f.vin,
    fuel: f.fuel,
    displacementCc: f.displacementCc,
    powerKw: f.powerKw,
    gearbox: f.gearbox,
    powertrainConfirmed: f.powertrainConfirmed,
    commercialOverride: f.commercialOverride,
    ltpf: f.ltpf,
    co2FromLtpf: f.co2FromLtpf,
    co2ListFrom: f.co2ListFrom,
    co2FromEea: f.co2FromEea,
    euroFromDate: f.euroFromDate,
    editedFields: f.edited,
  };
}

/**
 * CO2 when the listing shows none: from the chosen price-list version (or the same version in a
 * nearby list), else the EEA estimate. Never replaces a listing or typed value; follows the inputs.
 * Returns the same object when nothing changes (it runs in an effect).
 */
export function withCo2Estimate(f: FormState, list: Co2FromPriceList | null, eea: EeaCo2Estimate | null): FormState {
  const estimated = f.co2FromLtpf || f.co2FromEea !== null;
  if (f.edited.includes('co2GKm') || (f.co2GKm !== null && !estimated)) return f;
  let next: Pick<FormState, 'co2GKm' | 'co2FromLtpf' | 'co2ListFrom' | 'co2FromEea'>;
  if (list) next = { co2GKm: list.co2GKm, co2FromLtpf: true, co2ListFrom: list.sameRecord ? null : list.record.valid_from, co2FromEea: null };
  else if (eea) next = { co2GKm: eea.co2GKm, co2FromLtpf: false, co2ListFrom: null, co2FromEea: { level: eea.level, cars: eea.cars } };
  else next = { co2GKm: estimated ? null : f.co2GKm, co2FromLtpf: false, co2ListFrom: null, co2FromEea: null };
  const same =
    next.co2GKm === f.co2GKm && next.co2FromLtpf === f.co2FromLtpf && next.co2ListFrom === f.co2ListFrom &&
    next.co2FromEea?.level === f.co2FromEea?.level && next.co2FromEea?.cars === f.co2FromEea?.cars;
  return same ? f : { ...f, ...next };
}

/** Fill the Euro class from the first registration when the date decides it and none is set. */
export function withEuroFromDate(f: FormState): FormState {
  if (f.euroClass !== null && !f.euroFromDate) return f;
  const fill = euroFromFirstRegistration(f.firstRegistration).fill;
  if (fill) return { ...f, euroClass: fill, euroFromDate: true };
  return f.euroFromDate ? { ...f, euroClass: null, euroFromDate: false } : f;
}

export function commercialCheck(l: ListingData, f: FormState) {
  return checkVehicleKind([f.model, f.version, l.title.value, l.siteCategory.value]);
}
