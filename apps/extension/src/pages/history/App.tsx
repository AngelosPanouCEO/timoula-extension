import { useEffect, useMemo, useState } from 'preact/hooks';
import { COUNTRY_NAMES, PRODUCT, todayIso } from '@timoula/core';
import { allEntries, dedupeHistory, deleteEntry, saveEntry, type HistoryEntry } from '../../shared/db';
import * as fmt from '../../shared/format';
import { historyToCsv } from '../../shared/historyCsv';
import { loadSettings, type AppSettings } from '../../shared/settings';
import { LangContext, useT } from '../../shared/ui';

type SortKey = 'date' | 'price' | 'saving' | 'total';

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      document.documentElement.lang = s.lang;
    });
  }, []);
  if (!settings) return null;
  return (
    <LangContext.Provider value={settings.lang}>
      <History />
    </LangContext.Provider>
  );
}

const bestSaving = (e: HistoryEntry) => (e.verdicts ? Math.max(e.verdicts.A.saving.highCents, e.verdicts.B.saving.highCents) : null);

function History() {
  const { t, lang } = useT();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [site, setSite] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    dedupeHistory()
      .then(allEntries)
      .then(setEntries)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    document.title = `${t('history.title')} · ${PRODUCT.name}`;
    void reload();
  }, []);

  const countries = useMemo(() => [...new Set((entries ?? []).map((e) => e.countryCode).filter(Boolean) as string[])].sort(), [entries]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (entries ?? []).filter((e) => {
      if (site && e.site !== site) return false;
      if (country && e.countryCode !== country) return false;
      if (verdictFilter) {
        const levels = [e.verdicts?.A.level, e.verdicts?.B.level];
        if (verdictFilter === 'none' ? e.verdicts !== null : !levels.includes(verdictFilter as never)) return false;
      }
      if (!needle) return true;
      return [e.title, e.meta.make, e.meta.model, e.meta.version, e.notes, e.meta.vin].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
    const by: Record<SortKey, (e: HistoryEntry) => number> = {
      date: (e) => -Date.parse(e.updatedAt),
      price: (e) => e.inputs.priceCents ?? Infinity,
      saving: (e) => -(bestSaving(e) ?? -Infinity),
      total: (e) => e.costs?.options[0].total.lowCents ?? Infinity,
    };
    return [...list].sort((a, b) => by[sort](a) - by[sort](b));
  }, [entries, q, sort, site, verdictFilter, country]);

  async function updateNotes(e: HistoryEntry, notes: string) {
    const next = { ...e, notes, updatedAt: new Date().toISOString() };
    await saveEntry(next);
    setEntries((list) => list?.map((x) => (x.id === e.id ? next : x)) ?? null);
  }

  async function remove(e: HistoryEntry) {
    if (!confirm(t('history.confirmDelete'))) return;
    await deleteEntry(e.id);
    void reload();
  }

  return (
    <div class="page-wrap">
      <div class="row">
        <h1>
          <span class="brand">{PRODUCT.name}</span> · {t('history.title')}
        </h1>
        <span class="spacer" />
        <a href="../settings/index.html">{t('nav.settings')}</a>
        <a href="../privacy/index.html">{t('nav.privacy')}</a>
      </div>
      <div class="filters">
        <label>
          <span class="field-label">{t('history.search')}</span>
          <input type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </label>
        <label>
          <span class="field-label">{t('history.sort')}</span>
          <select value={sort} onChange={(e) => setSort(e.currentTarget.value as SortKey)}>
            <option value="date">{t('history.sort.date')}</option>
            <option value="price">{t('history.sort.price')}</option>
            <option value="saving">{t('history.sort.saving')}</option>
            <option value="total">{t('history.sort.total')}</option>
          </select>
        </label>
        <label>
          <span class="field-label">{t('history.filter.site')}</span>
          <select value={site} onChange={(e) => setSite(e.currentTarget.value)}>
            <option value="">{t('history.filter.all')}</option>
            <option value="mobile.de">mobile.de</option>
            <option value="autoscout24">AutoScout24</option>
          </select>
        </label>
        <label>
          <span class="field-label">{t('history.filter.verdict')}</span>
          <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.currentTarget.value)}>
            <option value="">{t('history.filter.all')}</option>
            <option value="good">{t('market.good')}</option>
            <option value="marginal">{t('market.marginal')}</option>
            <option value="bad">{t('market.bad')}</option>
            <option value="none">—</option>
          </select>
        </label>
        <label>
          <span class="field-label">{t('history.filter.country')}</span>
          <select value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
            <option value="">{t('history.filter.all')}</option>
            {countries.map((c) => (
              <option value={c}>{COUNTRY_NAMES[c]?.[lang] ?? c}</option>
            ))}
          </select>
        </label>
        <span class="spacer" />
        <span class="muted small">{t('history.count', { n: shown.length })}</span>
        <button type="button" disabled={!shown.length} onClick={() => fmt.download(`${PRODUCT.slug}-history-${todayIso()}.csv`, historyToCsv(shown), 'text/csv;charset=utf-8')}>
          {t('history.exportCsv')}
        </button>
      </div>
      {error ? <div class="banner bad">{error}</div> : null}
      {entries && !entries.length ? <p class="muted">{t('history.empty')}</p> : null}
      {shown.length ? (
        <table class="history">
          <thead>
            <tr>
              <th />
              <th>{t('field.model')}</th>
              <th class="num">{t('field.price')}</th>
              <th class="num">{t('tax.final')}</th>
              <th class="num">{t('cost.optionA')}</th>
              <th class="num">{t('cost.optionB')}</th>
              <th>{t('market.verdict')}</th>
              <th>{t('field.notes')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <Row key={e.id} e={e} onNotes={(n) => updateNotes(e, n)} onDelete={() => remove(e)} />
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function Row({ e, onNotes, onDelete }: { e: HistoryEntry; onNotes: (n: string) => void; onDelete: () => void }) {
  const { t, lang } = useT();
  const [notes, setNotes] = useState(e.notes);
  const a = e.costs?.options[0].total;
  const b = e.costs?.options[1].total;
  const prices = e.priceHistory;
  const priceChanged = prices.length > 1 && prices[0]!.priceCents !== prices[prices.length - 1]!.priceCents;
  return (
    <tr>
      <td>{e.photoUrl ? <img src={e.photoUrl} alt="" referrerpolicy="no-referrer" loading="lazy" /> : null}</td>
      <td>
        <div>
          <strong>{[e.meta.make, e.meta.model].filter(Boolean).join(' ') || e.title}</strong>
        </div>
        <div class="small muted">{e.meta.version}</div>
        <div class="small muted">
          {e.site} · {e.countryCode ? (COUNTRY_NAMES[e.countryCode]?.[lang] ?? e.countryCode) : '—'} · {fmt.date(lang, e.inputs.firstRegistration)} · {fmt.num(lang, e.inputs.mileageKm)} km
        </div>
        <div class="small muted">{t('history.calculatedAt', { date: fmt.dateTime(lang, e.updatedAt) })}</div>
        {e.status === 'incomplete' ? <span class="badge estimate">{t('history.incomplete')}</span> : null}
        <details>
          <summary class="small">{t('history.details')}</summary>
          <div class="small">
            <div>
              {t('field.ltpf')}: {fmt.money(lang, e.inputs.ltpfCents, 2)} {e.meta.ltpf.label ? `(${e.meta.ltpf.label})` : ''}{' '}
              {e.inputs.ltpfCents !== null ? (e.meta.ltpf.origin === 'manual' ? t('ltpf.manual') : e.meta.ltpf.official ? t('ltpf.official') : t('ltpf.estimate')) : ''}
            </div>
            <div>
              {t('field.co2')}: {e.inputs.co2GKm ?? '—'} · Euro {e.inputs.euroClass ?? '—'} · {e.inputs.powertrain ? t(`pt.${e.inputs.powertrain}`) : '—'} ·{' '}
              {e.inputs.bodyCategory ? t(`body.${e.inputs.bodyCategory}`) : '—'}
            </div>
            <div>
              {t('field.expectedRegistration')}: {fmt.date(lang, e.inputs.expectedRegistration)} · {e.rulesVersionId ? t('tax.rules', { id: e.rulesVersionId }) : ''}
            </div>
            {e.costs
              ? e.costs.options.map((o) => (
                  <div>
                    {o.id}: {o.lines.map((l) => `${t(`cost.${l.id}`)} ${fmt.moneyRange(lang, l.amount.lowCents, l.amount.highCents)}`).join(' + ')}
                  </div>
                ))
              : null}
            {e.market?.stats ? (
              <div>
                {t('market.median')}: {fmt.money(lang, e.market.stats.medianCents)} · {t('market.range')}: {fmt.moneyRange(lang, e.market.stats.minCents, e.market.stats.maxCents)} · {t('market.count')}: {e.market.stats.count}
              </div>
            ) : null}
            {prices.length > 1 ? (
              <div>
                {t('history.priceChanges')}: {prices.map((p) => `${fmt.date(lang, p.at)} ${fmt.money(lang, p.priceCents)}`).join(' → ')}
              </div>
            ) : null}
          </div>
        </details>
      </td>
      <td class="num">
        {fmt.money(lang, e.inputs.priceCents)}
        {priceChanged ? <div class="small muted">{prices[prices.length - 1]!.priceCents > prices[0]!.priceCents ? '▲' : '▼'}</div> : null}
      </td>
      <td class="num">{fmt.money(lang, e.tax?.registrationTaxCents)}</td>
      <td class="num">{a ? fmt.moneyRange(lang, a.lowCents, a.highCents) : '—'}</td>
      <td class="num">{b ? fmt.moneyRange(lang, b.lowCents, b.highCents) : '—'}</td>
      <td>
        {e.verdicts
          ? (['A', 'B'] as const).map((k) => (
              <div class={`verdict ${e.verdicts![k].level}`} style={{ padding: '2px 6px', marginBottom: '3px', fontWeight: 500 }}>
                {k}: {t(`market.${e.verdicts![k].level}`)}
                <div class="small">{fmt.moneyRange(lang, e.verdicts![k].saving.lowCents, e.verdicts![k].saving.highCents)}</div>
              </div>
            ))
          : '—'}
      </td>
      <td style={{ minWidth: '180px' }}>
        <textarea rows={3} value={notes} onInput={(ev) => setNotes(ev.currentTarget.value)} onBlur={() => notes !== e.notes && onNotes(notes)} aria-label={t('field.notes')} />
      </td>
      <td>
        <div class="stack">
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            {t('history.openListing')}
          </a>
          <button type="button" class="danger" onClick={onDelete}>
            {t('common.delete')}
          </button>
        </div>
      </td>
    </tr>
  );
}
