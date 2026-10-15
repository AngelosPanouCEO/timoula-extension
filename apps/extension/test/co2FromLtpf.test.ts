import { describe, expect, it } from 'vitest';
import type { LtpfRecord } from '@timoula/core';
import { co2FromRecord, withCo2From, type FormState } from '../src/popup/form';

const rec = (patch: Partial<LtpfRecord>) => ({ co2_g_km: 106, co2_cycle: 'NEDC', ...patch }) as LtpfRecord;
const form = (patch: Partial<FormState>) => ({ co2GKm: null, co2FromLtpf: false, firstRegistration: '2018-03-31', edited: [], ...patch }) as unknown as FormState;

describe('CO2 from the chosen price-list version', () => {
  it('fills CO2 when the listing has none and marks it', () => {
    expect(withCo2From(form({}), rec({}))).toMatchObject({ co2GKm: 106, co2FromLtpf: true });
  });

  it('never replaces a CO2 from the listing or typed by the client', () => {
    expect(withCo2From(form({ co2GKm: 112 }), rec({}))).toMatchObject({ co2GKm: 112, co2FromLtpf: false });
    expect(withCo2From(form({ co2GKm: null, edited: ['co2GKm'] }), rec({}))).toMatchObject({ co2GKm: null, co2FromLtpf: false });
  });

  it('follows the chosen version and clears when no version is chosen', () => {
    const first = withCo2From(form({}), rec({}));
    expect(withCo2From(first, rec({ co2_g_km: 105 }))).toMatchObject({ co2GKm: 105, co2FromLtpf: true });
    expect(withCo2From(first, null)).toMatchObject({ co2GKm: null, co2FromLtpf: false });
  });

  it('skips a list CO2 of the other cycle (NEDC up to 2020, WLTP from 2021) and lists without CO2', () => {
    expect(co2FromRecord(rec({ co2_cycle: 'WLTP' }), '2020-06-30')).toBeNull();
    expect(co2FromRecord(rec({ co2_cycle: 'NEDC' }), '2021-02-01')).toBeNull();
    expect(co2FromRecord(rec({ co2_cycle: 'WLTP', co2_g_km: 124 }), '2021-05-10')).toBe(124);
    expect(co2FromRecord(rec({ co2_cycle: null, co2_g_km: 151 }), '2014-11-30')).toBe(151);
    expect(co2FromRecord(rec({ co2_g_km: null }), '2018-03-31')).toBeNull();
  });
});
