#!/usr/bin/env python3
"""
Second, independent read of every Audi row.

Usage: python3 -I audi_verify.py <dir with the PDFs> <parsed.json>   (updates parsed.json in place)

audi_parse.py reads the lists with poppler (pdftotext). This script reads the same pages
with pdfplumber (pdfminer, a different PDF text engine), finds the line that holds the model
code and checks that the same ΛΤΠΦ is printed on it. Rows that pass get "second_read_ok"; a CO2
read by audi_parse.py is checked the same way ("co2_second_read_ok").
"""
import json
import os
import re
import sys
from collections import defaultdict
from multiprocessing import Pool

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audi_parse import NUM_RE, num  # noqa: E402


def words_of(page):
    return page.extract_words(keep_blank_chars=False, use_text_flow=False)


def same_line(words, anchor, tol=4.0):
    """Words whose vertical position is within tol points of the anchor word."""
    return [w['text'] for w in words if abs(w['top'] - anchor['top']) <= tol]


def verify_file(args):
    src, f = args
    rows = f['rows']
    by_page = defaultdict(list)
    for i, r in enumerate(rows):
        by_page[r['page']].append(i)
    result = {}
    with pdfplumber.open(os.path.join(src, f['file'])) as pdf:
        for pno, idxs in by_page.items():
            words = words_of(pdf.pages[pno - 1])
            for i in idxs:
                r = rows[i]
                found, co2_found = False, False
                for anchor in (w for w in words if w['text'].rstrip('.') == r['code']):
                    ln = same_line(words, anchor)
                    values = [num(t.replace('€', '')) for t in ln if NUM_RE.match(t.replace('€', ''))]
                    if any(abs(v - r['ltpf']) < 0.005 for v in values):
                        found = True
                        co2_found = bool(r.get('co2')) and r['co2'] in values
                        break
                result[i] = (found, co2_found)
    return f['file'], result


def main():
    src, parsed_path = sys.argv[1], sys.argv[2]
    data = json.load(open(parsed_path, encoding='utf-8'))
    by_name = {f['file']: f for f in data}
    jobs = [(src, f) for f in data if f['rows']]
    with Pool(processes=os.cpu_count() or 2) as pool:
        for name, result in pool.imap_unordered(verify_file, jobs):
            f = by_name[name]
            for i, (ok, co2_ok) in result.items():
                f['rows'][i]['second_read_ok'] = ok
                f['rows'][i]['co2_second_read_ok'] = co2_ok
            n_co2 = sum(1 for r in f['rows'] if r.get('co2'))
            print(f"{name}: second read {sum(ok for ok, _ in result.values())}/{len(result)}, CO2 {sum(c for _, c in result.values())}/{n_co2}", flush=True)
    json.dump(data, open(parsed_path, 'w', encoding='utf-8'), ensure_ascii=False)


if __name__ == '__main__':
    main()
