"""Rating-level statistics -> data/levels_<tc>.json"""
import json, os
import numpy as np
import agg_levels as AL
from lib import *

SIZES = [100, 200, 400, 600, 800]
MIN_N = 40


def groups(size):
    out, lo = [], 400
    while lo <= 2800:
        hi = lo + size - 100
        out.append((lo, min(hi, 2800)))
        lo += size
    return out


def label(lo, hi, size):
    top = hi >= 2800
    if size == 100:
        return f'{lo}+' if top else f'{lo}'
    return f'{lo}+' if top else f'{lo}–{hi + 99}'


def build(cells, outdir):
    os.makedirs(outdir, exist_ok=True)
    for tc in ['All'] + TCS:
        res = {}
        for size in SIZES:
            lst = []
            for lo, hi in groups(size):
                A = AL.new_agg()
                for (t, b), cell in cells.items():
                    if (tc == 'All' or t == tc) and lo <= b <= hi:
                        AL.merge(A, cell)
                n = int(A['n'][0])
                entry = {'lo': lo, 'hi': hi + 99 if hi < 2800 else None, 'label': label(lo, hi, size), 'n': n}
                if n >= MIN_N:
                    entry.update(AL.render(A))
                else:
                    entry['thin'] = True
                lst.append(entry)
            res[str(size)] = lst
        json.dump(res, open(os.path.join(outdir, f'levels_{tc.lower()}.json'), 'w'), separators=(',', ':'))
        print('levels', tc, 'ok')
