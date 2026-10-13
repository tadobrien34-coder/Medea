import type { LevelEntry } from './types'

export const MOVE_LABELS = ['1–10', '11–20', '21–30', '31–40', '41–50', '51–60', '61–70', '71–80', '81–90', '91–100', '100+']
export const SHIFT_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+']
export const sizeLabel = (s: string) => (s === '100' ? '100 Elo' : `${s} Elo`)
export const usable = (e: LevelEntry) => !e.thin
export function rangeLabel(b: { lo: number; hi: number | null }, unit = '') {
  return b.hi == null ? `${b.lo}${unit}+` : `${b.lo}–${b.hi}${unit}`
}
/** Pick up to k evenly spaced usable groups. */
export function defaultSelection(entries: LevelEntry[], k = 6) {
  const ok = entries.map((e, i) => (usable(e) && e.n >= 150 ? i : -1)).filter((i) => i >= 0)
  if (ok.length <= k) return ok
  return Array.from({ length: k }, (_, j) => ok[Math.round((j * (ok.length - 1)) / (k - 1))])
}
