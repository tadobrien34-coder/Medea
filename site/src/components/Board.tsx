import { Chess, Square } from 'chess.js'
import { useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import ArrowLayer from './ArrowLayer'

export interface MoveResult { san: string }

/** Board with drag-and-drop and click-to-move. The parent owns the position; `onMove` receives a legal SAN move. */
export default function Board({ fen, flipped, onMove, arrows, lastMove, interactive = true, tint, rings }: {
  fen: string; flipped?: boolean; onMove?: (san: string) => void
  arrows?: { startSquare: string; endSquare: string; color: string }[]; lastMove?: [string, string] | null; interactive?: boolean
  tint?: Record<string, string>; rings?: Record<string, string>
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  const game = useMemo(() => new Chess(fen), [fen])

  const legalTargets = useMemo(() => {
    if (!selected) return []
    return game.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string)
  }, [game, selected])

  const commit = (from: string, to: string, promotion?: string): boolean => {
    try {
      const g = new Chess(fen)
      const res = g.move({ from, to, promotion })
      onMove?.(res.san)
      return true
    } catch { return false }
  }

  const attempt = (from: string, to: string): boolean => {
    const mv = game.moves({ square: from as Square, verbose: true }).find((m) => m.to === to)
    if (!mv) return false
    if (mv.promotion) { setPromo({ from, to }); return false }   // ask which piece
    return commit(from, to)
  }

  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {}
    if (lastMove) for (const q of lastMove) s[q] = { background: 'rgba(57, 135, 229, 0.30)' }
    if (tint) for (const [q, c] of Object.entries(tint)) s[q] = { ...(s[q] ?? {}), background: c }
    if (rings) for (const [q, c] of Object.entries(rings)) s[q] = { ...(s[q] ?? {}), boxShadow: `inset 0 0 0 4px ${c}, inset 0 0 14px 2px ${c}` }
    if (selected) s[selected] = { background: 'rgba(57, 135, 229, 0.50)' }
    for (const t of legalTargets) {
      s[t] = { ...(s[t] ?? {}), background: `${s[t]?.background ? s[t].background + ',' : ''}radial-gradient(circle, rgba(11,11,11,.28) 20%, transparent 22%)` }
    }
    return s
  }, [lastMove, selected, legalTargets, tint, rings])

  const white = game.turn() === 'w'
  const glyph: Record<string, string> = white ? { q: '♕', r: '♖', b: '♗', n: '♘' } : { q: '♛', r: '♜', b: '♝', n: '♞' }
  return (
    <div className="board-wrap">
    <Chessboard
      options={{
        position: fen,
        boardOrientation: flipped ? 'black' : 'white',
        allowDragging: interactive,
        animationDurationInMs: 160,
        squareStyles,
        arrows: [],
        allowDrawingArrows: false,
        lightSquareStyle: { backgroundColor: 'var(--sq-light)' },
        darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
        boardStyle: { borderRadius: 0 },
        showNotation: true,
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          setSelected(null)
          return !!targetSquare && attempt(sourceSquare, targetSquare)
        },
        onSquareClick: ({ square, piece }) => {
          if (!interactive) return
          if (selected && legalTargets.includes(square)) { attempt(selected, square); setSelected(null); return }
          const own = piece && game.get(square as Square)?.color === game.turn()
          setSelected(own && square !== selected ? square : null)
        },
        canDragPiece: ({ square }) => !!square && game.get(square as Square)?.color === game.turn(),
      }}
    />
      <ArrowLayer arrows={arrows ?? []} flipped={!!flipped} />
      {promo && (
        <div role="dialog" aria-label="Choose promotion piece" onClick={() => setPromo(null)}
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)' }}>
          <div className="card" style={{ display: 'flex', gap: 6, padding: 8 }} onClick={(e) => e.stopPropagation()}>
            {(['q', 'r', 'b', 'n'] as const).map((k) => (
              <button key={k} className="btn" style={{ fontSize: 34, lineHeight: 1, padding: '6px 12px', color: 'var(--ink)' }} aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[k]}
                onClick={() => { const p = promo; setPromo(null); setSelected(null); commit(p.from, p.to, k) }}>{glyph[k]}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
