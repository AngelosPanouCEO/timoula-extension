/**
 * Total import cost, as two transport options with a low and a high total:
 *  A) trailer transport, B) drive the car back on export plates.
 */
import { addRanges, range, roundCents, type Range } from '../util/money';
import type { CostSettings } from './settings';

export type CostLineId =
  | 'carPrice'
  | 'registrationTax'
  | 'environmentalFee'
  | 'vatNewMeansOfTransport'
  | 'trailer'
  | 'exportPlatesAndInsurance'
  | 'driveBack'
  | 'customsBrokerAndPlates';

export interface CostLine {
  id: CostLineId;
  amount: Range;
}

export interface TransportOption {
  id: 'A' | 'B';
  lines: CostLine[];
  total: Range;
}

export interface CostBreakdownInput {
  /** Listed price (gross basis), cents. */
  carPriceCents: number;
  registrationTaxCents: number;
  environmentalFeeCents: number;
  /** New means of transport: buy net and pay Greek VAT. */
  newMeansOfTransportVat: null | {
    netPriceCents: number;
    vatRatePct: number;
    baseIncludesRegistrationTax: boolean;
  };
  countryCode: string | null;
  settings: CostSettings;
}

export interface CostBreakdown {
  /** Price the calculation used for the car itself (net when NMT VAT applies). */
  carCostCents: number;
  vatCents: number;
  options: [TransportOption, TransportOption];
}

export function driveBackRange(settings: CostSettings, country: string | null): Range {
  return (country && settings.driveBackByCountry[country]) || settings.driveBackDefault;
}

export function computeCostBreakdown(i: CostBreakdownInput): CostBreakdown {
  const { settings } = i;
  let carCostCents = i.carPriceCents;
  let vatCents = 0;
  if (i.newMeansOfTransportVat) {
    const v = i.newMeansOfTransportVat;
    carCostCents = v.netPriceCents;
    const base = v.netPriceCents + (v.baseIncludesRegistrationTax ? i.registrationTaxCents : 0);
    vatCents = roundCents((base * v.vatRatePct) / 100);
  }
  const common: CostLine[] = [
    { id: 'carPrice', amount: range(carCostCents) },
    { id: 'registrationTax', amount: range(i.registrationTaxCents) },
  ];
  if (i.environmentalFeeCents > 0) common.push({ id: 'environmentalFee', amount: range(i.environmentalFeeCents) });
  if (vatCents > 0) common.push({ id: 'vatNewMeansOfTransport', amount: range(vatCents) });

  const broker: CostLine = { id: 'customsBrokerAndPlates', amount: settings.customsBrokerAndPlates };
  const aLines = [...common, { id: 'trailer' as const, amount: settings.trailer }, broker];
  const bLines = [
    ...common,
    { id: 'exportPlatesAndInsurance' as const, amount: settings.exportPlatesAndInsurance },
    { id: 'driveBack' as const, amount: driveBackRange(settings, i.countryCode) },
    broker,
  ];
  const opt = (id: 'A' | 'B', lines: CostLine[]): TransportOption => ({ id, lines, total: addRanges(...lines.map((l) => l.amount)) });
  return { carCostCents, vatCents, options: [opt('A', aLines), opt('B', bLines)] };
}
