import { describe, expect, it } from 'vitest';
import {
  bundledLtpfDataset,
  bundledTaxRules,
  dePriceCandidates,
  estimateCo2FromEea,
  loadEeaCo2Table,
  lookupLtpfWithEstimates,
  marketResidual,
  residualLtpfRecord,
  type DePriceTable,
  type LtpfQuery,
} from '../src';

const records = bundledLtpfDataset().records;
const rules = bundledTaxRules();
const q = (patch: Partial<LtpfQuery>): LtpfQuery => ({
  make: 'BMW', model: '320', versionText: '320d Touring Sport Line', firstRegistration: '2017-05-31', displacementCc: 1995, powerKw: 140, powerHp: 190,
  co2GKm: null, fuel: 'diesel', powertrain: 'ICE', gearbox: 'automatic', ...patch,
});
const de: DePriceTable = {
  source: 'test',
  makes: ['BMW', 'AUDI'],
  models: ['3ER-REIHE', 'A3'],
  rows: [
    [0, 0, 'BMW 320d Touring Sport Line Steptronic', 'diesel', 140, '2015-07', '2019-06', 46_900, 1],
    [0, 0, 'BMW 320d Touring Sport Line', 'diesel', 140, '2015-07', '2019-06', 44_800, 2],
    [0, 0, 'BMW 318d Touring', 'diesel', 110, '2015-07', '2019-06', 39_000, 3], // other power
    [0, 0, 'BMW 320d Touring', 'diesel', 140, '2012-01', '2015-06', 40_000, 4], // other period
    [1, 1, 'Audi A3 Sportback 40 TDI quattro S tronic', 'diesel', 147, '2020-03', null, 38_500, 5],
  ],
};
const residualInput = { priceCents: 2_000_000, countryCode: 'DE', firstRegistration: '2017-05-31', expectedRegistration: '2026-11-16', mileageKm: 120_000, bodyCategory: 'suv_atv' as const };

describe('ΛΤΠΦ estimates when the Greek lists have no exact match', () => {
  it('German price of the same version (ADAC): make, model word, power and period must match; VAT removed', () => {
    const c = dePriceCandidates(de, q({}));
    expect(c.map((r) => r.id)).toEqual(['adac-1', 'adac-2']);
    expect(c[0]).toMatchObject({ model: '320d', version: 'Touring Sport Line Steptronic', ltpf_eur: 39_411.76, source_type: 'foreign_price_estimate', verified: false, transmission: 'AT' });
  });

  it('residual value: used price ÷ market residual (age, mileage) ÷ VAT of the origin country', () => {
    // Mercedes C 200 4MATIC 09/2022, 30.800 € in Germany; new ≈ 52.000 € with VAT (≈ 43.700 € without).
    const c200 = q({ make: 'Mercedes-Benz', model: 'C 200', firstRegistration: '2022-09-30', displacementCc: 1496, powerKw: 150, powerHp: 204 });
    const r = residualLtpfRecord(rules, c200, { ...residualInput, priceCents: 3_080_000, firstRegistration: '2022-09-30', mileageKm: 60_000 })!;
    expect(r.ltpf_eur).toBeGreaterThan(45_000);
    expect(r.ltpf_eur).toBeLessThan(60_000);
    expect(r).toMatchObject({ confidence: 'low', verified: false });
    expect(marketResidual(4, 60_000)).toBeCloseTo(0.48, 2);
    expect(marketResidual(4, 120_000)).toBeLessThan(marketResidual(4, 60_000)); // more km → keeps less
  });

  it('brand without Greek lists: German price first (ε), residual estimate as alternative', () => {
    const r = lookupLtpfWithEstimates(records, q({}), { foreign: dePriceCandidates(de, q({})), residual: residualLtpfRecord(rules, q({}), residualInput) });
    expect(r.criterion).toBe('epsilon');
    expect(r.candidates.map((c) => c.criterion)).toEqual(['epsilon', 'epsilon', 'residual']);
    expect(r.candidates[0]!.record.id).toBe('adac-1'); // automatic gearbox, like the listing
    expect(r.status).toBe('choose'); // the popup uses the first and asks to confirm
  });

  it('nothing in any list: the residual estimate keeps the calculation going', () => {
    const r = lookupLtpfWithEstimates(records, q({}), { foreign: [], residual: residualLtpfRecord(rules, q({}), residualInput) });
    expect(r).toMatchObject({ status: 'single', criterion: 'residual' });
    expect(r.selected!.record.ltpf_eur).toBeGreaterThan(20_000 / 1.19);
  });

  it('Greek sister version far from the car’s power (A3 40 TDI 200 hp vs 30 TDI 116 hp) comes after the estimates', () => {
    const a3 = q({ make: 'Audi', model: 'A3', versionText: 'Sportback 40 TDI quattro S tronic', firstRegistration: '2021-06-30', displacementCc: 1968, powerKw: 147, powerHp: 200, fuel: 'diesel' });
    const residual = residualLtpfRecord(rules, a3, { ...residualInput, firstRegistration: '2021-06-30' });
    const onlyResidual = lookupLtpfWithEstimates(records, a3, { foreign: [], residual });
    expect(onlyResidual.candidates[0]!.criterion).toBe('residual');
    expect(onlyResidual.candidates.slice(1).every((c) => c.criterion === 'beta')).toBe(true);
    const withDe = lookupLtpfWithEstimates(records, a3, { foreign: dePriceCandidates(de, a3), residual });
    expect(withDe.selected?.record.id).toBe('adac-5');
  });

  it('an exact Greek match is never replaced by an estimate', () => {
    const a3 = q({ make: 'Audi', model: 'A3', versionText: '1.6 TDI Sportback design', firstRegistration: '2018-03-31', displacementCc: 1598, powerKw: 85, powerHp: 116 });
    const r = lookupLtpfWithEstimates(records, a3, { foreign: [], residual: residualLtpfRecord(rules, a3, residualInput) });
    expect(r.criterion).toBe('exact');
    expect(r.candidates.every((c) => c.criterion === 'exact' && c.official)).toBe(true);
  });
});

describe('CO2 estimate from the EEA registrations data', () => {
  it('same model and engine, in the cycle customs applies', async () => {
    const t = await loadEeaCo2Table();
    const e = (p: Partial<Parameters<typeof estimateCo2FromEea>[1]>) =>
      estimateCo2FromEea(t, { make: 'BMW', model: '320', fuel: 'diesel', powertrain: 'ICE', displacementCc: 1995, powerKw: 140, firstRegistration: '2017-05-31', ...p });
    expect(e({})).toMatchObject({ level: 'model', cycle: 'NEDC' });
    expect(e({})!.co2GKm).toBeGreaterThan(105);
    expect(e({})!.co2GKm).toBeLessThan(130);
    expect(e({ firstRegistration: '2021-06-30' })!.cycle).toBe('WLTP');
    // A full hybrid must not get the plug-in's value, and a plug-in must not get the hybrid's.
    expect(e({ make: 'Toyota', model: 'RAV4', fuel: 'petrol_electric', powertrain: 'HEV', displacementCc: 2487, powerKw: 131, firstRegistration: '2020-01-31' })!.co2GKm).toBeGreaterThan(80);
    expect(e({ make: 'BMW', model: '330e', fuel: 'petrol_electric', powertrain: 'PHEV', displacementCc: 1998, powerKw: 135, firstRegistration: '2020-10-31' })!.co2GKm).toBeLessThan(60);
    expect(e({ fuel: 'electric', powertrain: 'BEV' })).toBeNull();
  });
});
