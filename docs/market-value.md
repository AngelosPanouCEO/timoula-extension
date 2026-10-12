# Greek market value — car.gr and alternatives

## What ships in phase 1

- **(c) Assisted mode — default.** The popup opens a car.gr search pre-filtered by make, model,
  year (±1) and mileage (±25%) and fuel. The client reads the prices and types/pastes them; the
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

## Search URL template — VERIFY

The car.gr URL format could not be checked (blocked). The template is a setting
(Settings → Market value): run any search on car.gr, copy the address and replace the values with
`{make} {model} {yearFrom} {yearTo} {kmFrom} {kmTo} {fuel}`. Path placeholders such as
`/classifieds/cars/{make}/{model}/` also work.
