"""Per-opening statistics, classification and written summaries."""
import json, os, re
import numpy as np
from lib import *
import board_pass as bp
from mk_book import vkey_of, fkey_of, side_of

MIN_GAMES = 100
PNAME = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
TNAME = {k: v for k, v in bp.TACTICS}
SIGNATURE_SKIP = {'other', 'attack', 'win_exchange', 'perpetual', 'stalemate', 'promotion'}


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def wdl(res, side):
    w = int(((res == 0) if side == 0 else (res == 2)).sum())
    l = int(((res == 2) if side == 0 else (res == 0)).sum())
    d = int((res == 1).sum())
    return [w, d, l]


def pct(a, b, nd=3):
    return round(a / b, nd) if b else None


def median_move(plies):
    plies = np.asarray(plies)
    return int(np.median(plies // 2 + 1)) if len(plies) else None


def prep(tables):
    rows = tables['rows']
    names = rows['v']
    vk = np.array([vkey_of(x) for x in names], dtype=object)
    fk = np.array([fkey_of(x) for x in names], dtype=object)
    ev = rows['ev'].astype(np.float32)
    ev[rows['ev'] == -32768] = np.nan
    return vk, fk, ev / 100.0


def baselines(rows, ev):
    N = len(ev)
    bw = float(np.nanmedian(ev[:, 9:16]))
    res = rows['res']
    ws = float(((res == 0).sum() + 0.5 * (res == 1).sum()) / N)
    npl = rows['npl']
    ok = npl >= 30
    st_w = float(((ev[ok, 19] >= 0.3) & (ev[ok, 29] >= 0.3)).mean())
    st_b = float(((ev[ok, 19] <= -0.3) & (ev[ok, 29] <= -0.3)).mean())
    return {'obj': [bw, -bw], 'score': [ws, 1 - ws], 'steady': [st_w, st_b]}


def tier_obj(rel):
    return 'good' if rel >= 0.08 else ('sound' if rel >= -0.15 else 'dubious')


def tier_play(p):
    return 'high' if p >= 58 else ('ok' if p >= 46 else 'tricky')


def verdict(o, p):
    if o == 'dubious':
        return 'Avoid' if p != 'high' else 'Risky'
    if o == 'good' and p in ('high', 'ok'):
        return 'Recommended'
    if o == 'sound' and p == 'high':
        return 'Recommended'
    if o == 'good':
        return 'Solid'
    return 'Playable' if p != 'tricky' else 'Niche'


def analyse(level, key, idx, tables, ev_all, base, meta, global_tact, n_games):
    rows, shifts, tact = tables['rows'], tables['shifts'], tables['tact']
    n = len(idx)
    m = meta.get((level, key)) or {}
    plies = m.get('plies', 1)
    side = side_of(key, plies)
    sg = 1 if side == 0 else -1
    ev = ev_all[idx] * sg
    res = rows['res'][idx]
    ww, dd, ll = wdl(res, side)
    score = (ww + 0.5 * dd) / n
    cnt = (~np.isnan(ev)).sum(0)
    with np.errstate(all='ignore'):
        med = np.nanmedian(ev, axis=0)
        sd = np.nanstd(ev, axis=0)
    ok = cnt >= max(20, int(0.08 * n))
    last = int(np.max(np.flatnonzero(ok))) + 1 if ok.any() else 0
    traj = {'med': [round(float(x), 2) for x in med[:last]], 'sd': [round(float(x), 2) for x in sd[:last]],
            'n': [int(x) for x in cnt[:last]]}
    obj = float(np.nanmean(med[9:16])) if last >= 16 else (float(np.nanmean(med[:last])) if last else 0.0)
    npl = rows['npl'][idx]
    g30 = npl >= 30
    if g30.sum() >= 20:
        steady = float(((ev[g30, 19] >= 0.3) & (ev[g30, 29] >= 0.3)).mean())
    else:
        steady = base['steady'][side]
    # steady-edge / winning-advantage timing for the opener
    ea = rows['edge'][idx, side]
    wa = rows['win'][idx, side]
    edge_share, win_share = pct((ea >= 0).sum(), n), pct((wa >= 0).sum(), n)
    edge_move = median_move(ea[ea >= 0])
    win_move = median_move(wa[wa >= 0])
    et, em = rows['et'][idx], rows['em'][idx]
    won = ((res == 0) if side == 0 else (res == 2))
    lost = ((res == 2) if side == 0 else (res == 0))
    wtypes = [int(((et == k) & won).sum()) for k in (0, 1, 2)]
    ltypes = [int(((et == k) & lost).sum()) for k in (0, 1, 2)]
    # shifts
    inG = np.zeros(len(rows['res']), dtype=bool)
    inG[idx] = True
    sm = inG[shifts[:, 0]] if len(shifts) else np.zeros(0, bool)
    S = shifts[sm]
    own = S[(S[:, 2] == side) & (S[:, 3] == side)]            # you held the lead and moved: lead lost
    opp = S[(S[:, 2] == 1 - side) & (S[:, 3] == 1 - side)]    # opponent lost it
    careful = np.bincount(own[:, 4], minlength=6)
    target = np.bincount(opp[:, 4], minlength=6)
    punish_you = np.bincount(opp[:, 5][opp[:, 5] >= 0], minlength=6)   # the pieces that cash in for you
    own_moves = (own[:, 1] // 2 + 1) if len(own) else np.zeros(0)
    opp_moves = (opp[:, 1] // 2 + 1) if len(opp) else np.zeros(0)
    # tactics (primary tag only)
    tm = inG[tact[:, 0]] if len(tact) else np.zeros(0, bool)
    T = tact[tm]
    sig = []
    mine = T[T[:, 4] == side]
    theirs = T[T[:, 4] == 1 - side]
    for name, arr in (('yours', mine), ('theirs', theirs)):
        c = np.bincount(arr[:, 1], minlength=len(bp.TACTICS))
        rate = c / n
        lift = rate / np.maximum(global_tact, 1e-9)
        order = [i for i in np.argsort(-lift) if bp.TACTICS[i][0] not in SIGNATURE_SKIP and c[i] >= 6][:3]
        sig.append([{'id': bp.TACTICS[i][0], 'name': bp.TACTICS[i][1], 'per100': round(100 * rate[i], 1),
                     'lift': round(float(lift[i]), 2)} for i in order])
    by_tc = {}
    tcs = rows['tc'][idx]
    for i, t in enumerate(TCS):
        mk = tcs == i
        if mk.sum() >= 15:
            w_, d_, l_ = wdl(res[mk], side)
            by_tc[t] = {'n': int(mk.sum()), 'score': round((w_ + 0.5 * d_) / mk.sum(), 3)}
    avg = rows['avg'][idx]
    bands = []
    for i, name in enumerate(BAND_NAMES):
        mk = (avg >= BAND_EDGES[i]) & (avg < BAND_EDGES[i + 1])
        if mk.sum() >= 15:
            w_, d_, l_ = wdl(res[mk], side)
            bands.append({'band': name, 'n': int(mk.sum()), 'win': pct(w_, mk.sum()), 'draw': pct(d_, mk.sum()),
                          'loss': pct(l_, mk.sum())})
    rel_obj = obj - base['obj'][side]
    rel_score = score - base['score'][side]
    steady_rel = steady - base['steady'][side]
    play = float(np.clip(50 + 140 * rel_score + 60 * steady_rel, 0, 100))
    to, tp = tier_obj(rel_obj), tier_play(play)
    out = {
        'key': key, 'level': level, 'slug': slug(key), 'side': side, 'eco': m.get('eco'), 'n': n,
        'line': m.get('sans'),
        'wdl': [pct(ww, n), pct(dd, n), pct(ll, n)], 'score': round(score, 3),
        'obj': round(obj, 2), 'rel_obj': round(rel_obj, 2), 'steady': round(steady, 3), 'steady_n': int(g30.sum()),
        'play': round(play), 'tier_obj': to, 'tier_play': tp, 'verdict': verdict(to, tp),
        'sd30': round(float(sd[29]), 2) if last > 29 else None,
        'traj': traj, 'by_tc': by_tc, 'bands': bands,
        'edge': {'share': edge_share, 'move': edge_move}, 'win': {'share': win_share, 'move': win_move},
        'wins': {'mate': pct(wtypes[0], max(1, sum(wtypes))), 'resign': pct(wtypes[1], max(1, sum(wtypes))),
                 'time': pct(wtypes[2], max(1, sum(wtypes))), 'median_move': int(np.median(em[won])) if won.any() else None},
        'losses': {'mate': pct(ltypes[0], max(1, sum(ltypes))), 'resign': pct(ltypes[1], max(1, sum(ltypes))),
                   'time': pct(ltypes[2], max(1, sum(ltypes))), 'median_move': int(np.median(em[lost])) if lost.any() else None},
        'careful': [int(x) for x in careful], 'target': [int(x) for x in target], 'punish': [int(x) for x in punish_you],
        'careful_moves': [int(np.percentile(own_moves, 25)), int(np.percentile(own_moves, 75))] if len(own_moves) >= 8 else None,
        'target_moves': [int(np.percentile(opp_moves, 25)), int(np.percentile(opp_moves, 75))] if len(opp_moves) >= 8 else None,
        'shifts_per_game': round(float(len(S)) / n, 2),
        'signature': {'yours': sig[0], 'theirs': sig[1]},
    }
    out['summary'] = summarise(out)
    return out


def summarise(o):
    L = []
    side = 'White' if o['side'] == 0 else 'Black'
    ev_txt = {'good': 'objectively good', 'sound': 'objectively sound', 'dubious': 'objectively dubious'}[o['tier_obj']]
    pl_txt = {'high': 'highly playable', 'ok': 'playable', 'tricky': 'tricky in practice'}[o['tier_play']]
    L.append(f"{ev_txt.capitalize()} and {pl_txt} for {side}: scores {o['score'] * 100:.0f}%, median eval {o['obj']:+.2f} around moves 5–8.")
    e, w = o['edge'], o['win']
    if e['move']:
        s = f"A steady edge (+1.0) arrives by move {e['move']} in {e['share'] * 100:.0f}% of games"
        if w['move']:
            s += f"; a winning advantage (+6.0) by move {w['move']} in {w['share'] * 100:.0f}%"
        L.append(s + '.')
    c = np.array(o['careful'], dtype=float)
    if c.sum() >= 12:
        top = np.argsort(-c)[:2]
        mv = f", usually around moves {o['careful_moves'][0]}–{o['careful_moves'][1]}" if o['careful_moves'] else ''
        L.append('Careful with your ' + ' and '.join(f"{PNAME[i]} ({c[i] / c.sum() * 100:.0f}%)" for i in top)
                 + f": the piece you move when the lead slips{mv}.")
    t = np.array(o['target'], dtype=float)
    if t.sum() >= 12:
        top = np.argsort(-t)[:2]
        L.append('Target their ' + ' and '.join(f"{PNAME[i]} ({t[i] / t.sum() * 100:.0f}%)" for i in top)
                 + ': they give the advantage away with it most often.')
    sg = o['signature']['yours']
    if sg:
        L.append('Signature shots: ' + ', '.join(f"{x['name'].lower()} ({x['lift']:.1f}× typical)" for x in sg[:2]) + '.')
    wn = o['wins']
    L.append(f"Wins end by resignation {wn['resign'] * 100:.0f}%, mate {wn['mate'] * 100:.0f}%, clock {wn['time'] * 100:.0f}%"
             + (f" (median move {wn['median_move']})." if wn['median_move'] else '.'))
    return L


def build(tables, meta, outdir):
    os.makedirs(os.path.join(outdir, 'openings'), exist_ok=True)
    rows = tables['rows']
    vk, fk, ev = prep(tables)
    base = baselines(rows, ev)
    n_games = len(vk)
    tact = tables['tact']
    gt = np.bincount(tact[:, 1], minlength=len(bp.TACTICS)) / n_games / 2.0   # per game per side
    print('baselines', base)
    entries = []
    # variation level (names with ':') and family level
    for level, arr in (('v', vk), ('f', fk)):
        vals, inv, counts = np.unique(arr, return_inverse=True, return_counts=True)
        order = np.argsort(inv, kind='stable')
        starts = np.concatenate([[0], np.cumsum(counts)])
        for gi, key in enumerate(vals):
            if counts[gi] < MIN_GAMES or key in ('?', ''):
                continue
            if level == 'v' and ':' not in key:
                continue
            idx = order[starts[gi]:starts[gi + 1]]
            o = analyse(level, key, idx, tables, ev, base, meta, gt, n_games)
            entries.append(o)
    # families that are also lone variations keep level 'f'; link variations to families
    fam_children = {}
    for o in entries:
        if o['level'] == 'v':
            fam_children.setdefault(fkey_of(o['key']), []).append(o['key'])
    index = []
    for o in entries:
        o['family'] = fkey_of(o['key'])
        if o['level'] == 'f':
            o['children'] = sorted(fam_children.get(o['key'], []), key=lambda k: -next(x['n'] for x in entries if x['key'] == k))
        json.dump(o, open(os.path.join(outdir, 'openings', f"{o['level']}-{o['slug']}.json"), 'w'), separators=(',', ':'))
        index.append({k: o[k] for k in ('key', 'level', 'slug', 'family', 'side', 'eco', 'n', 'score', 'wdl', 'obj', 'rel_obj', 'steady',
                                         'play', 'tier_obj', 'tier_play', 'verdict', 'sd30', 'edge', 'win', 'shifts_per_game')})
        index[-1]['med'] = {str(p): (o['traj']['med'][p - 1] if len(o['traj']['med']) >= p else None) for p in (8, 16, 24, 40)}
        index[-1]['line'] = o['line']
    json.dump({'baselines': base, 'min_games': MIN_GAMES, 'openings': index}, open(os.path.join(outdir, 'openings.json'), 'w'),
              separators=(',', ':'))
    print('openings:', len(index), 'files; families', sum(1 for o in index if o['level'] == 'f'))
    return entries
