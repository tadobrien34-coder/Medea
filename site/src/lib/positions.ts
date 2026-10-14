import { Chess, Square } from 'chess.js'
import type { Arrow } from '../components/BoardView'

export function fenAfter(line: string[], upTo = line.length): { fen: string; last: [string, string] | null; ok: boolean } {
  const g = new Chess()
  let last: [string, string] | null = null
  for (let i = 0; i < Math.min(upTo, line.length); i++) {
    try { const m = g.move(line[i]); last = [m.from, m.to] } catch { return { fen: g.fen(), last, ok: false } }
  }
  return { fen: g.fen(), last, ok: true }
}

/** Arrows for candidate SAN moves from a position, opacity by share. */
export function moveArrows(fen: string, moves: [string, number][], rgb = '224,163,26'): Arrow[] {
  const g = new Chess(fen)
  const out: Arrow[] = []
  for (const [san, share] of moves) {
    try {
      const m = g.move(san); g.undo()
      out.push({ startSquare: m.from, endSquare: m.to, color: `rgba(${rgb},${(0.35 + 0.55 * Math.min(1, share * 1.5)).toFixed(2)})` })
    } catch { /* illegal in this position */ }
  }
  return out
}

/** Pieces that are attacked and either undefended or attacked by something cheaper: the usual targets. */
export function loosePieces(fen: string): Record<string, string> {
  const g = new Chess(fen)
  const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
  const out: Record<string, string> = {}
  for (const row of g.board()) for (const p of row) {
    if (!p || p.type === 'k') continue
    const enemy = p.color === 'w' ? 'b' : 'w'
    const att = g.attackers(p.square as Square, enemy)
    if (!att.length) continue
    const def = g.attackers(p.square as Square, p.color)
    const cheapest = Math.min(...att.map((a) => val[g.get(a as Square)!.type]))
    if (!def.length || cheapest < val[p.type]) out[p.square] = 'rgba(208,59,59,0.85)'
  }
  return out
}

export function uciToArrow(uci: string, color: string): Arrow {
  return { startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color }
}

export function sanOf(fen: string, uci: string): string {
  try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san } catch { return uci }
}
