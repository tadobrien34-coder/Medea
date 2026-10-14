#!/usr/bin/env python3
"""Run every per-game analysis over the raw dump shards in parallel and save merged tables.

    python build_dump.py            ->  out/dump_tables.pkl
"""
import glob, json, multiprocessing as mp, os, pickle, sys, time
import numpy as np
import chess
from lib import *
from features import features
import agg_levels as AL
import board_pass as bp

OUT = os.path.join(HERE, 'out')


def vkey_of(op):
    return op.split(',')[0] if ':' in op else op


def fkey_of(op):
    return op.split(':')[0]


def iter_safe(path, s, e):
    with open(path, 'rb') as f:
        f.seek(s)
        if s:
            f.readline()
        while f.tell() < e:
            line = f.readline()
            if not line:
                break
            try:
                yield json.loads(line)
            except ValueError:
                continue


def work(task):
    path, s, e = task
    cells, tree = {}, {}
    rows = {k: [] for k in ('v', 'tc', 'avg', 'res', 'et', 'em', 'npl', 'ev', 'edge', 'win', 'nsh', 'ponr', 'id')}
    shifts, tact, losses, examples = [], [], [], []
    ex_count = {}
    gi = 0
    for rec in iter_safe(path, s, e):
        if rec.get('x'):
            continue
        try:
            f = features(rec)
        except Exception:
            continue
        tc = TCI[rec['tc']]
        avg = (rec['w'] + rec['b']) // 2
        key = (rec['tc'], bucket_of(rec['w'], rec['b']))
        AL.add_game(cells.setdefault(key, AL.new_agg()), f)
        edges, events, ok, trk = bp.board_pass(f)
        if not ok:
            continue
        # opening tree
        for ply, (parent, san, child, cp) in enumerate(edges):
            k = (parent, san)
            node = tree.get(k)
            if node is None:
                node = tree[k] = [child, ply, 0, 0, 0, 0, []]
            node[2] += 1
            node[3 + (0 if f.res == 0 else (1 if f.res == 1 else 2))] += 1
            if cp is not None:
                node[6].append(cp)
        op = rec.get('op') or '?'
        row = np.full(MAXPLY, -32768, dtype=np.int16)
        m = min(f.n, MAXPLY)
        row[:m] = f.cp[:m]
        rows['v'].append(op)
        rows['id'].append(rec['id'])
        rows['tc'].append(tc); rows['avg'].append(avg); rows['res'].append(f.res)
        rows['et'].append(f.end_type); rows['em'].append(f.end_move); rows['npl'].append(f.n)
        rows['ev'].append(row)
        rows['edge'].append(f.edge_at); rows['win'].append(f.win_at)
        rows['nsh'].append(len(f.shift_ply)); rows['ponr'].append(f.ponr)
        for j, frm in zip(f.shift_ply, f.shift_from):
            j = int(j)
            holder = 0 if frm == 1 else 1
            mover = j % 2
            rep_pc = int(f.pc[j + 1]) if j + 1 < f.n else -1
            if mover == holder and j < len(trk['pid']):
                pidc = trk['pid'][j]
                rc = 1 if (j + 1 < len(trk['cpid']) and pidc >= 0 and trk['cpid'][j + 1] == pidc and trk['cap'][j + 1] > 0) else 0
                shifts.append((gi, j, holder, mover, int(f.pc[j]), rep_pc, pidc, trk['from'][j], trk['to'][j], rc, trk['pt'][j + 1] if rc else -1))
            else:
                shifts.append((gi, j, holder, mover, int(f.pc[j]), rep_pc, -1, -1, -1, 0, -1))
        for (ply_l, col_l, ptype_l, pid_l, sq_l, capper_l, clean_l) in trk['loss']:
            losses.append((gi, ply_l, col_l, ptype_l, pid_l, sq_l, capper_l, clean_l))
        for ev in events:
            st = bp.event_stats(f, ev)
            cm = ev[3] if len(ev) > 3 else 0
            tid = bp.TID[bp.primary(ev[2])]
            tact.append((gi, tid, tc, band_of(avg)) + st + (cm & 0xFFFFFFFF, cm >> 32))
            fin = tid in (0, 1, 20, 21)         # mates and saving tactics: no "new winning advantage" to test
            if ((st[5] == 1 and st[4] == 0 and tid < 20) or fin) and 8 <= st[1] <= 90 and ex_count.get(tid, 0) < (6 if fin else 4):
                bd = chess.Board()
                for san_ in f.sans[:st[1]]:
                    bd.push_san(san_)
                ex_count[tid] = ex_count.get(tid, 0) + 1
                examples.append((tid, bd.fen(), f.sans[st[1]], st[2], st[3], cm, st[1], avg))
        gi += 1
    # drop singleton deep edges to keep the merge light
    tree = {k: v for k, v in tree.items() if v[2] > 1 or v[1] < 6}
    out = {
        'cells': cells, 'tree': tree, 'n': gi,
        'rows': {k: (np.asarray(v, dtype=(np.int16 if k in ('em', 'npl', 'avg') else np.int8 if k in ('tc', 'res', 'et', 'nsh') else None))
                     if k not in ('v', 'id') else v) for k, v in rows.items()},
        'shifts': np.asarray(shifts, dtype=np.int32).reshape(-1, 11),
        'losses': np.asarray(losses, dtype=np.int32).reshape(-1, 8),
        'examples': examples,
        'tact': np.asarray(tact, dtype=np.int64).reshape(-1, 19),
    }
    out['rows']['ev'] = np.asarray(rows['ev'], dtype=np.int16).reshape(-1, MAXPLY)
    out['rows']['edge'] = np.asarray(rows['edge'], dtype=np.int16).reshape(-1, 2)
    out['rows']['win'] = np.asarray(rows['win'], dtype=np.int16).reshape(-1, 2)
    out['rows']['ponr'] = np.asarray(rows['ponr'], dtype=np.int16)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    paths = sorted(glob.glob(os.path.join(RAW, 'games_*.jsonl')))
    tasks = chunk_offsets(paths, 5_000_000)
    t0 = time.time()
    print(len(tasks), 'tasks', flush=True)
    nproc = max(2, (os.cpu_count() or 4) - 1)
    cells, tree = {}, {}
    cols = {'rows': [], 'shifts': [], 'tact': [], 'losses': []}
    examples = []
    total = 0
    with mp.Pool(nproc) as pool:
        for i, res in enumerate(pool.imap_unordered(work, tasks, chunksize=1)):
            for key, A in res['cells'].items():
                if key in cells:
                    AL.merge(cells[key], A)
                else:
                    cells[key] = A
            for k, v in res['tree'].items():
                node = tree.get(k)
                if node is None:
                    tree[k] = v
                else:
                    for j in range(2, 6):
                        node[j] += v[j]
                    node[6].extend(v[6])
            res['shifts'][:, 0] += total
            res['losses'][:, 0] += total
            cols['losses'].append(res['losses']); examples.extend(res['examples'])
            res['tact'][:, 0] += total
            cols['rows'].append(res['rows']); cols['shifts'].append(res['shifts']); cols['tact'].append(res['tact'])
            total += res['n']
            if i % 10 == 0:
                print(f'  {i + 1}/{len(tasks)} tasks, {total} games, {time.time() - t0:.0f}s', flush=True)
    rows = {}
    for k in cols['rows'][0]:
        if k in ('v', 'id'):
            rows[k] = [x for r_ in cols['rows'] for x in r_[k]]
        else:
            rows[k] = np.concatenate([r_[k] for r_ in cols['rows']])
    data = {'cells': cells, 'tree': tree, 'rows': rows, 'examples': examples,
            'shifts': np.concatenate(cols['shifts']), 'losses': np.concatenate(cols['losses']),
            'tact': np.concatenate(cols['tact']), 'n': total}
    with open(os.path.join(OUT, 'dump_tables.pkl'), 'wb') as fh:
        pickle.dump(data, fh, protocol=5)
    print(f'done: {total} games, {len(tree)} tree edges, {len(data["tact"])} tactic events in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
