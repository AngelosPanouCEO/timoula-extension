/**
 * Reading Next.js data embedded in the page:
 *  - classic pages: <script id="__NEXT_DATA__"> JSON (AutoScout24)
 *  - app router: self.__next_f.push([1,"..."]) flight chunks (mobile.de)
 */

export function readNextData(doc: Document): Record<string, unknown> | null {
  const el = doc.getElementById('__NEXT_DATA__');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Concatenate the string payloads of all self.__next_f.push([1,"..."]) scripts. */
export function readFlightPayload(doc: Document): string {
  let out = '';
  for (const s of Array.from(doc.querySelectorAll('script'))) {
    const text = (s.textContent ?? '').trim();
    const m = /^\(?self\.__next_f(?:=self\.__next_f\|\|\[\])?\)?\.push\(([\s\S]*)\)\s*;?$/.exec(text);
    if (!m) continue;
    try {
      const arr = JSON.parse(m[1]!) as unknown[];
      if (typeof arr[1] === 'string') out += arr[1];
    } catch {
      /* chunk that is not plain JSON: skip */
    }
  }
  return out;
}

/** Return the balanced JSON object/array text starting at index `start` ('{' or '['), or null. */
export function balancedJsonAt(s: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** Every JSON object that follows `"key":` in the payload and parses cleanly. */
export function objectsAfterKey(payload: string, key: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const needle = `"${key}":{`;
  let idx = payload.indexOf(needle);
  while (idx !== -1) {
    const text = balancedJsonAt(payload, idx + needle.length - 1);
    if (text) {
      try {
        out.push(JSON.parse(text) as Record<string, unknown>);
      } catch {
        /* not plain JSON */
      }
    }
    idx = payload.indexOf(needle, idx + needle.length);
  }
  return out;
}
