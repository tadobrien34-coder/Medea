"""GM games -> players.json, repertoires.json, openings.json (under data/gm/)."""
import glob, json, os
import numpy as np
from lib import *
from features import features
from mk_book import vkey_of, fkey_of

GMDIR = os.path.join(RAW, 'gm')
PN = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
TCL = {'bullet': 'Bullet', 'blitz': 'Blitz', 'rapid': 'Rapid', 'classical': 'Classical'}
NM, NCS, NCP = len(MOVE_BINS), len(CLOCK_SEC_EDGES) - 1, len(CLOCK_PCT_EDGES) - 1
MOVE_EDGES = [b[0] for b in MOVE_BINS]
TM = 40


def to_rec(d, user):
    pw, pb = d['players']['white'], d['players']['black']
    wn = (pw.get('user') or {}).get('name', '')
    bn = (pb.get('user') or {}).get('name', '')
    if wn.lower() == user.lower():
        side = 0
    elif bn.lower() == user.lower():
        side = 1
    else:
        return None
    moves = (d.get('moves') or '').split()
    n = len(moves)
    if n < 6 or 'rating' not in pw or 'rating' not in pb:
        return None
    ck = d.get('clocks')
    ck = [int(round(c / 100)) for c in ck[:n]] if ck and len(ck) >= n else None   # API appends one extra trailing entry
    ev = None
    an = d.get('analysis')
    if an and n - 1 <= len(an) <= n:
        ev = []
        for a in an:
            if 'eval' in a:
                ev.append(max(-1000, min(1000, int(a['eval']))))
            elif 'mate' in a:
                ev.append(1000 if a['mate'] > 0 else -1000)
            else:
                ev = None
                break
        if ev is not None and len(ev) == n - 1:
            ev.append(1000 if (moves[-1].endswith('#') and n % 2 == 1) else (-1000 if moves[-1].endswith('#') else ev[-1]))
    w = d.get('winner')
    rec = {
        'id': d['id'], 'tc': TCL.get(d.get('perf'), 'Blitz'), 'w': pw['rating'], 'b': pb['rating'],
        'r': '1-0' if w == 'white' else ('0-1' if w == 'black' else '1/2-1/2'), 'tm': 1 if d.get('status') == 'outoftime' else 0,
        'base': (d.get('clock') or {}).get('initial', 0), 'inc': (d.get('clock') or {}).get('increment', 0),
        'op': (d.get('opening') or {}).get('name', '?'), 'mv': ' '.join(moves), 'ev': ev, 'ck': ck,
        'opp': (bn if side == 0 else wn), 'wn': wn, 'bn': bn,
        'wt': pw.get('user', {}).get('title') or '', 'bt': pb.get('user', {}).get('title') or '',
    }
    return rec, side


class Agg:
    def __init__(self):
        z = np.zeros
        self.n = 0; self.res = z(3); self.col = z(2)
        self.win_t = z(4); self.loss_t = z(4); self.win_em = []; self.loss_em = []
        self.chk = z(2); self.cap = z(2)
        self.t_sum = z(2); self.t_move = z((2, TM)); self.t_cpct = z(TM)
        self.clock_games = 0; self.flag = z(4)   # flagged, flagged while >=+2 (analysed), flagged analysed, opp flagged
        self.an = 0; self.bm = z((NM, 4)); self.bs = z((NCS, 4)); self.bp = z((NCP, 4))
        self.you_lose = z(6); self.opp_lose = z(6); self.you_cash = z(6); self.opp_cash = z(6); self.shifts = 0
        self.pc_moves = z(6); self.bl_pc = z(6)

    def add(self, f, s):
        self.n += 1
        if f.winner == s: self.res[0] += 1
        elif f.winner < 0: self.res[1] += 1
        else: self.res[2] += 1
        self.col[s] += 1
        if f.winner == s:
            self.win_t[f.end_type] += 1; self.win_em.append(f.end_move)
        elif f.winner >= 0:
            self.loss_t[f.end_type] += 1; self.loss_em.append(f.end_move)
        mine = f.mover == s
        self.chk += [f.chk[mine].sum(), mine.sum()]
        self.cap += [f.cap[mine].sum(), mine.sum()]
        self.pc_moves += np.bincount(f.pc[mine], minlength=6)
        if f.has_clock:
            self.clock_games += 1
            self.t_sum += [f.spent[mine].sum(), mine.sum()]
            m = np.minimum(f.moveno[mine], TM) - 1
            np.add.at(self.t_move[0], m, f.spent[mine]); np.add.at(self.t_move[1], m, 1)
            np.add.at(self.t_cpct, m, np.minimum(f.cpct[mine], 150))
            if f.rec.get('tm'):
                if f.winner == 1 - s:
                    self.flag[0] += 1
                    if f.has_eval:
                        self.flag[2] += 1
                        self.flag[1] += (f.p[-1] * (1 if s == 0 else -1)) >= 2.0
                elif f.winner == s:
                    self.flag[3] += 1
        if not f.has_eval:
            return
        self.an += 1
        sel = mine
        mv = np.minimum(f.moveno, 101)
        bi = np.searchsorted(MOVE_EDGES, mv, side='right') - 1
        for k, flag in ((0, np.ones(f.n, bool)), (1, f.is_inacc), (2, f.is_mistake), (3, f.is_blunder)):
            np.add.at(self.bm[:, k], bi[sel], flag[sel])
        np.add.at(self.bl_pc, f.pc[sel & f.is_blunder], 1)
        if f.has_clock:
            cs = np.clip(np.searchsorted(CLOCK_SEC_EDGES, f.cb, side='right') - 1, 0, NCS - 1)
            cp = np.clip(np.searchsorted(CLOCK_PCT_EDGES, f.cpct, side='right') - 1, 0, NCP - 1)
            for k, flag in ((0, np.ones(f.n, bool)), (1, f.is_inacc), (2, f.is_mistake), (3, f.is_blunder)):
                np.add.at(self.bs[:, k], cs[sel], flag[sel]); np.add.at(self.bp[:, k], cp[sel], flag[sel])
        for j, frm in zip(f.shift_ply, f.shift_from):
            j = int(j); holder = 0 if frm == 1 else 1
            if j % 2 != holder:
                continue
            self.shifts += 1
            reply = int(f.pc[j + 1]) if j + 1 < f.n else -1
            if holder == s:
                self.you_lose[f.pc[j]] += 1
                if reply >= 0: self.opp_cash[reply] += 1
            else:
                self.opp_lose[f.pc[j]] += 1
                if reply >= 0: self.you_cash[reply] += 1


def rate(a, b, nd=4):
    return round(float(a) / float(b), nd) if b else None


def top_piece(v, k=1):
    v = np.asarray(v, dtype=float)
    if v.sum() < 6:
        return None
    i = np.argsort(-v)[:k]
    return [(PN[j], v[j] / v.sum()) for j in i]


class OpenAgg:
    def __init__(self, key):
        self.key = key; self.n = 0; self.res = np.zeros(3); self.col = np.zeros(2)
        self.win_t = np.zeros(4); self.loss_t = np.zeros(4); self.win_em = []; self.loss_em = []
        self.an = 0; self.opp_lose = np.zeros(6); self.you_lose = np.zeros(6)
        self.tc_n = {}

    def add(self, f, s, tc, opp_lose, you_lose):
        self.n += 1; self.col[s] += 1
        self.tc_n[tc] = self.tc_n.get(tc, 0) + 1
        if f.winner == s:
            self.res[0] += 1; self.win_t[f.end_type] += 1; self.win_em.append(f.end_move)
        elif f.winner < 0:
            self.res[1] += 1
        else:
            self.res[2] += 1; self.loss_t[f.end_type] += 1; self.loss_em.append(f.end_move)
        if f.has_eval:
            self.an += 1; self.opp_lose += opp_lose; self.you_lose += you_lose


def _mixv(t):
    t = np.asarray(t[:3], dtype=float)
    return [round(float(x), 3) for x in (t / t.sum())] if t.sum() else [0.0, 0.0, 0.0]


ENDS = ['checkmate', 'resignation', 'the clock']


def _mix(t, kind):
    """'Mostly by resignation (59%), then checkmate (22%)' from a [mate, resign, time] count vector."""
    t = t[:3] / max(1, t[:3].sum())
    order = np.argsort(-t)
    s = f"Mostly by {ENDS[order[0]]} ({t[order[0]] * 100:.0f}%)"
    if t[order[1]] >= 0.15:
        s += f", then {ENDS[order[1]]} ({t[order[1]] * 100:.0f}%)"
    return s


def describe_opening(o):
    w, l = int(o.res[0]), int(o.res[2])
    win = lose = None
    if w >= 5:
        s = f"{_mix(o.win_t, 'win')}; median move {int(np.median(o.win_em))}."
        tp = top_piece(o.opp_lose) if o.an >= 8 else None
        if tp:
            s += f" Opponents give up the lead with the {tp[0][0]} ({tp[0][1] * 100:.0f}%)."
        win = s
    if l >= 5:
        s = f"{_mix(o.loss_t, 'loss')}; median move {int(np.median(o.loss_em))}."
        tp = top_piece(o.you_lose) if o.an >= 8 else None
        if tp:
            s += f" The lead slips with the {tp[0][0]} ({tp[0][1] * 100:.0f}%)."
        lose = s
    return win, lose


def player_style(P, tc):
    win = lose = None
    wins, losses = int(P.res[0]), int(P.res[2])
    if wins >= 15:
        win = f"{_mix(P.win_t, 'win')}; the median win ends on move {int(np.median(P.win_em))}."
        tp = top_piece(P.opp_lose) if P.an >= 15 else None
        if tp:
            win += f" Opponents hand over the lead with the {tp[0][0]} most often."
        if P.flag[3] / max(1, wins) >= 0.2:
            win += f" {P.flag[3] / wins * 100:.0f}% of wins come from opponents flagging."
    if losses >= 15:
        lose = f"{_mix(P.loss_t, 'loss')}; the median loss ends on move {int(np.median(P.loss_em))}."
        tp = top_piece(P.you_lose) if P.an >= 15 else None
        if tp:
            lose += f" The lead slips with the {tp[0][0]} most often."
        if P.flag[2] >= 6 and P.flag[1] / P.flag[2] >= 0.3:
            lose += f" {P.flag[1] / P.flag[2] * 100:.0f}% of time losses came from a clearly better position."
    return win, lose


def build(outdir, openings_index):
    pool = {p['name'].lower(): p for p in json.load(open(os.path.join(HERE, 'ref', 'gm_pool.json')))}
    gdir = os.path.join(outdir, 'gm')
    os.makedirs(gdir, exist_ok=True)
    players, reps = {}, {tc: [] for tc in TCS}
    gm_open = {}          # key -> {gm id -> stats}
    have_page = {(o['level'], o['key']) for o in openings_index}
    og = {}               # opening key -> candidate GM games to show on the opening page
    seen_games = set()
    for path in sorted(glob.glob(os.path.join(GMDIR, '*.ndjson'))):
        user, tcl = os.path.basename(path)[:-7].split('__')
        tc = TCL[tcl]
        info = pool.get(user.lower(), {'id': user.lower(), 'name': user, 'title': None, 'perfs': {}})
        P = Agg(); O = {}
        fam = {}
        for line in open(path, encoding='utf8'):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            got = to_rec(d, user)
            if not got:
                continue
            rec, s = got
            try:
                f = features(rec)
            except Exception:
                continue
            if rec['id'] not in seen_games and f.n >= 12 and rec['op'] not in ('?', ''):
                seen_games.add(rec['id'])
                row = ((rec['w'] + rec['b']) // 2, rec['id'], rec['wn'], rec['bn'], rec['wt'], rec['bt'], rec['w'], rec['b'], rec['r'], rec['tc'], ' '.join(rec['mv'].split(' ')[:70]))
                for kk in (vkey_of(rec['op']), fkey_of(rec['op'])):
                    og.setdefault(kk, []).append(row)
            before = (P.opp_lose.copy(), P.you_lose.copy())
            P.add(f, s)
            ol, yl = P.opp_lose - before[0], P.you_lose - before[1]
            op = rec['op']
            for key, dd in ((vkey_of(op), O), (fkey_of(op), fam)):
                oa = dd.get(key) or dd.setdefault(key, OpenAgg(key))
                oa.add(f, s, tc, ol, yl)
        if P.n < 20:
            continue
        pid = info['id']
        pl = players.setdefault(pid, {'id': pid, 'name': info['name'], 'title': info.get('title'), 'tcs': {}})
        win_s, lose_s = player_style(P, tc)
        cg = max(1, P.clock_games)
        k = int(np.max(np.flatnonzero(P.t_move[1] >= 15))) + 1 if (P.t_move[1] >= 15).any() else 0
        bm = P.bm
        pl['tcs'][tc] = {
            'rating': (info.get('perfs', {}).get(tcl) or {}).get('rating'), 'games': P.n, 'analysed': P.an,
            'wdl': [rate(P.res[0], P.n), rate(P.res[1], P.n), rate(P.res[2], P.n)],
            'time': {
                'avg_per_move': rate(P.t_sum[0], P.t_sum[1], 2), 'flag_pct': rate(P.flag[0], cg), 'flag_ahead': rate(P.flag[1], P.flag[2]),
                'flag_n': int(P.flag[0]), 'opp_flag_pct': rate(P.flag[3], cg),
                'per_move': [rate(P.t_move[0][i], P.t_move[1][i], 2) for i in range(k)],
                'clock_pct': [rate(P.t_cpct[i], P.t_move[1][i], 1) for i in range(k)],
            },
            'blunder': {
                'overall': rate(bm[:, 3].sum(), bm[:, 0].sum()), 'mistake': rate(bm[:, 2].sum(), bm[:, 0].sum()), 'moves': int(bm[:, 0].sum()),
                'by_move': [{'moves': int(bm[i, 0]), 'blunder': rate(bm[i, 3], bm[i, 0])} for i in range(NM)],
                'by_clock_sec': [{'moves': int(P.bs[i, 0]), 'blunder': rate(P.bs[i, 3], P.bs[i, 0])} for i in range(NCS)],
                'by_clock_pct': [{'moves': int(P.bp[i, 0]), 'blunder': rate(P.bp[i, 3], P.bp[i, 0])} for i in range(NCP)],
                'pieces': [int(x) for x in P.bl_pc],
            },
            'pieces': {'you': [int(x) for x in P.you_lose], 'opp': [int(x) for x in P.opp_lose],
                       'you_cash': [int(x) for x in P.you_cash], 'opp_cash': [int(x) for x in P.opp_cash]},
            'checks_pct': rate(P.chk[0], P.chk[1]), 'captures_pct': rate(P.cap[0], P.cap[1]),
            'median_len': int(np.median(P.win_em + P.loss_em)) if (P.win_em or P.loss_em) else None,
            'white_share': rate(P.col[0], P.n), 'win_text': win_s, 'lose_text': lose_s,
        }
        # repertoire rows (variation level)
        rows = []
        for key, oa in sorted(O.items(), key=lambda kv: -kv[1].n):
            if oa.n < 6 or key in ('?', ''):
                continue
            wt, lt = describe_opening(oa)
            lvl = 'v' if ':' in key else 'f'
            rows.append({
                'key': key, 'family': fkey_of(key), 'level': lvl, 'n': oa.n, 'w': int(oa.res[0]), 'd': int(oa.res[1]), 'l': int(oa.res[2]),
                'white': int(oa.col[0]), 'black': int(oa.col[1]), 'how_win': wt, 'how_lose': lt, 'page': (lvl, key) in have_page,
                'win_mix': _mixv(oa.win_t) if oa.res[0] >= 5 else None, 'loss_mix': _mixv(oa.loss_t) if oa.res[2] >= 5 else None,
                'win_move': int(np.median(oa.win_em)) if oa.win_em else None, 'loss_move': int(np.median(oa.loss_em)) if oa.loss_em else None,
            })
        reps[tc].append({
            'id': pid, 'name': info['name'], 'title': info.get('title'), 'rating': (info.get('perfs', {}).get(tcl) or {}).get('rating'),
            'games': P.n, 'wdl': [rate(P.res[0], P.n), rate(P.res[1], P.n), rate(P.res[2], P.n)],
            'win_text': win_s, 'lose_text': lose_s, 'openings': rows[:10],
            'win_mix': _mixv(P.win_t), 'loss_mix': _mixv(P.loss_t), 'win_move': int(np.median(P.win_em)) if P.win_em else None, 'loss_move': int(np.median(P.loss_em)) if P.loss_em else None,
            'avg_time': rate(P.t_sum[0], P.t_sum[1], 2), 'flag': rate(P.flag[0], max(1, P.clock_games)),
        })
        for dd in (O, fam):
            for key, oa in dd.items():
                if oa.n < 3 or key in ('?', ''):
                    continue
                g = gm_open.setdefault(key, {})
                e = g.setdefault(pid, {'id': pid, 'name': info['name'], 'title': info.get('title'), 'n': 0, 'w': 0, 'd': 0, 'l': 0, 'tcs': {}})
                e['n'] += oa.n; e['w'] += int(oa.res[0]); e['d'] += int(oa.res[1]); e['l'] += int(oa.res[2])
                e['tcs'][tc] = e['tcs'].get(tc, 0) + oa.n
    # time grades per time control
    grades = {}
    for tc in TCS:
        rows = [(pid, p['tcs'][tc]) for pid, p in players.items() if tc in p['tcs'] and p['tcs'][tc]['games'] >= 100]
        if len(rows) < 6:
            continue
        f = np.array([r[1]['time']['flag_pct'] or 0 for r in rows]); o = np.array([r[1]['time']['opp_flag_pct'] or 0 for r in rows])
        z = lambda a: (a - a.mean()) / (a.std() or 1)
        score = -z(f) + 0.6 * z(o)
        order = np.argsort(-score)
        for rank, i in enumerate(order):
            players[rows[i][0]]['tcs'][tc]['time']['score'] = round(float(score[i]), 2)
        k = min(5, len(rows) // 3)
        grades[tc] = {'good': [rows[i][0] for i in order[:k]], 'bad': [rows[i][0] for i in order[::-1][:k]]}
    for tc in TCS:
        reps[tc].sort(key=lambda x: (x['title'] != 'GM', -(x['rating'] or 0)))
        reps[tc] = reps[tc][:20]
    json.dump({'players': list(players.values()), 'grades': grades}, open(os.path.join(gdir, 'players.json'), 'w'), separators=(',', ':'))
    json.dump(reps, open(os.path.join(gdir, 'repertoires.json'), 'w'), separators=(',', ':'))
    out = {}
    for key, g in gm_open.items():
        gms = sorted(g.values(), key=lambda e: -e['n'])
        tot = sum(e['n'] for e in gms)
        if tot >= 8:
            out[key] = {'n': tot, 'gms': gms[:12]}
    json.dump(out, open(os.path.join(gdir, 'openings.json'), 'w'), separators=(',', ':'))
    games_out = {}
    for kk, rows_ in og.items():
        rows_.sort(key=lambda r_: -r_[0])
        keep = rows_[:10]
        games_out[kk] = [{'id': r_[1], 'w': r_[2], 'b': r_[3], 'wt': r_[4], 'bt': r_[5], 'wr': r_[6], 'br': r_[7], 'r': r_[8], 'tc': r_[9], 'mv': r_[10]} for r_ in keep]
    json.dump(games_out, open(os.path.join(gdir, 'games.json'), 'w'), separators=(',', ':'))
    print('gm: players', len(players), 'reps', {tc: len(v) for tc, v in reps.items()}, 'opening keys', len(out))
