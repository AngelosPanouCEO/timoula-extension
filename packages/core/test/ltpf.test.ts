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
  it('loads the Subaru pilot (311 records) and the Audi archive', () => {
    expect(records.filter((r) => r.brand === 'SUBARU')).toHaveLength(311);
    const audi = records.filter((r) => r.brand === 'AUDI');
    expect(audi.length).toBeGreaterThan(5000);
    expect(records.every((r) => r.brand === 'SUBARU' || r.brand === 'AUDI')).toBe(true);
    // Every Audi price was confirmed by a second, independent read of the PDF.
    expect(audi.every((r) => r.verified && r.source_type === 'gr_official_pricelist' && r.source_sha256 && r.source_page)).toBe(true);
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
  });

  it('Audi records have one valid window per version (no overlaps for the same code and version)', () => {
    const audi = records.filter((r) => r.brand === 'AUDI');
    const byKey = new Map<string, typeof audi>();
    for (const r of audi) {
      const key = `${r.list_label?.split(' ')[0]}|${r.model}|${r.version}|${r.notes?.match(/πακέτο (\S+)/)?.[1] ?? ''}|${r.ltpf_eur}`;
      byKey.set(key, [...(byKey.get(key) ?? []), r]);
    }
    for (const rs of byKey.values()) {
      const sorted = [...rs].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
      for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1]!.valid_to !== null && sorted[i - 1]!.valid_to! < sorted[i]!.valid_from).toBe(true);
    }
  });
});

describe('ΛΤΠΦ lookup: Audi archive', () => {
  const audi = (patch: Partial<LtpfQuery>) => q({ make: 'Audi', ...patch });

  it('fixture 19: A3 Sportback 1.6 TDI S tronic 03/2018 → versions of the 20/02/2018 list, Design = 21.723 € official', () => {
    const r = lookupLtpf(
      records,
      audi({ model: 'A3', versionText: '1.6 TDI Sportback design *Ambientebeleuchtung*AHK*', firstRegistration: '2018-03-31', displacementCc: 1598, powerKw: 85, powerHp: 116, fuel: 'diesel', gearbox: 'automatic', powertrain: 'ICE' }),
    );
    expect(r.criterion).toBe('exact');
    expect(r.status).toBe('choose');
    const top = r.candidates[0]!;
    expect(top.record.version).toBe('Sportback 1.6 TDI Design S tronic');
    expect(top.record.ltpf_eur).toBe(21723);
    expect(top.record.valid_from).toBe('2018-02-20');
    expect(top.official).toBe(true);
    expect(r.candidates.every((c) => c.record.power_ps === 116 && c.record.transmission === 'DCT')).toBe(true);
  });

  it('Q5 40 TDI quattro 02/2020: list without a VAT column (second read) → 37.722 € official', () => {
    const r = lookupLtpf(
      records,
      audi({ model: 'Q5', versionText: '40 TDI quattro S tronic', firstRegistration: '2020-02-10', displacementCc: 1968, powerKw: 140, powerHp: 190, fuel: 'diesel', gearbox: 'automatic', powertrain: 'ICE' }),
    );
    expect(r.criterion).toBe('exact');
    expect(r.candidates[0]!.record.ltpf_eur).toBe(37722);
    expect(r.candidates[0]!.official).toBe(true);
  });

  it('listing model names with a body word use the base model (A3 Sportback → A3)', () => {
    const r = lookupLtpf(records, audi({ model: 'A3 Sportback', versionText: '30 TFSI', firstRegistration: '2021-05-10', displacementCc: 999, powerKw: 81, powerHp: 110, fuel: 'petrol', gearbox: 'manual' }));
    expect(r.criterion).toBe('exact');
    expect(r.candidates[0]!.record.model).toBe('A3');
    expect(r.candidates[0]!.record.version).toBe('Sportback 30 TFSI');
  });

  it('a new generation in a partial list does not end the old one: A3 8V 35 TFSI 08/2020 still official', () => {
    const r = lookupLtpf(records, audi({ model: 'A3', versionText: 'Sportback 35 TFSI', firstRegistration: '2020-08-20', displacementCc: 1498, powerKw: 110, powerHp: 150, fuel: 'petrol', gearbox: 'manual' }));
    expect(r.criterion).toBe('exact');
    const v8 = r.candidates.find((c) => c.record.list_label?.startsWith('8VFAZC'));
    expect(v8?.record.ltpf_eur).toBe(19788);
    expect(v8?.official).toBe(true);
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
