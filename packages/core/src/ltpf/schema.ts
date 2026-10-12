/** ΛΤΠΦ record schema (mirrors ltpf/ltpf.schema.json, version 1.0). */
import * as v from 'valibot';
import { isIsoDate } from '../util/dates';

const IsoDate = v.pipe(v.string(), v.check((s: string) => isIsoDate(s), 'Expected an ISO date (YYYY-MM-DD)'));
const nullableString = v.nullable(v.string());

export const SOURCE_TYPES = ['gr_official_pricelist', 'gr_importer_estimate', 'gr_similar_model_estimate', 'foreign_price_estimate', 'customs_info_form', 'manual'] as const;
export type LtpfSourceType = (typeof SOURCE_TYPES)[number];

export const LtpfRecordSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  brand: v.pipe(v.string(), v.minLength(1)),
  model: v.pipe(v.string(), v.minLength(1)),
  model_year_tag: nullableString,
  version: v.string(),
  engine_label: nullableString,
  displacement_l: v.nullable(v.number()),
  displacement_cc: v.nullable(v.pipe(v.number(), v.integer())),
  fuel: v.nullable(v.picklist(['petrol', 'diesel', 'electric', 'lpg', 'cng', 'hydrogen'])),
  powertrain: v.nullable(v.picklist(['ICE', 'MHEV', 'HEV', 'PHEV', 'BEV', 'FCEV'])),
  power_ps: v.nullable(v.pipe(v.number(), v.integer())),
  power_kw: v.nullable(v.pipe(v.number(), v.integer())),
  transmission: nullableString,
  drive: v.nullable(v.picklist(['FWD', 'RWD', 'AWD'])),
  body_type: nullableString,
  co2_g_km: v.nullable(v.pipe(v.number(), v.integer())),
  co2_cycle: v.nullable(v.picklist(['NEDC', 'WLTP'])),
  ltpf_eur: v.pipe(v.number(), v.minValue(0)),
  retail_incl_tax_eur: v.nullable(v.number()),
  valid_from: IsoDate,
  valid_to: v.nullable(IsoDate),
  source_type: v.picklist(SOURCE_TYPES),
  confidence: v.picklist(['high', 'medium', 'low']),
  importer: v.optional(nullableString, null),
  protocol_no: v.optional(nullableString, null),
  list_label: v.optional(nullableString, null),
  source_url: v.string(),
  source_page: v.optional(v.nullable(v.number()), null),
  source_sha256: v.optional(nullableString, null),
  extraction_method: v.optional(v.nullable(v.picklist(['pdf_text', 'pdf_text+manual_verified', 'ocr', 'ocr+manual_verified', 'html', 'manual'])), null),
  verified: v.boolean(),
  extracted_at: v.optional(IsoDate),
  notes: v.optional(nullableString, null),
});

export type LtpfRecord = v.InferOutput<typeof LtpfRecordSchema>;

export const LtpfDatasetSchema = v.object({
  schema_version: v.string(),
  generated_at: IsoDate,
  record_count: v.optional(v.number()),
  records: v.array(LtpfRecordSchema),
});
export type LtpfDataset = v.InferOutput<typeof LtpfDatasetSchema>;

export function parseLtpfDataset(data: unknown): LtpfDataset {
  const res = v.safeParse(LtpfDatasetSchema, data);
  if (!res.success) {
    throw new Error(`Invalid ΛΤΠΦ dataset: ${res.issues.slice(0, 5).map((i) => `${v.getDotPath(i)}: ${i.message}`).join('; ')}`);
  }
  return res.output;
}

export function validateLtpfRecord(data: unknown): { ok: true; record: LtpfRecord } | { ok: false; errors: string[] } {
  const res = v.safeParse(LtpfRecordSchema, data);
  return res.success ? { ok: true, record: res.output } : { ok: false, errors: res.issues.map((i) => `${v.getDotPath(i) ?? 'record'}: ${i.message}`) };
}

/** Shown to the client as «επίσημη τιμή» only when this is true (SPEC.md). */
export function isOfficialPrice(r: Pick<LtpfRecord, 'source_type' | 'verified'>): boolean {
  return r.source_type === 'gr_official_pricelist' && r.verified;
}
