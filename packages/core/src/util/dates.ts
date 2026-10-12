/** Date helpers working on ISO calendar dates (YYYY-MM-DD), timezone-free. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

export function parseIso(s: string): { y: number; m: number; d: number } {
  const m = ISO_DATE.exec(s);
  if (!m) throw new Error(`Invalid ISO date: ${s}`);
  return { y: +m[1]!, m: +m[2]!, d: +m[3]! };
}

export function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Last day of the given month, as ISO. */
export function endOfMonthIso(y: number, m: number): string {
  return toIso(y, m, daysInMonth(y, m));
}

export function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = parseIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Today's date in the given IANA zone (defaults to Athens), as ISO. */
export function todayIso(now: Date = new Date(), timeZone = 'Europe/Athens'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Age in fractional months between two ISO dates (from <= to).
 * Whole months are counted calendar-wise; the remainder is the fraction of the next month.
 */
export function monthsBetween(fromIso: string, toIsoDate: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIsoDate);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  let dayDiff = b.d - a.d;
  if (dayDiff < 0) {
    months -= 1;
    // days from the anniversary in the previous month to b
    const prevM = b.m === 1 ? 12 : b.m - 1;
    const prevY = b.m === 1 ? b.y - 1 : b.y;
    const anchorDay = Math.min(a.d, daysInMonth(prevY, prevM));
    dayDiff = daysInMonth(prevY, prevM) - anchorDay + b.d;
    return months + dayDiff / daysInMonth(prevY, prevM);
  }
  return months + dayDiff / daysInMonth(b.y, b.m);
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive range check; null bounds are open. */
export function inRange(date: string, from: string | null | undefined, to: string | null | undefined): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
