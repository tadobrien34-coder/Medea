"""Per-opening statistics, classification and written summaries."""
import json, os, re
from collections import Counter
import chess
import numpy as np
from lib import *
from lib_pieces import pieceName
import board_pass as bp
from mk_book import vkey_of, fkey_of, side_of, pos_key

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


PK = ['P', 'N', 'B', 'R', 'Q', 'K']
PNAME_FULL = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']


def sqn(i):
    return chess.square_name(int(i))


def slip_summary(rows):
    """Which piece slipped the lead, where it went, and whether the reply took it."""
    out, tot = {}, max(1, len(rows))
    for pc in range(6):
        r = rows[rows[:, 4] == pc]
        if len(r) < 6:
            continue
        ids = Counter(int(x) for x in r[:, 6] if x >= 0).most_common(3)
        to = Counter(int(x) for x in r[:, 8] if x >= 0).most_common(6)
        capd = r[r[:, 9] == 1]
        out[PK[pc]] = {
            'n': int(len(r)), 'share': round(len(r) / tot, 3),
            'ids': [[sqn(i), round(c / len(r), 2)] for i, c in ids],
            'to': [[sqn(q), round(c / len(r), 2)] for q, c in to],
            'cap': round(len(capd) / len(r), 2),
            'by': [[PK[t - 1], round(c / len(capd), 2)] for t, c in Counter(int(x) for x in capd[:, 10]).most_common(3)] if len(capd) >= 6 else [],
        }
    return out


def loss_summary(rows, n_games):
    """Pieces of one colour that were captured: how often, where, by what, and whether it was a clean win."""
    out = {}
    for t in range(1, 6):                       # pawn..queen (python-chess numbering)
        r = rows[rows[:, 3] == t]
        if len(r) < 8:
            continue
        ids = Counter(int(x) for x in r[:, 4] if x >= 0).most_common(3)
        sq = Counter(int(x) for x in r[:, 5]).most_common(6)
        by = Counter(int(x) for x in r[:, 6]).most_common(3)
        out[PK[t - 1]] = {
            'per100': round(100 * len(r) / n_games, 1), 'clean': round(float((r[:, 7] == 1).mean()), 2),
            'ids': [[sqn(i), round(100 * c / n_games, 1)] for i, c in ids],
            'sq': [[sqn(q), round(100 * c / n_games, 1)] for q, c in sq],
            'by': [[PK[b - 1], round(c / len(r), 2)] for b, c in by],
        }
    return out


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


def piece_baseline(shifts):
    own = shifts[shifts[:, 2] == shifts[:, 3]]
    c = np.bincount(own[:, 4], minlength=6).astype(float)
    return (c / c.sum()).tolist()


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


def analyse(level, key, idx, tables, ev_all, base, meta, global_tact, n_games, tree_next):
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
    # per-piece detail: which piece, where, and what happened next
    slip = {'you': slip_summary(own), 'them': slip_summary(opp)}
    LS = tables['losses']
    inL = np.zeros(len(rows['res']), dtype=bool)
    inL[idx] = True
    Lg = LS[inL[LS[:, 0]]] if len(LS) else LS
    lost_pieces = {'you': loss_summary(Lg[Lg[:, 2] == side], n), 'them': loss_summary(Lg[Lg[:, 2] == 1 - side], n)}
    nxt = []
    if m.get('sans'):
        bb = chess.Board()
        try:
            for sn in m['sans']:
                bb.push_san(sn)
            kids = tree_next.get(pos_key(bb), [])
            tot_k = sum(c for _, c in kids) or 1
            nxt = [[sn, round(c / tot_k, 2)] for sn, c in sorted(kids, key=lambda x: -x[1])[:4] if c / tot_k >= 0.05]
        except Exception:
            nxt = []
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
        order = [i for i in np.argsort(-lift) if bp.TACTICS[i][0] not in SIGNATURE_SKIP and c[i] >= 6 and lift[i] >= 1.15][:3]
        sig.append([{'id': bp.TACTICS[i][0], 'name': bp.TACTICS[i][1], 'per100': round(100 * rate[i], 1),
                     'lift': round(float(lift[i]), 2)} for i in order])
    heat = {}
    for key_, arr in (('w', T[T[:, 4] == 0]), ('b', T[T[:, 4] == 1])):
        lo, hi = arr[:, 17], arr[:, 18]
        h = np.zeros(64)
        for q in range(64):
            h[q] = (((lo >> q) & 1) if q < 32 else ((hi >> (q - 32)) & 1)).sum()
        heat[key_] = [round(float(100 * x / n), 1) for x in h]
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
    band_obj = []
    for bi in range(len(BAND_NAMES)):
        mk = (avg >= BAND_EDGES[bi]) & (avg < BAND_EDGES[bi + 1])
        if mk.sum() >= 15 and last >= 16:
            with np.errstate(all='ignore'):
                band_obj.append(round(float(np.nanmean(np.nanmedian(ev[mk][:, 9:16], axis=0))), 2))
        else:
            band_obj.append(None)
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
        'traj': traj, 'by_tc': by_tc, 'bands': bands, 'band_obj': band_obj,
        'edge': {'share': edge_share, 'move': edge_move}, 'win': {'share': win_share, 'move': win_move},
        'wins': {'mate': pct(wtypes[0], max(1, sum(wtypes))), 'resign': pct(wtypes[1], max(1, sum(wtypes))),
                 'time': pct(wtypes[2], max(1, sum(wtypes))), 'median_move': int(np.median(em[won])) if won.any() else None},
        'losses': {'mate': pct(ltypes[0], max(1, sum(ltypes))), 'resign': pct(ltypes[1], max(1, sum(ltypes))),
                   'time': pct(ltypes[2], max(1, sum(ltypes))), 'median_move': int(np.median(em[lost])) if lost.any() else None},
        'careful': [int(x) for x in careful], 'target': [int(x) for x in target], 'punish': [int(x) for x in punish_you],
        'careful_lift': lift_of(careful, base['pieces']), 'target_lift': lift_of(target, base['pieces']),
        'careful_moves': [int(np.percentile(own_moves, 25)), int(np.percentile(own_moves, 75))] if len(own_moves) >= 8 else None,
        'target_moves': [int(np.percentile(opp_moves, 25)), int(np.percentile(opp_moves, 75))] if len(opp_moves) >= 8 else None,
        'shifts_per_game': round(float(len(S)) / n, 2),
        'signature': {'yours': sig[0], 'theirs': sig[1]},
        'heat': heat, 'slip': slip, 'lost': lost_pieces, 'next': nxt,
    }
    out['summary'] = summarise(out)
    out['plan'] = plan_text(out)
    out['tips'] = tips(out)
    return out


def lift_of(counts, base):
    c = np.asarray(counts, dtype=float)
    if c.sum() < 12:
        return [None] * 6
    return [round(float(x), 2) for x in (c / c.sum()) / np.asarray(base)]



def plan_text(o):
    """One or two sentences: where play usually goes and what to watch."""
    bits = []
    if o.get('next'):
        bits.append('Usually continues ' + ', '.join(f"{sn} ({int(p * 100)}%)" for sn, p in o['next'][:3]) + '.')
    sl = o['slip']['you']
    if sl:
        top = max(sl.items(), key=lambda kv: kv[1]['n'])
        k, v = top
        to = ', '.join(q for q, _ in v['to'][:2])
        bits.append(f"Your {PNAME_FULL[PK.index(k)]} is the one to watch" + (f" (often landing on {to})." if to else '.'))
    th = o['slip']['them']
    if th:
        k, v = max(th.items(), key=lambda kv: kv[1]['n'])
        bits.append(f"Aim at their {PNAME_FULL[PK.index(k)]}.")
    return ' '.join(bits)



def tips(o):
    """Short, specific things to do, each backed by a number from the games."""
    out = []
    e, w = o['edge'], o['win']
    if e['move'] and e['share']:
        out.append(f"Aim for a steady edge by move {e['move']}: {e['share'] * 100:.0f}% of games get there"
                   + (f", and {w['share'] * 100:.0f}% reach +6 by move {w['move']}." if w['move'] and w['share'] else '.'))
    def pick(slip, lift):
        """The piece that slips more than usual in this opening; failing that, the one that slips most."""
        if not slip:
            return None
        best = None
        for i, k in enumerate(PK):
            if k in slip and lift[i] and lift[i] >= 1.15 and k != 'K' and (best is None or lift[i] > lift[PK.index(best)]):
                best = k
        return best or max(slip, key=lambda k: slip[k]['n'])
    ky = pick(o['slip']['you'], o['careful_lift'])
    if ky:
        v = o['slip']['you'][ky]; lf = o['careful_lift'][PK.index(ky)]
        lead = f", most often the {pieceName(ky, v['ids'][0][0])} ({v['ids'][0][1] * 100:.0f}%)" if v['ids'] and ky in 'NBRP' and v['ids'][0][1] >= 0.3 else ''
        sq = ', '.join(q for q, _ in v['to'][:3])
        rate = f", {lf:.1f}× the usual rate" if lf and lf >= 1.15 else ''
        out.append(f"Watch your {PNAME_FULL[PK.index(ky)]}: it is behind {v['share'] * 100:.0f}% of your lost leads{rate}{lead}" + (f", landing on {sq}." if sq else '.'))
    kt = pick(o['slip']['them'], o['target_lift'])
    if kt:
        v = o['slip']['them'][kt]; lf = o['target_lift'][PK.index(kt)]
        lead = f", most often the {pieceName(kt, v['ids'][0][0])} ({v['ids'][0][1] * 100:.0f}%)" if v['ids'] and kt in 'NBRP' and v['ids'][0][1] >= 0.3 else ''
        by = f" Take it with a {PNAME_FULL[PK.index(v['by'][0][0])]}." if v['by'] else ''
        rate = f", {lf:.1f}× the usual rate" if lf and lf >= 1.15 else ''
        out.append(f"Aim at their {PNAME_FULL[PK.index(kt)]}: it is behind {v['share'] * 100:.0f}% of their lost leads{rate}{lead}. The reply wins it outright {v['cap'] * 100:.0f}% of the time.{by}")
    hy = o['heat']['w' if o['side'] == 0 else 'b']
    ht = o['heat']['b' if o['side'] == 0 else 'w']
    sq_you = [chess.square_name(i) for i in np.argsort(hy)[::-1][:2] if hy[i] >= 1.5]
    sq_them = [chess.square_name(i) for i in np.argsort(ht)[::-1][:2] if ht[i] >= 1.5]
    if sq_you:
        out.append(f"Material changes hands for you on {' and '.join(sq_you)}: build pressure there.")
    if sq_them:
        out.append(f"They win material on {' and '.join(sq_them)}: keep those squares defended.")
    sig = o['signature']
    if sig['yours']:
        x = sig['yours'][0]; out.append(f"Look for the {x['name'].lower()}: it appears {x['lift']:.1f}× as often as usual in this opening.")
    if sig['theirs']:
        x = sig['theirs'][0]; out.append(f"Expect a {x['name'].lower()} against you ({x['lift']:.1f}× usual): check for it before every quiet move.")
    return out[:6]


def pawn_tokens(line):
    """The pawn changes a line makes: pawns now on new squares, and start squares they left."""
    start = chess.Board()
    b = chess.Board()
    for sn in line:
        b.push_san(sn)
    def toks(board):
        return {('P' if c == chess.WHITE else 'p') + chess.square_name(q) for c in (chess.WHITE, chess.BLACK) for q in board.pieces(chess.PAWN, c)}
    now, then = toks(b), toks(start)
    return frozenset({'+' + t for t in now - then} | {'-' + t for t in then - now})


def add_similar(entries):
    """Openings with a similar pawn structure or the same attacking targets (same colour, different family)."""
    vec, paw = {}, {}
    for o in entries:
        if not o.get('line') or o['n'] < 300:
            continue
        try:
            paw[(o['level'], o['key'])] = pawn_tokens(o['line'])
        except Exception:
            continue
        h = np.array(o['heat']['w' if o['side'] == 0 else 'b'] + o['heat']['b' if o['side'] == 0 else 'w'], dtype=float)
        vec[(o['level'], o['key'])] = h / (np.linalg.norm(h) or 1)
    keys = list(paw)
    by_key = {(o['level'], o['key']): o for o in entries}
    for o in entries:
        k0 = (o['level'], o['key'])
        if k0 not in paw:
            o['similar'] = []
            continue
        cands = []
        for k1 in keys:
            p = by_key[k1]
            if k1 == k0 or p['side'] != o['side'] or fkey_of(p['key']) == fkey_of(o['key']):
                continue
            jac = len(paw[k0] & paw[k1]) / max(1, len(paw[k0] | paw[k1]))
            cos = float(vec[k0] @ vec[k1])
            cands.append((0.55 * jac + 0.45 * cos, jac, cos, p))
        cands.sort(key=lambda x: -x[0])
        out = []
        for sim, jac, cos, p in cands[:4]:
            if sim < 0.3:
                break
            why = 'Near-identical pawn structure' if jac >= 0.75 else 'Similar pawn structure' if jac >= 0.5 else 'Related pawn setup'
            if cos >= 0.6:
                a = np.array(o['heat']['w' if o['side'] == 0 else 'b']) * np.array(p['heat']['w' if p['side'] == 0 else 'b'])
                tops = [chess.square_name(i) for i in np.argsort(a)[::-1][:2] if a[i] > 0]
                why += f"; both win material on {' and '.join(tops)}" if tops else '; similar targets'
            out.append({'key': p['key'], 'level': p['level'], 'slug': p['slug'], 'why': why, 'sim': round(sim, 2), 'verdict': p['verdict'], 'score': p['score'], 'n': p['n'], 'line': p['line']})
        o['similar'] = out


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
        lf = o['careful_lift']
        tag = lambda i: f"{c[i] / c.sum() * 100:.0f}%" + (f", {lf[i]:.1f}× usual" if lf[i] and lf[i] >= 1.2 else '')
        L.append('Careful with your ' + ' and '.join(f"{PNAME[i]} ({tag(i)})" for i in top)
                 + f": the piece you move when the lead slips{mv}.")
    t = np.array(o['target'], dtype=float)
    if t.sum() >= 12:
        top = np.argsort(-t)[:2]
        lf = o['target_lift']
        tag = lambda i: f"{t[i] / t.sum() * 100:.0f}%" + (f", {lf[i]:.1f}× usual" if lf[i] and lf[i] >= 1.2 else '')
        L.append('Target their ' + ' and '.join(f"{PNAME[i]} ({tag(i)})" for i in top)
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
    base['pieces'] = piece_baseline(tables['shifts'])
    n_games = len(vk)
    tact = tables['tact']
    gt = np.bincount(tact[:, 1], minlength=len(bp.TACTICS)) / n_games / 2.0   # per game per side
    print('baselines', base)
    tree_next = {}
    for (parent, san), v in tables['tree'].items():
        tree_next.setdefault(parent, []).append((san, v[2]))
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
            o = analyse(level, key, idx, tables, ev, base, meta, gt, n_games, tree_next)
            entries.append(o)
    # families that are also lone variations keep level 'f'; link variations to families
    fam_children = {}
    for o in entries:
        if o['level'] == 'v':
            fam_children.setdefault(fkey_of(o['key']), []).append(o['key'])
    add_similar(entries)
    index = []
    for o in entries:
        o['family'] = fkey_of(o['key'])
        if o['level'] == 'f':
            o['children'] = sorted(fam_children.get(o['key'], []), key=lambda k: -next(x['n'] for x in entries if x['key'] == k))
        json.dump(o, open(os.path.join(outdir, 'openings', f"{o['level']}-{o['slug']}.json"), 'w'), separators=(',', ':'))
        index.append({k: o[k] for k in ('key', 'level', 'slug', 'family', 'side', 'eco', 'n', 'score', 'wdl', 'obj', 'rel_obj', 'steady',
                                         'play', 'tier_obj', 'tier_play', 'verdict', 'sd30', 'edge', 'win', 'shifts_per_game')})
        index[-1]['plan'] = o['plan']
        index[-1]['next'] = o['next']
        index[-1]['band_score'] = [None if not any(b['band'] == nm for b in o['bands']) else
                                   round(next(b['win'] + 0.5 * b['draw'] for b in o['bands'] if b['band'] == nm), 3) for nm in BAND_NAMES]
        index[-1]['band_n'] = [next((b['n'] for b in o['bands'] if b['band'] == nm), 0) for nm in BAND_NAMES]
        index[-1]['band_obj'] = o['band_obj']
        index[-1]['med'] = {str(p): (o['traj']['med'][p - 1] if len(o['traj']['med']) >= p else None) for p in (8, 16, 24, 40)}
        index[-1]['line'] = o['line']
    json.dump({'baselines': base, 'min_games': MIN_GAMES, 'openings': index}, open(os.path.join(outdir, 'openings.json'), 'w'),
              separators=(',', ':'))
    print('openings:', len(index), 'files; families', sum(1 for o in index if o['level'] == 'f'))
    return entries
