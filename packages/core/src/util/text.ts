/** Text normalisation used for fuzzy-but-deterministic name matching. */

/** Upper-case, strip diacritics, collapse whitespace. */
export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alphanumeric tokens (keeps '+' as part of a token, e.g. TREND+). */
export function tokens(s: string | null | undefined): string[] {
  return normName(s)
    .split(/[^A-Z0-9+]+/)
    .filter(Boolean);
}

/** Compact form: letters and digits only. */
export function compact(s: string | null | undefined): string {
  return normName(s).replace(/[^A-Z0-9+]/g, '');
}
