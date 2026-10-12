/**
 * mobile.de. Primary source: the "listing" object in the Next.js flight payload
 * (self.__next_f), whose attributes carry stable tags. Fallbacks: JSON-LD Car,
 * then the visible <dt data-testid="{tag}-item"> list.
 */
import type { ExtractionResult, ListingData } from '@timoula/core';
import {
  blankListing, cleanVin, field, fillDerivedPower, firstOf, get, jsonLdVehicle, mapCurrency, mapEuroClass, mapFuel, mapGearbox,
  mapSellerType, monthYearToIso, num, parseDecimal, parseIntLoose, parsePower, str,
} from './common';
import { objectsAfterKey, readFlightPayload } from './rsc';

type Attrs = Map<string, string>;

function pickListing(doc: Document): Record<string, unknown> | null {
  const payload = readFlightPayload(doc);
  if (!payload) return null;
  const candidates = objectsAfterKey(payload, 'listing').filter((o) => Array.isArray(o.attributes) && (o.price || o.contact));
  // The fullest object wins (some are partial references).
  return candidates.sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0] ?? null;
}

function attrsOf(listing: Record<string, unknown> | null): Attrs {
  const map: Attrs = new Map();
  const arr = listing?.attributes;
  if (!Array.isArray(arr)) return map;
  for (const a of arr) {
    const tag = str(get(a, 'tag'));
    const value = get(a, 'value');
    const text = Array.isArray(value) ? value.map(String).join(' | ') : str(value);
    if (tag && text) map.set(tag, text.replace(/ /g, ' '));
  }
  return map;
}

/** <dt data-testid="mileage-item">…</dt><dd>…</dd> */
function domAttrs(doc: Document): Attrs {
  const map: Attrs = new Map();
  for (const dt of Array.from(doc.querySelectorAll('dt[data-testid$="-item"]'))) {
    const tag = dt.getAttribute('data-testid')!.replace(/-item$/, '');
    const dd = dt.nextElementSibling;
    if (dd?.tagName === 'DD') map.set(tag, (dd.textContent ?? '').replace(/\s+/g, ' ').trim());
  }
  return map;
}

export function parseMobileDe(doc: Document, url: string, host: string): ExtractionResult {
  const listing = pickListing(doc);
  const ld = jsonLdVehicle(doc);
  const dom = domAttrs(doc);
  if (!listing && !ld && !dom.size) return { ok: false, kind: 'not-a-listing' };

  const idFromUrl = new URL(url).searchParams.get('id') ?? /\/(\d{6,})\.html/.exec(url)?.[1] ?? null;
  const listingId = str(listing?.id) ?? idFromUrl ?? url;
  const l: ListingData = blankListing({ site: 'mobile.de', host, listingId, url });
  const warnings: string[] = [];

  const sources: [Attrs, 'embedded-json' | 'dom'][] = [
    [attrsOf(listing), 'embedded-json'],
    [dom, 'dom'],
  ];
  const attr = (tag: string): { text: string | null; src: 'embedded-json' | 'dom' } => {
    for (const [m, src] of sources) {
      const t = m.get(tag);
      if (t) return { text: t, src };
    }
    return { text: null, src: 'dom' };
  };
  const E = 'embedded-json' as const;

  if (listing) {
    l.make = field(str(get(listing, 'make', 'localized')), E);
    l.model = field(str(get(listing, 'model', 'localized')), E);
    l.version = field(str(listing.subTitle), E);
    l.title = field(str(listing.title), E);
    const grs = num(get(listing, 'price', 'grs', 'amount'));
    l.priceCents = field(grs !== null ? Math.round(grs * 100) : null, E, str(get(listing, 'price', 'grs', 'localized')));
    const nt = get(listing, 'price', 'nt', 'amount');
    l.priceNetCents = field(typeof nt === 'number' ? Math.round(nt * 100) : null, E, str(get(listing, 'price', 'nt', 'localized')));
    const vat = num(get(listing, 'price', 'vat'));
    l.vatRatePct = field(vat && vat > 0 ? vat : null, E);
    l.currency = field(str(get(listing, 'price', 'grs', 'currency')), E);
    const contact = get(listing, 'contact') as Record<string, unknown> | undefined;
    const countryFromAddress = /^([A-Z]{1,2})-\d/.exec(str(contact?.address2) ?? '')?.[1] ?? null;
    l.countryCode = field(str(contact?.country)?.toUpperCase() ?? countryFromAddress, E, str(contact?.address2));
    l.sellerType = field(mapSellerType(str(contact?.enumType) ?? str(contact?.type)), E, str(contact?.type));
    const isNew = listing.isConditionNew === true || listing.isNew === true || listing.isPreRegistration === true;
    l.isNewOrPreRegistered = field(isNew, E, listing.isPreRegistration === true ? 'Tageszulassung' : null);
    l.siteCategory = field(str(listing.category), E);
    const images = listing.images;
    const firstImage = Array.isArray(images) ? (str(get(images[0], 'uri')) ?? str(get(images[0], 'src')) ?? str(images[0])) : null;
    if (firstImage && /^https?:/.test(firstImage)) l.photoUrl = field(firstImage, E);
  }

  // Technical attributes (flight payload first, visible list second).
  const reg = attr('firstRegistration');
  const regIso = monthYearToIso(reg.text);
  if (regIso) {
    l.firstRegistration = field(regIso.iso, reg.src, reg.text);
    l.firstRegistrationDayAssumed = regIso.dayAssumed;
  }
  const km = attr('mileage');
  l.mileageKm = field(parseIntLoose(km.text), km.src, km.text);
  const cc = attr('cubicCapacity');
  l.displacementCc = field(parseIntLoose(cc.text), cc.src, cc.text);
  const pw = attr('power');
  const p = parsePower(pw.text);
  l.powerKw = field(p.kw, pw.src, pw.text);
  l.powerHp = field(p.hp, pw.src, pw.text);
  const fuel = attr('fuel');
  const engineType = attr('envkv.engineType');
  l.fuelRaw = field([fuel.text, engineType.text].filter(Boolean).join(' · ') || null, fuel.src);
  // "Hybrid (Benzin/Elektro)" in the engine type beats a plain "Benzin" fuel.
  const fuelMapped = mapFuel(engineType.text && /hybrid|elektro/i.test(engineType.text) ? `${fuel.text ?? ''} ${engineType.text}` : fuel.text);
  l.fuel = field(fuelMapped, fuel.src, fuel.text);
  const co2Weighted = attr('envkv.co2EmissionsWeighted');
  const co2 = co2Weighted.text ? co2Weighted : attr('envkv.co2Emissions');
  l.co2GKm = field(parseIntLoose(co2.text), co2.src, co2.text);
  const euro = attr('emissionClass');
  l.euroClass = field(mapEuroClass(euro.text), euro.src, euro.text);
  const body = attr('category');
  l.bodyTypeRaw = field(body.text?.split(',')[0]?.trim() ?? null, body.src, body.text);
  if (body.text && /tageszulassung|vorführ|neufahrzeug/i.test(body.text)) l.isNewOrPreRegistered = field(true, body.src, body.text);
  const gear = attr('transmission');
  l.gearbox = field(mapGearbox(gear.text), gear.src, gear.text);
  const batt = attr('batteryCapacity');
  l.batteryKwh = field(parseDecimal(batt.text), batt.src, batt.text);
  const vin = attr('vin').text ?? attr('fin').text;
  l.vin = field(cleanVin(vin), 'embedded-json', vin);
  const trim = attr('trimLine');
  if (trim.text && !l.version.value) l.version = field(trim.text, trim.src);

  if (ld) {
    const J = 'jsonld' as const;
    l.make = firstOf(l.make, field(str(get(ld, 'brand', 'name')), J));
    l.model = firstOf(l.model, field(str(ld.model), J));
    l.title = firstOf(l.title, field(str(ld.name), J));
    const price = num(get(ld, 'offers', 'price'));
    l.priceCents = firstOf(l.priceCents, field(price !== null ? price * 100 : null, J));
    l.currency = firstOf(l.currency, field(mapCurrency(null, str(get(ld, 'offers', 'priceCurrency'))), J));
    l.mileageKm = firstOf(l.mileageKm, field(num(get(ld, 'mileageFromOdometer', 'value')), J));
    l.bodyTypeRaw = firstOf(l.bodyTypeRaw, field(str(ld.bodyType), J));
    l.gearbox = firstOf(l.gearbox, field(mapGearbox(str(ld.vehicleTransmission)), J));
    l.photoUrl = firstOf(l.photoUrl, field(Array.isArray(ld.image) ? str(ld.image[0]) : str(ld.image), J));
    l.countryCode = firstOf(l.countryCode, field(str(get(ld, 'offers', 'offeredBy', 'address', 'addressCountry'))?.toUpperCase(), J));
    const offeredType = str(get(ld, 'offers', 'offeredBy', '@type'));
    l.sellerType = firstOf(l.sellerType, field(offeredType === 'AutoDealer' ? 'dealer' : offeredType === 'Person' ? 'private' : null, J, offeredType));
    l.vin = firstOf(l.vin, field(cleanVin(ld.vehicleIdentificationNumber), J));
  }

  fillDerivedPower(l);
  if (!listing) warnings.push('primary-data-missing');
  if (l.currency.value && l.currency.value !== 'EUR') warnings.push('non-eur-price');
  if (!l.priceCents.value) warnings.push('price-missing');
  if (!l.make.value && !l.priceCents.value) return { ok: false, kind: 'not-a-listing' };
  return { ok: true, listing: l, warnings };
}
