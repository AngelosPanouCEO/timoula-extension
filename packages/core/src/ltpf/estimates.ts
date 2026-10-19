/**
 * ΛΤΠΦ when the Greek price lists have no exact match, so the calculation never stops.
 * Order (most to least reliable):
 *   exact (Greek list) → γ same version, other period → ε German price of the same version
 *   (ADAC, without VAT) → β sister version → residual value from the listing price.
 * β is moved after the residual estimate when the sister version's power is far from the car's
 * (> 15%), because then its price says little about this car (e.g. A6 allroad 55 TDI 349 hp vs 50 TDI 286 hp).
 *
 * Residual value: new price ≈ used price ÷ typical market residual value for the age (adjusted for
 * mileage), then without the origin country's VAT. The customs depreciation table is not used for this:
 * it is steeper than the market (≈60% at four years for a saloon, the market ≈50%), so it would
 * overstate the new price. Always a rough estimate (the used price also carries the options).
 */
import type { TaxRules } from '../tax/rulesSchema';
import type { BodyCategory } from '../types';
import { monthsBetween } from '../util/dates';
import { checkRecord, lookupLtpf, versionScore, type LtpfCandidate, type LtpfLookupResult, type LtpfQuery, type Synonyms, DEFAULT_SYNONYMS } from './lookup';
import type { LtpfRecord } from './schema';

/** Standard VAT rates of EU countries (2026), for the residual estimate. VERIFY when rates change. */
export const EU_VAT_RATES: Record<string, number> = {
  AT: 0.2, BE: 0.21, BG: 0.2, HR: 0.25, CY: 0.19, CZ: 0.21, DK: 0.25, EE: 0.24, FI: 0.255, FR: 0.2, DE: 0.19, GR: 0.24, HU: 0.27,
  IE: 0.23, IT: 0.22, LV: 0.21, LT: 0.21, LU: 0.17, MT: 0.18, NL: 0.21, PL: 0.23, PT: 0.23, RO: 0.21, SK: 0.23, SI: 0.22, ES: 0.21, SE: 0.25,
};

export interface ResidualInput {
  priceCents: number | null;
  countryCode: string | null;
  firstRegistration: string | null;
  expectedRegistration: string;
  mileageKm: number | null;
  bodyCategory: BodyCategory | null;
}

/**
 * Typical share of the new price a used car keeps, by age in years (European market averages,
 * rough; VERIFY against valuation data when available).
 */
const MARKET_RESIDUAL: [number, number][] = [
  [0, 1], [0.5, 0.85], [1, 0.76], [2, 0.64], [3, 0.55], [4, 0.48], [5, 0.42], [6, 0.37], [7, 0.33], [8, 0.29], [9, 0.26], [10, 0.23], [12, 0.18], [15, 0.12], [20, 0.08],
];
const AVERAGE_KM_PER_YEAR = 15_000;

export function marketResidual(ageYears: number, mileageKm: number | null): number {
  const a = Math.max(0, ageYears);
  let r = MARKET_RESIDUAL[MARKET_RESIDUAL.length - 1]![1];
  for (let i = 1; i < MARKET_RESIDUAL.length; i++) {
    const [y0, r0] = MARKET_RESIDUAL[i - 1]!;
    const [y1, r1] = MARKET_RESIDUAL[i]!;
    if (a <= y1) {
      r = r0 + ((r1 - r0) * (a - y0)) / (y1 - y0);
      break;
    }
  }
  if (mileageKm !== null && a > 0) {
    // ±2% per 10.000 km away from the average, at most ±15%.
    const diff = (mileageKm - AVERAGE_KM_PER_YEAR * a) / 10_000;
    r *= Math.min(1.15, Math.max(0.85, 1 - 0.02 * diff));
  }
  return r;
}

export function residualLtpfRecord(_rules: TaxRules, q: LtpfQuery, x: ResidualInput): LtpfRecord | null {
  if (!x.priceCents || !x.firstRegistration || !q.make) return null;
  const ageYears = Math.max(0, monthsBetween(x.firstRegistration, x.expectedRegistration)) / 12;
  const residual = marketResidual(ageYears, x.mileageKm);
  const vat = EU_VAT_RATES[x.countryCode ?? ''] ?? 0.19;
  const newGross = x.priceCents / 100 / residual;
  const ltpf = newGross / (1 + vat);
  return {
    id: 'residual-estimate',
    brand: q.make,
    model: q.model ?? '',
    model_year_tag: null,
    version: q.versionText ?? '',
    engine_label: null,
    displacement_l: null,
    displacement_cc: q.displacementCc,
    fuel: null,
    powertrain: null,
    power_ps: q.powerHp,
    power_kw: q.powerKw,
    transmission: null,
    drive: null,
    body_type: x.bodyCategory,
    co2_g_km: null,
    co2_cycle: null,
    ltpf_eur: Math.round(ltpf * 100) / 100,
    retail_incl_tax_eur: null,
    valid_from: x.firstRegistration,
    valid_to: null,
    source_type: 'manual',
    confidence: 'low',
    importer: null,
    protocol_no: null,
    list_label: null,
    source_url: 'residual-value-estimate',
    source_page: null,
    source_sha256: null,
    extraction_method: null,
    verified: false,
    notes: `Από την τιμή της αγγελίας: μέση υπολειμματική αξία ${Math.round(residual * 100)}% στα ${ageYears.toFixed(1).replace('.', ',')} έτη → καινούργιο ≈ ${Math.round(newGross).toLocaleString('el-GR')} € με ΦΠΑ ${Math.round(vat * 100)}%.`,
  };
}

const kwOf = (r: LtpfRecord) => r.power_kw ?? (r.power_ps !== null ? r.power_ps / 1.36 : null);

/** Greek lookup, then German prices and the residual estimate where the Greek lists fall short. */
export function lookupLtpfWithEstimates(
  records: LtpfRecord[],
  q: LtpfQuery,
  extra: { foreign?: LtpfRecord[]; residual?: LtpfRecord | null },
  syn: Synonyms = DEFAULT_SYNONYMS,
): LtpfLookupResult {
  const gr = lookupLtpf(records, q, syn);
  if (gr.criterion === 'exact' || gr.criterion === 'gamma') return gr;

  const toCandidate = (r: LtpfRecord, criterion: LtpfCandidate['criterion']): LtpfCandidate => ({
    record: r,
    checks: checkRecord(r, q),
    versionScore: versionScore(r, q.versionText),
    criterion,
    official: false,
  });
  const de = (extra.foreign ?? [])
    .map((r) => toCandidate(r, 'epsilon'))
    .filter((c) => c.checks.gearbox !== 'mismatch' && c.checks.fuel !== 'mismatch')
    // A matching gearbox outranks the name: ADAC names say "Steptronic", listings say "Automatik".
    .sort((a, b) => Number(b.checks.gearbox === 'match') - Number(a.checks.gearbox === 'match') || b.versionScore - a.versionScore || a.record.ltpf_eur - b.record.ltpf_eur);
  const residual = extra.residual ? toCandidate(extra.residual, 'residual') : null;
  const beta = gr.criterion === 'beta' ? gr.candidates : [];
  const qkw = q.powerKw ?? (q.powerHp !== null ? q.powerHp / 1.36 : null);
  const betaFar = beta.length > 0 && qkw !== null && beta.every((c) => {
    const k = kwOf(c.record);
    return k !== null && Math.abs(k - qkw) / qkw > 0.15;
  });

  const ordered: LtpfCandidate[] = [...de, ...(betaFar ? [] : beta), ...(residual ? [residual] : []), ...(betaFar ? beta : [])];
  if (!ordered.length) return gr;
  const first = ordered[0]!;
  const sameKind = ordered.filter((c) => c.criterion === first.criterion);
  const fullVersion = sameKind.filter((c) => c.versionScore === 1);
  const selected = sameKind.length === 1 || (fullVersion.length === 1 && fullVersion[0] === first) ? first : null;
  return { ...gr, status: selected ? 'single' : 'choose', criterion: first.criterion, candidates: ordered, selected, reason: undefined };
}
