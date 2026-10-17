#!/usr/bin/env python3
"""
Turn parsed Audi price-list rows (audi_parse.py + audi_verify.py) into ΛΤΠΦ records.

Usage: python3 -I audi_records.py <dir with the PDFs> <parsed.json> <out records.json> <report.md>

Validity: each list takes effect on its date ("Ημερομηνία έναρξης", else "ΙΣΧΥΕΙ ΑΠΟ", else the
file name). Audi files several lists per date (one per model year) and partial lists (only new
versions), so a version stays valid until a later list re-prices it; it ends earlier only when a
later list re-prices its body family (first 3 characters of the model code) without it, or at the
next full list (at least half of the models) when the family is never listed again. Consecutive lists with the same price are merged into one
record (valid_from of the first list, valid_to of the last).
"""
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

IMPORTER = 'KOSMOCAR A.E.'
EXTRACTED_AT = dt.date.today().isoformat()

# Files left out, with the reason shown in the report.
SKIP = {
    'Audi_Timokatalogos_2011_04_19.pdf': 'Τυπώνει μόνο τιμή με ΦΠΑ, όχι ΛΤΠΦ.',
    'Audi_Timokatalogos_2021_06_22_MY2021_MY2022.pdf': '«Ενδεικτικός» κατάλογος με τον ίδιο αριθμό πρωτοκόλλου (8208) και την ίδια ημερομηνία με τον 2021_06_11.',
}

# Rows audi_parse.py rejects because the list itself does not add up (found with a scan for rows
# that have a model code and a price but no valid reading).
INCONSISTENT_ROWS = [
    '12/07/2016, A5 Coupé (12 εκδόσεις): η ΛΤΠΦ άλλαξε (π.χ. 30.899 €) αλλά ο ΦΠΑ είναι του προηγούμενου καταλόγου (7.462 € = 24% × 31.090 €).',
    '04/08/2016, 8KH0RY A4 allroad 2.0 TDI: γραμμή χωρίς ΛΤΠΦ (0).',
    '01/08/2018, 8W5RXA RS4 Avant: ο ΦΠΑ (12.671 €) δεν αντιστοιχεί στην ΛΤΠΦ (67.346 €).',
]

# Page dates that are evidently typos, corrected from the file name and the protocol sequence.
DATE_OVERRIDES = {
    'Audi_Timokatalogos_2020_10_02_MY2021.pdf': ('2020-10-02', 'Ο κατάλογος γράφει 02/10/2021· αρ. πρωτ. 25196 είναι ανάμεσα στους 24077 (11/09/2020) και 26876 (29/10/2020).'),
    'Audi_Timokatalogos_2021_01_05_MY2021.pdf': ('2021-01-05', 'Ο κατάλογος γράφει 05/01/2020· αρ. πρωτ. 251 είναι του 2021 και ο κατάλογος έχει MY2021.'),
    'Audi_Timokatalogos_2021_01_22_MY2021.pdf': ('2021-01-22', 'Ο κατάλογος γράφει 22/01/2020· αρ. πρωτ. 1293 είναι του 2021 και ο κατάλογος έχει MY2021.'),
}

MODEL_TOKENS = re.compile(r'^(A[1-8]|Q[2-9]|R8|S[1-8]|SQ[2-8]|RS ?[3-7]|RS ?Q[38]|RSQ[38]|TTS|TT|E-TRON)$', re.I)
BEV_ETRON_MODELS = {'A2', 'A6', 'S6', 'Q4', 'Q6', 'SQ6', 'Q8', 'SQ8'}


def day_before(iso):
    return (dt.date.fromisoformat(iso) - dt.timedelta(days=1)).isoformat()


def header_dates(pdf_path):
    """First "Ημερομηνία έναρξης" and first "ΙΣΧΥΕΙ ΑΠΟ" on the first pages."""
    txt = subprocess.run(['pdftotext', '-layout', '-l', '3', pdf_path, '-'], capture_output=True, text=True).stdout

    def find(pat):
        m = re.search(pat, txt)
        return f'{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else None

    return find(r'[Έέ]ναρξης\s*:\s*(\d{1,2})/(\d{1,2})/(\d{4})'), find(r'ΙΣΧΥΕΙ ΑΠΟ:?\s*(\d{1,2})/(\d{1,2})/(\d{4})')


def list_date(f, pdf_dir):
    """Date the list takes effect, and a note when the sources disagree."""
    name = f['file']
    if name in DATE_OVERRIDES:
        return DATE_OVERRIDES[name]
    start, title = header_dates(os.path.join(pdf_dir, name))
    fd = f.get('file_date')
    if fd and fd in (title, start):
        date = fd
    elif start and start == title:
        date = start
    else:
        date = start or title or fd
    sources = {k: v for k, v in (('όνομα αρχείου', fd), ('έναρξη', start), ('ισχύει από', title)) if v}
    note = None
    if len(set(sources.values())) > 1:
        note = 'Αποκλίσεις: ' + ', '.join(f'{k} {v}' for k, v in sources.items()) + f' → {date}.'
    return date, note


def clean_desc(desc):
    d = re.sub(r'^(?:NEO|ΝΕΟ|Νέο|Νεο)\s+', '', desc.strip())
    d = re.sub(r'\bSB\b', 'Sportback', d)
    d = d.replace('allorad', 'allroad').replace('Coupe ', 'Coupé ').replace('S-line', 'S line')
    return re.sub(r'\s+', ' ', d).strip()


def model_of(desc):
    d = clean_desc(desc)
    if re.match(r'^allroad\b', d, re.I):
        return 'A6 ALLROAD'  # 2005–2006 "allroad quattro" (A6 based)
    w = d.split()
    first = w[0].upper()
    if first == 'RS' and len(w) > 1:
        nxt = w[1].upper()
        if nxt == 'E-TRON':
            return 'E-TRON GT'
        first = 'RS' + nxt
    elif first in ('S', 'RS') and len(w) > 1 and w[1].lower() == 'e-tron':
        return 'E-TRON GT' if 'GT' in d.upper() else 'E-TRON'
    first = first.replace(' ', '')
    if first == 'TT' and len(w) > 1 and w[1].upper() == 'RS':
        return 'TT RS'
    if first == 'E-TRON':
        return 'E-TRON GT' if re.search(r'\bGT\b', d, re.I) else 'E-TRON'
    if not MODEL_TOKENS.match(first):
        return None
    if first in ('A4', 'A6') and re.search(r'\ballroad\b', d, re.I):
        return first + ' ALLROAD'
    if first in BEV_ETRON_MODELS and re.search(r'\be-tron\b', d, re.I):
        return first + ' E-TRON'
    return first


def powertrain_of(desc, model, year):
    d = clean_desc(desc)
    u = d.upper()
    diesel = 'TDI' in u
    if 'G-TRON' in u:
        return 'cng', 'ICE'
    if re.search(r'TFSI ?E\b|E-HYBRID|PLUG-IN', u):
        return ('diesel' if diesel else 'petrol'), 'PHEV'
    if 'E-TRON' in u:
        if model in ('A3', 'Q7'):
            return ('diesel' if diesel else 'petrol'), 'PHEV'  # A3 Sportback e-tron, Q7 e-tron (2014–2019)
        return 'electric', 'BEV'
    if re.search(r'\bMHEV\b', u) or (re.search(r'\bHYBRID\b', u) and year >= 2019):
        return ('diesel' if diesel else 'petrol'), 'MHEV'
    if re.search(r'\bHYBRID\b', u):
        return 'petrol', 'HEV'  # A6/A8/Q5 hybrid (2011–2015)
    return ('diesel' if diesel else 'petrol'), 'ICE'


def transmission_of(desc, powertrain):
    u = desc.upper()
    if 'S TRONIC' in u or 'S-TRONIC' in u:
        return 'DCT'
    if 'TIPTRONIC' in u:
        return 'AT'
    if 'MULTITRONIC' in u:
        return 'CVT'
    if 'R TRONIC' in u or 'R-TRONIC' in u:
        return 'AMT'
    m = re.search(r'(\d)\s*ταχύτ', desc, re.I)
    if m:
        return f'{m.group(1)}MT'
    if powertrain == 'BEV':
        return 'AT'
    return None


def version_of(desc):
    """Version text without the gearbox wording, which moves to `transmission`."""
    d = clean_desc(desc)
    d = re.sub(r'\(?\s*\d\s*ταχύτ\w*\s*\)?', '', d, flags=re.I)
    return re.sub(r'\s+', ' ', d).strip()


def version_without_model(desc, model):
    """"A3 Sportback 1.4 TFSI" with model A3 → "Sportback 1.4 TFSI" (the popup shows model + version)."""
    words = version_of(desc).split()
    first = re.sub(r'[^A-Z0-9]', '', model.split()[0].upper())
    comp = lambda ws: re.sub(r'[^A-Z0-9]', '', ''.join(ws).upper())
    if words and comp(words[:1]) == first:
        words = words[1:]
    elif len(words) > 1 and comp(words[:2]) == first:
        words = words[2:]
    return ' '.join(words) or version_of(desc)


def engine_label_of(desc):
    d = clean_desc(desc)
    for pat in (r'\b\d\.\dT?\s?(?:TFSI e|TFSI|TDI|FSI|TSI|TFSI)\b', r'\b\d{2}\s(?:TFSI e|TFSI|TDI|g-tron|e-tron)\b', r'\b(?:TFSI e|TFSI|TDI)\b',
                r'\b\d\.\d\b', r'\b(?:V6|V8|V10|V12|W12)\b'):
        m = re.search(pat, d)
        if m:
            return m.group(0)
    return None


def displacement_l_of(desc):
    m = re.search(r'\b(\d\.\d)(?:T|\s|$)', clean_desc(desc))
    if m and 0.8 <= float(m.group(1)) <= 6.5:
        return float(m.group(1))
    return None


def co2_cycle_of(date, header_cycle):
    if header_cycle:
        return header_cycle
    if date < '2018-09-01':
        return 'NEDC'
    if date >= '2021-01-01':
        return 'WLTP'
    return None


def record_id(r):
    key = '|'.join([r['brand'], r['model'], r['model_year_tag'] or '', r['engine_label'] or '', r['version'], r['transmission'] or '', r['valid_from']])
    return hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]


def my_tag(f, row):
    m = re.search(r'MY(\d{4})', f['file'])
    if m and '_MY' in f['file'] and f['file'].count('MY') == 1:
        return 'MY' + m.group(1)[-2:]
    return row.get('my')


def main():
    pdf_dir, parsed_path, out_path, report_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    data = json.load(open(parsed_path, encoding='utf-8'))
    report = []
    occ = []  # one entry per row occurrence
    skipped_rows = 0
    for f in data:
        if f['file'] in SKIP:
            report.append(f"- `{f['file']}`: εκτός — {SKIP[f['file']]}")
            continue
        date, date_note = list_date(f, pdf_dir)
        if date_note:
            report.append(f"- `{f['file']}`: {date_note}")
        year = int(date[:4])
        for row in f['rows']:
            if not row.get('second_read_ok'):
                skipped_rows += 1
                continue
            model = model_of(row['desc'])
            if not model:
                report.append(f"- `{f['file']}` σελ. {row['page']}: άγνωστο μοντέλο «{row['desc']}» — εκτός.")
                skipped_rows += 1
                continue
            fuel, pt = powertrain_of(row['desc'], model, year)
            occ.append({
                'file': f['file'], 'sha256': f['sha256'], 'date': date, 'protocol': row.get('page_protocol') or f.get('protocol'),
                'page': row['page'], 'code': row['code'], 'desc': row['desc'], 'model': model, 'fuel': fuel, 'powertrain': pt,
                'ltpf': row['ltpf'], 'retail': row.get('retail') if row.get('total_ok') else None, 'vat_ok': row.get('vat_ok'),
                'cc': row.get('cc'), 'kw': row.get('kw'), 'hp': row.get('hp'), 'co2': row.get('co2') if row.get('co2_second_read_ok') else None,
                'cycle': co2_cycle_of(date, row.get('co2_header_cycle')), 'pkg': row.get('pkg'), 'my': my_tag(f, row),
                'power_typo': row.get('power_typo', False),
            })

    # Same list date + same code/version: keep one (identical rows repeat across model-year files).
    by_key_date = {}
    for o in occ:
        k = (o['code'], version_of(o['desc']).upper(), o['ltpf'], o['date'])
        by_key_date.setdefault(k, o)
    occ = list(by_key_date.values())

    dates = sorted({o['date'] for o in occ})
    keys_at = defaultdict(set)
    fam_at = defaultdict(set)
    model_at = defaultdict(set)
    for o in occ:
        o['key'] = (o['code'], version_of(o['desc']).upper())
        keys_at[o['date']].add(o['key'])
        fam_at[o['date']].add(o['code'][:3])
        model_at[o['date']].add(o['model'])

    def is_full(d):
        """A list that re-prices at least half of the models seen in the year before it."""
        year_before = (dt.date.fromisoformat(d) - dt.timedelta(days=365)).isoformat()
        seen = max((len(model_at[x]) for x in dates if year_before <= x < d), default=0)
        return len(model_at[d]) >= 0.5 * seen

    def end_of(o):
        later = [d for d in dates if d > o['date']]
        for d in later:
            if o['key'] in keys_at[d]:
                return d, 'repriced'
            if o['code'][:3] in fam_at[d]:
                return d, 'family'
        # The family is never listed again (model change, e.g. A3 8V → 8Y): it was dropped at the
        # next full list, so run-out cars of the old generation still find their official price.
        for d in later:
            if is_full(d):
                return d, 'dropped'
        return None, None

    # Merge consecutive appearances with the same price.
    occ.sort(key=lambda o: (o['key'], o['date']))
    records = []
    i = 0
    while i < len(occ):
        o = occ[i]
        nxt, why = end_of(o)
        first = o
        lists = 1
        j = i + 1
        while nxt and why == 'repriced' and j < len(occ) and occ[j]['key'] == o['key'] and occ[j]['date'] == nxt and occ[j]['ltpf'] == first['ltpf']:
            o = occ[j]
            lists += 1
            nxt, why = end_of(o)
            j += 1
        notes = []
        if lists > 1:
            notes.append(f'Ίδια τιμή σε {lists} διαδοχικούς καταλόγους (τελευταίος {o["date"]}).')
        if first['pkg']:
            notes.append(f'Ελληνικό πακέτο {first["pkg"]} (περιλαμβάνεται στην ΛΤΠΦ του καταλόγου).')
        if first['power_typo']:
            notes.append(f'Ο κατάλογος τυπώνει {first["kw"]} kW / {first["hp"]} hp (ασυνέπεια του καταλόγου).')
        rec = {
            'id': '',
            'brand': 'AUDI',
            'model': first['model'],
            'model_year_tag': first['my'],
            'version': version_without_model(first['desc'], first['model']),
            'engine_label': engine_label_of(first['desc']),
            'displacement_l': displacement_l_of(first['desc']),
            'displacement_cc': first['cc'] if isinstance(first['cc'], int) and first['cc'] >= 500 else None,
            'fuel': first['fuel'],
            'powertrain': first['powertrain'],
            'power_ps': first['hp'] if isinstance(first['hp'], int) else None,
            'power_kw': first['kw'] if isinstance(first['kw'], int) else None,
            'transmission': transmission_of(first['desc'], first['powertrain']),
            'drive': 'AWD' if re.search(r'quattro', first['desc'], re.I) else None,
            'body_type': None,
            'co2_g_km': first['co2'] if first['co2'] else (0 if first['powertrain'] == 'BEV' else None),
            'co2_cycle': first['cycle'] if first['co2'] else None,
            'ltpf_eur': first['ltpf'],
            'retail_incl_tax_eur': first['retail'],
            'valid_from': first['date'],
            'valid_to': day_before(nxt) if nxt else None,
            'source_type': 'gr_official_pricelist',
            'confidence': 'high',
            'importer': IMPORTER,
            'protocol_no': first['protocol'],
            'list_label': f'{first["code"]} · {first["file"].replace("Audi_Timokatalogos_", "").replace(".pdf", "")}',
            'source_url': f'archive:audi/{first["file"]}',
            'source_page': first['page'],
            'source_sha256': first['sha256'],
            'extraction_method': 'pdf_text',
            'verified': True,
            'extracted_at': EXTRACTED_AT,
            'notes': ' '.join(notes) or None,
        }
        rec['id'] = record_id(rec)
        records.append(rec)
        i = j

    # Unique ids (two packages of one version on one date can collide).
    seen = defaultdict(int)
    for r in records:
        seen[r['id']] += 1
        if seen[r['id']] > 1:
            r['id'] = hashlib.sha1((r['id'] + str(seen[r['id']])).encode()).hexdigest()[:16]
    records.sort(key=lambda r: (r['model'], r['valid_from'], r['version']))
    json.dump(records, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    by_year = defaultdict(int)
    for r in records:
        by_year[r['valid_from'][:4]] += 1
    with open(report_path, 'w', encoding='utf-8') as fh:
        fh.write(f'# Audi ΛΤΠΦ — αναφορά εισαγωγής ({EXTRACTED_AT})\n\n')
        fh.write(f'- Γραμμές καταλόγων που διαβάστηκαν και επαληθεύτηκαν: {len(occ)} (μοναδικές ανά ημερομηνία)\n')
        fh.write(f'- Εγγραφές μετά τη συγχώνευση ίδιων τιμών: {len(records)}\n')
        fh.write(f'- Ημερομηνίες καταλόγων: {len(dates)} ({dates[0]} … {dates[-1]})\n')
        fh.write(f'- Γραμμές εκτός (χωρίς επαλήθευση ή άγνωστο μοντέλο): {skipped_rows}\n\n')
        fh.write('## Εγγραφές ανά έτος έναρξης\n\n' + '\n'.join(f'- {y}: {n}' for y, n in sorted(by_year.items())) + '\n\n')
        fh.write('## Σημειώσεις ανά αρχείο\n\n' + '\n'.join(report) + '\n\n')
        fh.write('## Γραμμές εκτός λόγω ασυνέπειας του καταλόγου\n\n' + '\n'.join(f'- {x}' for x in INCONSISTENT_ROWS) + '\n')
    print(f'{len(records)} records from {len(occ)} rows; {len(dates)} list dates; skipped rows {skipped_rows}')


if __name__ == '__main__':
    main()
