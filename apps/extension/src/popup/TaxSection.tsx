import { useState } from 'preact/hooks';
import type { LtpfCandidate, LtpfLookupResult, RegistrationTaxResult } from '@timoula/core';
import * as fmt from '../shared/format';
import { Banner, EuroInput, Labeled, SourceBadge, useT } from '../shared/ui';
import type { FormState } from './form';
import type { SetField } from './VehicleSection';

export function LtpfBadge({ form }: { form: FormState }) {
  const { t } = useT();
  if (form.ltpfCents === null) return <SourceBadge source={null} empty />;
  if (form.ltpf.origin === 'manual') return <span class="badge user">{t('ltpf.manual')}</span>;
  return form.ltpf.official ? <span class="badge official">{t('ltpf.official')}</span> : <span class="badge estimate">{t('ltpf.estimate')}</span>;
}

function listLabel(t: ReturnType<typeof useT>['t'], lang: ReturnType<typeof useT>['lang'], from: string | null, to: string | null) {
  if (!from) return '';
  return t('ltpf.list', { from: fmt.date(lang, from), to: to ? ` – ${fmt.date(lang, to)}` : '' });
}

function CandidateRow(props: { c: LtpfCandidate; selected: boolean; onUse: () => void }) {
  const { t, lang } = useT();
  const r = props.c.record;
  const mark = (x: string) => t(`ltpf.check.${x as 'match' | 'mismatch' | 'unknown'}`);
  return (
    <div class={`candidate ${props.selected ? 'selected' : ''}`}>
      <div class="meta">
        <div>
          <strong>{props.c.criterion === 'residual' ? t('ltpf.criterion.residual') : `${r.model} ${r.version}`}</strong>{' '}
          {r.engine_label ?? ''} {r.transmission ?? ''} {r.model_year_tag ? `(${r.model_year_tag})` : ''}
        </div>
        <div class="small muted">
          {props.c.criterion === 'residual'
            ? `${r.notes ?? ''} · `
            : props.c.criterion === 'epsilon'
              ? `${r.list_label ?? ''} · ${r.notes ?? ''} · `
              : `${listLabel(t, lang, r.valid_from, r.valid_to)} · `}
          {t('ltpf.checks', {
            displacement: mark(props.c.checks.displacement),
            power: mark(props.c.checks.power),
            co2: `${r.co2_g_km ?? '—'} ${mark(props.c.checks.co2)}`,
            fuel: mark(props.c.checks.fuel),
            gearbox: mark(props.c.checks.gearbox),
          })}
        </div>
      </div>
      <div class="candidate-actions">
        <span class="num">{fmt.money(lang, Math.round(r.ltpf_eur * 100), 2)}</span>
        {props.c.official ? <span class="badge official">{t('ltpf.official')}</span> : <span class="badge estimate">{t('ltpf.estimate')}</span>}
        <button type="button" onClick={props.onUse} disabled={props.selected}>
          {t('ltpf.useThis')}
        </button>
      </div>
    </div>
  );
}

export function TaxInputs(props: { form: FormState; set: SetField; lookup: LtpfLookupResult | null; onUseCandidate: (c: LtpfCandidate) => void; missing: Set<string> }) {
  const { t, lang } = useT();
  const { form: f, set, lookup } = props;
  const criterionText = f.ltpf.criterion ? t(`ltpf.criterion.${f.ltpf.criterion}`) : null;
  const noneText =
    lookup?.status === 'none'
      ? lookup.reason === 'brand-not-in-table'
        ? t('ltpf.none.brand')
        : lookup.reason === 'model-not-in-table'
          ? t('ltpf.none.model')
          : lookup.reason === 'missing-make-model' || lookup.reason === 'missing-first-registration'
            ? t('ltpf.none.input')
            : t('ltpf.none.match')
      : null;
  return (
    <section class="card" aria-labelledby="sec-tax">
      <h2 id="sec-tax">{t('section.tax')}</h2>
      <div class="fields">
        <Labeled class="full" label={t('field.expectedRegistration')} hint={t('field.expectedRegistration.hint')}>
          <input type="date" value={f.expectedRegistration} onInput={(e) => e.currentTarget.value && set('expectedRegistration', e.currentTarget.value)} />
        </Labeled>
        <Labeled class="full" label={t('field.ltpf')} badge={<LtpfBadge form={f} />} missing={props.missing.has('ltpf')}>
          <EuroInput step={0.01} cents={f.ltpfCents} onChange={(v) => set('ltpfCents', v)} />
        </Labeled>
      </div>
      {f.ltpf.origin === 'table' && f.ltpf.recordId ? (
        <p class="small muted" style={{ margin: '4px 0 0' }}>
          {[f.ltpf.label, listLabel(t, lang, f.ltpf.listFrom, f.ltpf.listTo), criterionText].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {noneText && f.ltpfCents === null ? <p class="small muted">{noneText}</p> : null}
      {lookup && lookup.candidates.length > 1 ? (
        <div>
          <p class="small" style={{ margin: '6px 0 0' }}>
            {t(lookup.status === 'single' ? 'ltpf.autoPicked' : f.edited.includes('ltpf') ? 'ltpf.choose' : 'ltpf.autoPickedTop', { n: lookup.candidates.length })}
            {lookup.criterion && lookup.criterion !== 'exact' ? <span class="muted"> ({t(`ltpf.criterion.${lookup.criterion}`)})</span> : null}
          </p>
          <div class="candidates">
            {lookup.candidates.map((c) => (
              <CandidateRow c={c} selected={f.ltpf.recordId === c.record.id} onUse={() => props.onUseCandidate(c)} />
            ))}
          </div>
        </div>
      ) : null}
      <div class="fields" style={{ marginTop: '6px' }}>
        <Labeled class="full" label={t('field.extras')} hint={t('ltpf.extrasNote')}>
          <EuroInput step={0.01} cents={f.extrasCents} onChange={(v) => set('extrasCents', v ?? 0)} />
        </Labeled>
      </div>
    </section>
  );
}

export function TaxResult(props: { tax: RegistrationTaxResult | null }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const r = props.tax;
  if (!r) return null;
  if (!r.ok) {
    if (r.reason === 'no-rules-version') return <Banner kind="bad">{t('missing.noRules', { date: fmt.date(lang, r.date) })}</Banner>;
    return null;
  }
  const catName = t(`body.${r.depreciation.bodyCategory}`);
  return (
    <section class="card" aria-labelledby="sec-taxres">
      <h2 id="sec-taxres">
        {t('tax.title')} <span class="spacer" />
        <span class="num" style={{ fontSize: '16px' }}>
          {fmt.money(lang, r.registrationTaxCents, 2)}
        </span>
      </h2>
      <table class="lines">
        <tbody>
          {r.exemption ? (
            <tr class="sub">
              <td>{r.exemption.note}</td>
              <td class="num">−{r.exemption.pct}%</td>
            </tr>
          ) : null}
          {r.environmentalFeeCents > 0 ? (
            <tr>
              <td>
                {t('tax.envFee')} <span class="badge verify">{t('common.verify')}</span>
              </td>
              <td class="num">{fmt.money(lang, r.environmentalFeeCents)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <button type="button" class="link small" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? t('tax.hideSteps') : t('tax.showSteps')}
      </button>
      {open ? (
        <table class="lines small" style={{ marginTop: '6px' }}>
          <tbody>
            <tr class="sub">
              <td colSpan={2}>{t('tax.age', { years: fmt.num(lang, r.ageMonths / 12, 2), months: fmt.num(lang, r.ageMonths, 1) })}</td>
            </tr>
            <tr>
              <td>{t('tax.base')}</td>
              <td class="num">{fmt.money(lang, r.baseValueCents, 2)}</td>
            </tr>
            <tr>
              <td>{t('tax.depreciation', { cat: catName })}</td>
              <td class="num">−{fmt.pct(lang, r.depreciation.pct)}</td>
            </tr>
            <tr>
              <td>{t('tax.mileageReduction', { km: fmt.num(lang, r.mileage.excessKm) })}</td>
              <td class="num">−{fmt.pct(lang, r.mileage.pct)}</td>
            </tr>
            {r.depreciationCapped ? (
              <tr class="sub">
                <td colSpan={2}>{t('tax.capped')}</td>
              </tr>
            ) : null}
            <tr>
              <td>
                <strong>{t('tax.taxable')}</strong>
              </td>
              <td class="num">
                <strong>{fmt.money(lang, r.taxableValueCents, 2)}</strong>
              </td>
            </tr>
            <tr>
              <td>{r.co2.notProven ? t('tax.co2notProven') : t('tax.co2adj', { cycle: r.co2.cycle ?? '', gkm: r.co2.gKm ?? '—' })}</td>
              <td class="num">{r.co2.adjustPct > 0 ? '+' : ''}{r.co2.adjustPct}%</td>
            </tr>
            <tr>
              <td>{t('tax.euroadj', { cls: r.euro.effective ?? '—' })}</td>
              <td class="num">+{r.euro.adjustPct}%</td>
            </tr>
            <tr class="sub">
              <td>{t('tax.multiplier')}</td>
              <td class="num">× {fmt.num(lang, r.rateMultiplier, 4)}</td>
            </tr>
            {r.brackets.map((b) => (
              <tr class="sub">
                <td>
                  {b.toEur === null
                    ? t('tax.bracketTop', { from: fmt.num(lang, b.fromEur), rate: fmt.num(lang, b.adjustedRatePct, 2) })
                    : t('tax.bracket', { from: fmt.num(lang, b.fromEur), to: fmt.num(lang, b.toEur), rate: fmt.num(lang, b.adjustedRatePct, 2) })}
                </td>
                <td class="num">{fmt.money(lang, Math.round(b.taxCents), 2)}</td>
              </tr>
            ))}
            <tr>
              <td>{t('tax.effectiveRate')}</td>
              <td class="num">{fmt.pct(lang, r.effectiveRatePct)}</td>
            </tr>
            <tr>
              <td>{t('tax.beforeExemption')}</td>
              <td class="num">{fmt.money(lang, r.taxBeforeExemptionCents, 2)}</td>
            </tr>
            {r.exemption ? (
              <tr>
                <td>{t('tax.exemption', { pct: r.exemption.pct })}</td>
                <td class="num">−{fmt.money(lang, r.taxBeforeExemptionCents - r.registrationTaxCents, 2)}</td>
              </tr>
            ) : null}
            <tr class="total">
              <td>{t('tax.final')}</td>
              <td class="num">{fmt.money(lang, r.registrationTaxCents, 2)}</td>
            </tr>
            <tr class="sub">
              <td colSpan={2}>
                {t('tax.rules', { id: r.rulesVersionId })}
                {r.rulesSummary ? ` — ${r.rulesSummary}` : ''}
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
