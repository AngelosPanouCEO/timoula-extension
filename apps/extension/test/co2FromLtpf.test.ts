import { describe, expect, it } from 'vitest';
import { co2FromPriceList, type LtpfRecord } from '@timoula/core';
import { withCo2Estimate, type FormState } from '../src/popup/form';

const withCo2From = (f: FormState, list: ReturnType<typeof co2FromPriceList>) => withCo2Estimate(f, list, null);

const rec = (patch: Partial<LtpfRecord>) =>
  ({ brand: 'AUDI', model: 'R8', version: '4.2 FSI quattro R tronic', transmission: 'AMT', power_ps: 420, power_kw: null, co2_g_km: 106, co2_cycle: 'NEDC', valid_from: '2018-02-20', ...patch }) as LtpfRecord;
const form = (patch: Partial<FormState>) => ({ co2GKm: null, co2FromLtpf: false, co2ListFrom: null, co2FromEea: null, firstRegistration: '2018-03-31', edited: [], ...patch }) as unknown as FormState;
const src = (r: LtpfRecord, all: LtpfRecord[] = [r], firstReg = '2018-03-31') => co2FromPriceList(all, r, firstReg);

describe('CO2 from the chosen price-list version', () => {
  it('fills CO2 when the listing has none and marks it', () => {
    expect(withCo2From(form({}), src(rec({})))).toMatchObject({ co2GKm: 106, co2FromLtpf: true, co2ListFrom: null });
  });

  it('never replaces a CO2 from the listing or typed by the client', () => {
    expect(withCo2From(form({ co2GKm: 112 }), src(rec({})))).toMatchObject({ co2GKm: 112, co2FromLtpf: false });
    expect(withCo2From(form({ co2GKm: null, edited: ['co2GKm'] }), src(rec({})))).toMatchObject({ co2GKm: null, co2FromLtpf: false });
  });

  it('follows the chosen version and clears when no version is chosen', () => {
    const first = withCo2From(form({}), src(rec({})));
    expect(withCo2From(first, src(rec({ co2_g_km: 105 })))).toMatchObject({ co2GKm: 105, co2FromLtpf: true });
    expect(withCo2From(first, null)).toMatchObject({ co2GKm: null, co2FromLtpf: false });
  });

  it('skips a list CO2 of the other cycle (NEDC up to 2020, WLTP from 2021)', () => {
    expect(src(rec({ co2_cycle: 'WLTP' }), undefined, '2020-06-30')).toBeNull();
    expect(src(rec({ co2_cycle: 'NEDC' }), undefined, '2021-02-01')).toBeNull();
    expect(src(rec({ co2_cycle: 'WLTP', co2_g_km: 124 }), undefined, '2021-05-10')?.co2GKm).toBe(124);
    expect(src(rec({ co2_cycle: null, co2_g_km: 151 }), undefined, '2014-11-30')?.co2GKm).toBe(151);
  });

  it('list without CO2: the same version in the nearest list that prints it, at most 4 years away', () => {
    const chosen = rec({ co2_g_km: null, co2_cycle: null, valid_from: '2008-12-12' });
    const all = [
      chosen,
      rec({ co2_g_km: 332, valid_from: '2011-07-11' }),
      rec({ co2_g_km: 330, valid_from: '2012-09-26' }),
      rec({ co2_g_km: 290, valid_from: '2012-09-26', version: '4.2 FSI quattro S tronic', transmission: 'DCT' }), // other gearbox
      rec({ co2_g_km: 299, valid_from: '2011-07-11', power_ps: 430 }), // other power
    ];
    const s = src(chosen, all, '2008-01-31');
    expect(s).toMatchObject({ co2GKm: 332, sameRecord: false });
    expect(withCo2From(form({ firstRegistration: '2008-01-31' }), s)).toMatchObject({ co2GKm: 332, co2FromLtpf: true, co2ListFrom: '2011-07-11' });
    expect(src(chosen, [chosen, rec({ co2_g_km: 330, valid_from: '2013-07-11' })], '2008-01-31')).toBeNull(); // > 4 years
  });

  it('EEA estimate when no price list value; the price list wins when it has one; typed values stay', () => {
    const eea = { co2GKm: 172, cycle: 'NEDC' as const, level: 'model' as const, cars: 1558 };
    const a = withCo2Estimate(form({}), null, eea);
    expect(a).toMatchObject({ co2GKm: 172, co2FromEea: { level: 'model', cars: 1558 }, co2FromLtpf: false });
    expect(withCo2Estimate(a, src(rec({})), eea)).toMatchObject({ co2GKm: 106, co2FromLtpf: true, co2FromEea: null });
    expect(withCo2Estimate(a, null, null)).toMatchObject({ co2GKm: null, co2FromEea: null });
    expect(withCo2Estimate(form({ co2GKm: 150 }), null, eea)).toMatchObject({ co2GKm: 150, co2FromEea: null });
    const same = withCo2Estimate(a, null, eea);
    expect(same).toBe(a); // unchanged → same object (runs in an effect)
  });
});
