#!/usr/bin/env python3
"""Build the GM pool and download each GM's recent rated games per time control
(NDJSON with openings, clocks and, where analysed, Lichess evals).

    python fetch_gm.py pool            # build ref/gm_pool.json (leaderboards + GM names seen in the dump)
    python fetch_gm.py games --top 20  # fetch games for the top GMs of every time control (resumable)
"""
import argparse, glob, json, os, sys, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
REF, RAW = os.path.join(HERE, 'ref'), os.path.join(HERE, 'raw', 'gm')
UA = {'User-Agent': 'Medea-chess-research (tadthegoat@gmail.com)'}
TCS = ['bullet', 'blitz', 'rapid', 'classical']
MAX_GAMES = {'bullet': 1000, 'blitz': 1000, 'rapid': 800, 'classical': 600}


def get(url, **kw):
    while True:
        r = requests.get(url, headers={**UA, **kw.pop('headers', {})}, timeout=60, **kw)
        if r.status_code == 429:
            print('429 - sleeping 65s', flush=True); time.sleep(65); continue
        return r


def build_pool():
    names = {}
    for t in TCS:
        r = get(f'https://lichess.org/api/player/top/200/{t}', headers={'Accept': 'application/vnd.lichess.v3+json'}).json()
        for x in r['users']:
            if x.get('title') == 'GM' or t in ('rapid', 'classical'):
                names[x['id']] = x['username']
    for f in glob.glob(os.path.join(HERE, 'raw', 'games_*.jsonl')):
        with open(f, encoding='utf8') as fh:
            for line in fh:
                if '"wt":"GM"' not in line and '"bt":"GM"' not in line:
                    continue
                d = json.loads(line)
                if d.get('wt') == 'GM' and d.get('wn'): names[d['wn'].lower()] = d['wn']
                if d.get('bt') == 'GM' and d.get('bn'): names[d['bn'].lower()] = d['bn']
    ids = list(names)
    out = []
    for i in range(0, len(ids), 300):
        r = requests.post('https://lichess.org/api/users', data=','.join(ids[i:i + 300]),
                          headers={**UA, 'Content-Type': 'text/plain'}, timeout=60)
        if r.status_code == 429:
            time.sleep(65); r = requests.post('https://lichess.org/api/users', data=','.join(ids[i:i + 300]),
                                              headers={**UA, 'Content-Type': 'text/plain'}, timeout=60)
        for u in r.json():
            if u.get('closed') or u.get('tosViolation'):
                continue
            perfs = {k: {'rating': u['perfs'][k]['rating'], 'games': u['perfs'][k]['games'],
                         'prov': u['perfs'][k].get('prov', False)}
                     for k in TCS if k in u.get('perfs', {})}
            out.append({'id': u['id'], 'name': u['username'], 'title': u.get('title'), 'perfs': perfs,
                        'fide': (u.get('profile') or {}).get('fideRating')})
    os.makedirs(REF, exist_ok=True)
    json.dump(out, open(os.path.join(REF, 'gm_pool.json'), 'w'))
    print(len(out), 'GMs in pool')
    for t in TCS:
        c = [x for x in out if t in x['perfs'] and x['perfs'][t]['games'] >= 30 and not x['perfs'][t]['prov']]
        print(t, len(c), 'eligible')


def fetch_games(top, min_games, tcs):
    pool = json.load(open(os.path.join(REF, 'gm_pool.json')))
    os.makedirs(RAW, exist_ok=True)
    jobs = []
    for t in [x for x in TCS if x in tcs]:
        c = [x for x in pool if t in x['perfs'] and x['perfs'][t]['games'] >= min_games and not x['perfs'][t]['prov']]
        c.sort(key=lambda x: -x['perfs'][t]['rating'])
        gms = [x for x in c if x.get('title') == 'GM'][:top]
        if t in ('bullet', 'blitz'):
            pick = gms
        else:   # few GMs play rapid / classical on Lichess: fill with the top-rated others
            pick = gms + [x for x in c if x.get('title') != 'GM'][:max(0, 14 - len(gms))]
        jobs += [(x['name'], t) for x in pick]
    print(len(jobs), 'jobs', flush=True)
    for i, (user, t) in enumerate(jobs):
        path = os.path.join(RAW, f'{user}__{t}.ndjson')
        if os.path.exists(path):
            continue
        url = (f'https://lichess.org/api/games/user/{user}?max={MAX_GAMES[t]}&perfType={t}&rated=true'
               '&opening=true&clocks=true&evals=true&moves=true&ongoing=false')
        t0, n = time.time(), 0
        tmp = path + '.part'
        with get(url, headers={'Accept': 'application/x-ndjson'}, stream=True) as r, open(tmp, 'wb') as out:
            if r.status_code != 200:
                print('skip', user, t, r.status_code, flush=True); continue
            for line in r.iter_lines():
                if line:
                    out.write(line + b'\n'); n += 1
        os.replace(tmp, path)
        print(f'[{i + 1}/{len(jobs)}] {user} {t}: {n} games in {time.time() - t0:.0f}s', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['pool', 'games'])
    ap.add_argument('--top', type=int, default=20)
    ap.add_argument('--min-games', type=int, default=30)
    ap.add_argument('--tcs', default='bullet,blitz,rapid,classical')
    a = ap.parse_args()
    build_pool() if a.cmd == 'pool' else fetch_games(a.top, a.min_games, a.tcs.split(','))
