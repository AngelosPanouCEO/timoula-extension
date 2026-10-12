/** The rules file shipped with this build (phase 2: refreshed from the backend, this stays as the offline fallback). */
import rulesJson from '../../rules/gr-tax-rules.json';
import { parseTaxRules, type TaxRules } from './rulesSchema';

let cached: TaxRules | null = null;

export function bundledTaxRules(): TaxRules {
  cached ??= parseTaxRules(rulesJson);
  return cached;
}
