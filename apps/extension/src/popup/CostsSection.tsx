import type { CostBreakdown, CostLineId, Verdict } from '@timoula/core';
import * as fmt from '../shared/format';
import { useT } from '../shared/ui';

export function CostsSection(props: { costs: CostBreakdown; verdicts: { A: Verdict; B: Verdict } | null; netPrice: boolean }) {
  const { t, lang } = useT();
  const label = (id: CostLineId) => (id === 'carPrice' && props.netPrice ? t('cost.carPriceNet') : t(`cost.${id}`));
  return (
    <section class="card" aria-labelledby="sec-costs">
      <h2 id="sec-costs">{t('section.costs')}</h2>
      <div class="options">
        {props.costs.options.map((o) => {
          const v = props.verdicts?.[o.id];
          return (
            <div class="option">
              <h3>{o.id === 'A' ? t('cost.optionA') : t('cost.optionB')}</h3>
              <table class="lines">
                <tbody>
                  {o.lines.map((line) => (
                    <tr>
                      <td>{label(line.id)}</td>
                      <td class="num">{fmt.moneyRange(lang, line.amount.lowCents, line.amount.highCents)}</td>
                    </tr>
                  ))}
                  <tr class="total">
                    <td>{t('cost.total')}</td>
                    <td class="num">{fmt.moneyRange(lang, o.total.lowCents, o.total.highCents)}</td>
                  </tr>
                </tbody>
              </table>
              {v ? (
                <div class={`verdict ${v.level}`} style={{ marginTop: '8px' }}>
                  <div class="big">{t(`market.${v.level}`)}</div>
                  <div class="small">{t('market.saving', { low: fmt.money(lang, v.saving.lowCents), high: fmt.money(lang, v.saving.highCents) })}</div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
