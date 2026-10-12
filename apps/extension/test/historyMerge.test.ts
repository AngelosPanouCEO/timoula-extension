import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../src/shared/db';
import { entrySignature, mergeListingEntries } from '../src/shared/historyMerge';

const entry = (id: string, createdAt: string, updatedAt: string, prices: [string, number][], notes = ''): HistoryEntry =>
  ({
    id,
    listingKey: 'autoscout24:x',
    createdAt,
    updatedAt,
    notes,
    priceHistory: prices.map(([at, priceCents]) => ({ at, priceCents })),
    inputs: { priceCents: prices[prices.length - 1]![1] },
    meta: {},
    market: null,
    status: 'complete',
    countryCode: 'DE',
  }) as unknown as HistoryEntry;

describe('history: one entry per listing', () => {
  it('keeps the latest entry, the earliest creation date, all price changes and notes', () => {
    const a = entry('a', '2026-10-01T10:00:00Z', '2026-10-01T10:05:00Z', [['2026-10-01T10:00:00Z', 2_000_000]], 'καλό');
    const b = entry('b', '2026-10-03T10:00:00Z', '2026-10-03T10:01:00Z', [['2026-10-03T10:00:00Z', 2_000_000]]);
    const c = entry('c', '2026-10-05T10:00:00Z', '2026-10-05T10:02:00Z', [['2026-10-05T10:00:00Z', 1_900_000]], 'έπεσε η τιμή');
    const { keep, remove } = mergeListingEntries([a, b, c]);
    expect(keep.id).toBe('c');
    expect(remove.sort()).toEqual(['a', 'b']);
    expect(keep.createdAt).toBe('2026-10-01T10:00:00Z');
    expect(keep.priceHistory.map((p) => p.priceCents)).toEqual([2_000_000, 1_900_000]);
    expect(keep.notes).toBe('έπεσε η τιμή\n\nκαλό');
  });

  it('a single entry is left alone', () => {
    const a = entry('a', '2026-10-01T10:00:00Z', '2026-10-01T10:05:00Z', [['2026-10-01T10:00:00Z', 1]]);
    expect(mergeListingEntries([a])).toEqual({ keep: a, remove: [] });
  });

  it('signature ignores timestamps', () => {
    const a = entry('a', '2026-10-01T10:00:00Z', '2026-10-01T10:05:00Z', [['x', 1]]);
    expect(entrySignature(a)).toBe(entrySignature({ ...a, updatedAt: '2030-01-01T00:00:00Z' }));
  });
});
