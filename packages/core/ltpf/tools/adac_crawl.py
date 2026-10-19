#!/usr/bin/env python3
"""
German base prices ("Grundpreis", incl. 19% VAT) per version from the ADAC Autokatalog, for the
customs criterion ε (price in the country of origin). One request per model generation: the
generation page embeds every version (name with production period, fuel, kW, hp, base price).

  python3 -I adac_crawl.py fetch <cache dir> [brand ...]   # polite: one page per 1.5 s, cached
  python3 -I adac_crawl.py build <cache dir> <out.json>

robots.txt allows /rund-ums-fahrzeug/autokatalog/. ADAC's terms of use for commercial reuse must
be checked before the extension is published (see docs/market-value.md / SPEC.md).
"""
import json
import os
import re
import subprocess
import sys
import time

BASE = 'https://www.adac.de/rund-ums-fahrzeug/autokatalog/marken-modelle/'
SITEMAP = 'https://www.adac.de/sitemaps/sitemap-autokatalog.xml'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
DELAY_S = 1.5


def curl(url, out):
    r = subprocess.run(['curl', '-sS', '-L', '--max-time', '60', '-A', UA, '-o', out, '-w', '%{http_code}', url], capture_output=True, text=True)
    return r.stdout.strip()


def generations(cache):
    sm = os.path.join(cache, 'sitemap.xml')
    if not os.path.exists(sm):
        curl(SITEMAP, sm)
    locs = re.findall(r'<loc>([^<]+)</loc>', open(sm, encoding='utf-8').read())
    gens = set()
    for u in locs:
        parts = u.replace(BASE, '').strip('/').split('/')
        if len(parts) == 4:
            gens.add('/'.join(parts[:3]))
    return sorted(gens)


def apollo(html):
    m = re.search(r'window\.__APOLLO_STATE__=\s*', html)
    if not m:
        return None
    return json.loads(html[m.end():].split('</script>')[0].rstrip().rstrip(';'))


def fetch(cache, brands):
    os.makedirs(os.path.join(cache, 'gen'), exist_ok=True)
    gens = [g for g in generations(cache) if not brands or g.split('/')[0] in brands]
    for i, g in enumerate(gens):
        out = os.path.join(cache, 'gen', g.replace('/', '__') + '.json')
        if os.path.exists(out):
            continue
        tmp = out + '.html'
        for attempt in range(3):
            code = curl(BASE + g + '/', tmp)
            if code == '200':
                break
            time.sleep(5 * (attempt + 1))
        state = apollo(open(tmp, encoding='utf-8', errors='ignore').read()) if code == '200' else None
        items = [v for k, v in (state or {}).items() if k.startswith('ApilCarCollectionItem:')]
        json.dump({'generation': g, 'http': code, 'items': items}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
        os.remove(tmp)
        print(f'{i + 1}/{len(gens)} {g}: {code} {len(items)} versions', flush=True)
        time.sleep(DELAY_S)


PERIOD_RE = re.compile(r'\((\d{2})/(\d{2})\s*-\s*(?:(\d{2})/(\d{2}))?\s*\)\s*$')
FUELS = {'Benzin': 'petrol', 'Diesel': 'diesel', 'Elektro': 'electric', 'Autogas (LPG)': 'lpg', 'Erdgas (CNG)': 'cng',
         'Hybrid (Benzin/Elektro)': 'petrol_electric', 'Hybrid (Diesel/Elektro)': 'diesel_electric', 'Plug-in-Hybrid': 'petrol_electric',
         'Wasserstoff': 'hydrogen', 'Super': 'petrol', 'Super Plus': 'petrol', 'Normal': 'petrol'}


def year4(yy):
    y = int(yy)
    return 2000 + y if y < 50 else 1900 + y


def build(cache, out_path):
    rows = []
    makes, models = [], []
    mi, mo = {}, {}
    for name in sorted(os.listdir(os.path.join(cache, 'gen'))):
        if not name.endswith('.json'):
            continue
        g = json.load(open(os.path.join(cache, 'gen', name), encoding='utf-8'))
        brand, model, _gen = g['generation'].split('/')
        for it in g['items']:
            price, title = it.get('basePrice'), it.get('name') or ''
            m = PERIOD_RE.search(title)
            if not price or not m:
                continue
            start = f'{year4(m.group(2))}-{m.group(1)}'
            end = f'{year4(m.group(4))}-{m.group(3)}' if m.group(3) else None
            if (end or '9999') < '2003-01':
                continue  # older than any car worth importing
            kw = int(it['powerInKW']) if str(it.get('powerInKW') or '').isdigit() else None
            fuel = FUELS.get(it.get('fuelType') or '', None)
            mk = brand.upper()
            md = model.upper()
            if mk not in mi:
                mi[mk] = len(makes)
                makes.append(mk)
            if md not in mo:
                mo[md] = len(models)
                models.append(md)
            rows.append([mi[mk], mo[md], PERIOD_RE.sub('', title).strip(), fuel, kw, start, end, price, int(it['id'])])
    data = {
        'source': 'ADAC Autokatalog, Grundpreis (DE, incl. VAT) per version — for testing; check the terms before publishing',
        'columns': ['make', 'model', 'name', 'fuel', 'kw', 'from', 'to', 'price_de_gross', 'adac_id'],
        'makes': makes,
        'models': models,
        'rows': rows,
    }
    json.dump(data, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(rows)} versions, {len(makes)} makes, {os.path.getsize(out_path) / 1e6:.1f} MB')


if __name__ == '__main__':
    if sys.argv[1] == 'fetch':
        fetch(sys.argv[2], set(sys.argv[3:]))
    else:
        build(sys.argv[2], sys.argv[3])
