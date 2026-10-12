/**
 * One history entry per listing. Older versions of the extension created a new
 * entry every time the popup was opened; this merges such duplicates.
 */
import type { HistoryEntry } from './db';

/** Keep the most recently updated entry; merge price observations and notes from the others. */
export function mergeListingEntries(entries: HistoryEntry[]): { keep: HistoryEntry; remove: string[] } {
  const sorted = [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const keep = sorted[0]!;
  if (sorted.length === 1) return { keep, remove: [] };
  const earliest = sorted.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), keep.createdAt);
  const prices = sorted
    .flatMap((e) => e.priceHistory)
    .sort((a, b) => a.at.localeCompare(b.at))
    .filter((p, i, arr) => i === 0 || p.priceCents !== arr[i - 1]!.priceCents);
  const notes = [...new Set(sorted.map((e) => e.notes.trim()).filter(Boolean))].join('\n\n');
  return {
    keep: { ...keep, createdAt: earliest, priceHistory: prices, notes },
    remove: sorted.slice(1).map((e) => e.id),
  };
}

/** Fields that matter for "did anything change?" (ignores timestamps). */
export function entrySignature(e: HistoryEntry): string {
  return JSON.stringify([e.inputs, e.meta, e.market?.comparables ?? null, e.notes, e.priceHistory, e.status, e.countryCode]);
}
