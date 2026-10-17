/**
 * Local database (IndexedDB): calculation history and the client's own ΛΤΠΦ records.
 * Nothing here leaves the browser in phase 1.
 */
import { mergeListingEntries } from './historyMerge';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { PRODUCT, type CalculationInputs, type CostBreakdown, type ListingData, type LtpfCriterion, type LtpfRecord, type MarketComparison, type RegistrationTaxBreakdown, type Verdict } from '@timoula/core';

export interface LtpfChoice {
  /** How the ΛΤΠΦ value was obtained. */
  origin: 'table' | 'manual';
  recordId: string | null;
  criterion: LtpfCriterion | null;
  official: boolean;
  label: string | null;
  listFrom: string | null;
  listTo: string | null;
}

/** Everything the client confirmed or changed in the popup form, besides CalculationInputs. */
export interface FormMeta {
  make: string | null;
  model: string | null;
  version: string | null;
  vin: string | null;
  fuel: string | null;
  displacementCc: number | null;
  powerKw: number | null;
  gearbox: string | null;
  powertrainConfirmed: boolean;
  commercialOverride: boolean;
  ltpf: LtpfChoice;
  /** CO2 was copied from the chosen price-list version (the listing had none). */
  co2FromLtpf?: boolean;
  /** …from the same version in the list of this date (the chosen list prints no CO2). */
  co2ListFrom?: string | null;
  /** Field names the client edited by hand. */
  editedFields: string[];
}

export interface HistoryEntry {
  id: string;
  /** `${site}:${listingId}` – used to recognise a reopened listing. */
  listingKey: string;
  createdAt: string;
  updatedAt: string;
  site: ListingData['site'];
  url: string;
  title: string | null;
  photoUrl: string | null;
  countryCode: string | null;
  /** Data as read from the page (no seller names, phones or descriptions). */
  listing: ListingData;
  inputs: CalculationInputs;
  meta: FormMeta;
  tax: RegistrationTaxBreakdown | null;
  costs: CostBreakdown | null;
  market: MarketComparison | null;
  verdicts: { A: Verdict; B: Verdict } | null;
  notes: string;
  status: 'complete' | 'incomplete';
  /** Price seen each time the listing was opened. */
  priceHistory: { at: string; priceCents: number }[];
  rulesVersionId: string | null;
  rulesRevision: string;
  appVersion: string;
  /** Reserved for phase 3 (Request VIN flow). */
  vinStatus?: 'none' | 'waiting' | 'received';
}

interface Schema extends DBSchema {
  calculations: {
    key: string;
    value: HistoryEntry;
    indexes: { byListing: string; byUpdated: string };
  };
  ltpf: {
    key: string;
    value: LtpfRecord;
  };
}

const DB_NAME = `${PRODUCT.slug}-db`;
let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(database) {
      const calc = database.createObjectStore('calculations', { keyPath: 'id' });
      calc.createIndex('byListing', 'listingKey');
      calc.createIndex('byUpdated', 'updatedAt');
      database.createObjectStore('ltpf', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export async function saveEntry(entry: HistoryEntry): Promise<void> {
  await (await db()).put('calculations', entry);
}

export async function getEntry(id: string): Promise<HistoryEntry | undefined> {
  return (await db()).get('calculations', id);
}

export async function allEntries(): Promise<HistoryEntry[]> {
  return (await db()).getAll('calculations');
}

export async function entriesForListing(listingKey: string): Promise<HistoryEntry[]> {
  const list = await (await db()).getAllFromIndex('calculations', 'byListing', listingKey);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The single entry of a listing (merging any duplicates left by older versions). */
export async function entryForListing(listingKey: string): Promise<HistoryEntry | null> {
  const list = await entriesForListing(listingKey);
  if (!list.length) return null;
  const { keep, remove } = mergeListingEntries(list);
  if (remove.length) {
    const tx = (await db()).transaction('calculations', 'readwrite');
    await Promise.all([tx.store.put(keep), ...remove.map((id) => tx.store.delete(id)), tx.done]);
  }
  return keep;
}

/** Merge duplicate entries of every listing. Returns how many entries were removed. */
export async function dedupeHistory(): Promise<number> {
  const all = await allEntries();
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of all) groups.set(e.listingKey, [...(groups.get(e.listingKey) ?? []), e]);
  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const { keep, remove } = mergeListingEntries(list);
    const tx = (await db()).transaction('calculations', 'readwrite');
    await Promise.all([tx.store.put(keep), ...remove.map((id) => tx.store.delete(id)), tx.done]);
    removed += remove.length;
  }
  return removed;
}

export async function deleteEntry(id: string): Promise<void> {
  await (await db()).delete('calculations', id);
}

export async function customLtpfRecords(): Promise<LtpfRecord[]> {
  return (await db()).getAll('ltpf');
}

export async function putLtpfRecords(records: LtpfRecord[]): Promise<void> {
  const tx = (await db()).transaction('ltpf', 'readwrite');
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
}

export async function clearLtpfRecords(): Promise<void> {
  await (await db()).clear('ltpf');
}

export async function deleteAllData(): Promise<void> {
  const d = await db();
  await d.clear('calculations');
  await d.clear('ltpf');
}

export const listingKeyOf = (l: Pick<ListingData, 'site' | 'listingId'>) => `${l.site}:${l.listingId}`;

export function newId(): string {
  return crypto.randomUUID();
}
