# Worked examples for the registration-tax calculator

Each `*.json` file in this folder is one test case. `npm test` runs all of them.

## Add a real example

1. Copy `_template.json.example` to a new file, e.g. `real-2026-11-golf-tdi.json`.
2. Fill `input` from the customs clearance document (ΛΤΠΦ, dates, km, CO2, Euro class, body category).
3. Fill `expected.registrationTaxEur` with the amount the customs office charged.
4. Set `"status": "verified"` and describe the source (e.g. "Εκκαθαριστικό Τελωνείου Πειραιά 12/2026").

Verified cases must match within `toleranceEur`. Placeholder cases are regression checks
computed from our own reading of the rules; they are replaced as real examples arrive.

## Fields

| Field | Meaning |
|---|---|
| `ltpfEur` | ΛΤΠΦ of the base version (euro) |
| `extrasEur` | Value of optional (EXTRA) equipment at ΛΤΠΦ level |
| `firstRegistration` | First registration anywhere (YYYY-MM-DD) |
| `expectedRegistration` | Date the tax becomes due in Greece; selects the rules version |
| `mileageKm` | Odometer |
| `bodyCategory` | `suv_atv`, `hatchback`, `sedan`, `cabrio`, `coupe_roadster`, `mpv` |
| `co2GKm` | CO2 from the COC (null if not proven) |
| `euroClass` | `none`, `1`…`6e` |
| `powertrain` | `ICE`, `MHEV`, `HEV`, `PHEV`, `BEV`, `FCEV` |
| `mhevCountsAsHybrid` | MHEV only: COC marks it as hybrid electric |
