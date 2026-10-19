/** EEA CO2 table shipped with this build, loaded on demand (separate chunk, 1.6 MB). */
import type { EeaCo2Table } from './eea';

let cached: Promise<EeaCo2Table> | null = null;

export function loadEeaCo2Table(): Promise<EeaCo2Table> {
  cached ??= import('../../co2/eea-co2.json').then((m) => (m.default ?? m) as unknown as EeaCo2Table);
  return cached;
}
