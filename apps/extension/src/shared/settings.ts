/** App settings in chrome.storage.local (small, non-personal). */
import { OUTDATED_CARGR_TEMPLATES, DEFAULT_CARGR_SETTINGS, DEFAULT_COST_SETTINGS, type CarGrSettings, type CostSettings, type Lang } from '@timoula/core';
import { detectLang } from './i18n';

export interface AppSettings {
  schema: 1;
  lang: Lang;
  costs: CostSettings;
  cargr: CarGrSettings;
}

const KEY = 'settings.v1';

export function defaultSettings(): AppSettings {
  return { schema: 1, lang: detectLang(), costs: structuredClone(DEFAULT_COST_SETTINGS), cargr: structuredClone(DEFAULT_CARGR_SETTINGS) };
}

/** Merge stored values over defaults so new settings get their default after an update. */
function merge(stored: Partial<AppSettings> | undefined): AppSettings {
  const d = defaultSettings();
  if (!stored || stored.schema !== 1) return d;
  return {
    schema: 1,
    lang: stored.lang === 'en' || stored.lang === 'el' ? stored.lang : d.lang,
    costs: { ...d.costs, ...stored.costs, driveBackByCountry: { ...d.costs.driveBackByCountry, ...stored.costs?.driveBackByCountry } },
    cargr: {
      ...d.cargr,
      ...stored.cargr,
      // Not editable in the UI; stored copies are old defaults ("petrol", "hybrid"…), so always use the current ones.
      fuelCodes: d.cargr.fuelCodes,
      // An untouched old default is upgraded; a template the client edited is kept.
      urlTemplate: stored.cargr?.urlTemplate && !OUTDATED_CARGR_TEMPLATES.includes(stored.cargr.urlTemplate) ? stored.cargr.urlTemplate : d.cargr.urlTemplate,
    },
  };
}

const hasChromeStorage = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function loadSettings(): Promise<AppSettings> {
  try {
    if (hasChromeStorage()) {
      const res = await chrome.storage.local.get(KEY);
      return merge(res[KEY] as Partial<AppSettings> | undefined);
    }
    const raw = localStorage.getItem(KEY);
    return merge(raw ? (JSON.parse(raw) as Partial<AppSettings>) : undefined);
  } catch {
    return defaultSettings();
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  if (hasChromeStorage()) await chrome.storage.local.set({ [KEY]: s });
  else localStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearSettings(): Promise<void> {
  if (hasChromeStorage()) await chrome.storage.local.clear();
  else localStorage.removeItem(KEY);
}
