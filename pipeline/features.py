"""Per-game feature extraction (no board needed) shared by every aggregator."""
from types import SimpleNamespace
import numpy as np
from lib import *

_INIT_WP = float(winpct(np.array([INIT_CP]))[0])


def first_sustained(e, thr, k):
    """Index of the first ply from which e >= thr holds for k plies (or until game end)."""
    ok = e >= thr
    if not ok.any():
        return -1
    if ok[-1]:
        ok = np.concatenate([ok, np.ones(k - 1, dtype=bool)])
    if len(ok) < k:
        return -1
    run = np.convolve(ok.astype(np.int8), np.ones(k, dtype=np.int8), 'valid') == k
    return int(np.argmax(run)) if run.any() else -1


def features(rec):
    sans = rec['mv'].split(' ')
    n = len(sans)
    f = SimpleNamespace(rec=rec, n=n, sans=sans)
    res = rec['r']
    f.res = 0 if res == '1-0' else (2 if res == '0-1' else 1)           # 0 white win, 1 draw, 2 black win
    f.winner = 0 if f.res == 0 else (1 if f.res == 2 else -1)           # side index of the winner, -1 draw
    f.end_move = (n + 1) // 2
    last = sans[-1]
    if rec.get('tm'):
        f.end_type = 2
    elif res == '1/2-1/2':
        f.end_type = 3
    elif last.endswith('#'):
        f.end_type = 0
    else:
        f.end_type = 1
    f.pc = np.fromiter((piece_of(s) for s in sans), dtype=np.int8, count=n)
    f.chk = np.fromiter((('+' in s) or ('#' in s) for s in sans), dtype=bool, count=n)
    f.cap = np.fromiter(('x' in s for s in sans), dtype=bool, count=n)
    f.ply = np.arange(n)
    f.mover = f.ply % 2
    f.moveno = f.ply // 2 + 1

    # ---- clocks
    ck = rec.get('ck')
    f.has_clock = bool(ck) and len(ck) == n
    if f.has_clock:
        ck = np.asarray(ck, dtype=np.float64)
        base, inc = rec['base'], rec['inc']
        # each side's first clock reading is its true starting time (berserked arena games start at half the nominal time)
        start = np.array([ck[0], ck[1]])
        prev = np.empty(n)
        prev[:2] = start
        prev[2:] = ck[:-2]
        f.cb = prev                                          # clock when the move started
        f.spent = np.maximum(prev + inc - ck, 0)
        f.spent[:2] = 0                                      # the first move of each side is not timed
        f.cpct = 100.0 * prev / np.maximum(start[f.ply % 2], 1)
        f.base, f.inc = base, inc

    # ---- evals
    ev = rec.get('ev')
    f.has_eval = ev is not None and len(ev) == n and None not in ev
    if f.has_eval:
        cp = np.asarray(ev, dtype=np.float64)
        f.cp = cp
        f.p = cp / 100.0
        wp = winpct(cp)
        prev_wp = np.concatenate([[_INIT_WP], wp[:-1]])
        loss = np.where(f.mover == 0, prev_wp - wp, wp - prev_wp)
        f.loss = loss
        f.is_blunder = loss >= BLUNDER
        f.is_mistake = (loss >= MISTAKE) & (loss < BLUNDER)
        f.is_inacc = (loss >= INACC) & (loss < MISTAKE)
        # advantage shifts: the side holding a >= LEAD advantage changes
        s = np.where(f.p >= LEAD, 1, np.where(f.p <= -LEAD, -1, 0))
        idx = np.flatnonzero(s)
        if len(idx) > 1:
            ss = s[idx]
            flip = ss[1:] != ss[:-1]
            f.shift_ply = idx[1:][flip]
            f.shift_from = ss[:-1][flip]          # +1: white held it, -1: black held it
        else:
            f.shift_ply = np.zeros(0, dtype=int)
            f.shift_from = np.zeros(0, dtype=int)
        # point of no return for the eventual winner
        f.ponr = -1
        if f.winner >= 0:
            ew = f.p if f.winner == 0 else -f.p
            bad = np.flatnonzero(ew < LEAD)
            if len(bad) == 0:
                f.ponr = 0
            elif bad[-1] < n - 1:
                f.ponr = int(bad[-1]) + 1
        # steady edge / winning advantage reached (per side)
        f.edge_at = [first_sustained(f.p, LEAD, LEAD_SUSTAIN), first_sustained(-f.p, LEAD, LEAD_SUSTAIN)]
        f.win_at = [first_sustained(f.p, WIN_ADV, WIN_SUSTAIN), first_sustained(-f.p, WIN_ADV, WIN_SUSTAIN)]
    return f
