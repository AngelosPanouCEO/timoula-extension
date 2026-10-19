# ΤΙΜΟΥΛΑ

Chrome extension (Manifest V3) that calculates the total cost of importing a used car
from an EU listing on **mobile.de** or **AutoScout24** and registering it in Greece, and
compares it with the Greek market value.

> The product name lives in one place: `packages/core/src/config/product.ts`.
> The manifest, page titles and file names are generated from it.

**Status: Phase 1** — extraction, registration-tax calculation, cost options A/B, assisted
market comparison, local history. No backend yet; everything stays in the browser.

## Repository layout

```
packages/core/            Pure TypeScript domain logic (no browser APIs; reused by the backend in phase 2)
  rules/gr-tax-rules.json Versioned registration-tax rules — the ONLY place with rates/brackets/tables
  ltpf/                   ΛΤΠΦ data (Subaru, Audi), schema, SPEC.md, name synonyms, import tools
  src/tax/                Rules schema + calculation engine
  src/ltpf/               ΛΤΠΦ lookup (SPEC.md), CSV import/export
  src/classify/           Powertrain / body category / commercial-vehicle / EU checks
  src/cost/               Cost options A (trailer) and B (drive back), editable defaults
  src/market/             Market value providers, median/range, verdict, car.gr URL builder
  test/                   Unit tests; test/tax-cases/*.json = worked examples
apps/extension/
  src/extract/            Site parsers injected into the listing tab (one per site)
  src/popup/              Popup UI
  src/pages/              History, Settings, Privacy pages
  src/shared/             i18n (el/en), IndexedDB, settings, formatting, UI components
  test/fixtures/          Real listing pages (personal data removed) + parser tests
scripts/                  e2e test, fixture sanitiser, icon generator
docs/                     Architecture, tax rules, market value, estimates (missing ΛΤΠΦ/CO2) notes
```

## Local setup

Requirements: Node 20+ (22 recommended), npm 10, Chrome/Chromium 116+.

```bash
npm install          # .npmrc sets legacy-peer-deps (works around an npm peer-resolution bug)
npm run check        # typecheck + unit tests (112 tests)
npm run build        # → apps/extension/dist
```

`npm run dev` rebuilds on change (reload the extension in `chrome://extensions` afterwards).

## Load the unpacked extension

1. `npm run build`
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → choose `apps/extension/dist`.
4. Pin the ΤΙΜΟΥΛΑ icon, open a listing on mobile.de or AutoScout24 and click the icon.

## Tests

| Command | What it does |
|---|---|
| `npm test` | Unit tests: tax engine, rules validation, ΛΤΠΦ lookup, CSV, classifiers, costs, parsers on 18 real pages |
| `npm run build:e2e && npm run e2e` | Loads the extension in headless Chromium, serves the fixture pages, checks popup / history / settings / CSV; screenshots in `apps/extension/dist-e2e/screens/` |
| `E2E_LIVE=1 npm run e2e` | Same, against the live AutoScout24 URLs (mobile.de blocks automated browsers) |

### Adding real worked tax examples

Copy `packages/core/test/tax-cases/_template.json.example`, fill input and the amount customs
charged, set `"status": "verified"`. `npm test` picks it up. See `packages/core/test/tax-cases/README.md`.

### Adding a listing page as a fixture

Save the page HTML, then:
`node scripts/sanitize-fixture.mjs page.html apps/extension/test/fixtures/NN_name.html`
and put the URL in `NN_name.url.txt`. Add expectations in `apps/extension/test/parsers.test.ts`.

## Updating tax rules and ΛΤΠΦ

- **Rules:** edit `packages/core/rules/gr-tax-rules.json`. Add a new entry in `versions` with
  `effectiveFrom` (and close the previous one with `effectiveTo`). The version is chosen by the
  *expected registration date in Greece*. `npm test` validates the file (schema, overlaps,
  monotonic depreciation, source references). See `docs/tax-rules.md`.
- **ΛΤΠΦ:** `packages/core/ltpf/ltpf-records.json` (shipped seed). Clients can import more rows
  as CSV in Settings (same columns as `ltpf_records.csv`). Phase 2 serves both from the backend.

## Permissions and privacy

- `activeTab` + `scripting`: the listing is read only when the client clicks the icon. No
  permanent access to mobile.de / AutoScout24, no content scripts.
- `storage`: settings. History and imported ΛΤΠΦ rows are in IndexedDB — local only.
- `optional_host_permissions: https://www.car.gr/*`: requested only if the client turns on the
  car.gr page reader (off by default, see `docs/market-value.md`).
- No secrets in the extension. Seller names, phone numbers and descriptions are never extracted.

## Deploying the backend

Not part of phase 1. Phase 2 adds Supabase (EU region) for accounts, sync, plans, rules/ΛΤΠΦ
distribution and the admin page; this section will document it.

## License

Proprietary. All rights reserved.
