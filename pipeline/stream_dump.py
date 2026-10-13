#!/usr/bin/env python3
"""Stream a Lichess monthly dump, keep analysed games (those with [%eval]) up to
per-(time control, rating bucket) quotas, and append compact JSONL records.

    python stream_dump.py 2026-09 --cap 1200

Safe to stop at any time (touch raw/STOP, or Ctrl-C): records are flushed in batches.
Network drops are resumed with HTTP Range requests; the zstd decoder state is kept.
"""
import argparse, codecs, json, os, re, sys, time
import requests, zstandard

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")

RE_H = re.compile(r'\[(\w+) "([^"]*)"\]')
RE_M = re.compile(r'(?:\d+\.+\s+)?([^\s{}]+)\s+\{([^}]*)\}')
RE_EV = re.compile(r'\[%eval ([^\]\s]+)\]')
RE_CK = re.compile(r'\[%clk ([^\]\s]+)\]')
RE_SPLIT = re.compile(r'\n\n(?=\[Event )')
TCS = {"Bullet", "Blitz", "Rapid", "Classical"}


def parse_ev(tok):
    if tok.startswith('#'):
        return 1000 if not tok.startswith('#-') else -1000
    cp = int(round(float(tok) * 100))
    return max(-1000, min(1000, cp))


def parse_clk(tok):
    p = tok.split(':')
    return int(float(p[0]) * 3600 + float(p[1]) * 60 + float(p[2]))


def process(piece, caps, cap):
    head, _, mt = piece.partition('\n\n')
    if '[%eval' not in mt:
        return None
    h = dict(RE_H.findall(head))
    if 'FEN' in h or 'Variant' in h:
        return None
    m = re.match(r'Rated (\w+)', h.get('Event', ''))
    if not m or m.group(1) not in TCS:
        return None
    tc = m.group(1)
    if h.get('Termination') not in ('Normal', 'Time forfeit'):
        return None
    wt, bt = h.get('WhiteTitle', ''), h.get('BlackTitle', '')
    if wt == 'BOT' or bt == 'BOT':
        return None
    try:
        we, be = int(h['WhiteElo']), int(h['BlackElo'])
        base, inc = h['TimeControl'].split('+'); base, inc = int(base), int(inc)
    except (KeyError, ValueError):
        return None
    if abs(we - be) > 250:
        return None
    bucket = min(max((we + be) // 2 // 100 * 100, 400), 2800)
    key = (tc, bucket)
    titled = (wt == 'GM' or bt == 'GM')
    full = caps.get(key, 0) >= cap
    if full and not titled:
        return None
    moves = RE_M.findall(mt)
    n = len(moves)
    if n < 6:
        return None
    sans, evs, cks = [], [], []
    miss = 0
    for san, com in moves:
        san = san.rstrip('?!')
        e = RE_EV.search(com)
        c = RE_CK.search(com)
        if c is None:
            return None
        sans.append(san)
        cks.append(parse_clk(c.group(1)))
        if e is None:
            miss += 1
            evs.append(None)
        else:
            evs.append(parse_ev(e.group(1)))
    if miss:
        # the final (mating / terminal) move often has no eval
        if miss > 1 or evs[-1] is not None:
            return None
        if sans[-1].endswith('#'):
            evs[-1] = 1000 if (n % 2 == 1) else -1000
        else:
            evs[-1] = evs[-2]
    rec = {
        'id': h['Site'][-8:], 'tc': tc, 'w': we, 'b': be, 'r': h['Result'],
        'tm': 1 if h['Termination'] == 'Time forfeit' else 0,
        'base': base, 'inc': inc, 'eco': h.get('ECO', ''), 'op': h.get('Opening', ''),
        'mv': ' '.join(sans), 'ev': evs, 'ck': cks, 'd': h.get('UTCDate', ''),
    }
    if wt: rec['wt'] = wt
    if bt: rec['bt'] = bt
    if titled or wt in ('IM', 'FM') or bt in ('IM', 'FM'):
        rec['wn'], rec['bn'] = h.get('White', ''), h.get('Black', '')
    if full:
        rec['x'] = 1  # extra titled game: excluded from bucket statistics
    else:
        caps[key] = caps.get(key, 0) + 1
    return rec


class HTTPStream:
    """File-like object over an HTTP Range download that reconnects transparently."""
    def __init__(self, url):
        self.url, self.pos, self.sess, self.it, self.resp = url, 0, requests.Session(), None, None
        self.retries = 0

    def _connect(self):
        hdr = {'Range': f'bytes={self.pos}-'} if self.pos else {}
        self.resp = self.sess.get(self.url, headers=hdr, stream=True, timeout=(20, 60))
        self.resp.raise_for_status()
        self.it = self.resp.iter_content(1 << 20)

    def read(self, n=-1):
        while True:
            try:
                if self.it is None:
                    self._connect()
                chunk = next(self.it, b'')
                self.pos += len(chunk)
                self.retries = 0
                return chunk
            except requests.RequestException as e:
                self.retries += 1
                print(f'network error at {self.pos}: {e!r}; retry {self.retries}', flush=True)
                if self.retries > 300:
                    return b''
                self.it = None
                time.sleep(min(30, 2 * self.retries))

    def readable(self):
        return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('month')
    ap.add_argument('--cap', type=int, default=1200, help='games kept per (time control, 100-elo bucket)')
    ap.add_argument('--max-gb', type=float, default=1e9)
    a = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    url = f'https://database.lichess.org/standard/lichess_db_standard_rated_{a.month}.pgn.zst'
    out_path = os.path.join(RAW, f'games_{a.month}.jsonl')
    stat_path = os.path.join(RAW, f'status_{a.month}.json')
    stop_path = os.path.join(RAW, 'STOP')
    out = open(out_path, 'a', encoding='utf8')
    http = HTTPStream(url)
    reader = zstandard.ZstdDecompressor(max_window_size=1 << 31).stream_reader(http, read_across_frames=True)
    dec = codecs.getincrementaldecoder('utf8')('replace')
    caps, buf = {}, ''
    seen, kept, t0, last_stat = 0, 0, time.time(), 0

    def write_status(state):
        json.dump({'month': a.month, 'state': state, 'bytes': http.pos, 'gb': round(http.pos / 1e9, 3),
                   'games_seen': seen, 'kept': kept, 'elapsed_s': int(time.time() - t0),
                   'cells': {f'{k[0]}|{k[1]}': v for k, v in sorted(caps.items())}},
                  open(stat_path, 'w'))

    def drain(final=False):
        nonlocal buf, seen, kept
        parts = RE_SPLIT.split(buf)
        rest = '' if final else parts.pop()
        for p in parts:
            seen += 1
            r = process(p, caps, a.cap)
            if r:
                kept += 1
                out.write(json.dumps(r, separators=(',', ':')) + '\n')
        buf = rest
        out.flush()

    while True:
        data = reader.read(1 << 24)
        if not data:
            break
        buf += dec.decode(data)
        if len(buf) > 24_000_000:
            drain()
        if time.time() - last_stat > 20:
            last_stat = time.time()
            write_status('running')
            if os.path.exists(stop_path) or http.pos > a.max_gb * 1e9:
                break
    drain(final=True)
    write_status('done')
    out.close()


if __name__ == '__main__':
    main()
