# Greek market value — car.gr and alternatives

## What ships in phase 1

- **(c) Assisted mode — default.** The popup opens a car.gr search pre-filtered by make, model,
  year (±1), mileage ("up to" km + 10.000) and fuel. The client reads the prices and types/pastes them; the
  popup shows median, range and count and the verdict for options A and B.
- **(d) Page reader — OFF by default.** When the client turns it on in Settings, Chrome asks for
  permission to `https://www.car.gr/*`; the popup can then read prices from the car.gr results
  tab the client has open (JSON-LD offers first, then price elements). Nothing is stored except
  the prices used for the median. Turning it off removes the permission.

## Terms-of-use risk (summary)

- We could not read car.gr's terms: car.gr is behind Cloudflare bot protection and refused all
  automated access from our environment (including a headless browser). **Read the
  “Όροι & προϋποθέσεις” page yourself** for clauses on automated access, extraction and
  commercial reuse.
- Greek classifieds sites usually forbid automated extraction and commercial reuse. The listings
  database is also protected by the sui generis database right (ν. 2121/1993 art. 45Α, EU
  Directive 96/9; CJEU C‑762/19 CV‑Online v Melons): repeated extraction of small parts can
  infringe when it harms the maker's investment — selling the result to paying clients is the
  risky part.
- (d) lowers but does not remove the risk: it runs in the client's browser, only on a page they
  opened, only when they click.

**Recommendation:** keep (d) off until a Greek lawyer has reviewed car.gr's terms or car.gr
(EL.CAR.GR IKE) grants permission/a data licence. Ask for prices from licensed valuation data
(Autovista/Eurotax Hellas, DAT) in parallel; a backend provider can replace car.gr later
through the same `MarketValueProvider` interface.

## Search URL format (from a real search, 12/10/2026)

```
https://www.car.gr/used-cars/audi/a3.html?make=14093&model=15197&registration-to=2022&mileage-to=150000
                     &gearbox_type=automatic&euroclass=6&offer_type=sale&…
```

- Range filters use `-from` / `-to`: `registration-from/to` (year), `mileage-from/to` (km), `price-from/to`.
- Make and model appear twice: as slugs in the path (`/audi/a3.html`) and as numeric ids
  (`make=14093&model=15197`). We only know the slugs, so the link uses the path.
  **VERIFY:** that `/used-cars/{make}/{model}.html` alone filters (open a link from the popup and check).
- Fuel: parameter `fuel_type` (diesel = `2` confirmed by a real search; the rest from car.gr's filter list):

  | Our fuel / powertrain | car.gr | `fuel_type` |
  |---|---|---|
  | petrol | Βενζίνη | 1 |
  | diesel | Πετρέλαιο | 2 |
  | electric, BEV | Ηλεκτρικό | 3 |
  | LPG | Αέριο(lpg) - βενζίνη | 4 |
  | petrol HEV / MHEV | Υβριδικό βενζίνη | 8 |
  | diesel HEV / MHEV | Υβριδικό πετρέλαιο | 10 |
  | CNG | Φυσικό αέριο(cng) - βενζίνη | 11 |
  | petrol PHEV | Υβριδικό plug-in βενζίνη | 12 |
  | diesel PHEV | Υβριδικό plug-in πετρέλαιο | 13 |
  | hydrogen, FCEV | Υδρογόνο | 14 |

  A confirmed powertrain wins over the listing's fuel text (a Forester e-Boxer listed as "Benzin"
  searches Υβριδικό βενζίνη). "Other" adds no fuel filter. Greek sellers do not always list mild
  hybrids as hybrids, so an MHEV search can miss some comparables.

Default template (editable in Settings):
`https://www.car.gr/used-cars/{make}/{model}.html?offer_type=sale&registration-from={yearFrom}&registration-to={yearTo}&mileage-to={kmTo}&fuel_type={fuel}`

Comparables: years = car's year −1 … +1, mileage = "up to" the car's km + 10.000 (no lower limit),
rounded up to the next 1.000 km. All three numbers are settings.

## Page reader (d) — how it reads

car.gr embeds the search state in the page (`<script id="__NUXT_DATA__">`, Nuxt "devalue"
format). The reader decodes it and takes `pinia.classifiedsSearch.rows[]` → `rawPrice`,
`registration`, `mileage`, `fueltype`, `withoutVat`, `crashed`, plus `stats.total`. Crashed cars
and VAT-free (business) prices are excluded from the median. Only the page the client is
looking at is read (24 results per page). Tested on a saved results page
(`apps/extension/test/fixtures/cargr_audi_a3_results.html`) in unit tests and in Chromium.
