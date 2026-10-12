import { describe, expect, it } from 'vitest';
import {
  bundledTaxRules,
  calculateRegistrationTax,
  depreciationPct,
  monthsBetween,
  selectRulesVersion,
  type RegistrationTaxInput,
} from '../src';

const rules = bundledTaxRules();
const v2026 = selectRulesVersion(rules, '2026-11-11')!;

const base: RegistrationTaxInput = {
  ltpfCents: 2_000_000,
  extrasCents: 0,
  firstRegistration: '2026-11-11',
  expectedRegistration: '2026-11-11',
  mileageKm: 0,
  bodyCategory: 'sedan',
  co2GKm: 140,
  euroClass: '6d',
  powertrain: 'ICE',
  mhevCountsAsHybrid: false,
};

const calc = (patch: Partial<RegistrationTaxInput>) => {
  const r = calculateRegistrationTax(rules, { ...base, ...patch });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
};

describe('months between dates', () => {
  it('counts whole and partial months', () => {
    expect(monthsBetween('2020-01-31', '2020-01-31')).toBe(0);
    expect(monthsBetween('2020-01-15', '2021-01-15')).toBe(12);
    expect(monthsBetween('2020-01-31', '2020-02-29')).toBeCloseTo(29 / 31 - 0 + 0, 5);
  });
});

describe('depreciation table', () => {
  it('uses the table values on half-year points', () => {
    expect(depreciationPct(v2026, 'sedan', 12)).toBe(30);
    expect(depreciationPct(v2026, 'suv_atv', 60)).toBe(62);
    expect(depreciationPct(v2026, 'mpv', 192)).toBe(95);
    expect(depreciationPct(v2026, 'cabrio', 400)).toBe(95);
  });
  it('interpolates months in between and below 6 months', () => {
    expect(depreciationPct(v2026, 'sedan', 9)).toBeCloseTo(22.5, 6); // halfway 15% → 30%
    expect(depreciationPct(v2026, 'sedan', 3)).toBeCloseTo(7.5, 6); // 0 → 15% at 6 months
  });
});

describe('progressive brackets', () => {
  it('new car at 20.000 €: 14.000×4% + 3.000×26% + 3.000×53%', () => {
    const r = calc({});
    expect(r.taxableValueCents).toBe(2_000_000);
    expect(r.rateMultiplier).toBe(1);
    expect(r.registrationTaxCents).toBe(56_000 + 78_000 + 159_000);
  });
  it('above 30.000 € uses the 30% top bracket', () => {
    const r = calc({ ltpfCents: 4_000_000 });
    expect(r.registrationTaxCents).toBe(56_000 + 78_000 + 159_000 + 310_000 + 355_000 + 300_000);
  });
  it('for used cars applies the pre-depreciation weighted rate to the taxable value', () => {
    const r = calc({ firstRegistration: '2021-11-11', mileageKm: 75_000 });
    // 5 years sedan → 72% depreciation, mileage at average → no extra reduction
    expect(r.depreciation.pct).toBe(72);
    expect(r.mileage.pct).toBe(0);
    expect(r.taxableValueCents).toBe(560_000);
    expect(r.effectiveRatePct).toBeCloseTo((2930 / 20000) * 100, 6);
    expect(r.registrationTaxCents).toBe(Math.round(293_000 * 0.28));
  });
});

describe('mileage reduction', () => {
  it('0.10% per 500 km above 15.000 km/year, capped at 10%', () => {
    const one = calc({ firstRegistration: '2025-11-11', mileageKm: 15_000 + 5_000 });
    expect(one.mileage.pct).toBeCloseTo(1.0, 6);
    const capped = calc({ firstRegistration: '2025-11-11', mileageKm: 500_000 });
    expect(capped.mileage.pct).toBe(10);
  });
  it('total depreciation never exceeds 95%', () => {
    const r = calc({ firstRegistration: '2000-01-01', mileageKm: 900_000, euroClass: '4', co2GKm: 150 });
    expect(r.taxableValueCents).toBe(100_000);
    expect(r.depreciationCapped).toBe(true);
  });
});

describe('CO2 and Euro adjustments', () => {
  it('picks NEDC for first registration up to 2020 and WLTP from 2021', () => {
    expect(calc({ firstRegistration: '2020-12-31', co2GKm: 125 }).co2).toMatchObject({ cycle: 'NEDC', adjustPct: 10 });
    expect(calc({ firstRegistration: '2021-01-01', co2GKm: 125 }).co2).toMatchObject({ cycle: 'WLTP', adjustPct: -5 });
  });
  it('band edges are inclusive upper bounds', () => {
    expect(calc({ firstRegistration: '2022-01-01', co2GKm: 156 }).co2.adjustPct).toBe(0);
    expect(calc({ firstRegistration: '2022-01-01', co2GKm: 157 }).co2.adjustPct).toBe(10);
    expect(calc({ firstRegistration: '2022-01-01', co2GKm: 326 }).co2.adjustPct).toBe(100);
  });
  it('Euro 6 surcharge depends on first registration date', () => {
    expect(calc({ firstRegistration: '2015-08-31', euroClass: '6' }).euro.adjustPct).toBe(100);
    expect(calc({ firstRegistration: '2018-08-31', euroClass: '6' }).euro.adjustPct).toBe(50);
    expect(calc({ firstRegistration: '2018-09-01', euroClass: '6' }).euro.adjustPct).toBe(0);
  });
  it('plain Euro 5 is mapped to 5a/5b by date and flagged', () => {
    const a = calc({ firstRegistration: '2012-06-30', euroClass: '5' });
    expect(a.euro.effective).toBe('5a');
    expect(a.euro.adjustPct).toBe(200);
    expect(a.warnings).toContain('euro5-inferred');
    expect(calc({ firstRegistration: '2013-06-30', euroClass: '5' }).euro).toMatchObject({ effective: '5b', adjustPct: 100 });
  });
  it('combines CO2 and Euro multiplicatively (VERIFY in rules)', () => {
    const r = calc({ firstRegistration: '2012-06-30', euroClass: '5a', co2GKm: 150 });
    expect(r.rateMultiplier).toBeCloseTo(1.2 * 3, 6);
  });
  it('CO2 not proven on a pre-Euro car adds the top CO2 surcharge', () => {
    const r = calc({ firstRegistration: '1982-08-31', euroClass: 'none', co2GKm: null });
    expect(r.co2.notProven).toBe(true);
    expect(r.rateMultiplier).toBe(2 * 3);
    expect(r.flags.historic).toBe(true);
    expect(r.flags.registrationBanned).toBe(false);
    expect(r.environmentalFeeCents).toBe(0);
    expect(r.warnings).toContain('historic-vehicle');
  });
});

describe('exemptions by rules version', () => {
  it('BEV pays nothing and needs no CO2/Euro', () => {
    const r = calc({ powertrain: 'BEV', co2GKm: null, euroClass: null });
    expect(r.registrationTaxCents).toBe(0);
    expect(r.exemption?.pct).toBe(100);
  });
  it('hybrids before 2027: ≥51 g → 50%, ≤50 g → 75%', () => {
    expect(calc({ powertrain: 'HEV', co2GKm: 105 }).exemption?.pct).toBe(50);
    expect(calc({ powertrain: 'PHEV', co2GKm: 40 }).exemption?.pct).toBe(75);
  });
  it('hybrids from 2027: 50% regardless of CO2', () => {
    const r = calc({ powertrain: 'PHEV', co2GKm: 40, expectedRegistration: '2027-03-01', firstRegistration: '2027-03-01' });
    expect(r.rulesVersionId).toBe('2027-01-01');
    expect(r.exemption?.pct).toBe(50);
  });
  it('MHEV gets the hybrid exemption only when the COC confirms it', () => {
    const no = calc({ powertrain: 'MHEV', co2GKm: 150 });
    expect(no.exemption).toBeNull();
    expect(no.warnings).toContain('mhev-not-confirmed');
    expect(calc({ powertrain: 'MHEV', co2GKm: 150, mhevCountsAsHybrid: true }).exemption?.pct).toBe(50);
  });
});

describe('fees, bans and flags', () => {
  it('environmental fee for Euro 4 and Euro 5', () => {
    expect(calc({ firstRegistration: '2008-01-31', euroClass: '4', co2GKm: 160 }).environmentalFeeCents).toBe(300_000);
    expect(calc({ firstRegistration: '2014-01-31', euroClass: '5b', co2GKm: 160 }).environmentalFeeCents).toBe(100_000);
    expect(calc({ firstRegistration: '2014-01-31', euroClass: '5', co2GKm: 160 }).environmentalFeeCents).toBe(100_000);
  });
  it('Euro 1–3 cannot be registered unless historic', () => {
    expect(calc({ firstRegistration: '2001-01-31', euroClass: '3', co2GKm: 180 }).flags.registrationBanned).toBe(true);
    expect(calc({ firstRegistration: '1990-01-31', euroClass: '1', co2GKm: 180 }).flags.registrationBanned).toBe(false);
  });
  it('new means of transport: ≤6 months OR ≤6.000 km', () => {
    expect(calc({ firstRegistration: '2026-06-01', mileageKm: 9_000 }).flags.newMeansOfTransport).toBe(true);
    expect(calc({ firstRegistration: '2024-01-01', mileageKm: 5_000 }).flags.newMeansOfTransport).toBe(true);
    expect(calc({ firstRegistration: '2024-01-01', mileageKm: 6_001 }).flags.newMeansOfTransport).toBe(false);
  });
});

describe('missing inputs', () => {
  it('lists every missing field instead of guessing', () => {
    const r = calculateRegistrationTax(rules, { ...base, ltpfCents: null, co2GKm: null, euroClass: null, bodyCategory: null, powertrain: null });
    expect(r).toEqual({ ok: false, reason: 'missing-input', missing: ['ltpf', 'bodyCategory', 'powertrain', 'euroClass', 'co2'] });
  });
  it('reports dates without rules', () => {
    expect(calculateRegistrationTax(rules, { ...base, expectedRegistration: '2020-01-01' })).toEqual({ ok: false, reason: 'no-rules-version', date: '2020-01-01' });
  });
});
