#!/usr/bin/env python3
"""Generate every JSON the site reads from out/dump_tables.pkl (+ GM tables when present)."""
import json, os, pickle, sys, time
SITE_DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'site', 'public', 'data')
import mk_book, mk_levels, mk_openings, mk_tree, mk_tactics, mk_method, mk_gm
from lib import *

def main():
    os.makedirs(SITE_DATA, exist_ok=True)
    t0 = time.time()
    tables = pickle.load(open(os.path.join(HERE, 'out', 'dump_tables.pkl'), 'rb'))
    print('loaded', tables['n'], 'games', round(time.time() - t0), 's')
    book, meta, entries = mk_book.build()
    json.dump({k: v for k, v in book.items()}, open(os.path.join(SITE_DATA, 'book.json'), 'w'), separators=(',', ':'))
    mk_levels.build(tables['cells'], SITE_DATA)
    ents = mk_openings.build(tables, meta, SITE_DATA)
    mk_tree.build(tables, book, SITE_DATA)
    if os.path.exists(os.path.join(HERE, 'ref', 'gm_pool.json')):
        mk_gm.build(SITE_DATA, ents)
    mk_tactics.build(tables, SITE_DATA, tables['n'])
    import glob as _g
    months = sorted(os.path.basename(f)[6:13] for f in _g.glob(os.path.join(HERE, 'raw', 'games_20*.jsonl')))
    nlines = lambda p: sum(1 for _ in open(p, encoding='utf8')) if os.path.exists(p) else 0
    gm_games = sum(nlines(f) for f in _g.glob(os.path.join(HERE, 'raw', 'gm', '*.ndjson')))
    api_games = nlines(os.path.join(HERE, 'raw', 'games_gm.jsonl'))
    mk_method.build(tables['cells'], SITE_DATA, tables['n'], {'built': time.strftime('%Y-%m-%d'), 'months': months, 'gm_games': gm_games, 'api_games': api_games})
    print('all done', round(time.time() - t0), 's')

if __name__ == '__main__':
    main()
