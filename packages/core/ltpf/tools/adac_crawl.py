#!/usr/bin/env python3
"""
German base prices ("Grundpreis", incl. 19% VAT) per version from the ADAC Autokatalog, for the
customs criterion ε (price in the country of origin). One request per model generation: the
generation page embeds every version (name with production period, fuel, kW, hp, base price).

  python3 -I adac_crawl.py fetch <cache dir> [brand ...]    # one page per second, cached
  python3 -I adac_crawl.py details <cache dir> [brand ...]  # version pages the generation pages lack
  python3 -I adac_crawl.py build <cache dir> <out.json>

A generation page embeds only its first body (e.g. Octavia Limousine); the other bodies (Combi,
RS Combi, Avant, Touring…) load through ADAC's /bff API, which robots.txt disallows. The sitemap
also lists single version pages, some of them for the other bodies: `details` reads those.

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
DELAY_S = 1.0


def curl(url, out):
    r = subprocess.run(['curl', '-sS', '-L', '--compressed', '--max-time', '60', '-A', UA, '-o', out, '-w', '%{http_code}', url], capture_output=True, text=True)
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


def sitemap_cars(cache):
    """(generation path, car id) for every version page in the sitemap."""
    curl(SITEMAP, os.path.join(cache, 'sitemap.xml')) if not os.path.exists(os.path.join(cache, 'sitemap.xml')) else None
    locs = re.findall(r'<loc>([^<]+)</loc>', open(os.path.join(cache, 'sitemap.xml'), encoding='utf-8').read())
    out = []
    for u in locs:
        parts = u.replace(BASE, '').strip('/').split('/')
        if len(parts) == 4 and parts[3].isdigit():
            out.append(('/'.join(parts[:3]), parts[3]))
    return out


def details(cache, brands):
    os.makedirs(os.path.join(cache, 'car'), exist_ok=True)
    have = set()
    for name in os.listdir(os.path.join(cache, 'gen')):
        if name.endswith('.json'):
            have |= {str(i['id']) for i in json.load(open(os.path.join(cache, 'gen', name), encoding='utf-8'))['items']}
    todo = [(g, c) for g, c in sitemap_cars(cache) if c not in have and (not brands or g.split('/')[0] in brands)]
    for i, (g, c) in enumerate(todo):
        out = os.path.join(cache, 'car', c + '.json')
        if os.path.exists(out):
            continue
        tmp = out + '.html'
        for attempt in range(3):
            code = curl(BASE + g + '/' + c + '/', tmp)
            if code in ('200', '404'):
                break
            time.sleep(5 * (attempt + 1))
        item = None
        if code == '200':
            state = apollo(open(tmp, encoding='utf-8', errors='ignore').read()) or {}
            page = next((v for k, v in state.get('ROOT_QUERY', {}).items() if k.startswith('carPage(')), {}).get('carPage') or {}
            bd = page.get('basicData') or {}
            title = (page.get('metaData') or {}).get('teaserHeadline') or ''
            if not title:
                m = re.search(r'"teaserHeadline":"([^"]+)"', open(tmp, encoding='utf-8', errors='ignore').read())
                title = m.group(1) if m else ''
            price = re.sub(r'[^0-9]', '', bd.get('basePrice') or '')
            if title and price:
                item = {'id': c, 'name': title, 'fuelType': bd.get('fuelType'), 'powerInKW': str(bd.get('powerInKW') or ''), 'basePrice': int(price)}
        json.dump({'generation': g, 'http': code, 'item': item}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
        os.remove(tmp)
        print(f'{i + 1}/{len(todo)} {g}/{c}: {code} {item and item["name"]}', flush=True)
        time.sleep(DELAY_S)


PERIOD_RE = re.compile(r'\((?:ab\s*)?(\d{2})/(\d{2})\s*(?:-\s*(?:(\d{2})/(\d{2}))?)?\s*\)\s*$')
FUELS = {'Super': 'petrol', 'Super Plus': 'petrol', 'Normal': 'petrol', 'Bio-Ethanol': 'petrol', 'Diesel': 'diesel', 'Strom': 'electric',
         'Super / Strom': 'petrol_electric', 'Super Plus / Strom': 'petrol_electric', 'Strom / Super': 'petrol_electric',
         'Strom / Super Plus': 'petrol_electric', 'Diesel / Strom': 'diesel_electric', 'Flüssiggas': 'lpg', 'Erdgas': 'cng',
         'Erdgas / Super': 'cng', 'Wasserstoff': 'hydrogen'}


def year4(yy):
    y = int(yy)
    return 2000 + y if y < 50 else 1900 + y


def build(cache, out_path):
    rows = []
    makes, models = [], []
    mi, mo = {}, {}
    pages = [json.load(open(os.path.join(cache, 'gen', n), encoding='utf-8')) for n in sorted(os.listdir(os.path.join(cache, 'gen'))) if n.endswith('.json')]
    car_dir = os.path.join(cache, 'car')
    if os.path.isdir(car_dir):
        for n in sorted(os.listdir(car_dir)):
            c = json.load(open(os.path.join(car_dir, n), encoding='utf-8')) if n.endswith('.json') else None
            if c and c['item']:
                pages.append({'generation': c['generation'], 'items': [c['item']]})
    seen = set()
    for g in pages:
        brand, model, _gen = g['generation'].split('/')
        for it in g['items']:
            if str(it['id']) in seen:
                continue
            seen.add(str(it['id']))
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
    elif sys.argv[1] == 'details':
        details(sys.argv[2], set(sys.argv[3:]))
    else:
        build(sys.argv[2], sys.argv[3])
