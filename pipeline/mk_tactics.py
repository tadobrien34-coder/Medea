"""Tactics statistics -> data/tactics.json"""
import json, os
import numpy as np
from lib import *
import board_pass as bp
from tactic_text import TEXT, GENERIC_AFTER

PNAME = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
COL = dict(gi=0, tid=1, tc=2, band=3, side=4, ply=5, e_prev=6, e_after=7, already=8, new_win=9, kept=10, pts=11,
           gifted=12, post=13, post_piece=14, gave_back=15, phase=16)


def rate(x, nd=3):
    x = float(x)
    return None if x != x else round(x, nd)


def build(tables, outdir, n_games):
    t = tables['tact']
    out = {'n_games': n_games, 'win_adv': WIN_ADV, 'generic_after': GENERIC_AFTER, 'tactics': []}
    for tid, (key, name) in enumerate(bp.TACTICS):
        a = t[t[:, COL['tid']] == tid]
        if len(a) < 30:
            continue
        saves = key in ('perpetual', 'stalemate')
        e_prev = a[:, COL['e_prev']] / 100.0
        e_after = a[:, COL['e_after']] / 100.0
        fresh = a[:, COL['already']] == 0
        nw = a[fresh][:, COL['new_win']]
        kept = a[a[:, COL['new_win']] == 1][:, COL['kept']]
        kept = kept[kept >= 0]
        pts = a[:, COL['pts']] / 2.0
        post = a[:, COL['post']]
        pp = np.bincount(a[post == 1][:, COL['post_piece']], minlength=6) if (post == 1).any() else np.zeros(6, int)
        big = e_after >= 3.0
        d = {
            'id': key, 'name': name, 'n': int(len(a)), 'per100': round(100 * len(a) / n_games, 2),
            'saves': saves,
            'win_adv_rate': rate(nw.mean()) if len(nw) and not saves else None,       # reaches +6 within 4 moves
            'clear_rate': rate((e_after[fresh] >= 3.0).mean()) if fresh.any() and not saves else None,
            'kept_rate': rate(kept.mean()) if len(kept) >= 20 else None,
            'game_win': rate((pts == 1.0).mean()), 'game_score': rate(pts.mean()),
            'median_before': rate(np.median(e_prev), 2), 'median_after': rate(np.median(e_after), 2),
            'gifted': rate(a[:, COL['gifted']].mean()),
            'post_blunder': rate(post.mean()),
            'gave_back': rate(a[big][:, COL['gave_back']].mean()) if big.sum() >= 20 else None,
            'post_piece': [int(x) for x in pp],
            'phase': [int((a[:, COL['phase']] == k).sum()) for k in range(3)],
            'by_band': [{'band': BAND_NAMES[b], 'n': int((a[:, COL['band']] == b).sum()),
                         'win_adv_rate': (rate(a[(a[:, COL['band']] == b) & fresh][:, COL['new_win']].mean())
                                          if ((a[:, COL['band']] == b) & fresh).sum() >= 25 and not saves else None)}
                        for b in range(len(BAND_NAMES))],
            'by_tc': [{'tc': TCS[k], 'n': int((a[:, COL['tc']] == k).sum()),
                       'win_adv_rate': (rate(a[(a[:, COL['tc']] == k) & fresh][:, COL['new_win']].mean())
                                        if ((a[:, COL['tc']] == k) & fresh).sum() >= 25 and not saves else None)}
                      for k in range(4)],
        }
        d.update(TEXT[key])
        d['thoughts'] = after_thoughts(d)
        out['tactics'].append(d)
    out['tactics'].sort(key=lambda d: (d['saves'], -(d['win_adv_rate'] or 0)))
    json.dump(out, open(os.path.join(outdir, 'tactics.json'), 'w'), separators=(',', ':'))
    print('tactics:', len(out['tactics']))
    return out


def after_thoughts(d):
    """Data-driven reminders attached to the hand-written text."""
    L = []
    if d['saves'] or d['post_blunder'] is None:
        return L
    pp = np.array(d['post_piece'], dtype=float)
    top = f" Most often with the {PNAME[int(pp.argmax())]}." if pp.sum() >= 20 else ''
    L.append(f"{d['post_blunder'] * 100:.0f}% of the time the player blundered within their next three moves.{top}")
    if d['gave_back'] is not None:
        L.append(f"When it produced a +3 edge, it was thrown away within six moves {d['gave_back'] * 100:.0f}% of the time.")
    if d['gifted'] is not None:
        L.append(f"{d['gifted'] * 100:.0f}% of these were gifted by an opponent mistake, so stay alert: you may be in the same trouble next move.")
    return L
