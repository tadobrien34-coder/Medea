"""Opening book: position key -> (eco, name), and opening metadata (side, shortest line)."""
import csv, glob, json, os, re
import chess
from lib import *

REF = os.path.join(HERE, 'ref')


def pos_key(b):
    return b.board_fen() + (' w ' if b.turn else ' b ') + b.castling_xfen()


def vkey_of(op):
    return op.split(',')[0] if ':' in op else op


def fkey_of(op):
    return op.split(':')[0]


BLACK_FORCE = re.compile(r"(Benko|Englund|Latvian|Elephant|Budapest|Albin|Schliemann|Jaenisch|Rubinstein Counter)", re.I)
DEFENCE = re.compile(r"(Defen[cs]e|Counter|Accepted|Declined)", re.I)
WHITE_WORDS = re.compile(r"(Attack|Gambit|Advance|Exchange|Alapin|Anti-|Closed|System|Grand Prix|Smith-Morra|Fantasy|Opening|Fianchetto|Rossolimo|Maroczy|Wing|Game)", re.I)
BLACK_WORDS = re.compile(r"(Indian|Benoni|Dutch|Sicilian|French|Pirc|Slav|Philidor|Scandinavian|Alekhine|Caro|Nimzo|Gr[uü]nfeld|Petrov|Petroff|Owen|Modern|Hippopotamus|St\. George)", re.I)


def side_of(key, plies):
    """0 = White's opening, 1 = Black's defence. Name cues first, parity of the shortest line as a fallback."""
    fam = key.split(':')[0]
    var = key.split(':', 1)[1] if ':' in key else ''
    if BLACK_FORCE.search(key):
        return 1
    if var:
        if DEFENCE.search(var):
            return 1
        if WHITE_WORDS.search(var) and not BLACK_WORDS.search(var):
            return 0
    if DEFENCE.search(fam):
        return 1
    if WHITE_WORDS.search(fam):
        return 0
    if BLACK_WORDS.search(fam):
        return 1
    return 0 if plies % 2 == 1 else 1


def load_book():
    entries = []
    for p in sorted(glob.glob(os.path.join(REF, '?.tsv'))):
        with open(p, encoding='utf8') as fh:
            rd = csv.DictReader(fh, delimiter='\t')
            for row in rd:
                toks = [t for t in re.split(r'\s+', row['pgn'].strip()) if t and not re.match(r'^\d+\.+$', t)]
                b = chess.Board()
                sans = []
                for t in toks:
                    t2 = re.sub(r'^\d+\.+', '', t)
                    mv = b.parse_san(t2)
                    sans.append(b.san(mv))
                    b.push(mv)
                entries.append({'eco': row['eco'], 'name': row['name'], 'sans': sans, 'key': pos_key(b)})
    return entries


def build():
    entries = load_book()
    book = {}
    for e in entries:
        book[e['key']] = [e['eco'], e['name']]
    meta = {}
    for level, fn in (('v', vkey_of), ('f', fkey_of)):
        for e in entries:
            k = fn(e['name'])
            m = meta.setdefault((level, k), {'plies': 999, 'sans': None, 'eco': e['eco']})
            if len(e['sans']) < m['plies']:
                m.update(plies=len(e['sans']), sans=e['sans'], eco=e['eco'])
    return book, meta, entries


if __name__ == '__main__':
    book, meta, entries = build()
    print(len(entries), 'book lines;', len(book), 'positions;', len(meta), 'names')
    for k in [('f', 'Sicilian Defense'), ('f', 'Italian Game'), ('v', 'Sicilian Defense: Najdorf Variation'), ('f', "Queen's Gambit Declined")]:
        print(k, meta.get(k))
