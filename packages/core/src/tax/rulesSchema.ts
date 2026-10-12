/**
 * Schema for gr-tax-rules.json. The rules file is the single home for every
 * rate, bracket and table; this schema rejects malformed files (local edits,
 * and in phase 2 files served by the backend) before they reach the engine.
 */
import * as v from 'valibot';
import { BODY_CATEGORIES, EURO_CLASSES } from '../types';
import { isIsoDate } from '../util/dates';

const IsoDate = v.pipe(v.string(), v.check((s: string) => isIsoDate(s), 'Expected an ISO date (YYYY-MM-DD)'));
const Status = v.picklist(['OK', 'VERIFY']);
const Pct = v.number();
const EuroClassSchema = v.picklist(EURO_CLASSES as unknown as [string, ...string[]]);
const PowertrainSchema = v.picklist(['ICE', 'MHEV', 'HEV', 'PHEV', 'BEV', 'FCEV']);

const SourceSchema = v.object({
  id: v.string(),
  title: v.string(),
  url: v.nullable(v.string()),
});

const DepreciationRow = v.object({
  ageYears: v.number(),
  suv_atv: Pct,
  hatchback: Pct,
  sedan: Pct,
  cabrio: Pct,
  coupe_roadster: Pct,
  mpv: Pct,
});

const ExemptionSchema = v.object({
  id: v.string(),
  sourceId: v.string(),
  status: Status,
  powertrains: v.array(PowertrainSchema),
  co2MaxGKm: v.optional(v.number()),
  co2MinGKm: v.optional(v.number()),
  expectedRegistrationFrom: v.optional(IsoDate),
  expectedRegistrationTo: v.optional(IsoDate),
  exemptPct: Pct,
  note: v.string(),
});

const Co2Band = v.object({ upToGKm: v.nullable(v.number()), adjustPct: Pct });

const RulesVersionSchema = v.object({
  id: v.string(),
  effectiveFrom: IsoDate,
  effectiveTo: v.nullable(IsoDate),
  selectedBy: v.literal('expectedRegistrationDate'),
  summary: v.nullable(v.string()),
  verify: v.array(v.string()),
  sources: v.array(SourceSchema),
  taxableValue: v.object({
    sourceId: v.string(),
    depreciation: v.object({
      sourceId: v.string(),
      status: Status,
      interpolation: v.literal('linear-monthly'),
      belowFirstRow: v.literal('linear-from-zero'),
      table: v.pipe(v.array(DepreciationRow), v.minLength(1)),
    }),
    mileage: v.object({
      sourceId: v.string(),
      status: Status,
      averageKmPerYear: v.number(),
      stepKm: v.number(),
      pctPerStep: Pct,
      maxPct: Pct,
    }),
    maxTotalDepreciationPct: Pct,
  }),
  brackets: v.object({
    sourceId: v.string(),
    status: Status,
    mode: v.picklist(['progressive-pre-depreciation-scaled', 'progressive-on-taxable-value']),
    bands: v.pipe(v.array(v.object({ upToEur: v.nullable(v.number()), ratePct: Pct })), v.minLength(1)),
  }),
  co2: v.object({
    sourceId: v.string(),
    status: Status,
    tables: v.array(
      v.object({
        cycle: v.picklist(['NEDC', 'WLTP']),
        firstRegistrationFrom: v.optional(IsoDate),
        firstRegistrationTo: v.optional(IsoDate),
        bands: v.pipe(v.array(Co2Band), v.minLength(1)),
      }),
    ),
    notProvenAdjustPct: Pct,
    combineWithEuro: v.picklist(['multiplicative', 'additive']),
    combineStatus: Status,
  }),
  euro: v.object({
    sourceId: v.string(),
    status: Status,
    plainEuro5: v.array(v.object({ firstRegistrationTo: v.nullable(IsoDate), treatAs: EuroClassSchema })),
    plainEuro5Status: Status,
    rules: v.array(
      v.object({
        id: v.string(),
        euroClasses: v.array(EuroClassSchema),
        firstRegistrationTo: v.optional(IsoDate),
        adjustPct: Pct,
        note: v.string(),
      }),
    ),
  }),
  exemptions: v.array(ExemptionSchema),
  environmentalFee: v.object({
    sourceId: v.string(),
    status: Status,
    rules: v.array(v.object({ euroClasses: v.array(EuroClassSchema), amountEur: v.number() })),
    historicExempt: v.boolean(),
  }),
  registrationBan: v.object({
    sourceId: v.string(),
    status: Status,
    euroClasses: v.array(EuroClassSchema),
    historicExempt: v.boolean(),
  }),
  historic: v.object({ status: Status, minAgeYears: v.number() }),
  newMeansOfTransport: v.object({
    sourceId: v.string(),
    status: Status,
    maxAgeMonths: v.number(),
    maxKm: v.number(),
    vatRatePct: Pct,
    vatBaseIncludesRegistrationTax: v.boolean(),
  }),
});

export const TaxRulesSchema = v.object({
  schemaVersion: v.literal(1),
  rulesId: v.literal('gr-registration-tax'),
  jurisdiction: v.literal('GR'),
  revision: v.string(),
  publishedAt: IsoDate,
  preparedBy: v.string(),
  versions: v.pipe(v.array(RulesVersionSchema), v.minLength(1)),
});

export type TaxRules = v.InferOutput<typeof TaxRulesSchema>;
export type TaxRulesVersion = v.InferOutput<typeof RulesVersionSchema>;
export type Exemption = v.InferOutput<typeof ExemptionSchema>;

export class RulesValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid tax rules file:\n${issues.join('\n')}`);
    this.name = 'RulesValidationError';
  }
}

/** Validate an unknown value as a rules document; throws RulesValidationError with readable paths. */
export function parseTaxRules(data: unknown): TaxRules {
  const res = v.safeParse(TaxRulesSchema, data);
  if (!res.success) {
    throw new RulesValidationError(res.issues.map((i) => `${v.getDotPath(i) ?? '(root)'}: ${i.message}`));
  }
  const rules = res.output;
  // Semantic checks the structural schema cannot express.
  const issues: string[] = [];
  const sorted = [...rules.versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  sorted.forEach((ver, i) => {
    const next = sorted[i + 1];
    if (ver.effectiveTo && ver.effectiveTo < ver.effectiveFrom) issues.push(`version ${ver.id}: effectiveTo before effectiveFrom`);
    if (next && (ver.effectiveTo === null || ver.effectiveTo >= next.effectiveFrom)) issues.push(`version ${ver.id} overlaps ${next.id}`);
    const ages = ver.taxableValue.depreciation.table.map((r) => r.ageYears);
    if (ages.some((a, j) => j > 0 && a <= ages[j - 1]!)) issues.push(`version ${ver.id}: depreciation ages must increase`);
    for (const cat of BODY_CATEGORIES) {
      const col = ver.taxableValue.depreciation.table.map((r) => r[cat]);
      if (col.some((p, j) => j > 0 && p < col[j - 1]!)) issues.push(`version ${ver.id}: depreciation for ${cat} must not decrease`);
    }
    const bands = ver.brackets.bands;
    if (bands[bands.length - 1]!.upToEur !== null) issues.push(`version ${ver.id}: last bracket must be open (upToEur: null)`);
    const ids = new Set(ver.sources.map((s) => s.id));
    const refs = [ver.taxableValue.sourceId, ver.taxableValue.depreciation.sourceId, ver.taxableValue.mileage.sourceId, ver.brackets.sourceId, ver.co2.sourceId, ver.euro.sourceId, ver.environmentalFee.sourceId, ver.registrationBan.sourceId, ver.newMeansOfTransport.sourceId, ...ver.exemptions.map((e) => e.sourceId)];
    for (const r of refs) if (!ids.has(r)) issues.push(`version ${ver.id}: unknown sourceId ${r}`);
  });
  if (issues.length) throw new RulesValidationError(issues);
  return rules;
}

/** Pick the rules version in force on the given date, or null if none covers it. */
export function selectRulesVersion(rules: TaxRules, dateIso: string): TaxRulesVersion | null {
  return rules.versions.find((ver) => ver.effectiveFrom <= dateIso && (ver.effectiveTo === null || dateIso <= ver.effectiveTo)) ?? null;
}
