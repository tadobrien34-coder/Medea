import { Chess, Square } from 'chess.js'

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Name the kind of tactic a move is (rules-based, in the browser). */
export function classifyMove(fen: string, uci: string): string {
  const g = new Chess(fen)
  let mv
  try { mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) } catch { return 'Other advantage' }
  if (g.isCheckmate()) return 'Checkmate'
  const mover = mv.color, enemy = mover === 'w' ? 'b' : 'w'
  if (mv.captured && VAL[mv.captured] >= 3) {
    const before = new Chess(fen)
    const defenders = before.attackers(mv.to as Square, enemy).filter((s) => s !== mv.to)
    if (!defenders.length) return 'Free piece'
  }
  if (mv.captured && VAL[mv.captured] - VAL[mv.piece] >= 2) return 'Winning trade'
  // fork: the moved piece now attacks two valuable or loose enemy pieces
  let targets = 0
  for (const row of g.board()) for (const p of row) {
    if (!p || p.color !== enemy) continue
    if (!g.attackers(p.square as Square, mover).includes(mv.to as Square)) continue
    const defended = g.attackers(p.square as Square, enemy).length > 0
    if (p.type === 'k' || VAL[p.type] > VAL[mv.piece] || (VAL[p.type] >= 3 && !defended)) targets++
  }
  if (targets >= 2 && mv.piece !== 'k') return 'Fork'
  if (g.inCheck()) return 'Check that wins material'
  if (mv.promotion) return 'Promotion'
  if (mv.captured) return 'Capture'
  return 'Other advantage'
}
