import { useEffect, useState } from 'preact/hooks';
import {
  bundledLtpfDataset, COUNTRY_NAMES, DEFAULT_COST_SETTINGS, EU_COUNTRIES, exportLtpfCsv, importLtpfCsv, mergeLtpfRecords, PRODUCT, todayIso,
  VERIFY_SETTINGS, type CostSettings, type Lang, type Range,
} from '@timoula/core';
import { hasCarGrPermission, removeCarGrPermission, requestCarGrPermission } from '../../shared/chromeApi';
import { taxRules } from '../../shared/data';
import { allEntries, clearLtpfRecords, customLtpfRecords, deleteAllData, putLtpfRecords } from '../../shared/db';
import * as fmt from '../../shared/format';
import { clearSettings, defaultSettings, loadSettings, saveSettings, type AppSettings } from '../../shared/settings';
import { LangContext, Toast, useT } from '../../shared/ui';

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);
  if (!settings) return null;
  document.documentElement.lang = settings.lang;
  return (
    <LangContext.Provider value={settings.lang}>
      <Settings settings={settings} onChange={setSettings} />
    </LangContext.Provider>
  );
}

function RangeEditor({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const { t } = useT();
  const set = (k: keyof Range, eur: string) => {
    const n = Number(eur);
    if (Number.isFinite(n) && n >= 0) onChange({ ...value, [k]: Math.round(n * 100) });
  };
  return (
    <div class="range-input">
      <input type="number" min={0} aria-label={t('common.low')} value={value.lowCents / 100} onInput={(e) => set('lowCents', e.currentTarget.value)} />
      <input type="number" min={0} aria-label={t('common.high')} value={value.highCents / 100} onInput={(e) => set('highCents', e.currentTarget.value)} />
    </div>
  );
}

function Settings({ settings, onChange }: { settings: AppSettings; onChange: (s: AppSettings) => void }) {
  const { t, lang } = useT();
  const [toast, setToast] = useState<string | null>(null);
  const [customCount, setCustomCount] = useState(0);
  const [importReport, setImportReport] = useState<string | null>(null);
  const rules = taxRules();

  useEffect(() => {
    document.title = `${t('settings.title')} · ${PRODUCT.name}`;
    void customLtpfRecords().then((r) => setCustomCount(r.length));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(h);
  }, [toast]);

  const update = async (next: AppSettings) => {
    onChange(next);
    await saveSettings(next);
    setToast(t('settings.saved'));
  };
  const setCosts = (patch: Partial<CostSettings>) => update({ ...settings, costs: { ...settings.costs, ...patch } });
  const verify = (k: keyof CostSettings) => (VERIFY_SETTINGS.includes(k) ? <span class="badge verify">{t('common.verify')}</span> : null);

  async function toggleReader(on: boolean) {
    if (on) {
      const granted = await requestCarGrPermission();
      if (!granted) return setToast(t('settings.market.permissionDenied'));
    } else if (await hasCarGrPermission()) {
      await removeCarGrPermission();
    }
    await update({ ...settings, cargr: { ...settings.cargr, pageReaderEnabled: on } });
  }

  async function onImport(file: File) {
    const res = await importLtpfCsv(await file.text());
    const existing = await customLtpfRecords();
    const merged = mergeLtpfRecords(existing, res.records);
    await putLtpfRecords(res.records);
    setCustomCount(merged.records.length);
    setImportReport(
      t('settings.ltpf.imported', { added: merged.added, replaced: merged.replaced, errors: res.errors.length }) +
        (res.errors.length ? '\n' + res.errors.slice(0, 20).map((e) => `#${e.line}: ${e.messages.join('; ')}`).join('\n') : ''),
    );
  }

  async function exportAll() {
    const data = { product: PRODUCT.name, exportedAt: new Date().toISOString(), settings, calculations: await allEntries(), ltpfCustomRecords: await customLtpfRecords() };
    fmt.download(`${PRODUCT.slug}-my-data-${todayIso()}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  async function deleteEverything() {
    if (!confirm(t('settings.data.confirmDelete'))) return;
    await deleteAllData();
    await clearSettings();
    if (await hasCarGrPermission()) await removeCarGrPermission();
    onChange(defaultSettings());
    setCustomCount(0);
    setToast(t('settings.data.deleted'));
  }

  const c = settings.costs;
  return (
    <div class="page-wrap">
      <div class="row">
        <h1>
          <span class="brand">{PRODUCT.name}</span> · {t('settings.title')}
        </h1>
        <span class="spacer" />
        <a href="../history/index.html">{t('nav.history')}</a>
        <a href="../privacy/index.html">{t('nav.privacy')}</a>
      </div>

      <section class="card" style={{ marginTop: '14px' }}>
        <h2>{t('settings.language')}</h2>
        <div class="row">
          {(['el', 'en'] as Lang[]).map((l) => (
            <label class="row">
              <input type="radio" name="lang" checked={settings.lang === l} onChange={() => update({ ...settings, lang: l })} />
              {l === 'el' ? 'Ελληνικά' : 'English'}
            </label>
          ))}
        </div>
      </section>

      <section class="card">
        <h2>{t('settings.costs')}</h2>
        <p class="small muted">{t('settings.costs.hint')}</p>
        <div class="settings-grid">
          <label>
            <span class="field-label">{t('cost.trailer')} (€ low / high)</span>
            <RangeEditor value={c.trailer} onChange={(r) => setCosts({ trailer: r })} />
          </label>
          <label>
            <span class="field-label">{t('cost.customsBrokerAndPlates')} (€)</span>
            <RangeEditor value={c.customsBrokerAndPlates} onChange={(r) => setCosts({ customsBrokerAndPlates: r })} />
          </label>
          <label>
            <span class="field-label">
              {t('cost.exportPlatesAndInsurance')} (€) {verify('exportPlatesAndInsurance')}
            </span>
            <RangeEditor value={c.exportPlatesAndInsurance} onChange={(r) => setCosts({ exportPlatesAndInsurance: r })} />
          </label>
          <label>
            <span class="field-label">{t('settings.offset')}</span>
            <input type="number" min={0} max={365} value={c.expectedRegistrationOffsetDays} onInput={(e) => setCosts({ expectedRegistrationOffsetDays: Math.max(0, Number(e.currentTarget.value) || 0) })} />
          </label>
          <label>
            <span class="field-label">{t('settings.threshold')}</span>
            <input type="number" min={0} value={c.worthItThresholdCents / 100} onInput={(e) => setCosts({ worthItThresholdCents: Math.max(0, Math.round((Number(e.currentTarget.value) || 0) * 100)) })} />
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <span class="field-label">{t('settings.priceBasis')}</span>
            <label class="row small">
              <input type="radio" checked={c.priceBasis === 'gross'} onChange={() => setCosts({ priceBasis: 'gross' })} />
              {t('settings.priceBasis.gross')}
            </label>
            <label class="row small muted">
              <input type="radio" disabled />
              {t('settings.priceBasis.net')}
            </label>
          </fieldset>
        </div>
        <h3 style={{ margin: '14px 0 6px' }}>
          {t('settings.driveBack')} {verify('driveBackByCountry')}
        </h3>
        <div class="settings-grid">
          {[...EU_COUNTRIES]
            .filter((x) => x !== 'GR')
            .sort((a, b) => COUNTRY_NAMES[a]![lang].localeCompare(COUNTRY_NAMES[b]![lang], lang))
            .map((code) => (
              <label>
                <span class="field-label">{COUNTRY_NAMES[code]![lang]} (€)</span>
                <RangeEditor
                  value={c.driveBackByCountry[code] ?? c.driveBackDefault}
                  onChange={(r) => setCosts({ driveBackByCountry: { ...c.driveBackByCountry, [code]: r } })}
                />
              </label>
            ))}
          <label>
            <span class="field-label">{t('settings.driveBackDefault')} (€)</span>
            <RangeEditor value={c.driveBackDefault} onChange={(r) => setCosts({ driveBackDefault: r })} />
          </label>
        </div>
        <button type="button" style={{ marginTop: '10px' }} onClick={() => update({ ...settings, costs: structuredClone(DEFAULT_COST_SETTINGS) })}>
          {t('settings.reset')}
        </button>
      </section>

      <section class="card">
        <h2>{t('settings.market')}</h2>
        <label>
          <span class="field-label">
            {t('settings.market.template')} <span class="badge verify">{t('common.verify')}</span>
          </span>
          <input value={settings.cargr.urlTemplate} onChange={(e) => update({ ...settings, cargr: { ...settings.cargr, urlTemplate: e.currentTarget.value } })} />
          <span class="small muted">{t('settings.market.templateHint')}</span>
        </label>
        <div class="settings-grid" style={{ marginTop: '8px' }}>
          <label>
            <span class="field-label">{t('settings.market.yearsBefore')}</span>
            <input type="number" min={0} max={10} value={settings.cargr.yearsBefore} onInput={(e) => update({ ...settings, cargr: { ...settings.cargr, yearsBefore: Math.max(0, Number(e.currentTarget.value) || 0) } })} />
          </label>
          <label>
            <span class="field-label">{t('settings.market.yearsAfter')}</span>
            <input type="number" min={0} max={10} value={settings.cargr.yearsAfter} onInput={(e) => update({ ...settings, cargr: { ...settings.cargr, yearsAfter: Math.max(0, Number(e.currentTarget.value) || 0) } })} />
          </label>
          <label>
            <span class="field-label">{t('settings.market.kmMargin')}</span>
            <input type="number" min={0} step={1000} value={settings.cargr.mileageMarginKm} onInput={(e) => update({ ...settings, cargr: { ...settings.cargr, mileageMarginKm: Math.max(0, Number(e.currentTarget.value) || 0) } })} />
          </label>
        </div>
        <label class="row" style={{ marginTop: '10px' }}>
          <input type="checkbox" checked={settings.cargr.pageReaderEnabled} onChange={(e) => toggleReader(e.currentTarget.checked)} />
          {t('settings.market.reader')}
        </label>
        <p class="small" style={{ color: 'var(--warn)' }}>
          {t('settings.market.readerWarning')}
        </p>
      </section>

      <section class="card">
        <h2>{t('settings.ltpf')}</h2>
        <p class="small muted">{t('settings.ltpf.count', { bundled: bundledLtpfDataset().records.length, custom: customCount })}</p>
        <div class="row wrap">
          <label class="row">
            <span>{t('settings.ltpf.import')}:</span>
            <input type="file" accept=".csv,text/csv" style={{ width: 'auto' }} onChange={(e) => e.currentTarget.files?.[0] && onImport(e.currentTarget.files[0])} />
          </label>
          <button
            type="button"
            onClick={async () => {
              const custom = await customLtpfRecords();
              const all = mergeLtpfRecords(bundledLtpfDataset().records, custom).records;
              fmt.download(`${PRODUCT.slug}-ltpf-${todayIso()}.csv`, '﻿' + exportLtpfCsv(all), 'text/csv;charset=utf-8');
            }}
          >
            {t('settings.ltpf.export')}
          </button>
          <button
            type="button"
            class="danger"
            disabled={!customCount}
            onClick={async () => {
              await clearLtpfRecords();
              setCustomCount(0);
            }}
          >
            {t('settings.ltpf.clear')}
          </button>
        </div>
        {importReport ? <pre class="small" style={{ whiteSpace: 'pre-wrap' }}>{importReport}</pre> : null}
      </section>

      <section class="card">
        <h2>{t('settings.rules')}</h2>
        <p class="small muted">{t('settings.rules.revision', { revision: rules.revision, count: rules.versions.length })}</p>
        {rules.versions.map((v) => (
          <details>
            <summary>
              {t('settings.rules.version', { id: v.id, from: fmt.date(lang, v.effectiveFrom), to: v.effectiveTo ? ` – ${fmt.date(lang, v.effectiveTo)}` : '' })} — {v.summary}
            </summary>
            <h3 style={{ marginTop: '8px' }}>{t('common.verify')}</h3>
            <ul class="small">
              {v.verify.map((x) => (
                <li>{x}</li>
              ))}
            </ul>
            <ul class="small">
              {v.sources.map((s) => (
                <li>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      <section class="card">
        <h2>{t('settings.data')}</h2>
        <p class="small muted">{t('settings.data.hint')}</p>
        <div class="row">
          <button type="button" onClick={exportAll}>
            {t('settings.data.export')}
          </button>
          <button type="button" class="danger" onClick={deleteEverything}>
            {t('settings.data.delete')}
          </button>
        </div>
      </section>
      <Toast text={toast} />
    </div>
  );
}
