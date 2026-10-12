/** Helpers shared by the site parsers. Parsers never guess: unknown → null. */
import { emptyField, endOfMonthIso, isIsoDate, parseIso, type Co2Cycle, type EuroClass, type Field, type FieldSource, type Fuel, type Gearbox, type ListingData, type SellerType } from '@timoula/core';

export const field = <T>(value: T | null | undefined, source: FieldSource, raw?: string | null): Field<T> =>
  value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value)) || value === ''
    ? emptyField<T>()
    : { value, source, raw: raw ?? null };

/** First non-empty field. */
export const firstOf = <T>(...fields: Field<T>[]): Field<T> => fields.find((f) => f.value !== null) ?? emptyField<T>();

/** Parse "€ 14 450", "23.945", "1.998 cm³", "96.090 km" (European thousands separators). */
export function parseIntLoose(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const m = /-?\d[\d.\s  ']*(?:,\d+)?/.exec(String(text));
  if (!m) return null;
  const cleaned = m[0].replace(/[.\s  ']/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** "11 kWh", "5,7 l/100km" → 11, 5.7 */
export function parseDecimal(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(text);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "215 kW (292 PS)" → { kw: 215, hp: 292 } */
export function parsePower(text: string | null | undefined): { kw: number | null; hp: number | null } {
  if (!text) return { kw: null, hp: null };
  const kw = /(\d+)\s*kW/i.exec(text);
  const hp = /(\d+)\s*(PS|HP|CV|KM|pk|ch|hk|LE)\b/i.exec(text);
  return { kw: kw ? Number(kw[1]) : null, hp: hp ? Number(hp[1]) : null };
}

/**
 * Month/year → ISO date. Listings rarely show the day; we use the LAST day of the month,
 * which gives the younger age and therefore never under-states tax or the NMT test.
 */
export function monthYearToIso(text: string | null | undefined): { iso: string; dayAssumed: boolean } | null {
  if (!text) return null;
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) {
    // AutoScout24 encodes month/year as the first of the month.
    if (m[3] === '01') return { iso: endOfMonthIso(+m[1]!, +m[2]!), dayAssumed: true };
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isIsoDate(iso) ? { iso, dayAssumed: false } : null;
  }
  m = /(\d{1,2})[./-](\d{4})/.exec(t);
  if (m && +m[1]! >= 1 && +m[1]! <= 12) return { iso: endOfMonthIso(+m[2]!, +m[1]!), dayAssumed: true };
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (m) {
    const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    return isIsoDate(iso) ? { iso, dayAssumed: false } : null;
  }
  return null;
}

export const isoYear = (iso: string | null) => (iso ? parseIso(iso).y : null);

const FUEL_CODES: Record<string, Fuel> = { B: 'petrol', D: 'diesel', E: 'electric', '2': 'petrol_electric', '3': 'diesel_electric', L: 'lpg', C: 'cng', H: 'hydrogen' };

/** Map fuel text in the languages of the supported sites. */
export function mapFuel(text: string | null | undefined, code?: string | null): Fuel | null {
  if (code && FUEL_CODES[code]) return FUEL_CODES[code]!;
  if (!text) return null;
  const t = text.toLowerCase();
  const electric = /elektr|electr|strom|ev\b|bev/.test(t);
  const petrol = /benzin|petrol|gasoline|essence|benzyn|benzina|gasolina|super|bensin|benzine/.test(t);
  const diesel = /diesel|gasoil|olej nap/.test(t);
  if (/wasserstoff|hydrogen|idrogeno|wodór|hidrógeno/.test(t)) return 'hydrogen';
  if (electric && petrol) return 'petrol_electric';
  if (electric && diesel) return 'diesel_electric';
  if (/autogas|lpg|gpl|glp/.test(t)) return 'lpg';
  if (/erdgas|cng|metano|methane|gnv|gnc/.test(t)) return 'cng';
  if (diesel) return 'diesel';
  if (petrol) return 'petrol';
  if (electric) return 'electric';
  return 'other';
}

export function mapGearbox(text: string | null | undefined): Gearbox | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/halbautomatik|semi/.test(t)) return 'automatic';
  if (/automat|automatic|automatique|automatico|automática|automaattinen|dsg|cvt/.test(t)) return 'automatic';
  if (/schalt|manual|manuel|manuale|manualna|handgeschakeld|manuell|mecánico|mechani/.test(t)) return 'manual';
  return null;
}

/** "Euro 6d", "EURO6d", "Euro 6d-TEMP", "Euro6" → EuroClass */
export function mapEuroClass(text: string | null | undefined): EuroClass | null {
  if (!text) return null;
  const t = text.toUpperCase().replace(/\s+/g, '');
  const m = /EURO-?(\d)([A-E])?(-?TEMP)?/.exec(t);
  if (!m) return null;
  const n = m[1]!;
  const sub = (m[2] ?? '').toLowerCase();
  if (m[3] && n === '6' && sub === 'd') return '6d-temp';
  const cls = `${n}${sub}` as EuroClass;
  const valid: EuroClass[] = ['1', '2', '3', '4', '5', '5a', '5b', '6', '6a', '6b', '6c', '6d', '6e', '7'];
  return valid.includes(cls) ? cls : null;
}

export function mapCurrency(priceText: string | null | undefined, explicit?: string | null): string | null {
  if (explicit) return explicit.toUpperCase();
  if (!priceText) return null;
  if (/€|EUR/.test(priceText)) return 'EUR';
  if (/zł|PLN/i.test(priceText)) return 'PLN';
  if (/Kč|CZK/.test(priceText)) return 'CZK';
  if (/kr|SEK|DKK/i.test(priceText)) return /DKK/.test(priceText) ? 'DKK' : 'SEK';
  if (/Ft|HUF/.test(priceText)) return 'HUF';
  if (/lei|RON/i.test(priceText)) return 'RON';
  if (/CHF/.test(priceText)) return 'CHF';
  return null;
}

export function mapSellerType(text: string | null | undefined, isDealer?: boolean | null): SellerType | null {
  if (isDealer === true) return 'dealer';
  if (isDealer === false) return 'private';
  if (!text) return null;
  const t = text.toUpperCase();
  if (/DEALER|HÄNDLER|HANDLER|AUTODEALER|COMPANY/.test(t)) return 'dealer';
  if (/PRIVAT|PRIVATE/.test(t)) return 'private';
  return null;
}

export const co2CycleField = (): Field<Co2Cycle> => emptyField<Co2Cycle>();

/** All JSON-LD objects on the page (flattening @graph and arrays). */
export function readJsonLd(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(s.textContent ?? '');
      const push = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(push);
        else if (x && typeof x === 'object') {
          const o = x as Record<string, unknown>;
          if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(push);
          out.push(o);
        }
      };
      push(data);
    } catch {
      /* ignore malformed blocks */
    }
  }
  return out;
}

export function jsonLdVehicle(doc: Document): Record<string, unknown> | null {
  const types = ['Car', 'Vehicle', 'MotorVehicle', 'Product'];
  return (
    readJsonLd(doc).find((o) => {
      const t = o['@type'];
      return (typeof t === 'string' && types.includes(t)) || (Array.isArray(t) && t.some((x) => types.includes(x)));
    }) ?? null
  );
}

/** Safe nested property access. */
export function get(obj: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

export const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : typeof x === 'number' ? String(x) : null);
export const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' ? parseIntLoose(x) : null);

/** Visible <dt>/<dd> pairs as a label → value map (last-resort fallback). */
export function definitionList(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  for (const dt of Array.from(doc.querySelectorAll('dt'))) {
    const dd = dt.nextElementSibling;
    if (!dd || dd.tagName !== 'DD') continue;
    const label = (dt.textContent ?? '').replace(/\s+/g, ' ').trim();
    const value = (dd.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (label && value && !map.has(label)) map.set(label, value);
  }
  return map;
}

/** A VIN is 17 characters, no I/O/Q. */
export function cleanVin(x: unknown): string | null {
  const s = str(x)?.toUpperCase().replace(/\s/g, '') ?? null;
  return s && /^[A-HJ-NPR-Z0-9]{17}$/.test(s) ? s : null;
}

export function blankListing(base: Pick<ListingData, 'site' | 'host' | 'listingId' | 'url'>): ListingData {
  const e = emptyField;
  return {
    ...base,
    title: e(), make: e(), model: e(), version: e(), priceCents: e(), priceNetCents: e(), vatRatePct: e(), currency: e(),
    firstRegistration: e(), firstRegistrationDayAssumed: false, mileageKm: e(), fuel: e(), fuelRaw: e(), displacementCc: e(),
    powerKw: e(), powerHp: e(), co2GKm: e(), co2Cycle: e(), euroClass: e(), bodyTypeRaw: e(), gearbox: e(), sellerType: e(),
    countryCode: e(), vin: e(), photoUrl: e(), batteryKwh: e(), isNewOrPreRegistered: e(), siteCategory: e(), sitePowertrainFlag: e(),
  };
}

/** kW ↔ hp conversion when only one is shown (marked as derived). */
export function fillDerivedPower(l: ListingData): void {
  if (l.powerKw.value === null && l.powerHp.value !== null) l.powerKw = { value: Math.round(l.powerHp.value / 1.35962), source: 'derived', raw: null };
  if (l.powerHp.value === null && l.powerKw.value !== null) l.powerHp = { value: Math.round(l.powerKw.value * 1.35962), source: 'derived', raw: null };
}
