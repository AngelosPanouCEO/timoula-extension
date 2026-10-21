import { describe, expect, it } from 'vitest';
import {
  bundledLtpfDataset,
  deMarketEstimate,
  dePriceCandidates,
  estimateCo2FromEea,
  loadDePriceTable,
  loadEeaCo2Table,
  lookupLtpfWithEstimates,
  type DePriceTable,
  type LtpfQuery,
} from '../src';

const records = bundledLtpfDataset().records;
const q = (patch: Partial<LtpfQuery>): LtpfQuery => ({
  make: 'BMW', model: '320', versionText: '320d Touring Sport Line', firstRegistration: '2017-05-31', displacementCc: 1995, powerKw: 140, powerHp: 190,
  co2GKm: null, fuel: 'diesel', powertrain: 'ICE', gearbox: 'automatic', ...patch,
});
const de: DePriceTable = {
  source: 'test',
  makes: ['BMW', 'AUDI', 'PORSCHE'],
  models: ['3ER-REIHE', 'A3', '911', '5ER-REIHE'],
  rows: [
    [0, 0, 'BMW 320d Touring Sport Line Steptronic', 'diesel', 140, '2015-07', '2019-06', 46_900, 1],
    [0, 0, 'BMW 320d Touring Sport Line', 'diesel', 140, '2015-07', '2019-06', 44_800, 2],
    [0, 0, 'BMW 318d Touring', 'diesel', 110, '2015-07', '2019-06', 39_000, 3],
    [0, 0, 'BMW 320d Touring', 'diesel', 140, '2012-01', '2015-06', 40_000, 4], // other period
    [1, 1, 'Audi A3 Sportback 40 TDI quattro S tronic', 'diesel', 147, '2020-03', null, 38_500, 5],
    [0, 0, 'BMW 330d Touring', 'diesel', 190, '2015-07', '2019-06', 52_000, 6],
    [2, 2, 'Porsche 911 Carrera Coupé PDK', 'petrol', 272, '2015-12', '2018-08', 101_425, 7],
    [2, 2, 'Porsche 911 Carrera Coupé 4S PDK', 'petrol', 309, '2016-01', '2018-08', 122_964, 8],
    [0, 3, 'BMW 520d Touring', 'diesel', 140, '2017-02', null, 51_500, 10],
  ],
};

describe('ΛΤΠΦ estimates when the Greek lists have no exact match (new-car prices only)', () => {
  it('German price of the same version (ADAC): make, model word, power and period must match; VAT removed', () => {
    const c = dePriceCandidates(de, q({}));
    expect(c.map((r) => r.id)).toEqual(['adac-1', 'adac-2']);
    expect(c[0]).toMatchObject({ model: '320d', version: 'Touring Sport Line Steptronic', ltpf_eur: 39_411.76, source_type: 'foreign_price_estimate', verified: false, transmission: 'AT' });
  });

  it('generation codes in the listing (Porsche 991) find the model (911)', () => {
    const carreraT = q({ make: 'Porsche', model: '991', versionText: 'Carrera T PDK', firstRegistration: '2018-05-31', displacementCc: 2981, powerKw: 272, powerHp: 370, fuel: 'petrol' });
    const c = dePriceCandidates(de, carreraT);
    expect(c[0]).toMatchObject({ id: 'adac-7', ltpf_eur: 85_231.09 });
  });

  it('no version with the car’s power: the closest version of the same model (±25%), marked as such', () => {
    // BMW listings name the version ("325"), ADAC the series ("3er-reihe"); no 325d in the table.
    const c = dePriceCandidates(de, q({ model: '325', versionText: '325d Touring', powerKw: 170, powerHp: 231 }));
    expect(c.map((r) => r.id)).toEqual(['adac-6', 'adac-1', 'adac-2']); // 190, 140, 140 kW: closest first; 5 Series excluded
    expect(c[0]!.confidence).toBe('low');
    expect(c[0]!.notes).toContain('κοντινότερη έκδοση');
    // Price adjusted for power: 52.000 € × (170/190)^0.45.
    expect(c[0]!.retail_incl_tax_eur).toBe(Math.round(52_000 * Math.pow(170 / 190, 0.45)));
    expect(c[1]!.retail_incl_tax_eur).toBeGreaterThan(46_900);
  });

  it('no version on sale at the time (e.g. a body ADAC lacks): the closest version sold up to 18 months away', () => {
    const c = dePriceCandidates(de, q({ firstRegistration: '2020-06-30' })); // the table's 320d ended 06/2019
    expect(c.map((r) => r.id)).toEqual(['adac-1', 'adac-2']); // the same version first
    expect(c[0]!.confidence).toBe('low');
    expect(c[0]!.notes).toContain('ίδια έκδοση, πωλήθηκε 07/2015–06/2019');
    const other = dePriceCandidates(de, q({ model: '325', versionText: '325d Touring', firstRegistration: '2020-06-30', powerKw: 170, powerHp: 231 }));
    expect(other.map((r) => r.id)).toEqual(['adac-6', 'adac-1', 'adac-2']); // 190, 140, 140 kW
    expect(other[0]!.notes).toContain('κοντινότερη έκδοση του μοντέλου (190 kW), πωλήθηκε 07/2015–06/2019');
    expect(dePriceCandidates(de, q({ firstRegistration: '2021-01-31' }))).toEqual([]);
  });

  it('the model family is not a designation: an X5 M50d is not priced as the X5 40d without power adjustment', () => {
    const x5: DePriceTable = { source: 't', makes: ['BMW'], models: ['X5'], rows: [
      [0, 0, 'BMW X5 xDrive40d Steptronic', 'diesel', 250, '2020-08', '2023-02', 82_900, 1],
      [0, 0, 'BMW X5 M50d xDrive Steptronic Sport', 'diesel', 294, '2018-11', '2019-06', 92_900, 2],
    ] };
    const m50d = (d: string) => q({ model: 'X5', versionText: 'M50d', firstRegistration: d, displacementCc: 2993, powerKw: 294, powerHp: 400 });
    expect(dePriceCandidates(x5, m50d('2019-06-30')).map((r) => [r.id, r.confidence])).toEqual([['adac-2', 'medium']]);
    // Later: the same version sold 15 months earlier comes before another version adjusted for power.
    const later = dePriceCandidates(x5, m50d('2020-09-30'));
    expect(later.map((r) => [r.id, r.confidence])).toEqual([['adac-2', 'low']]);
    expect(later[0]!.notes).toContain('ίδια έκδοση, πωλήθηκε 11/2018–06/2019');
    const after = dePriceCandidates({ ...x5, rows: [x5.rows[0]!] }, m50d('2020-09-30'));
    expect(after[0]!.retail_incl_tax_eur).toBe(Math.round(82_900 * Math.pow(294 / 250, 0.45)));
  });

  it('brand without Greek lists: German price first (ε), market median as alternative', () => {
    const r = lookupLtpfWithEstimates(records, q({}), { foreign: dePriceCandidates(de, q({})), market: deMarketEstimate(de, q({})) });
    expect(r.criterion).toBe('epsilon');
    expect(r.candidates.map((c) => c.criterion)).toEqual(['epsilon', 'epsilon', 'market']);
    expect(r.candidates[0]!.record.id).toBe('adac-1'); // automatic gearbox, like the listing
    expect(r.status).toBe('choose'); // the popup uses the first and asks to confirm
  });

  it('drive in the listing text (4M, quattro, xDrive…) picks the all-wheel-drive version', () => {
    const awd = q({ versionText: '320d xDrive Touring Sport Line' });
    const table: DePriceTable = { ...de, rows: [...de.rows, [0, 0, 'BMW 320d Sport Line xDrive Steptronic', 'diesel', 140, '2015-07', '2019-06', 49_000, 9]] };
    const r = lookupLtpfWithEstimates(records, awd, { foreign: dePriceCandidates(table, awd), market: null });
    expect(r.candidates[0]!.record.id).toBe('adac-9');
  });

  it('market median: same make with similar power (kW ±10%), bounded by new-car prices', () => {
    const m = deMarketEstimate(de, q({ versionText: 'unknown', powerKw: 142 }))!;
    expect(m).toMatchObject({ id: 'market-make', confidence: 'low' });
    expect(m.ltpf_eur).toBeCloseTo(46_900 / 1.19, 1); // middle of 44.800 / 46.900 / 51.500 (140 kW, in period; the 2012–2015 version is not)
  });

  it('Greek sister version far from the car’s power (A3 40 TDI 200 hp vs 30 TDI 116 hp) comes last', () => {
    const a3 = q({ make: 'Audi', model: 'A3', versionText: 'Sportback 40 TDI quattro S tronic', firstRegistration: '2021-06-30', displacementCc: 1968, powerKw: 147, powerHp: 200, fuel: 'diesel' });
    const r = lookupLtpfWithEstimates(records, a3, { foreign: dePriceCandidates(de, a3), market: null });
    expect(r.selected?.record.id).toBe('adac-5');
    expect(r.candidates.slice(1).every((c) => c.criterion === 'beta')).toBe(true);
  });

  it('an exact Greek match is never replaced by an estimate', () => {
    const a3 = q({ make: 'Audi', model: 'A3', versionText: '1.6 TDI Sportback design', firstRegistration: '2018-03-31', displacementCc: 1598, powerKw: 85, powerHp: 116 });
    const r = lookupLtpfWithEstimates(records, a3, { foreign: dePriceCandidates(de, a3), market: deMarketEstimate(de, a3) });
    expect(r.criterion).toBe('exact');
    expect(r.candidates.every((c) => c.criterion === 'exact' && c.official)).toBe(true);
  });

  it('real data: Porsche 991 Carrera T PDK 05/2018 gets a German new-car price, not an extreme value', async () => {
    const table = await loadDePriceTable();
    const carreraT = q({ make: 'Porsche', model: '991', versionText: 'Carrera T PDK 18-Wege/Chrono/Memory', firstRegistration: '2018-05-31', displacementCc: 2981, powerKw: 272, powerHp: 370, fuel: 'petrol' });
    const r = lookupLtpfWithEstimates(records, carreraT, { foreign: dePriceCandidates(table, carreraT), market: deMarketEstimate(table, carreraT) });
    expect(r.criterion).toBe('epsilon');
    expect(r.candidates[0]!.record.ltpf_eur).toBeGreaterThan(75_000);
    expect(r.candidates[0]!.record.ltpf_eur).toBeLessThan(110_000);
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
