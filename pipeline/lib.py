"""Shared constants and helpers for the Medea analysis pipeline."""
import json, math, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')

TCS = ['Bullet', 'Blitz', 'Rapid', 'Classical']
TCI = {t: i for i, t in enumerate(TCS)}

# ---- definitions (documented on the site's Method page) -------------------------------
LEAD = 1.0          # pawns: a side "has the advantage" at |eval| >= LEAD
WIN_ADV = 6.0       # pawns: "winning advantage" (chosen by the retention test)
WIN_SUSTAIN = 3     # plies the eval must hold >= WIN_ADV to count as reached
LEAD_SUSTAIN = 4    # plies the eval must hold >= LEAD to count as a steady edge
INIT_CP = 15        # eval assumed before the first move
BLUNDER, MISTAKE, INACC = 30.0, 20.0, 10.0   # win-chance drop thresholds (Lichess)

PIECES = ['P', 'N', 'B', 'R', 'Q', 'K']
PIDX = {p: i for i, p in enumerate(PIECES)}

MOVE_BINS = [(1, 10), (11, 20), (21, 30), (31, 40), (41, 50), (51, 60), (61, 70), (71, 80), (81, 90), (91, 100), (101, 999)]
CLOCK_SEC_EDGES = [0, 5, 10, 20, 30, 60, 120, 300, 600, 1e9]
CLOCK_PCT_EDGES = [0, 5, 10, 20, 40, 60, 80, 100, 1e9]
BAND_EDGES = [0, 1000, 1400, 1800, 2200, 4000]
BAND_NAMES = ['<1000', '1000-1399', '1400-1799', '1800-2199', '2200+']
MAXMOVE = 150       # histogram length for move numbers
MAXPLY = 80         # plies tracked for eval trajectories


def winpct(cp):
    """Lichess win-chance (0..100) from centipawns (white POV)."""
    cp = np.clip(cp, -1000, 1000)
    return 50 + 50 * (2 / (1 + np.exp(-0.00368208 * cp)) - 1)


def piece_of(san):
    c = san[0]
    if c in 'NBRQK':
        return PIDX[c]
    if c == 'O':
        return PIDX['K']
    return 0


def bucket_of(w, b):
    return min(max((w + b) // 2 // 100 * 100, 400), 2800)


def band_of(avg):
    for i in range(len(BAND_EDGES) - 1):
        if BAND_EDGES[i] <= avg < BAND_EDGES[i + 1]:
            return i
    return len(BAND_NAMES) - 1


def iter_jsonl(path, start=0, end=None):
    with open(path, 'rb') as f:
        f.seek(start)
        if start:
            f.readline()  # align to next line boundary
        while True:
            pos = f.tell()
            if end is not None and pos >= end:
                break
            line = f.readline()
            if not line:
                break
            yield json.loads(line)


def chunk_offsets(paths, size=8_000_000):
    out = []
    for p in paths:
        total = os.path.getsize(p)
        s = 0
        while s < total:
            out.append((p, s, min(s + size, total)))
            s += size
    return out


def hist_quantile(h, q):
    """Quantile of an integer histogram (index = value)."""
    c = np.cumsum(h)
    if c[-1] == 0:
        return None
    return int(np.searchsorted(c, q * c[-1]))


def r(x, nd=2):
    if x is None:
        return None
    x = float(x)
    return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)
