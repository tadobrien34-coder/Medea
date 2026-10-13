"""Hand-written guidance for each tactic. Numbers are attached from the data at build time."""

GENERIC_AFTER = [
    'Re-read the position after every capture: what does their last move threaten?',
    'Run the blunder check each move: their checks, their captures, their threats, in that order.',
    'When ahead, trade pieces, not pawns. Simplify, keep your king safe, and make them prove it.',
    'Spend your clock on the moment after the tactic. That is when most advantages leak away.',
]

TEXT = {
    'hanging': {
        'what': 'Taking a piece the opponent left unprotected.',
        'recognize': 'Scan their last move: did it leave a piece loose, or remove the only defender of one? Undefended pieces on open diagonals and files are the usual victims.',
        'hold': 'Capture, then ask what their move threatened. Trade down once ahead; the extra piece matters more with fewer pieces on the board.',
        'avoid': 'Grabbing while a mate or a bigger capture was on the board. Recapturing on autopilot. Parking the capturing piece on a square that gets forked or trapped.',
    },
    'win_exchange': {
        'what': 'Capturing a bigger piece with a smaller one (pawn takes knight, minor takes rook).',
        'recognize': 'A pawn or minor piece attacked something worth more and the opponent let the capture happen. Look for pieces placed on squares your pawns control.',
        'hold': 'Recapture correctly, then re-count attackers and defenders on that square. Keep the structure intact and trade into an ending.',
        'avoid': 'Opening lines toward your own king with the recapture. Missing an in-between move that wins the material back.',
    },
    'fork_n': {
        'what': 'A knight attacks two or more valuable targets at once.',
        'recognize': 'Hunt for knight jumps that hit king plus queen or rook, or two loose pieces. Squares like c7, f7, e6 and d5 are the classics. Pieces on the same colour two jumps apart invite it.',
        'hold': 'Cash in at once: take the piece that cannot escape, then regroup. Keep the knight protected so the opponent cannot answer by capturing it.',
        'avoid': 'Letting the forked piece take your knight. Forgetting their in-between check. Taking the second piece when a quiet move keeps everything protected.',
    },
    'fork_p': {
        'what': 'A pawn push or capture hits two pieces at once.',
        'recognize': 'Two enemy pieces one square apart on the same rank, with your pawn able to step between them (d4-d5 versus a knight on c6 and bishop on e6).',
        'hold': 'Win the piece and keep the pawn structure healthy. Do not release the tension that made the fork possible until you have collected.',
        'avoid': 'Opening your own king while collecting. Trading the winning pawn off before it has done its job.',
    },
    'fork_q': {
        'what': 'The queen attacks two undefended targets, or the king and a piece.',
        'recognize': 'Queen checks that also hit a loose rook or bishop; undefended pieces sharing a diagonal, rank or file with an open queen route.',
        'hold': 'Check the landing square first. After you win material, bring the queen home or offer a queen trade.',
        'avoid': 'Queen raids that leave your own pieces unprotected. Missing a perpetual-check defence. Walking the queen into a trap while pawn-grabbing.',
    },
    'fork_br': {
        'what': 'A rook or bishop attacks two targets at once.',
        'recognize': 'Open lines with two loose pieces or a king plus a piece on them. A rook on the seventh, or a bishop on a long diagonal, finds these first.',
        'hold': 'Take the piece that is trapped, then improve. Keep your rooks connected so the forking rook is never loose.',
        'avoid': 'Losing the forking piece to a pawn or a bishop you forgot about. Forks into a position where they simply give a check.',
    },
    'skewer': {
        'what': 'A line attack on a valuable piece that must move, exposing a piece behind it.',
        'recognize': 'King or queen in front, a rook or bishop behind, on one file, rank or diagonal. Check along a line with something loose behind the king.',
        'hold': 'Take the exposed piece and head for a won ending. Keep your rook active and protected afterwards.',
        'avoid': 'Giving the skewering check on a square where it can be captured. Missing that the front piece can capture your attacker.',
    },
    'pin': {
        'what': 'A piece cannot move without exposing something more valuable behind it.',
        'recognize': 'A bishop, rook or queen lined up through a piece to a king or queen. Knights on c6 and f6, and any piece on the e-file with a king behind it.',
        'hold': 'Pile on: add a pawn or another attacker to the pinned piece before cashing in. Do not release the pin until you win something.',
        'avoid': 'Letting them break the pin with tempo (a check, or a pawn push). Trading your pinning piece. Walking into a counter-pin.',
    },
    'remove_def': {
        'what': 'Capturing or chasing the only defender, so the piece it guarded falls.',
        'recognize': 'A piece protected exactly once. Look at the defender: can you take it, trade it, or hit it with a pawn?',
        'hold': 'Recount attackers and defenders after the trade. Prefer the order of captures that never leaves your own piece hanging.',
        'avoid': 'Taking the defender with a piece you cannot afford to lose. Overlooking a recapture that opens your king.',
    },
    'trapped': {
        'what': 'A piece has no safe squares and cannot be saved.',
        'recognize': 'A bishop that grabbed a pawn on the edge (a7, h7), a knight near the rim, a queen deep in your camp with pawns covering the exits.',
        'hold': 'Take away its last squares first, then capture. Do not rush the attack and give it a way out.',
        'avoid': 'Allowing a desperado: the trapped piece grabs something on its way out. Forgetting they can sacrifice it for two pawns.',
    },
    'disc_attack': {
        'what': 'Moving one piece unmasks an attack by another.',
        'recognize': 'A bishop, rook or queen behind your own piece, pointing at a target. The front piece has a forcing move: a check, a capture, a threat.',
        'hold': 'Make the front piece do something nasty so they cannot answer both. Count what you win before you start.',
        'avoid': 'Moving the front piece to a square where it is captured with tempo. Releasing the line before the target is loose.',
    },
    'disc_check': {
        'what': 'A piece moves and uncovers a check from another, so the moved piece is free to do damage.',
        'recognize': 'Your rook, bishop or queen aims through your own piece at their king. Any move of the front piece is a check, so it can capture or fork.',
        'hold': 'Use the free move to win the most valuable thing available, then secure your own king.',
        'avoid': 'Ignoring their way out: they may interpose with a threat of their own. Spending the free move on a minor gain.',
    },
    'double_check': {
        'what': 'Two pieces give check at once; the king must move.',
        'recognize': 'A discovered check where the moving piece also checks. Often the finishing blow in an open king position.',
        'hold': 'Calculate the king moves; this is usually mate or a winning attack. If it is not mate, make sure the follow-up wins material.',
        'avoid': 'Starting it without a follow-up. Forgetting that your own king can be targeted when the lines open.',
    },
    'zwischen': {
        'what': 'An in-between move (usually a check or capture) before the expected recapture.',
        'recognize': 'They took something of yours and you reflexively want to recapture. Pause: is there a check or a bigger capture first?',
        'hold': 'After the intermezzo, recapture and make sure your king is safe; the material swing is yours to keep.',
        'avoid': 'Recapturing automatically. Playing the in-between move without checking that the original recapture is still available.',
    },
    'sacrifice': {
        'what': 'Giving up material for a bigger gain: a mating attack, a passed pawn, or a bigger capture.',
        'recognize': 'Open lines near their king, undeveloped defenders, and a forcing sequence of checks and threats. If the engine-style line is forced, it works.',
        'hold': 'Keep making threats; the initiative is your compensation. If the attack stalls, regroup and trade into something simple.',
        'avoid': 'Sacrificing without a calculated follow-up. Losing the thread after the first sacrifice and handing the piece back for nothing.',
    },
    'promotion': {
        'what': 'A pawn reaches the last rank and becomes a queen (or a knight).',
        'recognize': 'A passed pawn with an open road and no defender nearby, or a pawn supported by a rook from behind.',
        'hold': 'Promote and then check for stalemate and for forks on your new queen. Keep your king close to your own pieces.',
        'avoid': 'Stalemating a lone king. Promoting into a fork or skewer. Pushing the pawn when a quiet king move first would be safer.',
    },
    'back_rank': {
        'what': 'Checkmate on the first rank against a king boxed in by its own pawns.',
        'recognize': 'A castled king with f, g and h pawns unmoved and no luft. Their rooks are tied elsewhere and you can reach the back rank with a rook or queen.',
        'hold': 'This ends the game. Before starting the combination, confirm the back rank has no defenders and no escape square.',
        'avoid': 'Falling for it yourself: make luft early (h3 or h6) and keep one rook on the back rank when the position opens.',
    },
    'smothered': {
        'what': 'A knight mates a king surrounded by its own pieces.',
        'recognize': 'A king in the corner with pieces on every adjacent square, and a knight that can reach a checking square. Often prepared by a queen sacrifice.',
        'hold': 'It ends the game. Verify that every escape square is occupied before you sacrifice.',
        'avoid': 'Walking your own king into the corner behind a wall of pieces.',
    },
    'perpetual': {
        'what': 'Repeated checks save a lost position as a draw.',
        'recognize': 'You are losing, but their king has no shelter and your queen or rook can keep checking.',
        'hold': 'Check forcefully and track the repetition. If they have a way to block with a piece, look for a different check.',
        'avoid': 'Letting a check run out: calculate that every check has a follow-up. Do not accept a draw when the king is also safe for a win.',
    },
    'stalemate': {
        'what': 'A lost position saved by forcing a stalemate.',
        'recognize': 'You have a lone king, they have lots of material, and your king has no legal move after a forced capture.',
        'hold': 'Look for sacrifices that leave your king with no squares and nothing else to move.',
        'avoid': 'Being the one with the material: always leave the lone king a legal move.',
    },
    'attack': {
        'what': 'A move that attacks a loose piece and wins it next turn.',
        'recognize': 'A pawn or minor piece that can attack a bishop or knight that has no protector.',
        'hold': 'Pick the attacking move that also improves your position, so your threat comes for free.',
        'avoid': 'Attacking a piece that can simply capture your attacker.',
    },
    'other': {
        'what': 'A net material gain that is not one of the tactics above, usually a chain of captures.',
        'recognize': 'Exchanges where you end up a pawn or two ahead after a short capture sequence.',
        'hold': 'Count every capture before starting; trade into an ending once you are up.',
        'avoid': 'Starting a capture chain without counting who recaptures last.',
    },
}
