/** Rules and ΛΤΠΦ data used by the UI (phase 2: refreshed from the backend and cached). */
import { bundledLtpfDataset, bundledTaxRules, type LtpfRecord, type TaxRules } from '@timoula/core';
import { customLtpfRecords } from './db';

export function taxRules(): TaxRules {
  return bundledTaxRules();
}

/** Shipped records plus the client's imported ones (same id → imported wins). */
export async function ltpfRecords(): Promise<LtpfRecord[]> {
  const byId = new Map(bundledLtpfDataset().records.map((r) => [r.id, r]));
  try {
    for (const r of await customLtpfRecords()) byId.set(r.id, r);
  } catch {
    /* IndexedDB unavailable: shipped data only */
  }
  return [...byId.values()];
}

export const APP_VERSION = typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : 'dev';
