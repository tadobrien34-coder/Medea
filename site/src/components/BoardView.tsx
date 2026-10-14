import { Chessboard } from 'react-chessboard'
import ArrowLayer, { Arrow } from './ArrowLayer'
export type { Arrow } from './ArrowLayer'

/** A non-interactive board: arrows, tinted squares, rings. Used for previews, examples and overlays. */
export default function BoardView({ fen, size, flipped, arrows, tint, rings, last, id, notation = false }: {
  fen: string; size?: number; flipped?: boolean; arrows?: Arrow[]
  tint?: Record<string, string>                       // square -> css colour for a background wash
  rings?: Record<string, string>                      // square -> ring colour
  last?: [string, string] | null; id?: string; notation?: boolean
}) {
  const styles: Record<string, React.CSSProperties> = {}
  if (last) for (const q of last) styles[q] = { background: 'rgba(57, 135, 229, 0.30)' }
  if (tint) for (const [q, c] of Object.entries(tint)) styles[q] = { ...(styles[q] ?? {}), background: c }
  if (rings) for (const [q, c] of Object.entries(rings)) styles[q] = { ...(styles[q] ?? {}), boxShadow: `inset 0 0 0 4px ${c}, inset 0 0 14px 2px ${c}` }
  return (
    <div className="board-wrap" style={{ width: size ?? '100%' }}>
      <Chessboard options={{
        id, position: fen, boardOrientation: flipped ? 'black' : 'white', allowDragging: false, showAnimations: false, showNotation: notation,
        arrows: [], allowDrawingArrows: false, squareStyles: styles,
        lightSquareStyle: { backgroundColor: 'var(--sq-light)' }, darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
        boardStyle: { borderRadius: 6 },
      }} />
      <ArrowLayer arrows={arrows ?? []} flipped={!!flipped} />
    </div>
  )
}
