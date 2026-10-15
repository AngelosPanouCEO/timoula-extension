import { BODY_CATEGORIES, COUNTRY_NAMES, EURO_CLASSES, suggestBodyCategory, type Field, type ListingData, type PowertrainSuggestion } from '@timoula/core';
import { EuroInput, Labeled, NumberInput, SourceBadge, useT } from '../shared/ui';
import type { FormState } from './form';

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K], markEdited?: boolean) => void;

const FUELS = ['petrol', 'diesel', 'petrol_electric', 'diesel_electric', 'electric', 'lpg', 'cng', 'hydrogen', 'other'] as const;
const POWERTRAINS = ['ICE', 'MHEV', 'HEV', 'PHEV', 'BEV', 'FCEV'] as const;

export function VehicleSection(props: { listing: ListingData; form: FormState; set: SetField; powertrain: PowertrainSuggestion; missing: Set<string> }) {
  const { t, lang } = useT();
  const { listing: l, form: f, set } = props;
  const badge = (key: keyof FormState, field: Field<unknown> | null) => {
    if (f.edited.includes(key)) return <SourceBadge source="user" />;
    const value = f[key];
    if (value === null || value === undefined || value === '') return <SourceBadge source={null} empty />;
    return <SourceBadge source={field?.source ?? null} />;
  };
  const body = suggestBodyCategory(l.bodyTypeRaw.value);
  const countryOptions = Object.keys(COUNTRY_NAMES).sort((a, b) => COUNTRY_NAMES[a]![lang].localeCompare(COUNTRY_NAMES[b]![lang], lang));
  const signalsText = props.powertrain.signals.map((s) => `${s.evidence} → ${s.powertrain}`).join(' · ');

  return (
    <section class="card" aria-labelledby="sec-vehicle">
      <h2 id="sec-vehicle">{t('section.vehicle')}</h2>
      <div class="fields">
        <Labeled label={t('field.make')} badge={badge('make', l.make)}>
          <input value={f.make ?? ''} onInput={(e) => set('make', e.currentTarget.value || null)} />
        </Labeled>
        <Labeled label={t('field.model')} badge={badge('model', l.model)}>
          <input value={f.model ?? ''} onInput={(e) => set('model', e.currentTarget.value || null)} />
        </Labeled>
        <Labeled class="full" label={t('field.version')} badge={badge('version', l.version)}>
          <input value={f.version ?? ''} onInput={(e) => set('version', e.currentTarget.value || null)} />
        </Labeled>
        <Labeled label={t('field.price')} badge={badge('priceCents', l.priceCents)} missing={props.missing.has('price')}>
          <EuroInput cents={f.priceCents} onChange={(v) => set('priceCents', v)} />
        </Labeled>
        <Labeled label={t('field.priceNet')} badge={f.priceNetCents !== null ? badge('priceNetCents', l.priceNetCents) : <span class="badge">{t('common.optional')}</span>} missing={props.missing.has('netPrice')}>
          <EuroInput cents={f.priceNetCents} onChange={(v) => set('priceNetCents', v)} />
        </Labeled>
        <Labeled
          label={t('field.firstRegistration')}
          badge={badge('firstRegistration', l.firstRegistration)}
          missing={props.missing.has('firstRegistration')}
          hint={l.firstRegistrationDayAssumed && !f.edited.includes('firstRegistration') ? t('field.firstRegistration.assumed') : null}
        >
          <input type="date" value={f.firstRegistration ?? ''} onInput={(e) => set('firstRegistration', e.currentTarget.value || null)} />
        </Labeled>
        <Labeled label={t('field.mileage')} badge={badge('mileageKm', l.mileageKm)} missing={props.missing.has('mileage')}>
          <NumberInput value={f.mileageKm} onChange={(v) => set('mileageKm', v)} />
        </Labeled>
        <Labeled label={t('field.fuel')} badge={badge('fuel', l.fuel)}>
          <select value={f.fuel ?? ''} onChange={(e) => set('fuel', (e.currentTarget.value || null) as FormState['fuel'])}>
            <option value="">{t('option.select')}</option>
            {FUELS.map((x) => (
              <option value={x}>{t(`fuel.${x}`)}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label={t('field.gearbox')} badge={badge('gearbox', l.gearbox)}>
          <select value={f.gearbox ?? ''} onChange={(e) => set('gearbox', (e.currentTarget.value || null) as FormState['gearbox'])}>
            <option value="">{t('option.select')}</option>
            <option value="manual">{t('gear.manual')}</option>
            <option value="automatic">{t('gear.automatic')}</option>
          </select>
        </Labeled>
        <Labeled label={t('field.cc')} badge={badge('displacementCc', l.displacementCc)}>
          <NumberInput value={f.displacementCc} onChange={(v) => set('displacementCc', v)} />
        </Labeled>
        <Labeled label={`${t('field.kw')} / ${t('field.hp')}`} badge={badge('powerKw', l.powerKw)}>
          <div class="row">
            <NumberInput ariaLabel={t('field.kw')} value={f.powerKw} onChange={(v) => set('powerKw', v)} />
            <NumberInput ariaLabel={t('field.hp')} value={f.powerHp} onChange={(v) => set('powerHp', v)} />
          </div>
        </Labeled>
        <Labeled
          label={t('field.co2')}
          badge={f.co2FromLtpf ? <span class="badge">{t('source.ltpf')}</span> : badge('co2GKm', l.co2GKm)}
          missing={props.missing.has('co2')}
          hint={f.co2FromLtpf ? t('field.co2.fromLtpf') : t('field.co2.hint')}
        >
          <NumberInput value={f.co2GKm} onChange={(v) => set('co2GKm', v)} />
        </Labeled>
        <Labeled label={t('field.euro')} badge={badge('euroClass', l.euroClass)} missing={props.missing.has('euroClass')}>
          <select value={f.euroClass ?? ''} onChange={(e) => set('euroClass', (e.currentTarget.value || null) as FormState['euroClass'])}>
            <option value="">{t('option.select')}</option>
            {EURO_CLASSES.map((x) => (
              <option value={x}>{x === 'none' ? t('euro.none') : `Euro ${x.replace('-temp', '-TEMP')}`}</option>
            ))}
          </select>
        </Labeled>
        <Labeled
          label={t('field.body')}
          badge={f.edited.includes('bodyCategory') ? <SourceBadge source="user" /> : f.bodyCategory ? <SourceBadge source="derived" /> : <SourceBadge source={null} empty />}
          missing={props.missing.has('bodyCategory')}
          hint={l.bodyTypeRaw.value && (!body.confident || !f.bodyCategory) ? t('field.body.hint', { raw: l.bodyTypeRaw.value }) : null}
        >
          <select value={f.bodyCategory ?? ''} onChange={(e) => set('bodyCategory', (e.currentTarget.value || null) as FormState['bodyCategory'])}>
            <option value="">{t('option.select')}</option>
            {BODY_CATEGORIES.map((x) => (
              <option value={x}>{t(`body.${x}`)}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label={t('field.country')} badge={badge('countryCode', l.countryCode)} missing={props.missing.has('country')}>
          <select value={f.countryCode ?? ''} onChange={(e) => set('countryCode', e.currentTarget.value || null)}>
            <option value="">{t('option.select')}</option>
            {countryOptions.map((c) => (
              <option value={c}>{COUNTRY_NAMES[c]![lang]}</option>
            ))}
          </select>
        </Labeled>
        <Labeled class="full" label={t('field.powertrain')} badge={f.powertrainConfirmed ? <SourceBadge source={f.edited.includes('powertrain') ? 'user' : 'derived'} /> : f.powertrain ? <span class="badge confirm">{t('source.confirm')}</span> : <SourceBadge source={null} empty />} missing={props.missing.has('powertrain')} hint={signalsText ? t('field.powertrain.signals', { signals: signalsText }) : null}>
          <div class="row wrap">
            <select style={{ width: '230px' }} value={f.powertrain ?? ''} onChange={(e) => set('powertrain', (e.currentTarget.value || null) as FormState['powertrain'])}>
              <option value="">{t('option.select')}</option>
              {POWERTRAINS.map((x) => (
                <option value={x}>{t(`pt.${x}`)}</option>
              ))}
            </select>
            {!f.powertrainConfirmed || props.powertrain.needsConfirmation ? (
              <label class="row small">
                <input type="checkbox" checked={f.powertrainConfirmed} onChange={(e) => set('powertrainConfirmed', e.currentTarget.checked)} />
                {t('field.powertrain.confirm')}
              </label>
            ) : null}
            {f.powertrain === 'MHEV' ? (
              <label class="row small">
                <input type="checkbox" checked={f.mhevCountsAsHybrid} onChange={(e) => set('mhevCountsAsHybrid', e.currentTarget.checked)} />
                {t('field.mhev')}
              </label>
            ) : null}
          </div>
        </Labeled>
        <Labeled class="full" label={t('field.vin')} badge={f.vin ? badge('vin', l.vin) : <span class="badge">{t('common.optional')}</span>}>
          <input value={f.vin ?? ''} maxLength={17} onInput={(e) => set('vin', e.currentTarget.value.toUpperCase() || null)} />
        </Labeled>
      </div>
    </section>
  );
}
