"""Additive per-(time control, 100-elo bucket) aggregates, plus JSON rendering."""
import numpy as np
from lib import *
from features import first_sustained

THR_GRID = [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0]

NM = len(MOVE_BINS)
NCS = len(CLOCK_SEC_EDGES) - 1
NCP = len(CLOCK_PCT_EDGES) - 1
TMAX = 80


def new_agg():
    z = np.zeros
    return {
        'n': z(1), 'res': z(3), 'end_hist': z(MAXMOVE + 1), 'end_type': z(4), 'end_type_sum': z(4),
        'shift_hist': z(10), 'shift_sum': z(1), 'fshift_hist': z(MAXMOVE + 1), 'ponr_hist': z(MAXMOVE + 1),
        'ponr_n': z(1), 'decisive': z(1), 'noshift_decisive': z(1),
        'pc_blunder': z((3, 6)), 'pc_punish': z((3, 6)), 'pc_blunder_all': z(6), 'pc_mistake_all': z(6),
        'pc_moves': z(6), 'shift_n_by_move': z(MAXMOVE + 1),
        'chk': z(4), 'chk_moves': z(4), 'cap': z(4), 'cap_moves': z(4), 'cap_games': z(1),
        'bl_move': z((NM, 4)), 'bl_csec': z((NCS, 4)), 'bl_cpct': z((NCP, 4)),
        't_move_sum': z(TMAX), 't_move_cnt': z(TMAX), 't_frac_sum': z(TMAX),
        't_total': z(2), 'clock_games': z(1),
        'flag': z(3),            # flagged games, flagged while >= +2, flagged while >= WIN_ADV
        'edge_n': z(2), 'win_n': z(2),   # games where either side reached a steady edge / winning adv
        'eval_games': z(1),
        'thr': z((len(THR_GRID), 3)),    # per threshold: sustained-reach count, wins, kept-edge
    }


def merge(a, b):
    for k in a:
        a[k] += b[k]
    return a


def _phase(moveno):
    return 0 if moveno <= 10 else (1 if moveno <= 30 else 2)


def _bin(v, edges):
    return int(np.searchsorted(edges, v, side='right') - 1)


MOVE_EDGES = [b[0] for b in MOVE_BINS]


def add_game(A, f):
    A['n'][0] += 1
    A['res'][f.res] += 1
    A['end_hist'][min(f.end_move, MAXMOVE)] += 1
    A['end_type'][f.end_type] += 1
    A['end_type_sum'][f.end_type] += f.end_move
    n = f.n
    even, odd = f.mover == 0, f.mover == 1
    for side, mask in ((0, even), (1, odd)):
        A['chk'][side] += f.chk[mask].sum()
        A['chk_moves'][side] += mask.sum()
        A['cap'][side] += f.cap[mask].sum()
        A['cap_moves'][side] += mask.sum()
    if f.winner >= 0:
        wm = f.mover == f.winner
        A['chk'][2] += f.chk[wm].sum(); A['chk_moves'][2] += wm.sum()
        A['chk'][3] += f.chk[~wm].sum(); A['chk_moves'][3] += (~wm).sum()
        A['cap'][2] += f.cap[wm].sum(); A['cap_moves'][2] += wm.sum()
        A['cap'][3] += f.cap[~wm].sum(); A['cap_moves'][3] += (~wm).sum()
    A['pc_moves'] += np.bincount(f.pc, minlength=6)

    # ---- time
    if f.has_clock:
        A['clock_games'][0] += 1
        A['t_total'] += [f.spent.sum(), n]
        m = np.minimum(f.moveno, TMAX) - 1
        np.add.at(A['t_move_sum'], m, f.spent)
        np.add.at(A['t_move_cnt'], m, 1)
        np.add.at(A['t_frac_sum'], m, np.minimum(f.cpct, 150))
        if f.rec.get('tm') and f.has_eval:
            loser = 1 if f.res == 0 else 0
            le = f.p[-1] * (1 if loser == 0 else -1) if f.n else 0
            # eval is after the last move; the flagger's eval from their own point of view
            A['flag'][0] += 1
            A['flag'][1] += le >= 2.0
            A['flag'][2] += le >= WIN_ADV
        elif f.rec.get('tm'):
            A['flag'][0] += 1

    if not f.has_eval:
        return
    A['eval_games'][0] += 1
    ns = len(f.shift_ply)
    A['shift_hist'][min(ns, 9)] += 1
    A['shift_sum'][0] += ns
    if f.winner >= 0:
        A['decisive'][0] += 1
        if ns == 0:
            A['noshift_decisive'][0] += 1
        if f.ponr >= 0:
            A['ponr_n'][0] += 1
            A['ponr_hist'][min(f.ponr // 2 + 1, MAXMOVE)] += 1
    if ns:
        A['fshift_hist'][min(int(f.shift_ply[-1]) // 2 + 1, MAXMOVE)] += 1
        for j, frm in zip(f.shift_ply, f.shift_from):
            j = int(j)
            A['shift_n_by_move'][min(j // 2 + 1, MAXMOVE)] += 1
            mover = j % 2
            holder = 0 if frm == 1 else 1
            if mover == holder:                    # holder threw it away
                ph = _phase(j // 2 + 1)
                A['pc_blunder'][ph, f.pc[j]] += 1
                if j + 1 < n:
                    A['pc_punish'][ph, f.pc[j + 1]] += 1
    # blunder statistics per mover
    mv = np.minimum(f.moveno, 101)
    bi = np.searchsorted(MOVE_EDGES, mv, side='right') - 1
    for k, flag in ((0, np.ones(n, dtype=bool)), (1, f.is_inacc), (2, f.is_mistake), (3, f.is_blunder)):
        np.add.at(A['bl_move'][:, k], bi, flag)
    np.add.at(A['pc_blunder_all'], f.pc[f.is_blunder], 1)
    np.add.at(A['pc_mistake_all'], f.pc[f.is_mistake], 1)
    if f.has_clock:
        cs = np.searchsorted(CLOCK_SEC_EDGES, f.cb, side='right') - 1
        cp = np.searchsorted(CLOCK_PCT_EDGES, f.cpct, side='right') - 1
        cs = np.clip(cs, 0, NCS - 1); cp = np.clip(cp, 0, NCP - 1)
        for k, flag in ((0, np.ones(n, dtype=bool)), (1, f.is_inacc), (2, f.is_mistake), (3, f.is_blunder)):
            np.add.at(A['bl_csec'][:, k], cs, flag)
            np.add.at(A['bl_cpct'][:, k], cp, flag)
    for side in (0, 1):
        e = f.p if side == 0 else -f.p
        for ti, T in enumerate(THR_GRID):
            k = first_sustained(e, T, WIN_SUSTAIN)
            if k >= 0:
                A['thr'][ti, 0] += 1
                A['thr'][ti, 1] += (f.winner == side)
                A['thr'][ti, 2] += (e[k:].min() >= LEAD)
    A['edge_n'] += [f.edge_at[0] >= 0 or f.edge_at[1] >= 0, f.edge_at[0] >= 0 and f.edge_at[1] >= 0]
    A['win_n'] += [f.win_at[0] >= 0 or f.win_at[1] >= 0, f.win_at[0] >= 0 and f.win_at[1] >= 0]


# ---------------------------------------------------------------------------------------
def _rate(a, b, nd=4):
    return r(a / b, nd) if b else None


def render(A):
    """Turn summed arrays into the JSON object the site consumes."""
    n = int(A['n'][0])
    if n == 0:
        return None
    ne = int(A['eval_games'][0]) or 1
    out = {'n': n}
    eh = A['end_hist']
    out['result'] = {'white': _rate(A['res'][0], n), 'draw': _rate(A['res'][1], n), 'black': _rate(A['res'][2], n)}
    out['end'] = {
        'mean': r((eh * np.arange(len(eh))).sum() / n, 1), 'median': hist_quantile(eh, .5),
        'p25': hist_quantile(eh, .25), 'p75': hist_quantile(eh, .75),
        'hist': [int(x) for x in [eh[a:b + 1].sum() for a, b in MOVE_BINS[:-1] if a <= MAXMOVE] + [eh[101:].sum()]],
        'by': {k: {'share': _rate(A['end_type'][i], n), 'mean': _rate(A['end_type_sum'][i], A['end_type'][i], 1)}
               for i, k in enumerate(['mate', 'resign', 'time', 'draw'])},
    }
    sh = A['shift_hist']
    out['shifts'] = {
        'mean': _rate(A['shift_sum'][0], ne, 3), 'zero': _rate(sh[0], ne), 'hist': [_rate(x, ne) for x in sh[:7]] + [_rate(sh[7:].sum(), ne)],
        'wire_to_wire': _rate(A['noshift_decisive'][0], A['decisive'][0]),
    }
    fh = A['fshift_hist']
    nf = fh.sum()
    out['final_shift'] = {
        'n': int(nf), 'median': hist_quantile(fh, .5), 'mean': r((fh * np.arange(len(fh))).sum() / nf, 1) if nf else None,
        'p25': hist_quantile(fh, .25), 'p75': hist_quantile(fh, .75),
        'hist': [int(x) for x in [fh[a:b + 1].sum() for a, b in MOVE_BINS[:-1]] + [fh[101:].sum()]],
    }
    ph = A['ponr_hist']
    out['ponr'] = {'n': int(ph.sum()), 'median': hist_quantile(ph, .5),
                   'hist': [int(x) for x in [ph[a:b + 1].sum() for a, b in MOVE_BINS[:-1]] + [ph[101:].sum()]]}
    out['edge'] = {'reached': _rate(A['edge_n'][0], ne), 'both': _rate(A['edge_n'][1], ne)}
    out['winning'] = {'reached': _rate(A['win_n'][0], ne), 'both': _rate(A['win_n'][1], ne)}
    pb, pp = A['pc_blunder'].sum(0), A['pc_punish'].sum(0)
    out['pieces'] = {
        'blunder': [int(x) for x in pb], 'punish': [int(x) for x in pp],
        'by_phase': [[int(x) for x in row] for row in A['pc_blunder']],
        'blunder_all': [int(x) for x in A['pc_blunder_all']],
        'mistake_all': [int(x) for x in A['pc_mistake_all']],
        'moves': [int(x) for x in A['pc_moves']],
    }
    cm = A['chk_moves']
    out['checks'] = {'white': _rate(A['chk'][0], n, 2), 'black': _rate(A['chk'][1], n, 2),
                     'winner': _rate(A['chk'][2], A['decisive'][0] + (n - ne) * 0 or 1, 2),
                     'pct_white': _rate(A['chk'][0], cm[0]), 'pct_black': _rate(A['chk'][1], cm[1]),
                     'pct_winner': _rate(A['chk'][2], cm[2]), 'pct_loser': _rate(A['chk'][3], cm[3]),
                     'pct_all': _rate(A['chk'][0] + A['chk'][1], cm[0] + cm[1])}
    out['captures'] = {'white': _rate(A['cap'][0], n, 2), 'black': _rate(A['cap'][1], n, 2),
                       'pct_all': _rate(A['cap'][0] + A['cap'][1], cm[0] + cm[1]),
                       'pct_winner': _rate(A['cap'][2], cm[2]), 'pct_loser': _rate(A['cap'][3], cm[3])}
    dec_games = max(1, int(A['res'][0] + A['res'][2]))
    out['checks']['winner'] = _rate(A['chk'][2], dec_games, 2)
    out['checks']['loser'] = _rate(A['chk'][3], dec_games, 2)
    out['captures']['winner'] = _rate(A['cap'][2], dec_games, 2)
    out['captures']['loser'] = _rate(A['cap'][3], dec_games, 2)

    bm = A['bl_move']
    out['blunder'] = {
        'n_moves': int(bm[:, 0].sum()),
        'overall': _rate(bm[:, 3].sum(), bm[:, 0].sum(), 4), 'mistake': _rate(bm[:, 2].sum(), bm[:, 0].sum(), 4),
        'inaccuracy': _rate(bm[:, 1].sum(), bm[:, 0].sum(), 4),
        'by_move': [{'lo': a, 'hi': (None if b > 500 else b), 'moves': int(bm[i, 0]), 'blunder': _rate(bm[i, 3], bm[i, 0], 4),
                     'mistake': _rate(bm[i, 2], bm[i, 0], 4)} for i, (a, b) in enumerate(MOVE_BINS)],
        'by_clock_sec': [{'lo': CLOCK_SEC_EDGES[i], 'hi': (None if CLOCK_SEC_EDGES[i + 1] > 1e8 else CLOCK_SEC_EDGES[i + 1]),
                          'moves': int(A['bl_csec'][i, 0]), 'blunder': _rate(A['bl_csec'][i, 3], A['bl_csec'][i, 0], 4),
                          'mistake': _rate(A['bl_csec'][i, 2], A['bl_csec'][i, 0], 4)} for i in range(NCS)],
        'by_clock_pct': [{'lo': CLOCK_PCT_EDGES[i], 'hi': (None if CLOCK_PCT_EDGES[i + 1] > 1e8 else CLOCK_PCT_EDGES[i + 1]),
                          'moves': int(A['bl_cpct'][i, 0]), 'blunder': _rate(A['bl_cpct'][i, 3], A['bl_cpct'][i, 0], 4),
                          'mistake': _rate(A['bl_cpct'][i, 2], A['bl_cpct'][i, 0], 4)} for i in range(NCP)],
    }
    cg = int(A['clock_games'][0]) or 1
    tm = A['t_move_cnt']
    k = int(np.max(np.flatnonzero(tm >= 20))) + 1 if (tm >= 20).any() else 0
    out['time'] = {
        'avg_per_move': _rate(A['t_total'][0], A['t_total'][1], 2),
        'per_move_by_move': [_rate(A['t_move_sum'][i], tm[i], 2) for i in range(k)],
        'clock_pct_by_move': [r(A['t_frac_sum'][i] / tm[i], 1) if tm[i] else None for i in range(k)],
        'flag_pct': _rate(A['flag'][0], cg, 4),
        'flag_while_ahead2': _rate(A['flag'][1], A['flag'][0]),
        'flag_while_winning': _rate(A['flag'][2], A['flag'][0]),
    }
    return out
