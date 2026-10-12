import { isEuCountry, normalizeCountry } from '../config/eu';

export type Eligibility = { status: 'eu'; country: string } | { status: 'non-eu'; country: string } | { status: 'unknown' };

/** EU-only rule: listings located outside the EU are never calculated. */
export function checkEligibility(countryCode: string | null | undefined): Eligibility {
  const c = normalizeCountry(countryCode);
  if (!c) return { status: 'unknown' };
  return isEuCountry(c) ? { status: 'eu', country: c } : { status: 'non-eu', country: c };
}
