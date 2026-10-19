/**
 * ΛΤΠΦ when the Greek price lists have no exact match, so the calculation never stops.
 * Every fallback is a NEW-car price (never derived from the used listing price, which gave extreme
 * values for cars that keep their value, e.g. a Porsche 911 at 240.000 €). Order:
 *   exact (Greek list) → γ same version, other period → ε German price of the same version
 *   (ADAC, without VAT) → β Greek sister version → ε closest German version of the same model
 *   (power ±25%) → median German price of similar power (same make, else all makes).
 * β is moved to the end when the sister version's power is far from the car's (> 15%).
 */
import { normName } from '../util/text';
import { checkRecord, lookupLtpf, versionScore, type LtpfCandidate, type LtpfLookupResult, type LtpfQuery, type Synonyms, DEFAULT_SYNONYMS } from './lookup';
import type { LtpfRecord } from './schema';

const kwOf = (r: LtpfRecord) => r.power_kw ?? (r.power_ps !== null ? r.power_ps / 1.36 : null);

/** Greek lookup, then German new-car prices where the Greek lists fall short. */
export function lookupLtpfWithEstimates(
  records: LtpfRecord[],
  q: LtpfQuery,
  extra: { foreign?: LtpfRecord[]; market?: LtpfRecord | null },
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
  const awdWanted = /\b(4M|4MATIC|QUATTRO|XDRIVE|4MOTION|ALLRAD|AWD|4X4|4WD|ALL4|Q4)\b/.test(normName(q.versionText));
  const de = (extra.foreign ?? [])
    .map((r) => toCandidate(r, 'epsilon'))
    .filter((c) => c.checks.gearbox !== 'mismatch' && c.checks.fuel !== 'mismatch')
    // Gearbox and drive outrank the name: ADAC says "Steptronic"/"4MATIC", listings "Automatik"/"4M".
    .sort(
      (a, b) =>
        Number(b.checks.gearbox === 'match') - Number(a.checks.gearbox === 'match') ||
        Number((b.record.drive === 'AWD') === awdWanted) - Number((a.record.drive === 'AWD') === awdWanted) ||
        b.versionScore - a.versionScore ||
        a.record.ltpf_eur - b.record.ltpf_eur,
    );
  const market = extra.market ? toCandidate(extra.market, 'market') : null;
  const deSame = de.filter((c) => c.record.confidence !== 'low');
  const deNear = de.filter((c) => c.record.confidence === 'low');
  const beta = gr.criterion === 'beta' ? gr.candidates : [];
  const qkw = q.powerKw ?? (q.powerHp !== null ? q.powerHp / 1.36 : null);
  const betaFar = beta.length > 0 && qkw !== null && beta.every((c) => {
    const k = kwOf(c.record);
    return k !== null && Math.abs(k - qkw) / qkw > 0.15;
  });

  const ordered: LtpfCandidate[] = [...deSame, ...(betaFar ? [] : beta), ...deNear, ...(market ? [market] : []), ...(betaFar ? beta : [])];
  if (!ordered.length) return gr;
  const first = ordered[0]!;
  const sameKind = ordered.filter((c) => c.criterion === first.criterion);
  const fullVersion = sameKind.filter((c) => c.versionScore === 1);
  const selected = sameKind.length === 1 || (fullVersion.length === 1 && fullVersion[0] === first) ? first : null;
  return { ...gr, status: selected ? 'single' : 'choose', criterion: first.criterion, candidates: ordered, selected, reason: undefined };
}
