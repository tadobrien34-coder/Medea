import { Chess, Square } from 'chess.js'
import { useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'

export interface MoveResult { san: string }

/** Board with drag-and-drop and click-to-move. The parent owns the position; `onMove` receives a legal SAN move. */
export default function Board({ fen, flipped, onMove, arrows, lastMove, interactive = true }: {
  fen: string; flipped?: boolean; onMove?: (san: string) => void
  arrows?: { startSquare: string; endSquare: string; color: string }[]; lastMove?: [string, string] | null; interactive?: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const game = useMemo(() => new Chess(fen), [fen])

  const legalTargets = useMemo(() => {
    if (!selected) return []
    return game.moves({ square: selected as Square, verbose: true }).map((m) => m.to as string)
  }, [game, selected])

  const attempt = (from: string, to: string): boolean => {
    try {
      const mv = game.moves({ square: from as Square, verbose: true }).find((m) => m.to === to)
      if (!mv) return false
      const g = new Chess(fen)
      const res = g.move({ from, to, promotion: mv.promotion ? 'q' : undefined })
      onMove?.(res.san)
      return true
    } catch { return false }
  }

  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {}
    if (lastMove) for (const q of lastMove) s[q] = { background: 'rgba(57, 135, 229, 0.30)' }
    if (selected) s[selected] = { background: 'rgba(57, 135, 229, 0.50)' }
    for (const t of legalTargets) {
      s[t] = { ...(s[t] ?? {}), background: `${s[t]?.background ? s[t].background + ',' : ''}radial-gradient(circle, rgba(11,11,11,.28) 20%, transparent 22%)` }
    }
    return s
  }, [lastMove, selected, legalTargets])

  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: flipped ? 'black' : 'white',
        allowDragging: interactive,
        animationDurationInMs: 160,
        squareStyles,
        arrows: arrows ?? [],
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
  )
}
