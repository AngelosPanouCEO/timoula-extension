import { describe, expect, it } from 'vitest';
import {
  buildCarGrUrl,
  bundledTaxRules,
  computeCostBreakdown,
  DEFAULT_CARGR_SETTINGS,
  DEFAULT_COST_SETTINGS,
  priceStats,
  runCalculation,
  verdict,
  type CalculationInputs,
} from '../src';

describe('cost breakdown', () => {
  const base = { carPriceCents: 2_000_000, registrationTaxCents: 150_000, environmentalFeeCents: 0, newMeansOfTransportVat: null, countryCode: 'DE', settings: DEFAULT_COST_SETTINGS };

  it('option A: price + tax + trailer + broker/plates, low and high', () => {
    const a = computeCostBreakdown(base).options[0];
    expect(a.lines.map((l) => l.id)).toEqual(['carPrice', 'registrationTax', 'trailer', 'customsBrokerAndPlates']);
    expect(a.total).toEqual({ lowCents: 2_000_000 + 150_000 + 80_000 + 110_000, highCents: 2_000_000 + 150_000 + 80_000 + 200_000 });
  });

  it('option B uses the drive-back estimate of the origin country', () => {
    const b = computeCostBreakdown(base).options[1];
    expect(b.lines.map((l) => l.id)).toEqual(['carPrice', 'registrationTax', 'exportPlatesAndInsurance', 'driveBack', 'customsBrokerAndPlates']);
    expect(b.lines.find((l) => l.id === 'driveBack')!.amount).toEqual(DEFAULT_COST_SETTINGS.driveBackByCountry.DE);
    const unknown = computeCostBreakdown({ ...base, countryCode: null }).options[1];
    expect(unknown.lines.find((l) => l.id === 'driveBack')!.amount).toEqual(DEFAULT_COST_SETTINGS.driveBackDefault);
  });

  it('new means of transport: net price + 24% VAT on (net + registration tax)', () => {
    const c = computeCostBreakdown({ ...base, newMeansOfTransportVat: { netPriceCents: 1_680_672, vatRatePct: 24, baseIncludesRegistrationTax: true } });
    expect(c.carCostCents).toBe(1_680_672);
    expect(c.vatCents).toBe(Math.round((1_680_672 + 150_000) * 0.24));
    expect(c.options[0].lines.map((l) => l.id)).toContain('vatNewMeansOfTransport');
  });
});

describe('runCalculation', () => {
  const inputs: CalculationInputs = {
    priceBasis: 'gross',
    priceCents: 2_497_000,
    priceNetCents: 2_098_319,
    ltpfCents: 2_000_000,
    extrasCents: 0,
    firstRegistration: '2026-08-31',
    expectedRegistration: '2026-11-11',
    mileageKm: 9,
    bodyCategory: 'mpv',
    co2GKm: 156,
    euroClass: '6e',
    powertrain: 'ICE',
    mhevCountsAsHybrid: false,
    countryCode: 'DE',
    applyNewMeansOfTransportVat: true,
  };
  it('applies NMT VAT when chosen and the car qualifies', () => {
    const r = runCalculation(bundledTaxRules(), inputs, DEFAULT_COST_SETTINGS);
    if (!r.ok) throw new Error(r.reason);
    expect(r.tax.flags.newMeansOfTransport).toBe(true);
    expect(r.costs.vatCents).toBeGreaterThan(0);
  });
  it('asks for the net price when NMT VAT is chosen but missing', () => {
    expect(runCalculation(bundledTaxRules(), { ...inputs, priceNetCents: null }, DEFAULT_COST_SETTINGS)).toMatchObject({ ok: false, reason: 'missing-net-price' });
  });
  it('no price → missing-price', () => {
    expect(runCalculation(bundledTaxRules(), { ...inputs, priceCents: null }, DEFAULT_COST_SETTINGS)).toMatchObject({ ok: false, reason: 'missing-price' });
  });
});

describe('market value', () => {
  it('median, range and count', () => {
    expect(priceStats([20_000_00, 18_000_00, 25_000_00, 0, -5])).toEqual({ count: 3, medianCents: 20_000_00, minCents: 18_000_00, maxCents: 25_000_00, p25Cents: 19_000_00, p75Cents: 22_500_00 });
    expect(priceStats([])).toBeNull();
    expect(priceStats([10, 20])!.medianCents).toBe(15);
  });

  it('verdict colours', () => {
    expect(verdict(30_000_00, { lowCents: 25_000_00, highCents: 26_000_00 })).toEqual({ saving: { lowCents: 4_000_00, highCents: 5_000_00 }, level: 'good' });
    expect(verdict(25_500_00, { lowCents: 25_000_00, highCents: 26_000_00 }).level).toBe('marginal');
    expect(verdict(24_000_00, { lowCents: 25_000_00, highCents: 26_000_00 }).level).toBe('bad');
    expect(verdict(26_500_00, { lowCents: 25_000_00, highCents: 26_000_00 }, 100_000).level).toBe('marginal');
  });

  it('builds a car.gr search URL from the template and drops empty filters', () => {
    const url = buildCarGrUrl({ make: 'Subaru', model: 'XV', firstRegistrationYear: 2014, mileageKm: 178_000, fuel: 'diesel' }, DEFAULT_CARGR_SETTINGS)!;
    const u = new URL(url);
    expect(u.hostname).toBe('www.car.gr');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      make: 'Subaru',
      model: 'XV',
      'registration-from': '2013',
      'registration-to': '2015',
      'mileage-from': '134000',
      'mileage-to': '223000',
      fuel_type: 'diesel',
    });
    const noKm = new URL(buildCarGrUrl({ make: 'Subaru', model: null, firstRegistrationYear: null, mileageKm: null, fuel: null }, DEFAULT_CARGR_SETTINGS)!);
    expect([...noKm.searchParams.keys()]).toEqual(['make']);
  });

  it('supports path placeholders', () => {
    const url = buildCarGrUrl({ make: 'Subaru', model: 'XV', firstRegistrationYear: 2014, mileageKm: null, fuel: null }, { ...DEFAULT_CARGR_SETTINGS, urlTemplate: 'https://www.car.gr/classifieds/cars/{make}/{model}/?registration-from={yearFrom}' });
    expect(url).toBe('https://www.car.gr/classifieds/cars/subaru/xv/?registration-from=2013');
  });
});
