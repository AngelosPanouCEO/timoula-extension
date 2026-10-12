/** Runs every worked example in ./tax-cases (see tax-cases/README.md). */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledTaxRules, calculateRegistrationTax, eurToCents } from '../src';

interface TaxCase {
  name: string;
  description: string;
  status: 'placeholder' | 'verified';
  source: string;
  input: {
    ltpfEur: number;
    extrasEur: number;
    firstRegistration: string;
    expectedRegistration: string;
    mileageKm: number;
    bodyCategory: never;
    co2GKm: number | null;
    euroClass: never;
    powertrain: never;
    mhevCountsAsHybrid: boolean;
  };
  expected: { registrationTaxEur: number; environmentalFeeEur?: number; taxableValueEur?: number | null; toleranceEur: number };
}

const dir = join(import.meta.dirname, 'tax-cases');
const cases: TaxCase[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as TaxCase);

describe('registration tax worked examples', () => {
  it('has cases to run', () => expect(cases.length).toBeGreaterThan(0));

  for (const c of cases) {
    it(`[${c.status}] ${c.name}: ${c.description}`, () => {
      const res = calculateRegistrationTax(bundledTaxRules(), {
        ltpfCents: eurToCents(c.input.ltpfEur),
        extrasCents: eurToCents(c.input.extrasEur ?? 0),
        firstRegistration: c.input.firstRegistration,
        expectedRegistration: c.input.expectedRegistration,
        mileageKm: c.input.mileageKm,
        bodyCategory: c.input.bodyCategory,
        co2GKm: c.input.co2GKm,
        euroClass: c.input.euroClass,
        powertrain: c.input.powertrain,
        mhevCountsAsHybrid: c.input.mhevCountsAsHybrid ?? false,
      });
      if (!res.ok) throw new Error(`calculation failed: ${JSON.stringify(res)}`);
      const tol = eurToCents(c.expected.toleranceEur);
      expect(Math.abs(res.registrationTaxCents - eurToCents(c.expected.registrationTaxEur))).toBeLessThanOrEqual(tol);
      if (c.expected.environmentalFeeEur !== undefined) expect(res.environmentalFeeCents).toBe(eurToCents(c.expected.environmentalFeeEur));
      if (c.expected.taxableValueEur != null) expect(Math.abs(res.taxableValueCents - eurToCents(c.expected.taxableValueEur))).toBeLessThanOrEqual(tol);
    });
  }
});
