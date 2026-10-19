/** German base prices (ADAC) shipped with this build, loaded on demand (separate chunk). */
import type { DePriceTable } from './dePrice';

let cached: Promise<DePriceTable> | null = null;

export function loadDePriceTable(): Promise<DePriceTable> {
  cached ??= import('../../ltpf/de-prices.json').then((m) => (m.default ?? m) as unknown as DePriceTable);
  return cached;
}
