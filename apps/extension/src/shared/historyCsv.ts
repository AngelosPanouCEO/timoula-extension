/** CSV export of the calculation history (UTF-8 with BOM so Excel shows Greek correctly). */
import { toCsv } from '@timoula/core';
import type { HistoryEntry } from './db';

const eur = (cents: number | null | undefined) => (cents === null || cents === undefined ? null : (cents / 100).toFixed(2));

export const HISTORY_CSV_COLUMNS = [
  'calculated_at', 'updated_at', 'site', 'url', 'make', 'model', 'version', 'country', 'seller_type', 'first_registration', 'mileage_km', 'fuel',
  'powertrain', 'co2_g_km', 'euro_class', 'body_category', 'vin', 'price_eur', 'price_net_eur', 'ltpf_eur', 'ltpf_label', 'ltpf_official',
  'expected_registration_gr', 'registration_tax_eur', 'environmental_fee_eur', 'vat_eur', 'option_a_low_eur', 'option_a_high_eur',
  'option_b_low_eur', 'option_b_high_eur', 'market_median_eur', 'market_comparables', 'saving_a_low_eur', 'saving_a_high_eur', 'verdict_a',
  'saving_b_low_eur', 'saving_b_high_eur', 'verdict_b', 'status', 'rules_version', 'notes',
] as const;

export function historyToCsv(entries: HistoryEntry[]): string {
  const rows = entries.map((e) => {
    const a = e.costs?.options[0].total;
    const b = e.costs?.options[1].total;
    return [
      e.createdAt, e.updatedAt, e.site, e.url, e.meta.make, e.meta.model, e.meta.version, e.countryCode, e.listing.sellerType.value,
      e.inputs.firstRegistration, e.inputs.mileageKm, e.meta.fuel, e.inputs.powertrain, e.inputs.co2GKm, e.inputs.euroClass, e.inputs.bodyCategory,
      e.meta.vin, eur(e.inputs.priceCents), eur(e.inputs.priceNetCents), eur(e.inputs.ltpfCents), e.meta.ltpf.label ?? (e.meta.ltpf.origin === 'manual' ? 'manual' : null),
      e.meta.ltpf.official ? 'yes' : 'no', e.inputs.expectedRegistration, eur(e.tax?.registrationTaxCents), eur(e.tax?.environmentalFeeCents),
      eur(e.costs?.vatCents), eur(a?.lowCents), eur(a?.highCents), eur(b?.lowCents), eur(b?.highCents), eur(e.market?.stats?.medianCents),
      e.market?.stats?.count ?? null, eur(e.verdicts?.A.saving.lowCents), eur(e.verdicts?.A.saving.highCents), e.verdicts?.A.level ?? null,
      eur(e.verdicts?.B.saving.lowCents), eur(e.verdicts?.B.saving.highCents), e.verdicts?.B.level ?? null, e.status, e.rulesVersionId, e.notes,
    ];
  });
  return '﻿' + toCsv(HISTORY_CSV_COLUMNS, rows);
}
