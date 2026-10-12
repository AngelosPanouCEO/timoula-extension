/**
 * car.gr results page reader — the (d) market provider, OFF by default
 * (docs/market-value.md). Reads the result rows car.gr embeds in the page
 * (Nuxt payload: pinia.classifiedsSearch.rows) — only the page the client opened.
 * Fallback: price-like elements in the visible results.
 */

export interface CarGrRow {
  priceCents: number;
  title: string | null;
  registration: string | null;
  mileageKm: number | null;
  fuel: string | null;
  /** Price shown without VAT (business seller): not comparable with private prices. */
  withoutVat: boolean;
  crashed: boolean;
  isNew: boolean;
}

export interface CarGrResults {
  source: 'nuxt' | 'dom' | 'none';
  rows: CarGrRow[];
  /** Total results of the search (all pages), when car.gr states it. */
  total: number | null;
  page: number | null;
  perPage: number | null;
}

const SPECIAL = new Set(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef']);

/** Decode Nuxt's devalue payload (flat array, values reference indices). */
export function decodeDevalue(arr: unknown[]): unknown {
  const memo = new Map<number, unknown>();
  const hydrate = (i: number): unknown => {
    if (i < 0) return i === -3 ? NaN : i === -4 ? Infinity : i === -5 ? -Infinity : i === -6 ? -0 : i === -2 ? null : undefined;
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      const tag = v[0];
      if (typeof tag === 'string' && SPECIAL.has(tag)) {
        const r = v.length > 1 ? hydrate(v[1] as number) : undefined;
        memo.set(i, r);
        return r;
      }
      if (tag === 'EmptyRef' || tag === 'EmptyShallowRef') return undefined;
      if (tag === 'Date') return v[1];
      if (tag === 'Set') {
        const out: unknown[] = [];
        memo.set(i, out);
        for (const x of v.slice(1)) out.push(hydrate(x as number));
        return out;
      }
      if (tag === 'Map') {
        const out: Record<string, unknown> = {};
        memo.set(i, out);
        for (let k = 1; k < v.length; k += 2) out[String(hydrate(v[k] as number))] = hydrate(v[k + 1] as number);
        return out;
      }
      const out: unknown[] = [];
      memo.set(i, out);
      for (const x of v) out.push(typeof x === 'number' ? hydrate(x) : x);
      return out;
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      memo.set(i, out);
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = typeof x === 'number' ? hydrate(x) : x;
      return out;
    }
    memo.set(i, v);
    return v;
  };
  return hydrate(0);
}

const kmOf = (s: unknown) => {
  const m = /([\d.]+)\s*(χλμ|km)/i.exec(String(s ?? ''));
  return m ? Number(m[1]!.replace(/\./g, '')) : null;
};

function fromNuxt(doc: Document): CarGrResults | null {
  const el = doc.getElementById('__NUXT_DATA__');
  if (!el?.textContent) return null;
  let root: unknown;
  try {
    root = decodeDevalue(JSON.parse(el.textContent) as unknown[]);
  } catch {
    return null;
  }
  const search = (root as { pinia?: { classifiedsSearch?: Record<string, unknown> } })?.pinia?.classifiedsSearch;
  const rows = search?.rows;
  if (!Array.isArray(rows)) return null;
  const out: CarGrRow[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const price = typeof r.rawPrice === 'number' ? r.rawPrice : null;
    if (!price || price < 100) continue; // "price on request" etc.
    out.push({
      priceCents: Math.round(price * 100),
      title: typeof r.title === 'string' ? r.title : null,
      registration: typeof r.registration === 'string' ? r.registration.replace(/\s/g, '') : null,
      mileageKm: kmOf(r.mileage),
      fuel: typeof r.fueltype === 'string' ? r.fueltype : null,
      withoutVat: r.withoutVat === true,
      crashed: r.crashed === true,
      isNew: r.isNew === true,
    });
  }
  const stats = search?.stats as { total?: number } | undefined;
  const pag = search?.pagination as { total?: number; page?: number; perPage?: number } | undefined;
  return { source: 'nuxt', rows: out, total: stats?.total ?? pag?.total ?? null, page: pag?.page ?? null, perPage: pag?.perPage ?? null };
}

function fromDom(doc: Document): CarGrResults {
  const rows: CarGrRow[] = [];
  const seen: Element[] = [];
  for (const el of Array.from(doc.querySelectorAll('[class*="price" i], [data-testid*="price" i], [itemprop="price"]'))) {
    if (seen.some((s) => s.contains(el) || el.contains(s))) continue;
    if (el.closest('select, option, form, nav, header, footer, aside')) continue;
    const text = (el.getAttribute('content') ?? el.textContent ?? '').replace(/\s+/g, ' ');
    const m = /(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*€/.exec(text);
    if (!m) continue;
    const eur = Number(m[1]!.replace(/\./g, ''));
    if (eur < 500 || eur > 2_000_000) continue;
    rows.push({ priceCents: eur * 100, title: null, registration: null, mileageKm: null, fuel: null, withoutVat: false, crashed: false, isNew: false });
    seen.push(el);
  }
  return { source: rows.length ? 'dom' : 'none', rows, total: null, page: null, perPage: null };
}

export function readCarGrResults(doc: Document): CarGrResults {
  return fromNuxt(doc) ?? fromDom(doc);
}
