"""Method page data: the winning-advantage retention test and dataset summary -> data/method.json"""
import json, os
import numpy as np
import agg_levels as AL
from lib import *


def build(cells, outdir, n_games, extra):
    def merged(select):
        A = AL.new_agg()
        for (t, b), cell in cells.items():
            if select(t, b):
                AL.merge(A, cell)
        return A

    def table(A):
        return [{'t': T, 'reached': int(A['thr'][i, 0]),
                 'win': round(A['thr'][i, 1] / A['thr'][i, 0], 3) if A['thr'][i, 0] else None,
                 'kept': round(A['thr'][i, 2] / A['thr'][i, 0], 3) if A['thr'][i, 0] else None}
                for i, T in enumerate(AL.THR_GRID)]
    out = {'win_adv': WIN_ADV, 'lead': LEAD, 'sustain': WIN_SUSTAIN, 'grid': AL.THR_GRID, 'n_games': n_games,
           'all': table(merged(lambda t, b: True)),
           'by_band': [{'band': name, 'rows': table(merged(lambda t, b, lo=lo, hi=hi: lo <= b < hi))}
                       for name, lo, hi in zip(BAND_NAMES, BAND_EDGES[:-1], BAND_EDGES[1:])],
           'by_tc': [{'tc': tc, 'rows': table(merged(lambda t, b, tc=tc: t == tc))} for tc in TCS]}
    out.update(extra)
    json.dump(out, open(os.path.join(outdir, 'method.json'), 'w'), separators=(',', ':'))
    print('method ok')
