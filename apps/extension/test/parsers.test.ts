// @vitest-environment node
/**
 * Parser tests against real pages collected on 12/10/2026 (personal data removed,
 * see scripts/sanitize-fixture.mjs and test/fixtures/README.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import type { ListingData } from '@timoula/core';
import { extractListing } from '../src/extract';
import { matchSite } from '../src/extract/sites';

const FIX = join(import.meta.dirname, 'fixtures');

function load(name: string) {
  const html = readFileSync(join(FIX, `${name}.html`), 'utf8');
  const url = readFileSync(join(FIX, `${name}.url.txt`), 'utf8').trim();
  const window = new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, navigation: { disableMainFrameNavigation: true } } });
  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  return { doc: doc as unknown as Document, url };
}

function parse(name: string): ListingData {
  const { doc, url } = load(name);
  const res = extractListing(doc, url);
  if (!res.ok) throw new Error(`${name}: ${JSON.stringify(res)}`);
  return res.listing;
}

const v = (l: ListingData) => ({
  make: l.make.value,
  model: l.model.value,
  priceEur: l.priceCents.value !== null ? l.priceCents.value / 100 : null,
  firstRegistration: l.firstRegistration.value,
  mileageKm: l.mileageKm.value,
  fuel: l.fuel.value,
  cc: l.displacementCc.value,
  kw: l.powerKw.value,
  hp: l.powerHp.value,
  co2: l.co2GKm.value,
  euro: l.euroClass.value,
  body: l.bodyTypeRaw.value,
  gearbox: l.gearbox.value,
  seller: l.sellerType.value,
  country: l.countryCode.value,
  currency: l.currency.value,
});

describe('site matching', () => {
  it.each([
    ['https://suchen.mobile.de/fahrzeuge/details.html?id=38836515714592', 'mobile.de', true],
    ['https://www.mobile.de/', 'mobile.de', false],
    ['https://www.autoscout24.de/angebote/subaru-xv-x', 'autoscout24', true],
    ['https://www.autoscout24.pl/oferta/skoda-x', 'autoscout24', true],
    ['https://www.autoscout24.de/lst/subaru/xv', 'autoscout24', false],
    ['https://www.autoscout24.it/annunci/x', 'autoscout24', false],
  ])('%s', (url, site, listing) => {
    expect(matchSite(url)).toMatchObject({ site, looksLikeListing: listing });
  });
  it('rejects other sites and plain http', () => {
    expect(matchSite('https://www.car.gr/classifieds/cars/')).toBeNull();
    expect(matchSite('http://www.autoscout24.de/angebote/x')).toBeNull();
    expect(matchSite('https://evil-autoscout24.de.example.com/angebote/x')).toBeNull();
  });
});

describe('AutoScout24 pages', () => {
  it('01 Subaru XV 2.0D Comfort (private seller, AT)', () => {
    const l = parse('01_subaru_xv_2.0d_2014_autoscout24');
    expect(v(l)).toEqual({
      make: 'Subaru', model: 'XV', priceEur: 5500, firstRegistration: '2014-11-30', mileageKm: 178000, fuel: 'diesel', cc: 1998, kw: 108, hp: 147,
      co2: 146, euro: null, body: 'SUV/Geländewagen/Pickup', gearbox: 'manual', seller: 'private', country: 'AT', currency: 'EUR',
    });
    expect(l.version.value).toBe('2.0D Comfort');
    expect(l.firstRegistrationDayAssumed).toBe(true);
    expect(l.co2Cycle.value).toBeNull();
    expect(l.listingId).toBe('da930bce-234a-44f6-94dd-0c6e2dbe79ad');
    expect(l.photoUrl.value).toMatch(/^https:\/\/prod\.pictures\.autoscout24\.net\//);
    expect(l.vin.value).toBeNull();
  });

  it('03 Subaru Forester mild hybrid listed as Benzin', () => {
    const l = parse('03_subaru_forester_eboxer_2021_autoscout24');
    expect(v(l)).toMatchObject({ fuel: 'petrol', co2: 154, euro: '6d', firstRegistration: '2021-07-31', country: 'DE', seller: 'dealer', gearbox: 'automatic' });
    expect(l.version.value).toContain('Mild-Hybrid');
  });

  it('05 Toyota RAV4 hybrid: CO2 only in the WLTP block, cycle not trusted', () => {
    const l = parse('05_hybrid_toyota_rav4_2020_autoscout24');
    expect(v(l)).toMatchObject({ fuel: 'petrol_electric', co2: 105, euro: '6', country: 'NL', priceEur: 23945 });
    expect(l.co2Cycle.value).toBeNull();
    expect(l.sitePowertrainFlag.value).toBe('phev');
  });

  it('07 VW ID.3: electric, net price shown', () => {
    const l = parse('07_bev_vw_id3_2021_autoscout24');
    expect(v(l)).toMatchObject({ fuel: 'electric', priceEur: 18395, co2: 0, cc: null, body: 'Kleinwagen' });
    expect(l.priceNetCents.value).toBe(1_520_200);
  });

  it('09 VW Passat 2012: Euro class not shown stays empty', () => {
    const l = parse('09_diesel_vw_passat_2.0tdi_2012_autoscout24');
    expect(v(l)).toMatchObject({ co2: 123, euro: null, fuel: 'diesel', seller: 'private', body: 'Kombi', priceEur: 2500 });
  });

  it('19 Audi A3 Sportback 1.6 TDI 2018: Audi ΛΤΠΦ lookup inputs', () => {
    const l = parse('19_audi_a3_sportback_1.6tdi_2018_autoscout24');
    expect(v(l)).toMatchObject({ make: 'Audi', model: 'A3', priceEur: 13790, firstRegistration: '2018-03-31', mileageKm: 141893, fuel: 'diesel', cc: 1598, kw: 85, hp: 116, gearbox: 'automatic', country: 'DE' });
    expect(l.version.value).toContain('Sportback design');
  });

  it('10 BMW 320Cd 2006: WLTP block on a 2006 car does not set the cycle', () => {
    const l = parse('10_old_bmw_e46_320cd_cabrio_2006_autoscout24');
    expect(v(l)).toMatchObject({ co2: 167, euro: '4', body: 'Cabrio', firstRegistration: '2006-04-30' });
    expect(l.co2Cycle.value).toBeNull();
  });

  it('12 Mercedes 230 CE 1982: no CO2, no Euro class', () => {
    const l = parse('12_historic_mercedes_w123_230ce_1982_autoscout24');
    expect(v(l)).toMatchObject({ co2: null, euro: null, firstRegistration: '1982-08-31', body: 'Coupé', priceEur: 18500 });
  });

  it('13 Genesis G70: CO2 only in the WLTP block', () => {
    expect(v(parse('13_no_gr_importer_genesis_g70_2024_autoscout24'))).toMatchObject({ make: 'Genesis', co2: 178, euro: '6d', fuel: 'diesel' });
  });

  it('14 Dodge Challenger: net price and VAT', () => {
    const l = parse('14_us_dodge_challenger_rt_2021_autoscout24');
    expect(v(l)).toMatchObject({ co2: 319, priceEur: 55990, mileageKm: 1591 });
    expect(l.priceNetCents.value).toBe(4_705_000);
    expect(l.vatRatePct.value).toBe(19);
  });

  it('15 autoscout24.pl: Polish page, price in EUR', () => {
    const l = parse('15_locale_pl_skoda_octavia_iv_2021_autoscout24pl');
    expect(v(l)).toMatchObject({ make: 'Skoda', priceEur: 14450, currency: 'EUR', fuel: 'petrol_electric', gearbox: 'automatic', country: 'DE' });
    expect(l.host).toBe('www.autoscout24.pl');
  });

  it('17 search results page → not a listing', () => {
    const { doc, url } = load('17_search_results_page_autoscout24');
    expect(extractListing(doc, url)).toEqual({ ok: false, kind: 'not-a-listing' });
  });

  it('18 VW T6 Transporter Kasten: body "Sonstige"', () => {
    const l = parse('18_van_vw_t6_transporter_kasten_2018_autoscout24');
    expect(v(l)).toMatchObject({ model: 'T6 Transporter', body: 'Sonstige', co2: 153, euro: '6' });
    expect(l.version.value).toContain('Kasten');
  });
});

describe('mobile.de pages', () => {
  it('02 Subaru Forester 2.0D Active', () => {
    const l = parse('02_subaru_forester_2.0d_active_2017_mobilede');
    expect(v(l)).toEqual({
      make: 'Subaru', model: 'Forester', priceEur: 17990, firstRegistration: '2017-02-28', mileageKm: 47000, fuel: 'diesel', cc: 1998, kw: 108, hp: 147,
      co2: 148, euro: '6', body: 'SUV/Geländewagen/Pickup', gearbox: 'manual', seller: 'dealer', country: 'DE', currency: 'EUR',
    });
    expect(l.listingId).toBe('38836515714592');
    expect(l.version.value).toContain('Active');
    expect(l.make.source).toBe('embedded-json');
  });

  it('04 Mercedes C 200: net price 25.882 €, MHEV not visible', () => {
    const l = parse('04_mhev_mercedes_c200_w206_2022_mobilede');
    expect(v(l)).toMatchObject({ make: 'Mercedes-Benz', model: 'C 200', fuel: 'petrol', co2: 154, euro: '6d', priceEur: 30800 });
    expect(l.priceNetCents.value).toBe(2_588_235);
    expect(l.vatRatePct.value).toBe(19);
  });

  it('06 BMW 330e: plug-in listed as petrol, battery 11 kWh, no CO2', () => {
    const l = parse('06_phev_bmw_330e_labelled_petrol_2020_mobilede');
    expect(v(l)).toMatchObject({ make: 'BMW', model: '330', fuel: 'petrol', co2: null, euro: '6d', body: 'Kombi' });
    expect(l.batteryKwh.value).toBe(11);
    expect(l.title.value).toContain('330e');
  });

  it('08 Ford Tourneo Courier: pre-registered (Tageszulassung), 9 km', () => {
    const l = parse('08_new_tageszulassung_ford_tourneo_courier_2026_mobilede');
    expect(v(l)).toMatchObject({ mileageKm: 9, euro: '6e', firstRegistration: '2026-08-31', body: 'Van/Minibus' });
    expect(l.isNewOrPreRegistered.value).toBe(true);
    expect(l.priceNetCents.value).toBe(2_098_319);
  });

  it('11 Porsche Cayenne Turbo GT', () => {
    const l = parse('11_highco2_porsche_cayenne_turbo_gt_2023_mobilede');
    expect(v(l)).toMatchObject({ make: 'Porsche', model: 'Cayenne', co2: 319, kw: 471, priceEur: 178500 });
    expect(l.version.value).toContain('Turbo GT');
  });

  it('16 Subaru Outback with a Swiss dealer → country CH', () => {
    const l = parse('16_non_eu_swiss_seller_subaru_outback_2012_mobilede');
    expect(v(l)).toMatchObject({ country: 'CH', euro: '5', priceEur: 15900 });
  });

  it('falls back to the visible attribute list when the flight payload is missing', () => {
    const { doc, url } = load('02_subaru_forester_2.0d_active_2017_mobilede');
    for (const s of Array.from(doc.querySelectorAll('script'))) if ((s.textContent ?? '').includes('__next_f')) s.remove();
    const res = extractListing(doc, url);
    if (!res.ok) throw new Error('expected ok');
    expect(res.warnings).toContain('primary-data-missing');
    expect(res.listing.mileageKm).toMatchObject({ value: 47000, source: 'dom' });
    expect(res.listing.priceCents).toMatchObject({ value: 1_799_000, source: 'jsonld' });
    expect(res.listing.countryCode.value).toBe('DE');
  });
});

describe('privacy', () => {
  it('never extracts seller names or phone numbers', () => {
    const l = parse('05_hybrid_toyota_rav4_2020_autoscout24');
    const json = JSON.stringify(l);
    expect(json).not.toMatch(/contactName|phone|whatsapp/i);
  });
});

describe('car.gr results page (reader d)', () => {
  it('reads the rows car.gr embeds in the page', async () => {
    const { readCarGrResults } = await import('../src/extract/cargr');
    const html = readFileSync(join(FIX, 'cargr_audi_a3_results.html'), 'utf8');
    const window = new Window({ url: 'https://www.car.gr/', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    const doc = new window.DOMParser().parseFromString(html, 'text/html') as unknown as Document;
    const res = readCarGrResults(doc);
    expect(res.source).toBe('nuxt');
    expect(res.total).toBe(1);
    expect(res.rows).toEqual([
      { priceCents: 1_690_000, title: 'Audi A3 2015 1.4 TFSI DSG', registration: '1/2015', mileageKm: 103_100, fuel: 'Βενζίνη', withoutVat: false, crashed: false, isNew: false },
    ]);
  });

  it('a page without data yields no rows (dropdown prices are ignored)', async () => {
    const { readCarGrResults } = await import('../src/extract/cargr');
    const window = new Window({ settings: { disableJavaScriptEvaluation: true } });
    const doc = new window.DOMParser().parseFromString('<select><option class="price">30.000 €</option></select><div class="price">12.500 €</div>', 'text/html') as unknown as Document;
    expect(readCarGrResults(doc).rows.map((r) => r.priceCents)).toEqual([1_250_000]);
  });
});
