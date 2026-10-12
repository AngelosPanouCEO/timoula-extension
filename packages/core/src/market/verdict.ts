import type { Range } from '../util/money';

export type VerdictLevel = 'good' | 'marginal' | 'bad';

export interface Verdict {
  /** Greek market value − total import cost. low uses the high cost, high uses the low cost. */
  saving: Range;
  level: VerdictLevel;
}

/**
 * good: even the worst case (highest cost) saves at least the threshold;
 * bad: even the best case (lowest cost) loses money; marginal: in between.
 */
export function verdict(marketValueCents: number, totalCost: Range, thresholdCents = 0): Verdict {
  const saving = { lowCents: marketValueCents - totalCost.highCents, highCents: marketValueCents - totalCost.lowCents };
  const level: VerdictLevel = saving.lowCents >= thresholdCents ? 'good' : saving.highCents < 0 ? 'bad' : 'marginal';
  return { saving, level };
}
