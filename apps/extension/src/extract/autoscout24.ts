/**
 * AutoScout24 (all EU country domains). Primary source: __NEXT_DATA__
 * (props.pageProps.listingDetails). Fallback: JSON-LD Car, then <dt>/<dd>.
 */
import type { ExtractionResult, ListingData } from '@timoula/core';
import {
  blankListing, cleanVin, definitionList, field, fillDerivedPower, firstOf, get, jsonLdVehicle, mapCurrency, mapEuroClass, mapFuel,
  mapGearbox, mapSellerType, monthYearToIso, num, parseDecimal, parseIntLoose, parsePower, str,
} from './common';
import { readNextData } from './rsc';

export function parseAutoScout24(doc: Document, url: string, host: string): ExtractionResult {
  const next = readNextData(doc);
  const pageProps = get(next, 'props', 'pageProps') as Record<string, unknown> | undefined;
  const details = get(pageProps, 'listingDetails') as Record<string, unknown> | undefined;
  const ld = jsonLdVehicle(doc);

  if (pageProps && !details) return { ok: false, kind: 'not-a-listing' };
  if (!details && !ld) return { ok: false, kind: 'not-a-listing' };

  const listingId = str(get(details, 'id')) ?? /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(url)?.[1] ?? url;
  const l: ListingData = blankListing({ site: 'autoscout24', host, listingId, url });
  const warnings: string[] = [];
  const v = (get(details, 'vehicle') ?? {}) as Record<string, unknown>;
  const E = 'embedded-json' as const;

  if (details) {
    l.make = field(str(v.make), E);
    l.model = field(str(v.model), E);
    l.version = field(str(v.modelVersionInput), E);
    l.title = field([str(v.make), str(v.model), str(v.modelVersionInput)].filter(Boolean).join(' '), E);

    const pub = get(details, 'prices', 'public') as Record<string, unknown> | undefined;
    const priceText = str(pub?.price) ?? str(get(details, 'price', 'priceFormatted'));
    const price = num(pub?.priceRaw) ?? parseIntLoose(priceText);
    l.priceCents = field(price !== null ? price * 100 : null, E, priceText);
    const net = num(pub?.netPriceRaw);
    l.priceNetCents = field(net !== null ? Math.round(net * 100) : null, E, str(pub?.netPrice));
    const vat = num(pub?.vatRate);
    l.vatRatePct = field(vat && vat > 0 ? vat : null, E);
    l.currency = field(mapCurrency(priceText), E, priceText);

    const reg = monthYearToIso(str(v.firstRegistrationDateRaw) ?? str(v.firstRegistrationDate));
    if (reg) {
      l.firstRegistration = field(reg.iso, E, str(v.firstRegistrationDate));
      l.firstRegistrationDayAssumed = reg.dayAssumed;
    }
    l.mileageKm = field(num(v.mileageInKmRaw), E, str(v.mileageInKm));
    l.displacementCc = field(num(v.rawDisplacementInCCM) ?? num(v.rawCylinderCapacity), E, str(v.displacementInCCM));
    l.powerKw = field(num(v.rawPowerInKw), E, str(v.powerInKw));
    l.powerHp = field(num(v.rawPowerInHp), E, str(v.powerInHp));

    const fuelRaw = str(get(v, 'fuelCategory', 'formatted'));
    const fuelCode = str(get(v, 'fuelCategory', 'raw'));
    l.fuelRaw = field(fuelRaw, E);
    l.fuel = field(mapFuel(fuelRaw, fuelCode), E, fuelRaw);

    // CO2: the regular field, else the WLTP block (weighted value first for plug-ins).
    // The WLTP block does NOT prove the measuring cycle (test page 10: a 2006 car), so co2Cycle stays empty.
    const co2Plain = get(v, 'co2emissionInGramPerKmWithFallback') as Record<string, unknown> | undefined;
    const wltpWeighted = get(v, 'wltp', 'co2EmissionsCombinedWeightedWithFallback') as Record<string, unknown> | undefined;
    const wltpCombined = get(v, 'wltp', 'co2EmissionsCombinedWithFallback') as Record<string, unknown> | undefined;
    const co2Of = (o: Record<string, unknown> | undefined) => (o && o.isFallback !== true ? num(o.raw) : null);
    l.co2GKm = firstOf(
      field(co2Of(co2Plain), E, str(co2Plain?.formatted)),
      field(co2Of(wltpWeighted), E, str(wltpWeighted?.formatted)),
      field(co2Of(wltpCombined), E, str(wltpCombined?.formatted)),
    );

    const euroText = str(get(v, 'environmentEuDirective', 'formatted'));
    l.euroClass = field(mapEuroClass(euroText), E, euroText);
    l.bodyTypeRaw = field(str(v.bodyType), E);
    l.gearbox = field(mapGearbox(str(v.transmissionType)), E, str(v.transmissionType));
    const seller = get(details, 'seller') as Record<string, unknown> | undefined;
    l.sellerType = field(mapSellerType(str(seller?.type), typeof seller?.isDealer === 'boolean' ? (seller.isDealer as boolean) : null), E, str(seller?.type));
    l.countryCode = field(str(get(details, 'location', 'countryCode'))?.toUpperCase() ?? null, E);
    l.vin = field(cleanVin(v.vin) ?? cleanVin(get(v, 'rawData', 'vin')), E);
    const images = get(details, 'images');
    l.photoUrl = field(Array.isArray(images) ? str(images[0]) : null, E);
    const battery = parseDecimal(str(get(v, 'batteryCapacity', 'formatted')) ?? str(v.batteryCapacity));
    l.batteryKwh = field(battery, E);
    const offerType = (str(v.offerType) ?? '').toUpperCase();
    const legal = (Array.isArray(v.legalCategories) ? v.legalCategories : []).join(' ');
    const isNew = details.isNew === true || offerType === 'N' || offerType === 'S' || /neu|new|tageszul|nowy|nuovo|neuf|nuevo/i.test(legal);
    l.isNewOrPreRegistered = field(isNew, E, legal || offerType || null);
    l.siteCategory = field(str(v.type), E);
    l.sitePowertrainFlag = field(str(details.vehicleType), E);
  }

  // Fallback: JSON-LD for anything still missing.
  if (ld) {
    const J = 'jsonld' as const;
    l.make = firstOf(l.make, field(str(get(ld, 'brand', 'name')) ?? str(ld.brand), J));
    l.model = firstOf(l.model, field(str(ld.model), J));
    l.title = firstOf(l.title, field(str(ld.name), J));
    const offerPrice = num(get(ld, 'offers', 'price'));
    l.priceCents = firstOf(l.priceCents, field(offerPrice !== null ? offerPrice * 100 : null, J));
    l.currency = firstOf(l.currency, field(str(get(ld, 'offers', 'priceCurrency')), J));
    l.mileageKm = firstOf(l.mileageKm, field(num(get(ld, 'mileageFromOdometer', 'value')), J));
    l.photoUrl = firstOf(l.photoUrl, field(Array.isArray(ld.image) ? str(ld.image[0]) : str(ld.image), J));
    l.vin = firstOf(l.vin, field(cleanVin(ld.vehicleIdentificationNumber), J));
    const reg = monthYearToIso(str(ld.dateVehicleFirstRegistered) ?? str(ld.productionDate));
    if (reg && l.firstRegistration.value === null) {
      l.firstRegistration = field(reg.iso, J);
      l.firstRegistrationDayAssumed = reg.dayAssumed;
    }
  }

  // Last resort: visible key/value list.
  const dl = definitionList(doc);
  if (dl.size) {
    const D = 'dom' as const;
    const pick = (...labels: string[]) => labels.map((x) => dl.get(x)).find(Boolean) ?? null;
    l.mileageKm = firstOf(l.mileageKm, field(parseIntLoose(pick('Kilometerstand', 'Przebieg', 'Kilometerstand ', 'Mileage')), D));
    const p = parsePower(pick('Leistung', 'Moc', 'Power'));
    l.powerKw = firstOf(l.powerKw, field(p.kw, D));
    l.powerHp = firstOf(l.powerHp, field(p.hp, D));
    l.euroClass = firstOf(l.euroClass, field(mapEuroClass(pick('Schadstoffklasse', 'Klasa emisji spalin', 'Emission class')), D));
    l.displacementCc = firstOf(l.displacementCc, field(parseIntLoose(pick('Hubraum', 'Pojemność skokowa', 'Engine size')), D));
    l.gearbox = firstOf(l.gearbox, field(mapGearbox(pick('Getriebe', 'Skrzynia biegów', 'Gearbox')), D));
  }

  fillDerivedPower(l);
  if (l.currency.value && l.currency.value !== 'EUR') warnings.push('non-eur-price');
  if (!l.priceCents.value) warnings.push('price-missing');
  return { ok: true, listing: l, warnings };
}
