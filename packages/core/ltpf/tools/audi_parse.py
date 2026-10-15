#!/usr/bin/env python3
"""
Parse Audi Hellas (Kosmocar) price lists into ΛΤΠΦ rows.

Usage: python3 -I audi_parse.py <dir with the PDFs> <out.json>

Each list is read with `pdftotext -layout`. A row is a line with a 6-character Audi
model code, the version text and numeric columns. The ΛΤΠΦ column is found by
arithmetic, not by position, because the column layout changed many times since 2005:
  - ΦΠΑ = ΛΤΠΦ × VAT rate (19/21/23/24%) within 1 €, and
  - τελική τιμή = ΛΤΠΦ + ΦΠΑ + τέλος ταξινόμησης (+ φόρος πολυτελείας) within 2 €.
The VAT check ("vat_ok") proves the ΛΤΠΦ was read as printed; the total ("total_ok") is an
extra check (a few lists print totals that do not add up, e.g. A5 Coupé in 08/2016). Lists that print only the ΛΤΠΦ (2023+) are
checked by a second, independent read of the PDF (pdfplumber) in audi_verify.py.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

CODE_RE = re.compile(r'^[0-9A-Z]{6}$')
NUM_RE = re.compile(r'^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$')
TYPE_RE = re.compile(r'^[A-Z0-9]{1,3} [0-9A-ZΑ-Ω]{2}$')
NOTE_RE = re.compile(r'^[A-Za-zΑ-Ωα-ωΆ-ώ .\-]+$')
PCT_RE = re.compile(r'^[-+]?\d+(?:,\d+)?\s?%$')
TRIPLE_RE = re.compile(r'^(-|[\d.]*)/(\d+)/(\d+)$')
DATE_RE = re.compile(r'(\d{1,2})/(\d{1,2})/(\d{4})')
VAT_RATES = (0.24, 0.23, 0.21, 0.19, 0.18)


def num(s):
    """Greek number format: 17.933,18 → 17933.18; 13.219 → 13219."""
    s = s.replace('.', '').replace(',', '.')
    v = float(s)
    return int(v) if v.is_integer() else v


def iso(d, m, y):
    return f'{int(y):04d}-{int(m):02d}-{int(d):02d}'


def file_date(name):
    m = re.search(r'(\d{4})_(\d{2})_(\d{2})', name)
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else None


def page_valid_from(page):
    # The customs filing header ("Ημερομηνία έναρξης") wins over the title line, which is
    # sometimes copied from the previous list (12/2018: title 10/12, filing 18/12).
    for pat in (r'[Έέ]ναρξης\s*:\s*(\d{1,2}/\d{1,2}/\d{4})', r'ΙΣΧΥΕΙ ΑΠΟ:?\s*(\d{1,2}/\d{1,2}/\d{4})'):
        m = re.search(pat, page)
        if m:
            d = DATE_RE.search(m.group(1))
            return iso(d.group(1), d.group(2), d.group(3))
    return None


def page_protocol(page):
    for pat in (r'Αριθ(?:μ)?\.?\s*Πρωτ\.?\s*:?\s*(\d+)', r'Αρ\.\s*Πρ\.?\s*:?\s*(\d+)', r'Αριθμός Πρωτοκόλλου:\s*\n?\s*([\d]+\s*ΕΙ\s*\d{4})'):
        m = re.search(pat, page)
        if m:
            return re.sub(r'\s+', ' ', m.group(1)).strip()
    return None


def page_my(page):
    m = re.search(r'\(?MY\s?(\d{2,4})\)?', page)
    if not m:
        return None
    y = m.group(1)
    return 'MY' + (y[-2:])


def cells_of(line):
    return [c.strip() for c in re.split(r'\s{2,}', line.strip()) if c.strip()]


def parse_row(line):
    """Return a dict for a price row, or None."""
    cells = cells_of(line)
    if len(cells) < 3:
        return None
    ci = None
    for i, c in enumerate(cells[:6]):
        base = c.rstrip('.')
        if CODE_RE.match(base) and not base.isdigit() and base not in ('AUDI',):
            ci = i
            break
        # "8X1AA4.." variants
    if ci is None or ci + 1 >= len(cells):
        return None
    code = cells[ci].rstrip('.')
    variant = cells[ci].endswith('..')
    desc = cells[ci + 1]
    # 2024–2025: AUDI | 2025 | 8YFANC | A3 8Y | description …  (type after the code)
    if TYPE_RE.match(desc) and ci + 2 < len(cells) and re.search(r'[a-z]', cells[ci + 2]):
        ci += 1
        desc = cells[ci + 1]
    if not re.search(r'[A-Za-z]', desc) or NUM_RE.match(desc.replace('€', '').strip()):
        return None
    rest = cells[ci + 2:]
    nums, triple, pkg, circ, note = [], None, None, None, None
    for c in rest:
        c2 = c.replace('€', '').strip()
        if re.fullmatch(r'[EΕ]\d{2}(?:/[EΕ]\d{2})*', c2):
            pkg = c2
            continue
        if PCT_RE.match(c2):
            continue  # price change vs the previous list (2019–2020)
        t = TRIPLE_RE.match(c2.replace(' ', '').replace("'", ''))
        if t:
            triple = (None if t.group(1) in ('-', '') else num(t.group(1)), int(t.group(2)), int(t.group(3)))
            continue
        if c.endswith('€') and NUM_RE.match(c2):
            circ = num(c2)
            nums.append(('circ', num(c2)))
            continue
        # cells may hold several numbers separated by one space ("70 95")
        parts = c2.split()
        if parts and all(NUM_RE.match(p) for p in parts):
            for p in parts:
                nums.append(('n', num(p)))
            continue
        if c2 in ('-', ''):
            nums.append(('n', 0))
            continue
        if nums and NOTE_RE.match(c2):
            note = c2  # "ΝΕΑ ΕΚΔΟΣΗ", "Νέα έκδοση" after the price
            continue
        return None  # unexpected cell: not a clean row
    values = [v for k, v in nums]
    kinds = [k for k, v in nums]
    return {'code': code, 'variant': variant, 'desc': desc, 'values': values, 'kinds': kinds, 'triple': triple, 'pkg': pkg, 'circ': circ, 'note': note}


def interpret(row):
    v, kinds = row['values'], row['kinds']
    out = {'ltpf': None, 'vat': None, 'vat_rate': None, 'reg_tax': None, 'retail': None, 'vat_ok': False, 'total_ok': False,
           'hp': None, 'kw': None, 'cc': None, 'co2': None}
    if row['triple']:
        out['cc'], out['kw'], out['hp'] = row['triple']
    # VAT pair
    for i in range(len(v) - 1):
        a, b = v[i], v[i + 1]
        # The ΛΤΠΦ is always among the first four numbers (hp | gross | ΛΤΠΦ, or cc | kW | hp | ΛΤΠΦ);
        # later pairs can match 24% by chance (luxury-tax base and tax, 04/2011).
        if i > 3 or a < 3000 or kinds[i] != 'n':
            continue
        for r in VAT_RATES:
            if abs(b - a * r) <= 1.5:
                out['ltpf'], out['vat'], out['vat_rate'], out['vat_ok'] = a, b, r, True
                # total: a later value equal to ltpf + vat + sum of the values in between
                acc = a + b
                for j in range(i + 2, len(v)):
                    if j > i + 2 and abs(v[j] - acc) <= 2:
                        out['retail'] = v[j]
                        out['reg_tax'] = v[i + 2]
                        out['total_ok'] = True
                        tail = v[j + 1:]
                        tk = kinds[j + 1:]
                        if 'circ' in tk:
                            k = tk.index('circ')
                            if k >= 1 and 20 <= tail[k - 1] <= 600:
                                out['co2'] = tail[k - 1]
                        break
                    acc += v[j]
                before = v[:i]
                if before and abs(before[-1] - (a + b)) <= 2:
                    before = before[:-1]  # "βασική τιμή με ΦΠΑ"
                if not row['triple']:
                    if len(before) >= 3:
                        out['cc'], out['kw'], out['hp'] = before[-3], before[-2], before[-1]
                    elif len(before) == 2:
                        x, y = before
                        if x > 600:
                            out['cc'], out['hp'] = x, y
                        else:
                            out['kw'], out['hp'] = x, y
                    elif len(before) == 1:
                        out['hp'] = before[0]
                return out
    # Lists that print only the ΛΤΠΦ: after a cc/kW/PS triple, or as cc, kW, hp, ΛΤΠΦ.
    if row['triple'] and len(v) == 1 and v[0] >= 3000:
        out['ltpf'] = v[0]
    elif not row['triple'] and len(v) == 4 and v[3] >= 3000 and 600 <= v[0] <= 7000:
        # cc, kW, hp, ΛΤΠΦ. A kW/hp mismatch is a typo in the list (RS Q3 04/2020: 294 kW "300 hp").
        out['cc'], out['kw'], out['hp'], out['ltpf'] = v
        if not 1.30 <= v[2] / max(v[1], 1) <= 1.40:
            out['power_typo'] = True
    elif not row['triple'] and len(v) == 3 and v[2] >= 3000 and 1.30 <= v[1] / max(v[0], 1) <= 1.40:
        out['kw'], out['hp'], out['ltpf'] = v  # electric: no cc
    return out


def parse_pdf(path):
    txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
    pages = txt.split('\f')
    rows = []
    meta = {'valid_from': None, 'protocol': None}
    for pno, page in enumerate(pages, start=1):
        vf = page_valid_from(page)
        if vf:
            meta['valid_from'] = meta['valid_from'] or vf
        pr = page_protocol(page)
        if pr:
            meta['protocol'] = meta['protocol'] or pr
        my = page_my(page)
        header = page[:3000]
        cycle = 'WLTP' if 'WLTP' in header else ('NEDC' if 'NEDC' in header else None)
        for line in page.split('\n'):
            r = parse_row(line)
            if not r:
                continue
            x = interpret(r)
            if x['ltpf'] is None:
                continue
            rows.append({**r, **x, 'page': pno, 'page_valid_from': vf, 'page_protocol': pr, 'my': my, 'co2_header_cycle': cycle})
    return meta, rows, len(pages)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    src, out = sys.argv[1], sys.argv[2]
    result = []
    for name in sorted(os.listdir(src)):
        if not name.lower().endswith('.pdf'):
            continue
        path = os.path.join(src, name)
        meta, rows, npages = parse_pdf(path)
        result.append({'file': name, 'file_date': file_date(name), 'sha256': sha256(path), 'pages': npages, **meta, 'rows': rows})
        ok = sum(1 for r in rows if r['vat_ok'])
        print(f'{name}: pages={npages} rows={len(rows)} vat_ok={ok} valid_from={meta["valid_from"]} protocol={meta["protocol"]}', flush=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == '__main__':
    main()
