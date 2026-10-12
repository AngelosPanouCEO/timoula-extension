/**
 * CSV import/export for the ΛΤΠΦ table. Same columns as ltpf_records.csv
 * (UTF-8, comma separated, RFC 4180 quoting, optional BOM).
 */
import { validateLtpfRecord, type LtpfRecord } from './schema';

export const LTPF_COLUMNS = [
  'id', 'brand', 'model', 'model_year_tag', 'version', 'engine_label', 'displacement_l', 'displacement_cc', 'fuel', 'powertrain',
  'power_ps', 'power_kw', 'transmission', 'drive', 'body_type', 'co2_g_km', 'co2_cycle', 'ltpf_eur', 'retail_incl_tax_eur',
  'valid_from', 'valid_to', 'source_type', 'confidence', 'importer', 'protocol_no', 'list_label', 'source_url', 'source_page',
  'source_sha256', 'extraction_method', 'verified', 'extracted_at', 'notes',
] as const;

const NUMBER_COLUMNS = new Set(['displacement_l', 'displacement_cc', 'power_ps', 'power_kw', 'co2_g_km', 'ltpf_eur', 'retail_incl_tax_eur', 'source_page']);
const REQUIRED = ['brand', 'model', 'version', 'ltpf_eur', 'valid_from', 'source_type', 'confidence', 'source_url', 'verified'];

/** Parse CSV text into rows of cells. Handles quotes, escaped quotes, CRLF and a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: unknown[][]): string {
  return [header.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n') + '\r\n';
}

/** Stable id as defined by the schema: first 16 hex chars of sha1(brand|model|model_year_tag|engine_label|version|transmission|valid_from). */
export async function ltpfRecordId(r: Pick<LtpfRecord, 'brand' | 'model' | 'model_year_tag' | 'engine_label' | 'version' | 'transmission' | 'valid_from'>): Promise<string> {
  const key = [r.brand, r.model, r.model_year_tag ?? '', r.engine_label ?? '', r.version, r.transmission ?? '', r.valid_from].join('|');
  const digest = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export interface CsvImportResult {
  records: LtpfRecord[];
  errors: { line: number; messages: string[] }[];
}

/** Convert CSV text into validated records. Rows that fail validation are reported, not imported. */
export async function importLtpfCsv(text: string): Promise<CsvImportResult> {
  const rows = parseCsv(text);
  const result: CsvImportResult = { records: [], errors: [] };
  if (!rows.length) return { records: [], errors: [{ line: 1, messages: ['Empty file'] }] };
  const header = rows[0]!.map((h) => h.trim());
  const missingCols = REQUIRED.filter((c) => !header.includes(c));
  if (missingCols.length) return { records: [], errors: [{ line: 1, messages: [`Missing columns: ${missingCols.join(', ')}`] }] };

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const obj: Record<string, unknown> = {};
    const messages: string[] = [];
    header.forEach((col, j) => {
      if (!(LTPF_COLUMNS as readonly string[]).includes(col)) return;
      const raw = (cells[j] ?? '').trim();
      if (raw === '') {
        obj[col] = null;
      } else if (NUMBER_COLUMNS.has(col)) {
        const n = Number(raw.replace(',', '.'));
        if (Number.isFinite(n)) obj[col] = n;
        else messages.push(`${col}: not a number (${raw})`);
      } else if (col === 'verified') {
        const v = raw.toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') obj[col] = true;
        else if (v === 'false' || v === '0' || v === 'no') obj[col] = false;
        else messages.push(`verified: expected true/false (${raw})`);
      } else obj[col] = raw;
    });
    for (const col of LTPF_COLUMNS) if (!(col in obj)) obj[col] = null;
    if (obj.extracted_at === null) delete obj.extracted_at;
    if (!obj.id && obj.brand && obj.model && obj.valid_from) {
      obj.id = await ltpfRecordId({
        brand: String(obj.brand),
        model: String(obj.model),
        model_year_tag: (obj.model_year_tag as string | null) ?? null,
        engine_label: (obj.engine_label as string | null) ?? null,
        version: String(obj.version ?? ''),
        transmission: (obj.transmission as string | null) ?? null,
        valid_from: String(obj.valid_from),
      });
    }
    if (obj.version === null) obj.version = '';
    const checked = validateLtpfRecord(obj);
    if (!messages.length && checked.ok) result.records.push(checked.record);
    else result.errors.push({ line: i + 1, messages: [...messages, ...(checked.ok ? [] : checked.errors)] });
  }
  return result;
}

export function exportLtpfCsv(records: LtpfRecord[]): string {
  return toCsv(
    LTPF_COLUMNS,
    records.map((r) => LTPF_COLUMNS.map((c) => (r as Record<string, unknown>)[c] ?? null)),
  );
}

/** Merge imported records into an existing table: same id replaces, new ids are added. */
export function mergeLtpfRecords(existing: LtpfRecord[], incoming: LtpfRecord[]): { records: LtpfRecord[]; added: number; replaced: number } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  let added = 0;
  let replaced = 0;
  for (const r of incoming) {
    if (byId.has(r.id)) replaced++;
    else added++;
    byId.set(r.id, r);
  }
  return { records: [...byId.values()], added, replaced };
}
