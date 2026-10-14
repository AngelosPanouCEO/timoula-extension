/**
 * Map a site's body type text to the customs depreciation categories.
 * German "Limousine" covers both saloons and hatchbacks, and "Kombi" (estate)
 * has no customs category, so those need the client's choice.
 * Customs decides from the type-approval body code, not from the listing: sites call
 * many crossovers "SUV" that are approved as MPV (real clearance: Hyundai Kona, code AF → mpv).
 * Only an off-road vehicle (category M1G) is suv_atv, so "SUV" is a suggestion to confirm.
 */
import type { BodyCategory } from '../types';
import { normName } from '../util/text';

export interface BodyCategorySuggestion {
  category: BodyCategory | null;
  /** false → show the suggestion but ask the client to confirm. */
  confident: boolean;
}

const RULES: { re: RegExp; cat: BodyCategory | null; confident: boolean }[] = [
  { re: /SUV|GELANDEWAGEN|OFF-?ROAD|PICKUP|PICK-UP|TERENOW|4X4|FUORISTRADA|TODOTERRENO/, cat: 'suv_atv', confident: false },
  { re: /CABRIO|CONVERTIBLE|KABRIOLET|DESCAPOTABLE/, cat: 'cabrio', confident: true },
  { re: /ROADSTER|COUPE|SPORTWAGEN|SPORTS ?CAR|KUPE/, cat: 'coupe_roadster', confident: true },
  { re: /VAN|MINIBUS|KLEINBUS|MPV|MINIVAN|MONOVOLUME|MONOVOLUMEN|BUS\b/, cat: 'mpv', confident: true },
  { re: /KLEINWAGEN|SMALL ?CAR|HATCHBACK|SCHRAGHECK|COMPACT|KOMPAKT|CITY ?CAR|CITADINE|UTILITARIA|MALY/, cat: 'hatchback', confident: true },
  { re: /^SEDAN$|SALOON|BERLINE|BERLINA/, cat: 'sedan', confident: true },
  { re: /LIMOUSINE|SEDAN/, cat: 'sedan', confident: false },
  { re: /KOMBI|ESTATE|STATION|WAGON|TOURING|BREAK|VARIANT|AVANT|COMBI|SW\b/, cat: null, confident: false },
];

export function suggestBodyCategory(raw: string | null | undefined): BodyCategorySuggestion {
  const n = normName(raw);
  if (!n) return { category: null, confident: false };
  // schema.org values from JSON-LD
  const schema: Record<string, BodyCategorySuggestion> = {
    ESTATECAR: { category: null, confident: false },
    OFFROAD: { category: 'suv_atv', confident: false },
  };
  if (schema[n.replace(/\s/g, '')]) return schema[n.replace(/\s/g, '')]!;
  for (const r of RULES) if (r.re.test(n)) return { category: r.cat, confident: r.confident };
  return { category: null, confident: false };
}
