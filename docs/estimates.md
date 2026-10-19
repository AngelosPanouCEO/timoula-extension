# Estimates when a value is missing

The calculation never stops for a missing ΛΤΠΦ, CO2, Euro class or powertrain. Every value
that does not come from the listing, a Greek price list or the client is shown as an estimate,
with its source.

## ΛΤΠΦ

| Order | Source | Badge | Notes |
|---|---|---|---|
| 1 | Greek importer price list, same version, list of the era | Επίσημη τιμή | `verified` records only (`isOfficialPrice`) |
| 2 | Greek list, same version, another period (γ) | Εκτίμηση | strict match on cc/power/fuel/gearbox |
| 3 | German base price of the same version without 19% VAT (ε) | Εκτίμηση | ADAC Autokatalog, `ltpf/de-prices.json` |
| 4 | Greek sister version (β) | Εκτίμηση | moved after 5 when its power is > 15% away from the car's |
| 5 | Listing price ÷ market residual value (age, mileage) ÷ VAT of the origin country | Εκτίμηση (χαμηλή ακρίβεια) | `marketResidual()`; the customs depreciation table is steeper than the market and is not used here |

With several candidates the most likely is used (gearbox and version name first) and the others
stay selectable.

**German prices (ADAC).** `ltpf/tools/adac_crawl.py` reads one page per model generation (1 s
apart, compressed). Each page embeds the versions of the generation's first body only (usually the
saloon or hatchback); the other bodies (Avant, Touring, allroad…) are loaded by ADAC's API under
`/bff`, which robots.txt disallows, so they are not collected. robots.txt allows the catalogue
pages. **ADAC's terms of use for commercial reuse must be checked before the extension is
published**; until then the data is for testing. Prices listed 7–12/2020 may include Germany's
temporary 16% VAT.

**US-only cars.** No open source of US list prices (MSRP) was found; they fall back to the
residual estimate (5).

## CO2

| Order | Source | Badge |
|---|---|---|
| 1 | Listing | από τη σελίδα |
| 2 | Chosen Greek price-list version | από τον τιμοκατάλογο |
| 3 | Same version in the nearest list that prints CO2 (≤ 4 years) | από τον τιμοκατάλογο (με ημερομηνία) |
| 4 | EEA new-car registrations (2010–2022), registration-weighted mean | εκτίμηση (ΕΕ) |

EEA levels: same model and engine → same model and cc, power ±8% → same make and engine → same
engine (all makes) → same power and fuel. Only values of the cycle customs applies (NEDC up to
31/12/2020, WLTP after). Plug-in and full hybrids are kept apart (≤ 90 / > 60 g/km). Source: EEA,
*Monitoring of CO2 emissions from passenger cars*, CC BY 4.0; rebuild with
`co2/tools/eea_build.py download|build`.

## Euro class and powertrain

- Euro class: Euro 6 is filled from a first registration on or after 1/9/2015 (all Euro 6
  variants are taxed the same); earlier, only the minimum class is shown.
- Powertrain: until the client confirms it, the tax is calculated provisionally — an unconfirmed
  mild hybrid as conventional (no exemption, the higher tax), other suggestions as suggested.
