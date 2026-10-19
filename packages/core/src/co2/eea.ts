/**
 * CO2 estimate from the EEA monitoring data of new cars registered in the EU (2010–2022),
 * for cars whose listing and price list show none. Built by co2/tools/eea_build.py.
 *
 * Levels, tried in order until at least MIN_CARS cars match:
 *   model  – same make, model, fuel, engine (cc ±25, kW ±3) and years around the registration
 *   model-near – same make, model, fuel and cc, kW ±8% (power updates, e.g. R8 4.2 309 → 316 kW)
 *   make   – same make, fuel and engine, any model
 *   engine – same fuel and engine, any make
 *   power  – same fuel and kW ±5%, any engine size
 * Values are registration-weighted means, in the cycle customs applies (NEDC up to 31/12/2020,
 * WLTP after). Always an estimate: customs uses the certificate of conformity.
 */
import type { Fuel, Powertrain } from '../types';
import { normName } from '../util/text';

export interface EeaCo2Table {
  source: string;
  makes: string[];
  models: string[];
  fuels: string[];
  /** [make, model, fuel, cc, kw, year_from (2-year bucket), nedc, wltp, cars] */
  rows: [number, number, number, number, number, number, number | null, number | null, number][];
}

export interface EeaCo2Query {
  make: string | null;
  model: string | null;
  fuel: Fuel | null;
  powertrain: Powertrain | null;
  displacementCc: number | null;
  powerKw: number | null;
  firstRegistration: string | null;
}

export type EeaCo2Level = 'model' | 'model-near' | 'make' | 'engine' | 'power';

export interface EeaCo2Estimate {
  co2GKm: number;
  cycle: 'NEDC' | 'WLTP';
  level: EeaCo2Level;
  cars: number;
}

const MIN_CARS = 30;
const MAKE_ALIASES: Record<string, string> = { VW: 'VOLKSWAGEN', MERCEDES: 'MERCEDES-BENZ', 'MERCEDES BENZ': 'MERCEDES-BENZ', SKODA: 'SKODA', ŠKODA: 'SKODA', CITROËN: 'CITROEN' };

const words = (s: string | null) =>
  normName(s)
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean);

/** First word of the model name, as eea_build.py stores it ("A6 Allroad" → "A6", "C 200" → "C"). */
export function eeaModelToken(make: string, model: string | null): string {
  const w = words(model);
  for (const m of words(make)) if (w[0] === m) w.shift();
  return w[0] ?? '';
}

/** "320" matches "320D"/"320I", "A6" matches "A6"; "C" does not match "CLA". */
function tokenMatches(table: string, listing: string): boolean {
  if (!table || !listing) return false;
  if (table === listing) return true;
  const [short, long] = table.length < listing.length ? [table, listing] : [listing, table];
  return /\d/.test(short) && long.startsWith(short) && /^[A-Z]{1,3}$/.test(long.slice(short.length));
}

function fuelCodes(q: EeaCo2Query): string[] {
  const f = q.fuel;
  const base = f === 'diesel' || f === 'diesel_electric' ? 'diesel' : f === 'petrol' || f === 'petrol_electric' ? 'petrol' : f;
  switch (q.powertrain) {
    case 'PHEV':
    case 'HEV':
      return [`${base}_electric`];
    case 'MHEV':
      return [base ?? 'petrol', `${base ?? 'petrol'}_electric`]; // listed either way
    default:
      if (f === 'petrol_electric' || f === 'diesel_electric') return [f];
      return f ? [f] : [];
  }
}

export function estimateCo2FromEea(table: EeaCo2Table, q: EeaCo2Query): EeaCo2Estimate | null {
  if (!q.firstRegistration) return null;
  if (q.powertrain === 'BEV' || q.powertrain === 'FCEV' || q.fuel === 'electric' || q.fuel === 'hydrogen') return null; // zero, handled by the tax rules
  if (q.displacementCc === null && q.powerKw === null) return null;
  const cycle: 'NEDC' | 'WLTP' = q.firstRegistration <= '2020-12-31' ? 'NEDC' : 'WLTP';
  const year = Number(q.firstRegistration.slice(0, 4));
  const fuels = new Set(fuelCodes(q).map((f) => table.fuels.indexOf(f)).filter((i) => i >= 0));
  if (!fuels.size) return null;
  const makeName = q.make ? (MAKE_ALIASES[normName(q.make)] ?? normName(q.make)) : null;
  const makeIdx = makeName ? table.makes.indexOf(makeName) : -1;
  const token = makeName ? eeaModelToken(makeName, q.model) : '';
  const plugIn = q.powertrain === 'PHEV';
  const col = cycle === 'NEDC' ? 6 : 7;

  const engineOk = (cc: number, kw: number) =>
    (q.displacementCc === null || Math.abs(cc - q.displacementCc) <= 25) && (q.powerKw === null || Math.abs(kw - q.powerKw) <= 3);
  const powerOk = (kw: number) => q.powerKw !== null && Math.abs(kw - q.powerKw) <= Math.max(3, q.powerKw * 0.05);
  const nearOk = (cc: number, kw: number) =>
    (q.displacementCc === null || Math.abs(cc - q.displacementCc) <= 25) && (q.powerKw === null || Math.abs(kw - q.powerKw) <= Math.max(3, q.powerKw * 0.08));

  const levels: { level: EeaCo2Level; ok: (r: EeaCo2Table['rows'][number]) => boolean }[] = [
    { level: 'model', ok: (r) => r[0] === makeIdx && tokenMatches(table.models[r[1]]!, token) && engineOk(r[3], r[4]) },
    { level: 'model-near', ok: (r) => r[0] === makeIdx && tokenMatches(table.models[r[1]]!, token) && nearOk(r[3], r[4]) },
    { level: 'make', ok: (r) => r[0] === makeIdx && engineOk(r[3], r[4]) },
    { level: 'engine', ok: (r) => q.displacementCc !== null && engineOk(r[3], r[4]) },
    { level: 'power', ok: (r) => powerOk(r[4]) },
  ];
  for (const { level, ok } of levels) {
    if (level !== 'engine' && level !== 'power' && makeIdx < 0) continue;
    const rows = table.rows.filter((r) => fuels.has(r[2]) && r[col] !== null && (!plugIn || r[col]! <= 90) && (plugIn || r[col]! > 60) && ok(r));
    if (!rows.length) continue;
    // Closest years first: widen the window until enough cars.
    for (const span of [1, 3, 6]) {
      const near = rows.filter((r) => Math.abs(r[5] + 0.5 - year) <= span);
      const cars = near.reduce((s, r) => s + r[8], 0);
      if (cars >= MIN_CARS) {
        const co2 = near.reduce((s, r) => s + r[col]! * r[8], 0) / cars;
        return { co2GKm: Math.round(co2), cycle, level, cars };
      }
    }
  }
  return null;
}
