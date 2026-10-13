"""Opening tree (position -> candidate moves with stats) and best-line search -> data/tree.json, data/lines.json"""
import json, os
import numpy as np
import chess
from lib import *
from mk_book import pos_key

ROOT = pos_key(chess.Board())
DEPTH_PLIES = 10


def status(share, d, score, n):
    if n >= 20 and (d <= -0.9 or score < 0.30):
        return 'outrageous'
    if d <= -0.4 or (n >= 30 and score < 0.40):
        return 'dubious'
    if share >= 0.12:
        return 'main'
    if share >= 0.03:
        return 'sound'
    return 'rare'


def build(tables, book, outdir):
    tree = tables['tree']
    node_evs = {}
    for (parent, san), v in tree.items():
        node_evs.setdefault(v[0], []).extend(v[6])
    node_med = {k: float(np.median(e)) for k, e in node_evs.items() if len(e) >= 12}
    node_med[ROOT] = float(INIT_CP)
    by_parent = {}
    for (parent, san), v in tree.items():
        by_parent.setdefault(parent, []).append((san, v))
    out, children = {}, {}
    stats = {'edges': 0, 'outrageous': 0, 'dubious': 0, 'early_outrageous': []}
    for parent, lst in by_parent.items():
        tot = sum(v[2] for _, v in lst)
        if tot < 30:
            continue
        mover_white = parent.split(' ')[1] == 'w'
        sgn = 1 if mover_white else -1
        pm = node_med.get(parent)
        kids = []
        for san, v in sorted(lst, key=lambda x: -x[1][2]):
            n = v[2]
            if n < (12 if v[1] < 6 else 20):
                continue
            med = float(np.median(v[6])) if len(v[6]) >= 5 else None
            d = ((med - pm) * sgn / 100.0) if (med is not None and pm is not None) else 0.0
            w, dr, l = v[3], v[4], v[5]
            score = ((w if mover_white else l) + 0.5 * dr) / n
            st = status(n / tot, d, score, n)
            stats['edges'] += 1
            if st in ('outrageous', 'dubious'):
                stats[st] += 1
                if st == 'outrageous' and v[1] < 4:
                    stats['early_outrageous'].append([san, n, round(d, 2), round(score, 3), v[1]])
            kids.append([san, n, w, dr, l, None if med is None else int(round(med)), st])
            children.setdefault(parent, []).append((san, v[0], n, d, score, st, med))
        if kids:
            out[parent] = kids
    json.dump({'root': ROOT, 'nodes': out}, open(os.path.join(outdir, 'tree.json'), 'w'), separators=(',', ':'))
    print('tree nodes:', len(out), 'edges', stats['edges'], 'dubious', stats['dubious'], 'outrageous', stats['outrageous'])

    # ---- depth-first expectimax with pruning: the opener picks the best move, the opponent replies as real players do
    import functools
    sys_rec = __import__('sys').getrecursionlimit()
    kids_of = {k: sorted([c for c in v if c[5] in ('main', 'sound') and c[2] >= 60], key=lambda c: -c[2]) for k, v in children.items()}

    @functools.lru_cache(maxsize=None)
    def value(key, ply, opener):
        """Evaluation for the opener (cp) after best play by the opener against typical replies."""
        kids = kids_of.get(key, [])
        sgn = 1 if opener == 0 else -1
        here = node_med.get(key)
        if ply >= DEPTH_PLIES or not kids:
            return None if here is None else sgn * here
        opener_moves = (key.split(' ')[1] == 'w') == (opener == 0)
        vals = []
        for san, ck, n, d, score, st, med in (kids if opener_moves else kids[:4]):
            v = value(ck, ply + 1, opener)
            if v is None:
                v = None if med is None else sgn * med
            if v is not None:
                vals.append((v, n))
        if not vals:
            return None if here is None else sgn * here
        if opener_moves:
            return max(v for v, _ in vals)
        return sum(v * n for v, n in vals) / sum(n for _, n in vals)

    def principal(key, ply, opener, path, names, first_choice=None):
        kids = kids_of.get(key, [])
        if ply >= DEPTH_PLIES or not kids:
            return path, names
        opener_moves = (key.split(' ')[1] == 'w') == (opener == 0)
        if opener_moves:
            scored = [(value(ck, ply + 1, opener) if value(ck, ply + 1, opener) is not None else -1e9, c) for c in kids for ck in [c[1]]]
            pick = max(scored, key=lambda x: x[0])[1] if first_choice is None else first_choice
        else:
            pick = kids[0]
        san, ck, n, d, score, st, med = pick
        nm = book.get(ck, [None, None])[1] or names
        return principal(ck, ply + 1, opener, path + [(san, n, med, score, ck)], nm)

    lines = {'white': [], 'black': {}, 'pruned': stats}

    def collect(start_key, start_path, ply, opener, k):
        """Top-k principal variations from a node, branching on the opener's first k best moves."""
        kids = kids_of.get(start_key, [])
        opener_moves = (start_key.split(' ')[1] == 'w') == (opener == 0)
        out, seen = [], set()
        cand = kids if not opener_moves else sorted(kids, key=lambda c: -(value(c[1], ply + 1, opener) if value(c[1], ply + 1, opener) is not None else -1e9))
        for c in cand[:k]:
            san, ck, n, d, score, st, med = c
            path, nm = principal(ck, ply + 1, opener, start_path + [(san, n, med, score, ck)], book.get(ck, [None, None])[1])
            if len(path) < 5 or path[-1][4] in seen:
                continue
            seen.add(path[-1][4])
            v = value(ck, ply + 1, opener)
            nn = min(p[1] for p in path)
            sc = path[-1][3]
            out.append({'moves': [p[0] for p in path], 'n': path[-1][1], 'eval': round((v if v is not None else 0) / 100.0, 2),
                        'score': round(sc if ((len(path) % 2 == 1) == (opener == 0)) else 1 - sc, 3), 'name': nm, 'min_n': nn})
        return out

    lines['white'] = sorted(collect(ROOT, [], 0, 0, 8), key=lambda x: -x['eval'])[:6]
    for san, ck, n, d, score, st, med in sorted(children.get(ROOT, []), key=lambda c: -c[2])[:5]:
        if st not in ('main', 'sound'):
            continue
        res = collect(ck, [(san, n, med, score, ck)], 1, 1, 8)
        lines['black'][san] = sorted(res, key=lambda x: -x['eval'])[:6]
    json.dump(lines, open(os.path.join(outdir, 'lines.json'), 'w'), separators=(',', ':'))
    return lines
