# Registration tax rules — sources and open points

File: `packages/core/rules/gr-tax-rules.json` (revision `2026-10-12.1`).

## Versions

| Version | Expected registration date | Hybrids | BEV / FCEV |
|---|---|---|---|
| `2025-11-01` | 1/11/2025 – 31/12/2026 | ≥51 g/km: 50% exempt · ≤50 g/km: 75% · ≤75 g/km imported 1/11/2025–31/5/2026: 75% (§6α) | 0 tax |
| `2027-01-01` | from 1/1/2027 | 50% exempt regardless of CO2 (ν. 5313/2026 art. 10) | 0 tax |

## Calculation (both versions)

1. Taxable value = (ΛΤΠΦ + EXTRA equipment) × (1 − age/body depreciation) × (1 − mileage reduction); total reduction ≤ 95%.
   - Depreciation table: Α.Υ.Ο. ΔΕΦΚΦΔ 1192035 ΕΞ 2017 (ΦΕΚ Β' 4618/2017), by half-year and body
     category, linear between months (Α.1203/2019 art. 11 §3). Age counts **completed months** up to
     the acceptance of the customs declaration (ΔΕΦΚ).
   - Mileage: 0.10% per 500 km above 15,000 km/year, max 10% (ν. 5222/2025 art. 142).
2. Brackets (art. 136 §2α): 0–14k 4%, 14–17k 26%, 17–20k 53%, 20–25k 62%, 25–30k 71%, >30k 30%.
   For used cars the brackets are chosen on the value *before* depreciation; the weighted rate is
   applied to the taxable value.
3. Rates are adjusted for CO2 (NEDC table for first registration ≤ 31/12/2020, WLTP from 2021)
   and Euro class (art. 136 §5), combined multiplicatively.
4. Exemptions (first matching rule).
5. Separately: environmental fee (Euro 4: 3,000 €; Euro 5: 1,000 €), registration ban for Euro 1–3
   unless historic (>30 years), new-means-of-transport flag (≤6 months or ≤6,000 km → 24% VAT).

## VERIFY list (also inside the JSON)

1. CO2 and Euro adjustments combined multiplicatively vs additively.
2. Interpretation of "brackets chosen on the pre-depreciation value".
3. Depreciation table of 2017 still in force.
4. Ages under 6 months: linear from 0%.
5. Mileage coefficient "0,10" read as 0.10 percentage points per 500 km.
6. Mild hybrids (MHEV): exemption only if the COC classifies them as hybrid electric.
7. Environmental fee amounts and whether it still applies (secondary sources only).
8. Euro 1–3 registration ban.
9. Historic vehicles (special regime not modelled).
10. NMT VAT base includes the registration tax.
11. Start date of version `2025-11-01`.

Plain "Euro 5" in a listing is mapped to 5a (first registration ≤ 31/12/2012) or 5b (later) — VERIFY.

## How to confirm

One real customs assessment (εκκαθαριστικό) per pattern is enough to settle items 1–5:
a Euro 6 car first registered before 9/2018, a Euro 5 car, and a car with excess mileage.
Add each as a `verified` case in `packages/core/test/tax-cases/`.

## Confirmed by real clearances

| Case | What it confirmed |
|---|---|
| `real-001` Hyundai Kona 1.0 T-GDi, 09/2020 (BE), ΔΕΦΚ 14/10/2026: tax 222,72 € | Brackets on the value before depreciation, weighted rate on the taxable value · CO2 +10% from the NEDC table for a 2020 car (customs used NEDC 125 although the certificate also shows WLTP 145) · ΦΕΚ Β' 4618/2017 table still in use · age in completed months (6 years 15 days → 67%) · body category from the type-approval code (AF → MPV), not from the listing ("SUV") |

Still unconfirmed: CO2 × Euro surcharges combined multiplicatively, mileage reduction, environmental
fee, hybrid exemptions, new-means-of-transport VAT.
