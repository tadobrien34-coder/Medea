#!/usr/bin/env python3
"""Add analysed games fetched from the Lichess API (strong players) to thin rating cells of the dump sample.

Only cells with fewer than THIN games from the monthly dump get API games, so common cells stay a pure dump sample.
    python convert_gm.py  ->  raw/games_gm.jsonl
"""
import glob, json, os
from lib import *
from mk_gm import to_rec

THIN = 1500
OK_STATUS = {'mate', 'resign', 'outoftime', 'draw', 'stalemate'}


def dump_counts():
    tot = {}
    for f in glob.glob(os.path.join(RAW, 'status_*.json')):
        for k, v in json.load(open(f))['cells'].items():
            tot[k] = tot.get(k, 0) + v
    return tot


def main():
    have = dump_counts()
    added = {}
    seen = set()
    out = open(os.path.join(RAW, 'games_gm.jsonl'), 'w', encoding='utf8')
    for path in sorted(glob.glob(os.path.join(RAW, 'gm', '*.ndjson'))):
        user = os.path.basename(path)[:-7].split('__')[0]
        for line in open(path, encoding='utf8'):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get('id') in seen or d.get('status') not in OK_STATUS or not d.get('rated'):
                continue
            got = to_rec(d, user)
            if not got:
                continue
            rec, _ = got
            if rec['ev'] is None or rec['ck'] is None or abs(rec['w'] - rec['b']) > 250:
                continue
            key = f"{rec['tc']}|{bucket_of(rec['w'], rec['b'])}"
            if have.get(key, 0) + added.get(key, 0) >= THIN:
                continue
            seen.add(d['id'])
            added[key] = added.get(key, 0) + 1
            rec.pop('opp', None)
            rec['eco'] = ''; rec['d'] = ''
            out.write(json.dumps(rec, separators=(',', ':')) + '\n')
    out.close()
    print('added', sum(added.values()), 'games to', len(added), 'thin cells')
    for k, v in sorted(added.items(), key=lambda kv: -kv[1])[:12]:
        print('  ', k, v)


if __name__ == '__main__':
    main()
