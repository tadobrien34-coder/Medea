import { Chess } from 'chess.js'
import { useData } from './data'

export type Book = Record<string, [string, string]>

export function posKey(fen: string) {
  const f = fen.split(' ')
  return `${f[0]} ${f[1]} ${f[2]}`
}

export interface Named { eco: string; name: string; ply: number }

/** Deepest named opening along a list of SAN moves from the start position. */
export function openingAlong(book: Book | null, sans: string[]): Named | null {
  if (!book) return null
  const g = new Chess()
  let found: Named | null = null
  const lim = Math.min(sans.length, 40)
  for (let i = 0; i < lim; i++) {
    try { g.move(sans[i]) } catch { break }
    const hit = book[posKey(g.fen())]
    if (hit) found = { eco: hit[0], name: hit[1], ply: i + 1 }
  }
  return found
}

export function useBook() {
  return useData<Book>('book.json').data
}
