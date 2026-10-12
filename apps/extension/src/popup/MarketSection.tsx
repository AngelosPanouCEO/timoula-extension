import { useState } from 'preact/hooks';
import type { MarketComparison } from '@timoula/core';
import { readCarGrPrices } from '../shared/chromeApi';
import * as fmt from '../shared/format';
import { useT } from '../shared/ui';
import type { FormState } from './form';
import type { SetField } from './VehicleSection';

export function MarketSection(props: { form: FormState; set: SetField; searchUrl: string | null; comparison: MarketComparison | null; readerEnabled: boolean; onOpenSearch: () => void }) {
  const { t, lang } = useT();
  const [readStatus, setReadStatus] = useState<string | null>(null);
  const s = props.comparison?.stats ?? null;

  async function readPage() {
    try {
      const res = await readCarGrPrices();
      if (!res.tabFound) return setReadStatus(t('market.readPage.none'));
      props.set('pagePricesCents', res.pricesCents);
      setReadStatus(res.pricesCents.length ? t('market.readPage.found', { n: res.pricesCents.length }) : t('market.readPage.zero'));
    } catch (e) {
      setReadStatus(String(e));
    }
  }

  return (
    <section class="card" aria-labelledby="sec-market">
      <h2 id="sec-market">{t('section.market')}</h2>
      <p class="small muted" style={{ margin: '0 0 6px' }}>
        {t('market.intro')}
      </p>
      <div class="row wrap">
        <button type="button" class="primary" onClick={props.onOpenSearch} disabled={!props.searchUrl}>
          {t('market.openSearch')}
        </button>
        {props.readerEnabled ? (
          <button type="button" onClick={readPage}>
            {t('market.readPage')}
          </button>
        ) : null}
        {readStatus ? <span class="small muted">{readStatus}</span> : null}
      </div>
      {!props.searchUrl ? <p class="small muted">{t('market.noUrl')}</p> : null}
      <label style={{ marginTop: '8px' }}>
        <span class="field-label">{t('market.pricesLabel')}</span>
        <textarea rows={3} value={props.form.pricesText} onInput={(e) => props.set('pricesText', e.currentTarget.value)} placeholder="12.500&#10;13.900&#10;11.750" />
      </label>
      {s ? (
        <div class="kpi" style={{ marginTop: '8px' }}>
          <div>
            <span class="small muted">{t('market.median')}</span>
            <span class="v">{fmt.money(lang, s.medianCents)}</span>
          </div>
          <div>
            <span class="small muted">{t('market.range')}</span>
            <span class="v">{fmt.moneyRange(lang, s.minCents, s.maxCents)}</span>
          </div>
          <div>
            <span class="small muted">{t('market.count')}</span>
            <span class="v">{s.count}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
