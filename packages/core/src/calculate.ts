/**
 * One full calculation: registration tax + cost options. Pure function so the
 * same code can run in the extension now and on the backend in phase 2.
 */
import { computeCostBreakdown, type CostBreakdown } from './cost/breakdown';
import type { CostSettings } from './cost/settings';
import { calculateRegistrationTax, type RegistrationTaxResult } from './tax/registrationTax';
import type { TaxRules } from './tax/rulesSchema';
import type { BodyCategory, EuroClass, PriceBasis, Powertrain } from './types';

export interface CalculationInputs {
  priceBasis: PriceBasis;
  priceCents: number | null;
  priceNetCents: number | null;
  ltpfCents: number | null;
  extrasCents: number;
  firstRegistration: string | null;
  expectedRegistration: string;
  mileageKm: number | null;
  bodyCategory: BodyCategory | null;
  co2GKm: number | null;
  euroClass: EuroClass | null;
  powertrain: Powertrain | null;
  mhevCountsAsHybrid: boolean;
  countryCode: string | null;
  /** New means of transport: pay 24% Greek VAT on the net price (client's choice). */
  applyNewMeansOfTransportVat: boolean;
}

export type CalculationOutcome =
  | { ok: true; tax: Extract<RegistrationTaxResult, { ok: true }>; costs: CostBreakdown }
  | { ok: false; tax: RegistrationTaxResult | null; reason: 'missing-price' | 'missing-net-price' | 'tax-incomplete' };

export function runCalculation(rules: TaxRules, inputs: CalculationInputs, settings: CostSettings, todayIso?: string): CalculationOutcome {
  const tax = calculateRegistrationTax(
    rules,
    {
      ltpfCents: inputs.ltpfCents,
      extrasCents: inputs.extrasCents,
      firstRegistration: inputs.firstRegistration,
      expectedRegistration: inputs.expectedRegistration,
      mileageKm: inputs.mileageKm,
      bodyCategory: inputs.bodyCategory,
      co2GKm: inputs.co2GKm,
      euroClass: inputs.euroClass,
      powertrain: inputs.powertrain,
      mhevCountsAsHybrid: inputs.mhevCountsAsHybrid,
    },
    todayIso,
  );
  if (inputs.priceCents === null || inputs.priceCents <= 0) return { ok: false, tax, reason: 'missing-price' };
  if (!tax.ok) return { ok: false, tax, reason: 'tax-incomplete' };
  const applyVat = inputs.applyNewMeansOfTransportVat && tax.flags.newMeansOfTransport;
  if (applyVat && (inputs.priceNetCents === null || inputs.priceNetCents <= 0)) return { ok: false, tax, reason: 'missing-net-price' };
  const costs = computeCostBreakdown({
    carPriceCents: inputs.priceCents,
    registrationTaxCents: tax.registrationTaxCents,
    environmentalFeeCents: tax.environmentalFeeCents,
    newMeansOfTransportVat: applyVat
      ? { netPriceCents: inputs.priceNetCents!, vatRatePct: tax.newMeansOfTransport.vatRatePct, baseIncludesRegistrationTax: tax.newMeansOfTransport.vatBaseIncludesRegistrationTax }
      : null,
    countryCode: inputs.countryCode,
    settings,
  });
  return { ok: true, tax, costs };
}
