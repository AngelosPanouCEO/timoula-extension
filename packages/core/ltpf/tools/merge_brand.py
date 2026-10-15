#!/usr/bin/env python3
"""
Replace one brand's records in ltpf-records.json.

Usage: python3 -I merge_brand.py <ltpf-records.json> <BRAND> <brand records.json>
"""
import datetime as dt
import json
import sys


def main():
    dataset_path, brand, records_path = sys.argv[1], sys.argv[2].upper(), sys.argv[3]
    dataset = json.load(open(dataset_path, encoding='utf-8'))
    new = json.load(open(records_path, encoding='utf-8'))
    if any(r['brand'] != brand for r in new):
        sys.exit(f'{records_path}: every record must have brand {brand}')
    kept = [r for r in dataset['records'] if r['brand'] != brand]
    records = kept + new
    ids = [r['id'] for r in records]
    if len(ids) != len(set(ids)):
        sys.exit('duplicate ids after merge')
    dataset['records'] = records
    dataset['record_count'] = len(records)
    dataset['generated_at'] = dt.date.today().isoformat()
    with open(dataset_path, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(f'{brand}: {len(new)} records; dataset now {len(records)} records')


if __name__ == '__main__':
    main()
