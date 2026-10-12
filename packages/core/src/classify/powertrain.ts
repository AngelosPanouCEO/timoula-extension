/**
 * Powertrain suggestion from listing signals. Listings are unreliable here:
 * mild hybrids and even plug-ins are often listed as plain petrol (test pages
 * 03, 04, 06). We collect every signal, suggest the most specific one and ask
 * the client to confirm whenever anything points away from a plain ICE car.
 */
import type { Fuel, Powertrain } from '../types';
import { normName } from '../util/text';
import hintsJson from './mhev-hints.json';

export interface PowertrainSignal {
  kind: 'fuel' | 'title' | 'battery' | 'site-flag' | 'model-hint';
  powertrain: Powertrain;
  /** Text that triggered the signal (for display). */
  evidence: string;
}

export interface PowertrainSuggestion {
  suggested: Powertrain | null;
  signals: PowertrainSignal[];
  /** The client must confirm before the tax is final. */
  needsConfirmation: boolean;
}

export interface PowertrainInput {
  fuel: Fuel | null;
  fuelRaw: string | null;
  make: string | null;
  model: string | null;
  version: string | null;
  title: string | null;
  batteryKwh: number | null;
  /** Site-provided flag (e.g. AutoScout24 vehicleType). Known to be unreliable. */
  siteFlag: string | null;
  firstRegistrationYear: number | null;
}

const PATTERNS: { re: RegExp; p: Powertrain }[] = [
  { re: /\b(PLUG[- ]?IN|PHEV|E-?HYBRID|HYBRID4|4XE|RECHARGE|GTE|TFSI ?E|TSI ?IV|XDRIVE\d{2}E|\d{3}X?E\b|\b[A-Z]{0,3} ?\d{3} ?D?E\b)/, p: 'PHEV' },
  { re: /\b(MILD[- ]?HYBRID|MHEV|48 ?V|E-?BOXER|EQ ?BOOST|SHVS|ECOBOOST HYBRID|SMART ?HYBRID)\b/, p: 'MHEV' },
  { re: /\b(HYBRID|HEV|HYBRIDE|HYBRYDA|IBRIDA|HIBRIDO|E:HEV|FULL HYBRID|SELF-CHARGING)\b/, p: 'HEV' },
];

const PRIORITY: Powertrain[] = ['BEV', 'FCEV', 'PHEV', 'MHEV', 'HEV', 'ICE'];

interface MhevHint {
  make: string;
  modelPattern: string;
  fromYear: number;
  note: string;
}

export function suggestPowertrain(i: PowertrainInput): PowertrainSuggestion {
  const signals: PowertrainSignal[] = [];
  if (i.fuel === 'electric') signals.push({ kind: 'fuel', powertrain: 'BEV', evidence: i.fuelRaw ?? 'electric' });
  if (i.fuel === 'hydrogen') signals.push({ kind: 'fuel', powertrain: 'FCEV', evidence: i.fuelRaw ?? 'hydrogen' });
  if (i.fuel === 'petrol_electric' || i.fuel === 'diesel_electric') signals.push({ kind: 'fuel', powertrain: 'HEV', evidence: i.fuelRaw ?? i.fuel });

  const text = normName([i.model, i.version, i.title].filter(Boolean).join(' | '));
  for (const { re, p } of PATTERNS) {
    // Model codes like "230 E" meant fuel injection long before plug-in hybrids existed.
    if (p === 'PHEV' && i.firstRegistrationYear !== null && i.firstRegistrationYear < 2013) continue;
    const m = re.exec(text);
    if (m) signals.push({ kind: 'title', powertrain: p, evidence: m[0].trim() });
  }
  // "Hybrid" inside "Mild-Hybrid"/"Plug-in Hybrid" must not count as a full hybrid on its own.
  const specific = signals.some((s) => s.kind === 'title' && (s.powertrain === 'MHEV' || s.powertrain === 'PHEV'));
  const filtered = specific ? signals.filter((s) => !(s.kind === 'title' && s.powertrain === 'HEV')) : signals;

  if (i.batteryKwh !== null && i.batteryKwh >= 4 && i.fuel !== 'electric') {
    filtered.push({ kind: 'battery', powertrain: 'PHEV', evidence: `${i.batteryKwh} kWh` });
  }
  const flag = normName(i.siteFlag);
  if (flag === 'PHEV' || flag === 'HEV' || flag === 'MHEV' || flag === 'EV' || flag === 'BEV') {
    filtered.push({ kind: 'site-flag', powertrain: flag === 'EV' ? 'BEV' : (flag as Powertrain), evidence: i.siteFlag ?? '' });
  }
  const make = normName(i.make);
  for (const h of hintsJson.hints as MhevHint[]) {
    if (normName(h.make) !== make) continue;
    if (!new RegExp(h.modelPattern, 'i').test(`${i.model ?? ''} ${i.version ?? ''} ${i.title ?? ''}`)) continue;
    if (i.firstRegistrationYear !== null && i.firstRegistrationYear < h.fromYear) continue;
    filtered.push({ kind: 'model-hint', powertrain: 'MHEV', evidence: h.note });
  }

  // The site flag and model hints never decide on their own; they only trigger confirmation.
  const deciding = filtered.filter((s) => s.kind !== 'site-flag' && s.kind !== 'model-hint');
  let suggested: Powertrain | null = null;
  for (const p of PRIORITY) {
    if (deciding.some((s) => s.powertrain === p)) {
      suggested = p;
      break;
    }
  }
  if (!suggested && i.fuel && i.fuel !== 'other') suggested = 'ICE';
  const distinct = new Set(filtered.map((s) => s.powertrain));
  const needsConfirmation =
    suggested === null || filtered.some((s) => s.powertrain !== 'ICE' && s.powertrain !== 'BEV') || distinct.size > 1 || (suggested === 'HEV' && filtered.some((s) => s.kind === 'fuel'));
  return { suggested, signals: filtered, needsConfirmation };
}
