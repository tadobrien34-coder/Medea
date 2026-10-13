"""Board-aware analysis: opening-tree edges and tactic detection (python-chess)."""
import chess
from chess import WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING
import numpy as np
from lib import *

VAL = [0, 1, 3, 3, 5, 9, 0]
TREE_DEPTH = 14

# tactic ids ---------------------------------------------------------------------------
TACTICS = [
    ('back_rank', 'Back-rank mate'), ('smothered', 'Smothered mate'), ('double_check', 'Double check'),
    ('disc_check', 'Discovered check'), ('fork_n', 'Knight fork'), ('fork_p', 'Pawn fork'), ('fork_q', 'Queen fork'),
    ('fork_br', 'Rook / bishop fork'), ('skewer', 'Skewer'), ('pin', 'Pin'), ('remove_def', 'Removing the defender'),
    ('trapped', 'Trapped piece'), ('disc_attack', 'Discovered attack'), ('zwischen', 'Zwischenzug'),
    ('sacrifice', 'Sacrifice'), ('promotion', 'Promotion'), ('hanging', 'Hanging piece'),
    ('win_exchange', 'Winning trade'), ('attack', 'Attack on a loose piece'), ('other', 'Other material win'),
    ('perpetual', 'Perpetual check'), ('stalemate', 'Stalemate trick'),
]
TID = {k: i for i, (k, _) in enumerate(TACTICS)}   # order == priority when an event carries several tags


def primary(tags):
    return min(tags, key=lambda t: TID[t])



def mat_of(b):
    s = 0
    for t in (PAWN, KNIGHT, BISHOP, ROOK, QUEEN):
        s += VAL[t] * (chess.popcount(b.pieces_mask(t, WHITE)) - chess.popcount(b.pieces_mask(t, BLACK)))
    return s


def pval(b, sq):
    t = b.piece_type_at(sq)
    return 100 if t == KING else VAL[t]


def lva(b, color, sq):
    best = 1000
    for a in b.attackers(color, sq):
        v = pval(b, a)
        if v < best:
            best = v
    return best


def see(b, move):
    color, enemy = b.turn, not b.turn
    to = move.to_square
    captured = PAWN if b.is_en_passant(move) else b.piece_type_at(to)
    cap_val = VAL[captured] if captured else 0
    pt = b.piece_type_at(move.from_square)
    v_on = 100 if pt == KING else VAL[pt]
    if move.promotion:
        cap_val += VAL[move.promotion] - 1
        v_on = VAL[move.promotion]
    mine = sorted(pval(b, s) for s in b.attackers(color, to) if s != move.from_square)
    theirs = sorted(pval(b, s) for s in b.attackers(enemy, to) if s != to)
    gains = [cap_val]
    enemy_turn = True
    while True:
        lst = theirs if enemy_turn else mine
        if not lst:
            break
        a = lst.pop(0)
        gains.append(v_on - gains[-1])
        v_on = a
        enemy_turn = not enemy_turn
    for d in range(len(gains) - 1, 0, -1):
        gains[d - 1] = -max(-gains[d - 1], gains[d])
    return gains[0]


DIRS = {BISHOP: [(1, 1), (1, -1), (-1, 1), (-1, -1)], ROOK: [(1, 0), (-1, 0), (0, 1), (0, -1)]}
DIRS[QUEEN] = DIRS[BISHOP] + DIRS[ROOK]


def ray_pieces(b, sq, d):
    """First two occupied squares along direction d from sq."""
    f, r = chess.square_file(sq) + d[0], chess.square_rank(sq) + d[1]
    out = []
    while 0 <= f < 8 and 0 <= r < 8:
        s = chess.square(f, r)
        if b.piece_type_at(s):
            out.append(s)
            if len(out) == 2:
                break
        f += d[0]; r += d[1]
    return out


def safe_square(aft, sq, color, pt):
    enemy = not color
    att = aft.attackers(enemy, sq)
    if not att:
        return True
    if aft.is_attacked_by(color, sq) and lva(aft, enemy, sq) >= VAL[pt] and pt != KING:
        return True
    return False


def detect(bef, aft, move, color, recapture=False):
    """Tactic tags the move exhibits -> bitboard of the squares the tactic is "about" (0 = unlinked)."""
    out = {}
    enemy = not color
    to = move.to_square
    pt = aft.piece_type_at(to)
    captured_t = PAWN if bef.is_en_passant(move) else bef.piece_type_at(to)
    mpt = bef.piece_type_at(move.from_square)

    if not recapture:
        if captured_t and captured_t != PAWN and VAL[captured_t] >= 3 and not bef.attackers(enemy, to):
            out['hanging'] = 0
        if captured_t and mpt != KING and VAL[captured_t] - VAL[mpt] >= 2:
            out['win_exchange'] = 0

    # forks
    if pt != KING:
        tg = aft.attacks_mask(to) & aft.occupied_co[enemy]
        worthy, mask = 0, 0
        for t in chess.scan_forward(tg):
            tt = aft.piece_type_at(t)
            if tt == KING or VAL[tt] > VAL[pt] or (VAL[tt] >= 3 and not aft.is_attacked_by(enemy, t)):
                worthy += 1
                mask |= chess.BB_SQUARES[t]
        if worthy >= 2 and safe_square(aft, to, color, pt):
            out[{KNIGHT: 'fork_n', PAWN: 'fork_p', QUEEN: 'fork_q'}.get(pt, 'fork_br')] = mask

    # pins / skewers by the moved slider
    if pt in DIRS:
        for d in DIRS[pt]:
            ps = ray_pieces(aft, to, d)
            if len(ps) == 2:
                x, y = ps
                if aft.color_at(x) == enemy and aft.color_at(y) == enemy:
                    xt, yt = aft.piece_type_at(x), aft.piece_type_at(y)
                    m = chess.BB_SQUARES[x] | chess.BB_SQUARES[y]
                    if xt == KING:
                        if VAL[yt] >= 3:
                            out['skewer'] = m
                    elif yt == KING or VAL[yt] > VAL[xt]:
                        out['pin'] = m
                    elif VAL[xt] > VAL[yt] and VAL[yt] >= 3 and safe_square(aft, to, color, pt):
                        out['skewer'] = m

    # discovered checks / attacks
    if aft.is_check():
        chk = aft.checkers_mask()
        if chess.popcount(chk) >= 2:
            out['double_check'] = 0
        elif not (chk & chess.BB_SQUARES[to]):
            out['disc_check'] = 0
    else:
        for s in chess.scan_forward(bef.occupied_co[color]):
            if s == move.from_square:
                continue
            if bef.piece_type_at(s) in DIRS:
                new = (aft.attacks_mask(s) & aft.occupied_co[enemy]) & ~bef.attacks_mask(s)
                m = 0
                for t in chess.scan_forward(new):
                    tt = aft.piece_type_at(t)
                    if tt != KING and (VAL[tt] >= 5 or (VAL[tt] >= 3 and not aft.is_attacked_by(enemy, t))):
                        m |= chess.BB_SQUARES[t]
                if m:
                    out['disc_attack'] = m
                    break

    # removing the defender
    if captured_t:
        for t in chess.scan_forward(bef.occupied_co[enemy] & bef.attacks_mask(to)):
            tt = bef.piece_type_at(t)
            if t == to or tt in (KING, PAWN):
                continue
            if bef.is_attacked_by(color, t) and set(bef.attackers(enemy, t)) == {to} and aft.is_attacked_by(color, t):
                out['remove_def'] = chess.BB_SQUARES[t]
                break

    # trapped piece: newly attacked, cannot be defended adequately, and has no safe square
    for t in chess.scan_forward(aft.occupied_co[enemy] & ~aft.kings & ~aft.pawns):
        tt = aft.piece_type_at(t)
        if bef.is_attacked_by(color, t) or not aft.is_attacked_by(color, t):
            continue
        if aft.is_attacked_by(enemy, t) and lva(aft, color, t) >= VAL[tt]:
            continue
        dests = aft.attacks_mask(t) & ~aft.occupied_co[enemy]
        if all(aft.is_attacked_by(color, d) for d in chess.scan_forward(dests)):
            out['trapped'] = chess.BB_SQUARES[t]
            break

    # attack on a loose piece
    if not captured_t and pt != KING:
        tg2 = aft.attacks_mask(to) & aft.occupied_co[enemy]
        for t in chess.scan_forward(tg2):
            tt = aft.piece_type_at(t)
            if tt != KING and VAL[tt] >= 3 and (not aft.is_attacked_by(enemy, t) or lva(aft, color, t) < VAL[tt]) \
                    and safe_square(aft, to, color, pt):
                out['attack'] = chess.BB_SQUARES[t]
                break

    if move.promotion:
        out['promotion'] = 0
    return out


def mate_pattern(aft, color):
    """Classify a checkmate delivered by `color` (position after the mating move)."""
    enemy = not color
    ks = aft.king(enemy)
    chk = aft.checkers_mask()
    if chess.popcount(chk) != 1:
        return None
    c = chess.msb(chk) if chk else None
    ct = aft.piece_type_at(c)
    around = [s for s in chess.scan_forward(aft.attacks_mask(ks))]
    if ct == KNIGHT and all(aft.color_at(s) == enemy for s in around):
        return 'smothered'
    home = 0 if enemy == WHITE else 7
    if chess.square_rank(ks) == home and ct in (ROOK, QUEEN) and chess.square_rank(c) == home:
        fwd = [s for s in around if chess.square_rank(s) != home]
        if all(aft.color_at(s) == enemy for s in fwd):
            return 'back_rank'
    return None


def board_pass(f, want_tree=True):
    """Return (tree_edges, tactic_events, ok) for one game (features object `f`)."""
    rec = f.rec
    b = chess.Board()
    moves, mats, edges, capv = [], [0], [], []
    n = f.n
    try:
        for i, san in enumerate(f.sans):
            mv = b.parse_san(san)
            parent = None
            if want_tree and i < TREE_DEPTH:
                parent = b.board_fen() + (' w ' if b.turn else ' b ') + b.castling_xfen()
            ct = PAWN if b.is_en_passant(mv) else b.piece_type_at(mv.to_square)
            capv.append(VAL[ct] if ct else 0)
            moves.append(mv)
            b.push(mv)
            mats.append(mat_of(b))
            if parent is not None:
                child = b.board_fen() + (' w ' if b.turn else ' b ') + b.castling_xfen()
                edges.append((parent, san, child, int(f.cp[i]) if f.has_eval else None))
    except Exception:
        return edges, [], False
    if not f.has_eval:
        return edges, [], True
    final_board = b
    events = []
    cp, p = f.cp, f.p
    mats = np.asarray(mats)
    idx = np.arange(n)
    sgn_arr = np.where(idx % 2 == 0, 1, -1)
    prevcap = np.concatenate([[False], f.cap[:-1]])
    base_idx = np.where(prevcap, idx - 1, idx)                    # measure from before an opponent's capture
    gain = sgn_arr * (mats[np.minimum(idx + 4, n)] - mats[base_idx])   # material won over the next 4 plies
    cand = gain >= 2
    last_cand = [-10, -10]
    b2 = chess.Board()
    for i in range(n):
        side = i & 1
        color = WHITE if side == 0 else BLACK
        sg = 1 if side == 0 else -1
        mv = moves[i]
        san = f.sans[i]
        is_cand = bool(cand[i]) and last_cand[side] < i - 4
        is_mate = san.endswith('#')
        sac_possible = (i >= 1 and sg * p[i] >= 1.0 and sg * (cp[i] - cp[i - 1]) >= -50 and not is_mate
                        and b2.is_attacked_by(not color, mv.to_square))
        zw_possible = (i >= 1 and i + 2 < n and capv[i - 1] >= 3 and 'x' in f.sans[i - 1] and
                       moves[i - 1].to_square != mv.to_square and ('+' in san or 'x' in san))
        if not (is_cand or sac_possible or zw_possible or mv.promotion or is_mate):
            b2.push(mv)
            continue
        aft = b2.copy(stack=False)
        aft.push(mv)
        tags = set()
        if is_cand:
            recap = i >= 1 and 'x' in f.sans[i - 1] and moves[i - 1].to_square == mv.to_square
            found = detect(b2, aft, mv, color, recap)
            # the material is usually collected on the mover's next capture; look at that move too
            capmask = chess.BB_SQUARES[mv.to_square] if 'x' in san else 0
            for j in (i + 2, i + 4):
                if j < n and 'x' in f.sans[j]:
                    capmask |= chess.BB_SQUARES[moves[j].to_square]
            if 'x' not in san and i + 2 < n and 'x' in f.sans[i + 2]:
                bj = aft.copy(stack=False)
                bj.push(moves[i + 1])
                aj = bj.copy(stack=False)
                aj.push(moves[i + 2])
                recap2 = 'x' in f.sans[i + 1] and moves[i + 1].to_square == moves[i + 2].to_square
                for k, m in detect(bj, aj, moves[i + 2], color, recap2).items():
                    if k in ('hanging', 'win_exchange', 'remove_def') and k not in found:
                        found[k] = m
            for k, m in found.items():
                if m == 0 or (m & capmask):
                    tags.add(k)
        if is_mate:
            mp = mate_pattern(aft, color)
            if mp:
                tags.add(mp)
        if (sac_possible and i + 1 < n and 'x' in f.sans[i + 1] and moves[i + 1].to_square == mv.to_square
                and see(b2, mv) <= -2):
            tags.add('sacrifice')
        if zw_possible:
            s = moves[i - 1].to_square
            if moves[i + 2].to_square == s and 'x' in f.sans[i + 2]:
                tags.add('zwischen')
        if mv.promotion:
            tags.add('promotion')
        if is_cand and not tags:
            tags.add('other')
        if tags:
            if is_cand:
                last_cand[side] = i
            events.append((i, side, sorted(tags)))
        b2.push(mv)
    # defensive resources that save half a point
    if rec['r'] == '1/2-1/2' and n >= 12:
        for side in (0, 1):
            ew = p if side == 0 else -p
            if ew[max(0, n - 14):n - 6].min() <= -2.0:
                own = [i for i in range(n - 1, -1, -1) if i % 2 == side][:3]
                if all(f.chk[i] for i in own):
                    events.append((own[-1], side, ['perpetual']))
        if final_board.is_stalemate():
            sw = (n - 1) % 2                                  # side that delivered the stalemate
            ahead = p[max(0, n - 6):n].mean() * (1 if sw == 0 else -1)
            if ahead >= 2.0:
                events.append((n - 1, 1 - sw, ['stalemate']))
    return edges, events, True


def event_stats(f, ev):
    """Numeric outcome record for a tactic event (ply, side, tags)."""
    i, side, tags = ev
    n, sgn = f.n, (1 if side == 0 else -1)
    e = f.cp * sgn / 100.0
    e_prev = e[i - 1] if i >= 1 else INIT_CP / 100.0
    j = min(i + 3, n - 1)
    e_after = e[j]
    win_at = f.win_at[side]
    already = bool(e_prev >= WIN_ADV)
    new_win = 0
    kept = -1
    if win_at >= 0 and not already and i <= win_at <= i + 8:
        new_win = 1
        kept = int(e[win_at:].min() >= LEAD)
    res = f.res
    pts = 1.0 if (res == 0 and side == 0) or (res == 2 and side == 1) else (0.5 if res == 1 else 0.0)
    gifted = 0
    if i >= 1:
        loss_prev = f.loss[i - 1]
        gifted = int(loss_prev >= MISTAKE)
    # blunders by the tactic's author in their next three moves
    post = 0
    post_piece = -1
    for k in (i + 2, i + 4, i + 6):
        if k < n and f.is_blunder[k]:
            post = 1
            post_piece = int(f.pc[k])
            break
    gave_back = 0
    if e_after >= 3.0 and i + 2 < n:
        gave_back = int(e[i + 2:min(n, i + 12)].min() < LEAD)
    phase = 0 if i // 2 + 1 <= 10 else (1 if i // 2 + 1 <= 30 else 2)
    return (side, i, int(round(e_prev * 100)), int(round(e_after * 100)), int(already), new_win, kept, int(pts * 2),
            gifted, post, post_piece, gave_back, phase)
