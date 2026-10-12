import { describe, expect, it } from 'vitest';
import {
  bundledLtpfDataset,
  exportLtpfCsv,
  importLtpfCsv,
  isOfficialPrice,
  lookupLtpf,
  ltpfRecordId,
  mergeLtpfRecords,
  parseCsv,
  type LtpfQuery,
} from '../src';

const records = bundledLtpfDataset().records;

const q = (patch: Partial<LtpfQuery>): LtpfQuery => ({
  make: 'Subaru',
  model: 'XV',
  versionText: null,
  firstRegistration: null,
  displacementCc: null,
  powerKw: null,
  powerHp: null,
  co2GKm: null,
  fuel: null,
  powertrain: null,
  gearbox: null,
  ...patch,
});

describe('bundled ΛΤΠΦ data', () => {
  it('loads the Subaru pilot (311 records)', () => {
    expect(records).toHaveLength(311);
    expect(records.every((r) => r.brand === 'SUBARU')).toBe(true);
  });
});

describe('ΛΤΠΦ lookup (SPEC.md)', () => {
  it('test page 01: XV 2.0D Comfort 11/2014 → list 30/10/2014, 21.620,81 € official', () => {
    const r = lookupLtpf(
      records,
      q({ versionText: '2.0D Comfort', firstRegistration: '2014-11-30', displacementCc: 1998, co2GKm: 146, fuel: 'diesel', gearbox: 'manual', powertrain: 'ICE', powerKw: 108, powerHp: 147 }),
    );
    expect(r.status).toBe('single');
    expect(r.criterion).toBe('exact');
    expect(r.selected?.record.ltpf_eur).toBe(21620.81);
    expect(r.selected?.record.valid_from).toBe('2014-10-30');
    expect(r.selected?.official).toBe(true);
  });

  it('test page 02: Forester 2.0D "Active" 02/2017 is not in the Greek list → client chooses', () => {
    const r = lookupLtpf(
      records,
      q({ model: 'Forester', versionText: '2.0D 4x4 Active *AHK*SHZ*Starlink*LM*', firstRegistration: '2017-02-28', displacementCc: 1998, co2GKm: 148, fuel: 'diesel', gearbox: 'manual', powertrain: 'ICE' }),
    );
    expect(r.status).toBe('choose');
    expect(r.criterion).toBe('exact');
    expect(r.candidates.map((c) => c.record.version).sort()).toEqual(['TREND', 'TREND-DYNAMIC']);
    expect(r.candidates.every((c) => c.official)).toBe(true);
  });

  it('test page 03: Forester e-BOXER 07/2021 falls in the 2020–2026 gap → estimate from another list (γ)', () => {
    const r = lookupLtpf(
      records,
      q({ model: 'Forester', versionText: '2.0ie Mild-Hybrid Edition Sport 40', firstRegistration: '2021-07-31', displacementCc: 1995, co2GKm: 154, fuel: 'petrol', gearbox: 'automatic', powertrain: 'MHEV' }),
    );
    expect(r.criterion).toBe('gamma');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every((c) => !c.official)).toBe(true);
    expect(r.candidates[0]!.record.model).toBe('FORESTER e-BOXER (MHEV)');
    expect(r.knownLists.find((l) => l.validFrom === '2019-11-08')?.endUnknown).toBe(true);
  });

  it('brand without price lists → none', () => {
    expect(lookupLtpf(records, q({ make: 'Genesis', model: 'G70', firstRegistration: '2024-11-30' }))).toMatchObject({ status: 'none', reason: 'brand-not-in-table' });
  });

  it('model not in the table → none', () => {
    expect(lookupLtpf(records, q({ model: 'Tribeca', firstRegistration: '2014-11-30' }))).toMatchObject({ status: 'none', reason: 'model-not-in-table' });
  });

  it('needs make, model and first registration', () => {
    expect(lookupLtpf(records, q({ model: null })).reason).toBe('missing-make-model');
    expect(lookupLtpf(records, q({})).reason).toBe('missing-first-registration');
  });

  it('a CO2 mismatch in the era list falls back to a sister version (β)', () => {
    const r = lookupLtpf(records, q({ versionText: 'Comfort', firstRegistration: '2014-11-30', displacementCc: 1998, co2GKm: 199, fuel: 'diesel', gearbox: 'manual' }));
    expect(r.criterion).toBe('beta');
    expect(r.candidates.every((c) => !c.official)).toBe(true);
  });

  it('labels only verified official price lists as official', () => {
    expect(isOfficialPrice({ source_type: 'gr_official_pricelist', verified: true })).toBe(true);
    expect(isOfficialPrice({ source_type: 'gr_official_pricelist', verified: false })).toBe(false);
    expect(isOfficialPrice({ source_type: 'gr_importer_estimate', verified: true })).toBe(false);
  });
});

describe('ΛΤΠΦ CSV', () => {
  it('parses quotes, commas, newlines and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n"multi\nline",2\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['multi\nline', '2'],
    ]);
  });

  it('round-trips the bundled table', async () => {
    const csv = exportLtpfCsv(records.slice(0, 20));
    const back = await importLtpfCsv(csv);
    expect(back.errors).toEqual([]);
    expect(back.records).toEqual(records.slice(0, 20));
  });

  it('computes the schema id when missing, reports bad rows', async () => {
    const csv = [
      'brand,model,version,ltpf_eur,valid_from,source_type,confidence,source_url,verified,transmission,engine_label,model_year_tag',
      'SUBARU,XV,COMFORT,18068.78,2013-10-07,gr_official_pricelist,high,http://subaru.net.gr/assets/files/SUBARU_ExRetailPrices.pdf,True,MT,1.6P,',
      'SUBARU,XV,BAD,not-a-number,2013-10-07,gr_official_pricelist,high,x,True,MT,,',
    ].join('\n');
    const res = await importLtpfCsv(csv);
    expect(res.records).toHaveLength(1);
    expect(res.records[0]!.id).toBe('74f17be7b6ce0307');
    expect(res.errors[0]!.line).toBe(3);
  });

  it('id matches the dataset ids (sha1 rule from the schema)', async () => {
    for (const r of records.slice(0, 30)) expect(await ltpfRecordId(r)).toBe(r.id);
  });

  it('merges by id', () => {
    const a = records.slice(0, 3);
    const b = [{ ...records[0]!, ltpf_eur: 1 }, records[3]!];
    const m = mergeLtpfRecords(a, b);
    expect(m).toMatchObject({ added: 1, replaced: 1 });
    expect(m.records.find((r) => r.id === records[0]!.id)!.ltpf_eur).toBe(1);
  });
});
