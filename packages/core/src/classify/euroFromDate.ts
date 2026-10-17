/**
 * Euro class implied by the date of first registration (passenger cars, M1).
 * From these dates every NEW car registered in the EU must meet the class (all vehicles,
 * not only new types): Reg. 715/2007 and 692/2008 with their amendments.
 *
 * From 1/9/2015 every new car is Euro 6, and the Greek rules treat all Euro 6 variants
 * (6b, 6c, 6d-temp, 6d, 6e) the same, so the class can be filled in. Earlier, a car may
 * exceed the minimum (an early Euro 5b or 6), and that changes the surcharge and the
 * environmental fee, so only the minimum is shown. Cars sold under the end-of-series
 * derogation (up to 12 months after the date) are rare; the client can change the value.
 * VERIFY: dates of the all-registrations stage.
 */
import type { EuroClass } from '../types';

const MANDATORY: { from: string; euro: EuroClass }[] = [
  { from: '2015-09-01', euro: '6' },
  { from: '2013-01-01', euro: '5b' },
  { from: '2011-01-01', euro: '5a' },
  { from: '2006-01-01', euro: '4' },
  { from: '2001-01-01', euro: '3' },
  { from: '1997-01-01', euro: '2' },
  { from: '1993-01-01', euro: '1' },
];

export interface EuroFromDate {
  /** Lowest class a car first registered on this date must meet; null before 1993. */
  minimum: EuroClass | null;
  minimumFrom: string | null;
  /** The class to use when the listing shows none: only when the date decides it (Euro 6). */
  fill: EuroClass | null;
  /** Within 12 months of the Euro 6 date: an end-of-series Euro 5 car is possible. */
  endOfSeriesPossible: boolean;
}

export function euroFromFirstRegistration(firstRegistration: string | null): EuroFromDate {
  const stage = firstRegistration ? MANDATORY.find((m) => firstRegistration >= m.from) : undefined;
  if (!stage) return { minimum: null, minimumFrom: null, fill: null, endOfSeriesPossible: false };
  const euro6 = stage.euro === '6';
  return { minimum: stage.euro, minimumFrom: stage.from, fill: euro6 ? '6' : null, endOfSeriesPossible: euro6 && firstRegistration! < '2016-09-01' };
}
