# Architecture (phase 1)

```
click icon ──► popup ──executeScript(extract.js)──► listing tab
                 │            (activeTab grant)          │
                 │◄──────── ListingData (no seller PII) ──┘
                 │
                 ├─ classify: EU? commercial? powertrain signals, body category
                 ├─ ΛΤΠΦ lookup (bundled + client CSV rows, SPEC.md order)
                 ├─ runCalculation(rules, inputs, cost settings)  ← @timoula/core, pure
                 │     registration tax (+ env. fee, NMT VAT) → options A / B (low–high)
                 ├─ market: car.gr search link (assisted) / page reader (off) → median → verdict
                 └─ autosave → IndexedDB (history) ; settings → chrome.storage.local
```

## Principles

- **Never guess.** Every extracted value carries its source (`jsonld`, `embedded-json`, `dom`,
  `derived`, `user`). Missing values stay empty and the calculation lists what is missing.
  Powertrain is suggested from signals but must be confirmed when anything points to a hybrid.
- **All numbers in one file.** Rates, brackets, CO2/Euro adjustments, depreciation, exemptions,
  environmental fee, NMT thresholds: `packages/core/rules/gr-tax-rules.json`, versioned by date,
  with sources and VERIFY notes. Cost defaults: `packages/core/src/cost/settings.ts` (editable in Settings).
- **Pure core.** `@timoula/core` has no browser APIs, so phase 2 runs the same calculation on the
  backend to enforce plan limits.
- **Money in cents.** Integer euro cents end to end; rounding to the cent at the end.
- **Price basis.** `priceBasis: 'gross'` is stored with every calculation and in settings; net
  handling can be added without changing the stored shape.
- **Two dates.** ΛΤΠΦ is looked up by the car's *first registration*; the rules version and the
  car's age use the *expected registration date in Greece* (today + 30 days, editable).

## Parsers

| Site | Primary | Fallbacks |
|---|---|---|
| AutoScout24 (all EU domains) | `__NEXT_DATA__` → `listingDetails` | JSON-LD `Car`, `<dt>/<dd>` |
| mobile.de | `listing` object in the Next.js flight payload (`self.__next_f`), attributes by tag | JSON-LD `Car`, `<dt data-testid="{tag}-item">` |

Known traps handled (from the test pages): hybrids listed as "Benzin"; CO2 only in the WLTP
block; the WLTP block does not prove the cycle; Swiss dealers on mobile.de; vans in "Sonstige";
`autoscout24.pl` pages in Polish with EUR prices.

## Phase 2 hooks already in place

- `MarketValueProvider` interface (`packages/core/src/market/provider.ts`).
- `HistoryEntry` carries `rulesRevision`, `appVersion`, `vinStatus` for sync and the VIN flow.
- `shared/data.ts` is the single place to swap bundled rules/ΛΤΠΦ for backend-served, cached ones.
