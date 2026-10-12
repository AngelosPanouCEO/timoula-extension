/** Robust summary of comparable prices (EUR cents). */
export interface PriceStats {
  count: number;
  medianCents: number;
  minCents: number;
  maxCents: number;
  p25Cents: number;
  p75Cents: number;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo));
}

export function priceStats(pricesCents: number[]): PriceStats | null {
  const xs = pricesCents.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  return {
    count: xs.length,
    medianCents: quantile(xs, 0.5),
    minCents: xs[0]!,
    maxCents: xs[xs.length - 1]!,
    p25Cents: quantile(xs, 0.25),
    p75Cents: quantile(xs, 0.75),
  };
}
