/**
 * Client-editable cost settings with their defaults. Amounts in EUR cents.
 * Values marked VERIFY are drafts to be replaced with real quotes.
 */
import type { PriceBasis } from '../types';
import type { Range } from '../util/money';

export interface CostSettings {
  /** How the listed price is interpreted. Only 'gross' is implemented in phase 1. */
  priceBasis: PriceBasis;
  /** Expected registration in Greece = today + N days. */
  expectedRegistrationOffsetDays: number;
  trailer: Range;
  customsBrokerAndPlates: Range;
  exportPlatesAndInsurance: Range;
  /** Fuel, tolls, vignettes and ferry when driving back, by origin country. */
  driveBackByCountry: Record<string, Range>;
  driveBackDefault: Range;
  /** A saving below this is shown as "marginal" (amber), cents. */
  worthItThresholdCents: number;
}

const r = (lowEur: number, highEur: number = lowEur): Range => ({ lowCents: lowEur * 100, highCents: highEur * 100 });

/** Draft drive-back estimates (VERIFY): fuel ~7 l/100 km at ~1.8 €/l, tolls/vignettes, Italy–Greece ferry where shorter. */
export const DEFAULT_DRIVE_BACK: Record<string, Range> = {
  IT: r(350, 700),
  SI: r(450, 800),
  HR: r(400, 750),
  AT: r(500, 950),
  DE: r(600, 1100),
  CZ: r(550, 950),
  SK: r(500, 900),
  HU: r(400, 750),
  PL: r(650, 1100),
  NL: r(750, 1300),
  BE: r(750, 1300),
  LU: r(700, 1250),
  FR: r(750, 1300),
  BG: r(200, 400),
  RO: r(300, 600),
  ES: r(950, 1600),
  PT: r(1050, 1750),
  DK: r(850, 1450),
  SE: r(1000, 1700),
  FI: r(1200, 2000),
  EE: r(1000, 1700),
  LV: r(950, 1600),
  LT: r(850, 1450),
  IE: r(1200, 2100),
  CY: r(600, 1100),
  MT: r(700, 1200),
};

export const DEFAULT_COST_SETTINGS: CostSettings = {
  priceBasis: 'gross',
  expectedRegistrationOffsetDays: 30,
  trailer: r(800),
  customsBrokerAndPlates: r(1100, 2000),
  exportPlatesAndInsurance: r(250, 450),
  driveBackByCountry: DEFAULT_DRIVE_BACK,
  driveBackDefault: r(700, 1300),
  worthItThresholdCents: 0,
};

/** Which defaults are drafts awaiting real figures (shown with a VERIFY badge in Settings). */
export const VERIFY_SETTINGS: (keyof CostSettings)[] = ['exportPlatesAndInsurance', 'driveBackByCountry', 'driveBackDefault'];
