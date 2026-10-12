/** Small shared Preact components. */
import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { FieldSource, Lang } from '@timoula/core';
import { translate, type I18nKey } from './i18n';

export const LangContext = createContext<Lang>('el');

export function useT() {
  const lang = useContext(LangContext);
  return { lang, t: (key: I18nKey, params?: Record<string, string | number>) => translate(lang, key, params) };
}

export function SourceBadge({ source, empty }: { source: FieldSource | null; empty?: boolean }) {
  const { t } = useT();
  if (empty || !source) return <span class="badge empty">{t('source.empty')}</span>;
  if (source === 'user') return <span class="badge user">{t('source.user')}</span>;
  if (source === 'derived') return <span class="badge">{t('source.derived')}</span>;
  return <span class="badge page">{t('source.page')}</span>;
}

export function Labeled(props: { label: string; badge?: ComponentChildren; children: ComponentChildren; class?: string; hint?: ComponentChildren; missing?: boolean }) {
  return (
    <label class={`field ${props.class ?? ''} ${props.missing ? 'missing' : ''}`}>
      <span class="field-label">
        <span>{props.label}</span>
        {props.badge}
      </span>
      {props.children}
      {props.hint ? <span class="small muted">{props.hint}</span> : null}
    </label>
  );
}

export function Banner(props: { kind: 'info' | 'warn' | 'bad' | 'good'; title?: string; children?: ComponentChildren }) {
  return (
    <div class={`banner ${props.kind}`} role={props.kind === 'bad' ? 'alert' : 'status'}>
      {props.title ? <h3>{props.title}</h3> : null}
      {props.children}
    </div>
  );
}

export function NumberInput(props: { value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; placeholder?: string; ariaLabel?: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={props.step ?? 1}
      min={props.min ?? 0}
      value={props.value ?? ''}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      onInput={(e) => {
        const raw = (e.currentTarget as HTMLInputElement).value;
        const n = raw === '' ? null : Number(raw);
        props.onChange(n === null || !Number.isFinite(n) ? null : n);
      }}
    />
  );
}

/** Euro amount input bound to cents. */
export function EuroInput(props: { cents: number | null; onChange: (c: number | null) => void; ariaLabel?: string; step?: number }) {
  return (
    <NumberInput
      ariaLabel={props.ariaLabel}
      step={props.step ?? 1}
      value={props.cents === null ? null : props.cents / 100}
      onChange={(v) => props.onChange(v === null ? null : Math.round(v * 100))}
    />
  );
}

export function Toast({ text }: { text: string | null }) {
  return text ? (
    <div class="toast" role="status">
      {text}
    </div>
  ) : null;
}
