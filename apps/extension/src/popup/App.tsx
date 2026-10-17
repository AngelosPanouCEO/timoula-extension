import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  buildCarGrUrl, buildComparison, checkEligibility, COUNTRY_NAMES, lookupLtpf, PRODUCT, runCalculation, todayIso, verdict,
  type Comparable, type ExtractionResult, type ListingData, type LtpfCandidate, type LtpfRecord, type MarketQuery, co2FromPriceList,
} from '@timoula/core';
import { matchSite } from '../extract/sites';
import { activeTab, extractFromTab, openPage, openTab } from '../shared/chromeApi';
import { APP_VERSION, ltpfRecords, taxRules } from '../shared/data';
import { entryForListing, listingKeyOf, newId, saveEntry, type HistoryEntry } from '../shared/db';
import { entrySignature } from '../shared/historyMerge';
import * as fmt from '../shared/format';
import type { I18nKey } from '../shared/i18n';
import { loadSettings, type AppSettings } from '../shared/settings';
import { Banner, LangContext, Toast, useT } from '../shared/ui';
import { CostsSection } from './CostsSection';
import { commercialCheck, withCo2From, withEuroFromDate, formFromEntry, initialForm, NO_LTPF, powertrainSuggestionFor, toInputs, toMeta, type FormState } from './form';
import { MarketSection } from './MarketSection';
import { TaxInputs, TaxResult } from './TaxSection';
import { VehicleSection, type SetField } from './VehicleSection';

type View =
  | { kind: 'loading' }
  | { kind: 'message'; title: I18nKey; body: I18nKey }
  | { kind: 'ready'; listing: ListingData; warnings: string[] };

const failureView = (r: Extract<ExtractionResult, { ok: false }>): View =>
  r.kind === 'unsupported-site'
    ? { kind: 'message', title: 'state.unsupported.title', body: 'state.unsupported.body' }
    : r.kind === 'not-a-listing'
      ? { kind: 'message', title: 'state.notListing.title', body: 'state.notListing.body' }
      : { kind: 'message', title: 'state.parseError.title', body: 'state.parseError.body' };

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      const s = await loadSettings();
      setSettings(s);
      document.documentElement.lang = s.lang;
      try {
        // ?tabId= lets the popup page be opened in a tab for testing.
        const forced = Number(new URLSearchParams(location.search).get('tabId'));
        const tab = forced ? await chrome.tabs.get(forced).catch(() => null) : await activeTab();
        const site = tab?.url ? matchSite(tab.url) : null;
        if (!tab?.id || !site) return setView({ kind: 'message', title: 'state.unsupported.title', body: 'state.unsupported.body' });
        let res: ExtractionResult;
        try {
          res = await extractFromTab(tab.id);
        } catch {
          return setView({ kind: 'message', title: 'state.noAccess.title', body: 'state.noAccess.body' });
        }
        setView(res.ok ? { kind: 'ready', listing: res.listing, warnings: res.warnings } : failureView(res));
      } catch {
        setView({ kind: 'message', title: 'state.parseError.title', body: 'state.parseError.body' });
      }
    })();
  }, []);

  if (!settings) return null;
  return (
    <LangContext.Provider value={settings.lang}>
      <TopBar />
      {view.kind === 'loading' ? <Message title="common.loading" /> : null}
      {view.kind === 'message' ? <Message title={view.title} body={view.body} /> : null}
      {view.kind === 'ready' ? <Calculator listing={view.listing} settings={settings} /> : null}
    </LangContext.Provider>
  );
}

function TopBar() {
  const { t } = useT();
  return (
    <header class="topbar">
      <span class="brand">{PRODUCT.name}</span>
      <span class="small muted">{t('app.tagline')}</span>
      <span class="spacer" />
      <button type="button" onClick={() => openPage('pages/history/index.html')}>
        {t('nav.history')}
      </button>
      <button type="button" onClick={() => openPage('pages/settings/index.html')}>
        {t('nav.settings')}
      </button>
    </header>
  );
}

function Message({ title, body }: { title: I18nKey; body?: I18nKey }) {
  const { t } = useT();
  return (
    <div class="state">
      <h2>{t(title)}</h2>
      {body ? <p>{t(body)}</p> : null}
    </div>
  );
}

function ListingHead({ listing, form }: { listing: ListingData; form: FormState }) {
  const { t, lang } = useT();
  const country = form.countryCode ? (COUNTRY_NAMES[form.countryCode]?.[lang] ?? form.countryCode) : null;
  return (
    <div class="listing-head">
      {listing.photoUrl.value ? <img src={listing.photoUrl.value} alt="" referrerpolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : null}
      <div>
        <div class="title">{listing.title.value ?? [form.make, form.model].filter(Boolean).join(' ')}</div>
        <div class="small muted">
          {listing.host}
          {listing.sellerType.value ? ` · ${t(`seller.${listing.sellerType.value}`)}` : ''}
          {country ? ` · ${country}` : ''}
        </div>
      </div>
      <span class="spacer" />
      <div class="num" style={{ fontSize: '16px', fontWeight: 700 }}>
        {fmt.money(lang, form.priceCents)}
      </div>
    </div>
  );
}

function Calculator({ listing, settings }: { listing: ListingData; settings: AppSettings }) {
  const { t, lang } = useT();
  const rules = taxRules();
  const today = todayIso();
  const [form, setForm] = useState<FormState>(() => initialForm(listing, settings));
  const [records, setRecords] = useState<LtpfRecord[] | null>(null);
  const [previous, setPrevious] = useState<HistoryEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // One history entry per listing: a reopened listing continues its existing entry.
  const entryId = useRef(newId());
  const createdAt = useRef(new Date().toISOString());
  const sessionStart = useRef(new Date().toISOString());
  const lastSaved = useRef<string | null>(null);
  const listingKey = listingKeyOf(listing);

  useEffect(() => {
    void ltpfRecords().then(setRecords);
    void entryForListing(listingKey)
      .then((prev) => {
        if (prev) {
          entryId.current = prev.id;
          createdAt.current = prev.createdAt;
          lastSaved.current = entrySignature(prev);
          setForm((f) => formFromEntry(prev, f));
        }
        setPrevious(prev);
      })
      .catch(() => setPrevious(null))
      .finally(() => setLoaded(true));
  }, [listingKey]);

  const set: SetField = (key, value, markEdited = true) => {
    setForm((f) => {
      const next: FormState = { ...f, [key]: value };
      if (markEdited && !next.edited.includes(key)) next.edited = [...next.edited, key];
      if (key === 'powertrain') next.powertrainConfirmed = value !== null;
      if (key === 'ltpfCents') next.ltpf = { ...NO_LTPF, origin: 'manual' };
      if (key === 'euroClass') next.euroFromDate = false;
      if (key === 'firstRegistration') return withEuroFromDate(next);
      if (key === 'co2GKm') {
        next.co2FromLtpf = false;
        next.co2ListFrom = null;
      }
      return next;
    });
  };

  const ptSuggestion = useMemo(() => powertrainSuggestionFor(listing, form), [listing, form.fuel, form.make, form.model, form.version, form.firstRegistration]);

  const lookup = useMemo(() => {
    if (!records) return null;
    return lookupLtpf(records, {
      make: form.make,
      model: form.model,
      versionText: [form.version, listing.title.value].filter(Boolean).join(' '),
      firstRegistration: form.firstRegistration,
      displacementCc: form.displacementCc,
      powerKw: form.powerKw,
      powerHp: form.powerHp,
      // A CO2 copied from a price-list version must not narrow the search for versions.
      co2GKm: form.co2FromLtpf ? null : form.co2GKm,
      fuel: form.fuel,
      powertrain: form.powertrain,
      gearbox: form.gearbox,
    });
  }, [records, form.make, form.model, form.version, form.firstRegistration, form.displacementCc, form.powerKw, form.powerHp, form.co2GKm, form.co2FromLtpf, form.fuel, form.powertrain, form.gearbox]);

  const useCandidate = (c: LtpfCandidate, markEdited: boolean) =>
    setForm((f) => ({
      ...withCo2From(f, c.criterion === 'beta' ? null : co2FromPriceList(records ?? [], c.record, f.firstRegistration)),
      ltpfCents: Math.round(c.record.ltpf_eur * 100),
      ltpf: {
        origin: 'table',
        recordId: c.record.id,
        criterion: c.criterion,
        official: c.official,
        label: `${c.record.brand} ${c.record.model} ${c.record.version} ${c.record.engine_label ?? ''} ${c.record.transmission ?? ''}`.replace(/\s+/g, ' ').trim(),
        listFrom: c.record.valid_from,
        listTo: c.record.valid_to,
      },
      edited: markEdited && !f.edited.includes('ltpf') ? [...f.edited, 'ltpf'] : f.edited,
    }));

  // Keep the ΛΤΠΦ in sync with the lookup unless the client typed or picked one.
  useEffect(() => {
    if (!lookup || form.ltpf.origin === 'manual' || form.edited.includes('ltpf')) return;
    if (lookup.selected) {
      if (form.ltpf.recordId !== lookup.selected.record.id || form.ltpf.official !== lookup.selected.official) useCandidate(lookup.selected, false);
    } else if (form.ltpf.recordId && !lookup.candidates.some((c) => c.record.id === form.ltpf.recordId)) {
      setForm((f) => ({ ...withCo2From(f, null), ltpfCents: null, ltpf: NO_LTPF }));
    }
  }, [lookup]);

  const eligibility = checkEligibility(form.countryCode);
  const commercial = commercialCheck(listing, form);
  const blockedCommercial = commercial.likelyCommercial && !form.commercialOverride;
  const powertrainUsable = form.powertrain !== null && form.powertrainConfirmed;
  const inputs = toInputs(form, settings, powertrainUsable);
  const outcome = eligibility.status === 'non-eu' || blockedCommercial ? null : runCalculation(rules, inputs, settings.costs, today);
  const tax = outcome?.tax ?? null;

  const missing = new Set<string>();
  if (tax && !tax.ok && tax.reason === 'missing-input') tax.missing.forEach((m) => missing.add(m));
  if (outcome && !outcome.ok && outcome.reason === 'missing-price') missing.add('price');
  if (outcome && !outcome.ok && outcome.reason === 'missing-net-price') missing.add('netPrice');
  if (eligibility.status === 'unknown') missing.add('country');

  const marketQuery: MarketQuery = {
    make: form.make,
    model: form.model,
    firstRegistrationYear: form.firstRegistration ? Number(form.firstRegistration.slice(0, 4)) : null,
    mileageKm: form.mileageKm,
    fuel: form.fuel,
    powertrain: powertrainUsable ? form.powertrain : null,
  };
  const searchUrl = buildCarGrUrl(marketQuery, settings.cargr);
  const comparables: Comparable[] = [
    ...fmt.parsePriceList(form.pricesText).map((p) => ({ priceCents: p, origin: 'manual' as const })),
    ...form.pagePricesCents.map((p) => ({ priceCents: p, origin: 'page' as const })),
  ];
  const comparison = comparables.length ? buildComparison(form.pagePricesCents.length ? 'cargr-page-reader' : 'cargr-assisted', marketQuery, searchUrl, comparables, new Date().toISOString()) : null;
  const verdicts =
    outcome?.ok && comparison?.stats
      ? {
          A: verdict(comparison.stats.medianCents, outcome.costs.options[0].total, settings.costs.worthItThresholdCents),
          B: verdict(comparison.stats.medianCents, outcome.costs.options[1].total, settings.costs.worthItThresholdCents),
        }
      : null;

  // Autosave (debounced): one history entry per popup session.
  useEffect(() => {
    if (!loaded || eligibility.status === 'non-eu') return;
    // Save complete calculations, and incomplete ones only once the client has typed something.
    if (!outcome?.ok && form.edited.length === 0 && !form.notes) return;
    const handle = setTimeout(() => {
      const now = new Date().toISOString();
      // Price history records the price the listing showed each time it was opened.
      const listed = listing.priceCents.value;
      const base = previous?.priceHistory ?? [];
      const priceHistory = listed !== null && (base.length === 0 || base[base.length - 1]!.priceCents !== listed) ? [...base, { at: sessionStart.current, priceCents: listed }] : base;
      const entry: HistoryEntry = {
        id: entryId.current,
        listingKey,
        createdAt: createdAt.current,
        updatedAt: now,
        site: listing.site,
        url: listing.url,
        title: listing.title.value ?? [form.make, form.model, form.version].filter(Boolean).join(' '),
        photoUrl: listing.photoUrl.value,
        countryCode: form.countryCode,
        listing,
        inputs,
        meta: toMeta(form),
        tax: tax?.ok ? tax : null,
        costs: outcome?.ok ? outcome.costs : null,
        market: comparison,
        verdicts,
        notes: form.notes,
        status: outcome?.ok ? 'complete' : 'incomplete',
        priceHistory,
        rulesVersionId: tax?.ok ? tax.rulesVersionId : null,
        rulesRevision: rules.revision,
        appVersion: APP_VERSION,
        vinStatus: form.vin ? 'received' : 'none',
      };
      const signature = entrySignature(entry);
      if (signature === lastSaved.current) return; // nothing changed: do not touch the entry
      saveEntry(entry)
        .then(() => {
          lastSaved.current = signature;
          if (outcome?.ok) setToast(t('save.saved'));
        })
        .catch((e) => setToast(t('save.error', { error: String(e) })));
    }, 800);
    return () => clearTimeout(handle);
  }, [form, records, previous, loaded]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(h);
  }, [toast]);

  if (eligibility.status === 'non-eu') {
    return (
      <main class="content">
        <ListingHead listing={listing} form={form} />
        <Banner kind="bad" title={t('state.nonEu.title')}>
          <p>{t('state.nonEu.body')}</p>
          <p class="small">{t('state.nonEu.country', { country: COUNTRY_NAMES[eligibility.country]?.[lang] ?? eligibility.country })}</p>
        </Banner>
      </main>
    );
  }

  const taxOk = tax?.ok ? tax : null;
  const prevPrice = previous?.priceHistory[previous.priceHistory.length - 1]?.priceCents ?? previous?.inputs.priceCents ?? null;
  const listedNow = listing.priceCents.value;

  return (
    <>
      <main class="content">
        <ListingHead listing={listing} form={form} />

        {previous ? (
          <Banner kind="info" title={t('banner.previous', { date: fmt.dateTime(lang, previous.updatedAt) })}>
            <div class="row wrap">
              <span>
                {prevPrice !== null && listedNow !== null && prevPrice !== listedNow
                  ? `${t('banner.previousPrice', { then: fmt.money(lang, prevPrice), now: fmt.money(lang, listedNow) })} (${listedNow > prevPrice ? '▲' : '▼'} ${fmt.money(lang, Math.abs(listedNow - prevPrice))})`
                  : t('banner.priceSame', { now: fmt.money(lang, listedNow) })}
              </span>
              <span class="spacer" />
              <button type="button" onClick={() => setForm(initialForm(listing, settings))}>
                {t('banner.resetToPage')}
              </button>
            </div>
          </Banner>
        ) : null}

        {listing.currency.value && listing.currency.value !== 'EUR' ? (
          <Banner kind="warn" title={t('state.nonEuro.title')}>
            <p>{t('state.nonEuro.body', { currency: listing.currency.value })}</p>
          </Banner>
        ) : null}

        {commercial.likelyCommercial ? (
          <Banner kind={form.commercialOverride ? 'info' : 'warn'} title={t('banner.commercial.title')}>
            <p>{t('banner.commercial.body', { evidence: commercial.evidence ?? '' })}</p>
            {!form.commercialOverride ? (
              <button type="button" onClick={() => set('commercialOverride', true)}>
                {t('banner.commercial.override')}
              </button>
            ) : null}
          </Banner>
        ) : null}

        {taxOk?.flags.registrationBanned ? (
          <Banner kind="bad" title={t('banner.ban.title')}>
            <p>{t('banner.ban.body')}</p>
          </Banner>
        ) : null}

        {taxOk?.flags.newMeansOfTransport ? (
          <Banner kind="warn" title={t('banner.nmt.title')}>
            <p>{t('banner.nmt.body')}</p>
            <label class="row small">
              <input type="checkbox" checked={form.applyNmtVat} onChange={(e) => set('applyNmtVat', e.currentTarget.checked)} />
              {t('banner.nmt.apply')}
            </label>
          </Banner>
        ) : null}

        {taxOk?.flags.historic ? <Banner kind="info">{t('banner.historic')}</Banner> : null}

        {missing.size ? (
          <Banner kind="warn" title={t('missing.title')}>
            <p>{[...missing].map((m) => t(`missing.${m}` as I18nKey)).join(', ')}</p>
          </Banner>
        ) : null}

        <div class="grid2">
          <VehicleSection listing={listing} form={form} set={set} powertrain={ptSuggestion} missing={missing} />
          <div>
            <TaxInputs form={form} set={set} lookup={lookup} onUseCandidate={(c) => useCandidate(c, true)} missing={missing} />
            {taxOk?.warnings.includes('co2-nedc-wltp-transition') ? (
              <p class="small muted" style={{ margin: '6px 2px' }}>
                {t('field.co2.transition')}
              </p>
            ) : null}
            <div style={{ marginTop: '10px' }}>
              <TaxResult tax={tax} />
            </div>
          </div>
        </div>

        {outcome?.ok && !taxOk?.flags.registrationBanned ? <CostsSection costs={outcome.costs} verdicts={verdicts} netPrice={outcome.costs.vatCents > 0} /> : null}

        <MarketSection
          form={form}
          set={set}
          searchUrl={searchUrl}
          comparison={comparison}
          readerEnabled={settings.cargr.pageReaderEnabled}
          onOpenSearch={() => searchUrl && openTab(searchUrl)}
        />

        <section class="card">
          <label>
            <span class="field-label">{t('field.notes')}</span>
            <textarea rows={2} value={form.notes} onInput={(e) => set('notes', e.currentTarget.value, false)} />
          </label>
        </section>
      </main>
      <footer class="footer">
        <span>{t('footer.disclaimer')}</span>
        <span class="spacer" />
        <span>
          {taxOk ? t('tax.rules', { id: taxOk.rulesVersionId }) : ''} · {rules.revision}
        </span>
      </footer>
      <Toast text={toast} />
    </>
  );
}
