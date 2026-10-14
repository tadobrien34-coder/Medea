export const PK = ['P', 'N', 'B', 'R', 'Q', 'K'] as const
export type PieceKey = (typeof PK)[number]
export const PIECE_WORD: Record<PieceKey, string> = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' }
export const PIECE_PLURAL: Record<PieceKey, string> = { P: 'pawns', N: 'knights', B: 'bishops', R: 'rooks', Q: 'queens', K: 'kings' }

/** Human name for a piece from the square it started on, e.g. N + g8 -> "king's knight". */
export function pieceName(pk: PieceKey, origin: string): string {
  const file = origin.charCodeAt(0) - 97, rank = parseInt(origin[1], 10)
  if (pk === 'N') return file <= 3 ? "queen's knight" : "king's knight"
  if (pk === 'R') return file <= 3 ? "queen's rook" : "king's rook"
  if (pk === 'B') return (file + rank) % 2 === 1 ? 'dark-squared bishop' : 'light-squared bishop'
  if (pk === 'P') return `${origin[0]}-pawn`
  return PIECE_WORD[pk]
}

export const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
export const pc = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`
