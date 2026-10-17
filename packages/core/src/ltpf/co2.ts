/**
 * CO2 for a car whose listing shows none, taken from the chosen price-list version.
 * Many lists print no CO2 (Audi 2005–2011, 2019–2020, 2024+). Then the same version
 * (model, version text, gearbox, power) in the nearest list that prints it is used,
 * at most four years away. Only values of the cycle customs applies to the car are used:
 * NEDC for a first registration up to 31/12/2020, WLTP after.
 */
import { compact, normName } from '../util/text';
import type { LtpfRecord } from './schema';

export interface Co2FromPriceList {
  co2GKm: number;
  /** Record the value comes from: the chosen one, or the same version in another list. */
  record: LtpfRecord;
  sameRecord: boolean;
}

const MAX_DISTANCE_DAYS = 4 * 366;

function cycleFits(r: LtpfRecord, firstRegistration: string | null): boolean {
  if (!r.co2_cycle || !firstRegistration) return true;
  return r.co2_cycle === (firstRegistration <= '2020-12-31' ? 'NEDC' : 'WLTP');
}

const days = (iso: string) => Date.parse(iso + 'T00:00:00Z') / 86_400_000;

function sameVersion(a: LtpfRecord, b: LtpfRecord): boolean {
  if (normName(a.brand) !== normName(b.brand) || compact(a.model) !== compact(b.model) || compact(a.version) !== compact(b.version)) return false;
  if ((a.transmission ?? '') !== (b.transmission ?? '')) return false;
  if (a.power_ps !== null && b.power_ps !== null) return a.power_ps === b.power_ps;
  if (a.power_kw !== null && b.power_kw !== null) return a.power_kw === b.power_kw;
  return false;
}

export function co2FromPriceList(records: readonly LtpfRecord[], chosen: LtpfRecord, firstRegistration: string | null): Co2FromPriceList | null {
  if (chosen.co2_g_km !== null) return cycleFits(chosen, firstRegistration) ? { co2GKm: chosen.co2_g_km, record: chosen, sameRecord: true } : null;
  let best: { r: LtpfRecord; d: number } | null = null;
  for (const r of records) {
    if (r === chosen || r.co2_g_km === null || !cycleFits(r, firstRegistration) || !sameVersion(r, chosen)) continue;
    const d = Math.abs(days(r.valid_from) - days(chosen.valid_from));
    if (d <= MAX_DISTANCE_DAYS && (!best || d < best.d)) best = { r, d };
  }
  return best ? { co2GKm: best.r.co2_g_km!, record: best.r, sameRecord: false } : null;
}
