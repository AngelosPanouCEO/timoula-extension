#!/usr/bin/env python3
"""
Build the compact CO2 table from the EEA monitoring data of new passenger cars (open data,
CC BY 4.0: https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b).

  python3 -I eea_build.py download <dir>        # one JSON per year, aggregated on the EEA server
  python3 -I eea_build.py build <dir> <out.json>

Rows: make, model token (first word of the commercial name), fuel, cc, kW, 2-year bucket, and the
registration-weighted mean CO2 for NEDC and WLTP with the number of cars behind it.
"""
import json
import os
import re
import subprocess
import sys
import urllib.parse
from collections import defaultdict

YEARS = range(2010, 2023)
MIN_CARS = 10

QUERY = """SELECT UPPER(Mk) mk, UPPER(Cn) cn, UPPER(Ft) ft, [Ec (cm3)] cc, [Ep (KW)] kw, SUM(R) n,
SUM(CASE WHEN COALESCE([Enedc (g/km)],[E (g/km)]) IS NOT NULL THEN R END) n_nedc, SUM(R*COALESCE([Enedc (g/km)],[E (g/km)])) s_nedc,
SUM(CASE WHEN [Ewltp (g/km)] IS NOT NULL THEN R END) n_wltp, SUM(R*[Ewltp (g/km)]) s_wltp
FROM [CO2Emission].[latest].[co2cars] WHERE [Year]={year} AND (Cr='M1' OR Ct='M1')
GROUP BY UPPER(Mk), UPPER(Cn), UPPER(Ft), [Ec (cm3)], [Ep (KW)] HAVING SUM(R) >= 3"""

FUELS = {
    'PETROL': 'petrol', 'DIESEL': 'diesel', 'ELECTRIC': 'electric', 'LPG': 'lpg', 'NG': 'cng', 'NG-BIOMETHANE': 'cng',
    'PETROL/ELECTRIC': 'petrol_electric', 'PETROL-ELECTRIC': 'petrol_electric', 'DIESEL/ELECTRIC': 'diesel_electric',
    'DIESEL-ELECTRIC': 'diesel_electric', 'HYDROGEN': 'hydrogen', 'E85': 'petrol', 'PETROL-E85': 'petrol',
}


# Canonical makes; EEA make strings are matched to the earliest one they contain
# ("A.U.D.I." → AUDI, "AUTOMOBILE DACIA S.A …" → DACIA, "CHEVROLET,GMC,BUICK" → CHEVROLET).
CANON = [
    'ABARTH', 'ALFA ROMEO', 'ALPINA', 'ALPINE', 'ASTON MARTIN', 'AUDI', 'BENTLEY', 'BMW', 'BYD', 'CADILLAC', 'CHEVROLET', 'CHRYSLER',
    'CITROEN', 'CUPRA', 'DACIA', 'DAIHATSU', 'DODGE', 'DS', 'FERRARI', 'FIAT', 'FORD', 'GENESIS', 'HONDA', 'HYUNDAI', 'INFINITI',
    'ISUZU', 'JAGUAR', 'JEEP', 'KIA', 'LADA', 'LAMBORGHINI', 'LANCIA', 'LAND ROVER', 'LEXUS', 'LOTUS', 'LYNK', 'MASERATI', 'MAZDA',
    'MCLAREN', 'MERCEDES-BENZ', 'MG', 'MINI', 'MITSUBISHI', 'NISSAN', 'OPEL', 'PEUGEOT', 'POLESTAR', 'PORSCHE', 'RENAULT',
    'ROLLS-ROYCE', 'SAAB', 'SEAT', 'SKODA', 'SMART', 'SSANGYONG', 'SUBARU', 'SUZUKI', 'TESLA', 'TOYOTA', 'VAUXHALL', 'VOLKSWAGEN',
    'VOLVO', 'ZEEKR', 'NIO', 'XPENG', 'AIWAYS', 'LEAPMOTOR', 'OMODA', 'CHERY', 'GEELY', 'GREAT WALL', 'ORA', 'WEY', 'MAXUS',
]
ALIASES = {'VW': 'VOLKSWAGEN', 'MERCEDES': 'MERCEDES-BENZ', 'DAIMLER': 'MERCEDES-BENZ', 'KODA': 'SKODA', 'RANGEROVER': 'LAND ROVER',
           'ALFAROMEO': 'ALFA ROMEO', 'KGM': 'SSANGYONG', 'LYNK&CO': 'LYNK', 'ROLLSROYCE': 'ROLLS-ROYCE'}
_compact = lambda s: re.sub(r'[^A-Z0-9]', '', s)


def norm_make(s):
    c = _compact((s or '').upper().replace('Ë', 'E').replace('Š', 'S').replace('Ö', 'O'))
    if not c:
        return None
    best = None
    for name in CANON + list(ALIASES):
        i = c.find(_compact(name))
        if i >= 0 and (best is None or i < best[0] or (i == best[0] and len(name) > len(best[1]))):
            best = (i, name)
    if not best:
        return None
    if best[1] == 'MINI' and 'BMW' in c and c.find('BMW') < best[0]:
        return 'BMW'
    return ALIASES.get(best[1], best[1])


def model_token(cn, make):
    """First word of the commercial name, without the make: "AUDI A3 SPORTBACK" → "A3"."""
    s = re.sub(r'[^A-Z0-9 ]+', ' ', (cn or '').upper().replace('Ë', 'E').replace('Š', 'S'))
    words = [w for w in s.split() if w]
    for m in make.replace('-', ' ').split():
        if words and words[0] == m:
            words = words[1:]
    return words[0] if words else ''


def download(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for y in YEARS:
        url = 'https://discodata.eea.europa.eu/sql?' + urllib.parse.urlencode({'query': QUERY.format(year=y), 'nrOfHits': 500000})
        subprocess.run(['curl', '-sS', '--max-time', '600', '-o', os.path.join(out_dir, f'y{y}.json'), url], check=True)
        print(y, flush=True)


def build(in_dir, out_path):
    acc = defaultdict(lambda: [0, 0, 0.0, 0, 0.0])  # n, n_nedc, s_nedc, n_wltp, s_wltp
    for y in YEARS:
        for x in json.load(open(os.path.join(in_dir, f'y{y}.json')))['results']:
            make = norm_make(x['mk'])
            fuel = FUELS.get((x['ft'] or '').strip())
            if not make or not fuel or not x['n']:
                continue
            cc = x['cc'] or 0
            kw = x['kw'] or 0
            key = (make, model_token(x['cn'], make), fuel, int(cc), int(kw), y - y % 2)
            a = acc[key]
            a[0] += x['n']
            if x['n_nedc'] and x['s_nedc']:
                a[1] += x['n_nedc']
                a[2] += x['s_nedc']
            if x['n_wltp'] and x['s_wltp']:
                a[3] += x['n_wltp']
                a[4] += x['s_wltp']
    makes, models, out = [], [], []
    mi, mo = {}, {}
    fuel_codes = sorted(set(FUELS.values()))
    for (make, model, fuel, cc, kw, yb), (n, nn, sn, nw, sw) in sorted(acc.items()):
        if n < MIN_CARS or (not nn and not nw):
            continue
        if make not in mi:
            mi[make] = len(makes)
            makes.append(make)
        if model not in mo:
            mo[model] = len(models)
            models.append(model)
        nedc = round(sn / nn) if nn >= MIN_CARS else None
        wltp = round(sw / nw) if nw >= MIN_CARS else None
        if nedc is None and wltp is None:
            continue
        out.append([mi[make], mo[model], fuel_codes.index(fuel), cc, kw, yb, nedc, wltp, n])
    data = {
        'source': 'EEA, Monitoring of CO2 emissions from passenger cars (Regulation (EU) 2019/631), 2010–2022, CC BY 4.0',
        'columns': ['make', 'model', 'fuel', 'cc', 'kw', 'year_from', 'nedc', 'wltp', 'cars'],
        'year_bucket': 2,
        'makes': makes,
        'models': models,
        'fuels': fuel_codes,
        'rows': out,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} rows, {len(makes)} makes, {len(models)} model tokens, {os.path.getsize(out_path) / 1e6:.1f} MB')


if __name__ == '__main__':
    if sys.argv[1] == 'download':
        download(sys.argv[2])
    else:
        build(sys.argv[2], sys.argv[3])
