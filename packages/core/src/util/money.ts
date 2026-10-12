/** Money helpers. Amounts are integer euro cents. */

export const eurToCents = (eur: number): number => Math.round(eur * 100);
export const centsToEur = (cents: number): number => cents / 100;

/** Round a (possibly fractional) cent amount to a whole cent, half away from zero. */
export const roundCents = (cents: number): number => (cents < 0 ? -Math.round(-cents) : Math.round(cents));

export interface Range {
  lowCents: number;
  highCents: number;
}

export const range = (lowCents: number, highCents: number = lowCents): Range => ({
  lowCents: Math.min(lowCents, highCents),
  highCents: Math.max(lowCents, highCents),
});

export const addRanges = (...rs: Range[]): Range =>
  rs.reduce((acc, r) => ({ lowCents: acc.lowCents + r.lowCents, highCents: acc.highCents + r.highCents }), range(0));
