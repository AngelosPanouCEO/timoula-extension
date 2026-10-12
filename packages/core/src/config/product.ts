/**
 * Product identity. Rename the product here and nowhere else: the manifest,
 * page titles, CSV/export file names and UI strings all read from this file.
 */
export const PRODUCT = {
  /** Display name shown to clients. */
  name: 'ΤΙΜΟΥΛΑ',
  /** Latin-only name for file names, storage keys and the Web Store. */
  slug: 'timoula',
  /** Short description used in the manifest. */
  description: {
    el: 'Υπολογισμός κόστους εισαγωγής μεταχειρισμένου αυτοκινήτου από την ΕΕ στην Ελλάδα.',
    en: 'Import-cost calculator for used cars bought in the EU and registered in Greece.',
  },
} as const;

export type Lang = 'el' | 'en';
