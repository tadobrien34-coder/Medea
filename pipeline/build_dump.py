#!/usr/bin/env python3
"""Run every per-game analysis over the raw dump shards in parallel and save merged tables.

    python build_dump.py            ->  out/dump_tables.pkl
"""
import glob, json, multiprocessing as mp, os, pickle, sys, time
import numpy as np
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
    shifts, tact = [], []
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
        edges, events, ok = bp.board_pass(f)
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
            shifts.append((gi, j, holder, mover, int(f.pc[j]), int(f.pc[j + 1]) if j + 1 < f.n else -1))
        for ev in events:
            st = bp.event_stats(f, ev)
            tact.append((gi, bp.TID[bp.primary(ev[2])], tc, band_of(avg)) + st)
        gi += 1
    # drop singleton deep edges to keep the merge light
    tree = {k: v for k, v in tree.items() if v[2] > 1 or v[1] < 6}
    out = {
        'cells': cells, 'tree': tree, 'n': gi,
        'rows': {k: (np.asarray(v, dtype=(np.int16 if k in ('em', 'npl', 'avg') else np.int8 if k in ('tc', 'res', 'et', 'nsh') else None))
                     if k not in ('v', 'id') else v) for k, v in rows.items()},
        'shifts': np.asarray(shifts, dtype=np.int16).reshape(-1, 6),
        'tact': np.asarray(tact, dtype=np.int32).reshape(-1, 17),
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
    cols = {'rows': [], 'shifts': [], 'tact': []}
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
    data = {'cells': cells, 'tree': tree, 'rows': rows,
            'shifts': np.concatenate(cols['shifts']), 'tact': np.concatenate(cols['tact']), 'n': total}
    with open(os.path.join(OUT, 'dump_tables.pkl'), 'wb') as fh:
        pickle.dump(data, fh, protocol=5)
    print(f'done: {total} games, {len(tree)} tree edges, {len(data["tact"])} tactic events in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
