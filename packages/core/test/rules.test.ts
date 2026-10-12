import { describe, expect, it } from 'vitest';
import rulesJson from '../rules/gr-tax-rules.json';
import { bundledTaxRules, parseTaxRules, RulesValidationError, selectRulesVersion } from '../src';

const clone = () => JSON.parse(JSON.stringify(rulesJson));

describe('gr-tax-rules.json', () => {
  it('parses and validates', () => {
    expect(bundledTaxRules().versions.length).toBeGreaterThanOrEqual(2);
  });

  it('selects the version by expected registration date', () => {
    const rules = bundledTaxRules();
    expect(selectRulesVersion(rules, '2026-12-31')?.id).toBe('2025-11-01');
    expect(selectRulesVersion(rules, '2027-01-01')?.id).toBe('2027-01-01');
    expect(selectRulesVersion(rules, '2024-01-01')).toBeNull();
  });

  it('every VERIFY item and source is documented', () => {
    for (const v of bundledTaxRules().versions) {
      expect(v.sources.length).toBeGreaterThan(0);
      expect(v.verify.length).toBeGreaterThan(0);
    }
  });

  it('rejects a malformed file with a readable path', () => {
    const bad = clone();
    bad.versions[0].brackets.bands[0].ratePct = 'four';
    expect(() => parseTaxRules(bad)).toThrow(RulesValidationError);
    try {
      parseTaxRules(bad);
    } catch (e) {
      expect((e as RulesValidationError).issues.join()).toContain('versions.0.brackets.bands.0.ratePct');
    }
  });

  it('rejects overlapping versions', () => {
    const bad = clone();
    bad.versions[0].effectiveTo = '2027-02-01';
    expect(() => parseTaxRules(bad)).toThrow(/overlaps/);
  });

  it('rejects decreasing depreciation and unknown sources', () => {
    const bad = clone();
    bad.versions[0].taxableValue.depreciation.table[3].sedan = 1;
    bad.versions[0].brackets.sourceId = 'NOPE';
    expect(() => parseTaxRules(bad)).toThrow(/must not decrease[\s\S]*unknown sourceId NOPE/);
  });
});
