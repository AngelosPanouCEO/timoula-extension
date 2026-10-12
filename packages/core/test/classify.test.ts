import { describe, expect, it } from 'vitest';
import { checkEligibility, checkVehicleKind, suggestBodyCategory, suggestPowertrain, type PowertrainInput } from '../src';

const pt = (p: Partial<PowertrainInput>) =>
  suggestPowertrain({ fuel: 'petrol', fuelRaw: null, make: null, model: null, version: null, title: null, batteryKwh: null, siteFlag: null, firstRegistrationYear: 2020, ...p });

describe('powertrain suggestion', () => {
  it('03: mild hybrid visible only in the title', () => {
    const s = pt({ fuel: 'petrol', fuelRaw: 'Benzin', make: 'Subaru', model: 'Forester', version: '2.0ie Mild-Hybrid Edition Sport 40', firstRegistrationYear: 2021 });
    expect(s.suggested).toBe('MHEV');
    expect(s.needsConfirmation).toBe(true);
  });
  it('04: Mercedes C 200 W206 listed as petrol → ICE suggested, model hint asks to check the COC', () => {
    const s = pt({ make: 'Mercedes-Benz', model: 'C 200', version: '4M AVANTGARDE Advanced Soundsystem AHK 360', firstRegistrationYear: 2022 });
    expect(s.suggested).toBe('ICE');
    expect(s.needsConfirmation).toBe(true);
    expect(s.signals.some((x) => x.kind === 'model-hint')).toBe(true);
  });
  it('06: BMW 330e listed as petrol → PHEV from model name and battery', () => {
    const s = pt({ make: 'BMW', model: '330', title: 'BMW 330e Sport Line DA Prof Laser PA HuD Pano HiFi', batteryKwh: 11 });
    expect(s.suggested).toBe('PHEV');
    expect(s.signals.map((x) => x.kind).sort()).toEqual(['battery', 'title']);
  });
  it('05: RAV4 Hybrid with an unreliable "phev" site flag → HEV, confirm', () => {
    const s = pt({ fuel: 'petrol_electric', fuelRaw: 'Elektro/Benzin', model: 'RAV4', version: '2.5 Hybrid Dynamic Aut.', siteFlag: 'phev' });
    expect(s.suggested).toBe('HEV');
    expect(s.needsConfirmation).toBe(true);
  });
  it('15: Skoda Octavia 1.4 TSI iV → PHEV', () => {
    expect(pt({ fuel: 'petrol_electric', model: 'Octavia', version: '1.4 TSI iV Style' }).suggested).toBe('PHEV');
  });
  it('07: electric → BEV without confirmation', () => {
    const s = pt({ fuel: 'electric', fuelRaw: 'Elektro', model: 'ID.3' });
    expect(s).toMatchObject({ suggested: 'BEV', needsConfirmation: false });
  });
  it('plain diesel → ICE without confirmation', () => {
    expect(pt({ fuel: 'diesel', model: 'Passat Variant', version: '2.0 TDI BlueMotion Technology R-Line' })).toMatchObject({ suggested: 'ICE', needsConfirmation: false });
  });
  it('old "230 E" (injection) is not a plug-in', () => {
    expect(pt({ make: 'Mercedes-Benz', model: '230 E', firstRegistrationYear: 1984 }).suggested).toBe('ICE');
  });
  it('no fuel and no signals → no suggestion', () => {
    expect(pt({ fuel: null }).suggested).toBeNull();
  });
});

describe('body category', () => {
  it.each([
    ['SUV/Geländewagen/Pickup', 'suv_atv', true],
    ['OffRoad', 'suv_atv', true],
    ['Kleinwagen', 'hatchback', true],
    ['Cabrio', 'cabrio', true],
    ['Coupé', 'coupe_roadster', true],
    ['Van/Minibus, Tageszulassung', 'mpv', true],
    ['Limousine', 'sedan', false],
    ['Kombi', null, false],
    ['EstateCar', null, false],
    ['Sonstige', null, false],
  ])('%s → %s', (raw, cat, confident) => {
    expect(suggestBodyCategory(raw)).toEqual({ category: cat, confident });
  });
});

describe('vehicle kind', () => {
  it('18: VW T6 Transporter Kasten is flagged as commercial', () => {
    expect(checkVehicleKind(['T6 Transporter', 'Kasten/Kombi Kasten FWD EcoProfi*AHK'])).toEqual({ likelyCommercial: true, evidence: 'KASTEN' });
  });
  it('passenger cars pass', () => {
    expect(checkVehicleKind(['Tourneo Courier', 'Titanium Aut.']).likelyCommercial).toBe(false);
    expect(checkVehicleKind(['Passat Variant', '2.0 TDI R-Line']).likelyCommercial).toBe(false);
  });
});

describe('EU eligibility', () => {
  it('EU, non-EU and unknown', () => {
    expect(checkEligibility('DE')).toEqual({ status: 'eu', country: 'DE' });
    expect(checkEligibility('ch')).toEqual({ status: 'non-eu', country: 'CH' });
    expect(checkEligibility('UK')).toEqual({ status: 'non-eu', country: 'GB' });
    expect(checkEligibility('NO')).toEqual({ status: 'non-eu', country: 'NO' });
    expect(checkEligibility('EL')).toEqual({ status: 'eu', country: 'GR' });
    expect(checkEligibility(null)).toEqual({ status: 'unknown' });
  });
});
