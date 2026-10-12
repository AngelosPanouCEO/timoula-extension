/**
 * EU member states (ISO 3166-1 alpha-2). Only listings located in one of these
 * countries are calculated. Edit this list if membership changes.
 * Note: Greece uses "GR" in ISO but "EL" in some EU systems; both are accepted.
 */
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
] as const;

export type EuCountry = (typeof EU_COUNTRIES)[number];

const ALIASES: Record<string, string> = {
  EL: 'GR',
  // Licence-plate style codes some sites use instead of ISO codes.
  D: 'DE',
  A: 'AT',
  B: 'BE',
  F: 'FR',
  I: 'IT',
  L: 'LU',
  E: 'ES',
  P: 'PT',
  UK: 'GB',
};

/** Normalise a country code (ISO alpha-2 or plate code) to ISO alpha-2 upper case. */
export function normalizeCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!c) return null;
  return ALIASES[c] ?? (c.length === 2 ? c : null);
}

export function isEuCountry(code: string | null | undefined): boolean {
  const c = normalizeCountry(code);
  return c !== null && (EU_COUNTRIES as readonly string[]).includes(c);
}

/** Country names for the UI (EU members plus the non-EU countries we commonly see). */
export const COUNTRY_NAMES: Record<string, { el: string; en: string }> = {
  AT: { el: 'Αυστρία', en: 'Austria' },
  BE: { el: 'Βέλγιο', en: 'Belgium' },
  BG: { el: 'Βουλγαρία', en: 'Bulgaria' },
  CY: { el: 'Κύπρος', en: 'Cyprus' },
  CZ: { el: 'Τσεχία', en: 'Czechia' },
  DE: { el: 'Γερμανία', en: 'Germany' },
  DK: { el: 'Δανία', en: 'Denmark' },
  EE: { el: 'Εσθονία', en: 'Estonia' },
  ES: { el: 'Ισπανία', en: 'Spain' },
  FI: { el: 'Φινλανδία', en: 'Finland' },
  FR: { el: 'Γαλλία', en: 'France' },
  GR: { el: 'Ελλάδα', en: 'Greece' },
  HR: { el: 'Κροατία', en: 'Croatia' },
  HU: { el: 'Ουγγαρία', en: 'Hungary' },
  IE: { el: 'Ιρλανδία', en: 'Ireland' },
  IT: { el: 'Ιταλία', en: 'Italy' },
  LT: { el: 'Λιθουανία', en: 'Lithuania' },
  LU: { el: 'Λουξεμβούργο', en: 'Luxembourg' },
  LV: { el: 'Λετονία', en: 'Latvia' },
  MT: { el: 'Μάλτα', en: 'Malta' },
  NL: { el: 'Ολλανδία', en: 'Netherlands' },
  PL: { el: 'Πολωνία', en: 'Poland' },
  PT: { el: 'Πορτογαλία', en: 'Portugal' },
  RO: { el: 'Ρουμανία', en: 'Romania' },
  SE: { el: 'Σουηδία', en: 'Sweden' },
  SI: { el: 'Σλοβενία', en: 'Slovenia' },
  SK: { el: 'Σλοβακία', en: 'Slovakia' },
  CH: { el: 'Ελβετία', en: 'Switzerland' },
  GB: { el: 'Ηνωμένο Βασίλειο', en: 'United Kingdom' },
  NO: { el: 'Νορβηγία', en: 'Norway' },
  LI: { el: 'Λιχτενστάιν', en: 'Liechtenstein' },
  IS: { el: 'Ισλανδία', en: 'Iceland' },
  TR: { el: 'Τουρκία', en: 'Turkey' },
  RS: { el: 'Σερβία', en: 'Serbia' },
  UA: { el: 'Ουκρανία', en: 'Ukraine' },
};
