import type { Lang } from '@timoula/core';

const locale = (lang: Lang) => (lang === 'el' ? 'el-GR' : 'en-IE');

export function money(lang: Lang, cents: number | null | undefined, fractionDigits = 0): string {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'EUR', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(cents / 100);
}

export function moneyRange(lang: Lang, low: number, high: number): string {
  return low === high ? money(lang, low) : `${money(lang, low)} – ${money(lang, high)}`;
}

export function num(lang: Lang, n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function pct(lang: Lang, n: number, digits = 2): string {
  return `${num(lang, n, digits)}%`;
}

export function date(lang: Lang, iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00Z') : new Date(iso);
  return new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Athens' }).format(d);
}

export function dateTime(lang: Lang, iso: string): string {
  return new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' }).format(new Date(iso));
}

/** Parse a user-typed euro amount ("12.345,67", "12345.67", "12 345") to cents; null if empty/invalid. */
export function parseEuroInput(text: string): number | null {
  const t = text.trim().replace(/[€\s ]/g, '');
  if (!t) return null;
  let normalised = t;
  if (/,\d{1,2}$/.test(t)) normalised = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,2}$/.test(t) && (t.match(/\./g) ?? []).length === 1) normalised = t.replace(/,/g, '');
  else normalised = t.replace(/[.,]/g, '');
  const n = Number(normalised);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/**
 * Split a pasted list of prices: one per line, or separated by ";", tabs or commas.
 * Greek format uses "." for thousands and "," for decimals, so a comma followed by
 * 3+ digits separates two prices while ",50" stays a decimal.
 */
export function parsePriceList(text: string): number[] {
  return text
    .split(/[\n;\t]+|,(?=\s*\d{3,})/)
    .map((s) => parseEuroInput(s))
    .filter((x): x is number => x !== null && x >= 50_000);
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
