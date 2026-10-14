import { UGame } from './account'

const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)
export const MOVE_EDGES = [1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101]
export const SEC_EDGES = [0, 5, 10, 20, 30, 60, 120, 300, 600]
export const PCT_EDGES = [0, 5, 10, 20, 40, 60, 80, 100]
const bin = (v: number, edges: number[]) => { let b = 0; for (let i = 0; i < edges.length; i++) if (v >= edges[i]) b = i; return b }

export interface UserStats {
  games: number; analysed: number; moves: number
  blunderRate: number | null; flagRate: number; avgTime: number | null
  byMove: (number | null)[]; bySec: (number | null)[]; byPct: (number | null)[]      // blunder %, same bins as the Levels charts
  perMove: (number | null)[]; clockLeft: (number | null)[]                        // seconds spent / % of clock left, by move number
}

const MIN_MOVES = 60

/** The same measures as the Levels page, computed from your own games, so they can be drawn on the same axes. */
export function userStats(games: UGame[]): UserStats {
  const K = 60
  const sum = new Array(K).fill(0), cnt = new Array(K).fill(0), lsum = new Array(K).fill(0)
  const mv = EDGES_ZERO(MOVE_EDGES.length), sc = EDGES_ZERO(SEC_EDGES.length), pc = EDGES_ZERO(PCT_EDGES.length)
  let analysed = 0, moves = 0, blunders = 0, flagged = 0, timeSum = 0, timeN = 0
  for (const g of games) {
    if (g.res === 0 && g.term === 'time') flagged++
    const start = g.left[0] || g.base || 1
    g.spent.forEach((s, k) => {
      if (k < K) { sum[k] += s; cnt[k]++; lsum[k] += (g.left[k] / start) * 100 }
      if (k > 0) { timeSum += s; timeN++ }
    })
    if (!g.evs || g.evs.length !== g.sans.length) continue
    analysed++
    for (let k = 0; ; k++) {
      const i = g.color + 2 * k
      if (i >= g.evs.length) break
      const prev = i ? g.evs[i - 1] : 15
      const drop = g.color === 0 ? winPct(prev) - winPct(g.evs[i]) : winPct(g.evs[i]) - winPct(prev)
      const bad = drop >= 30 ? 1 : 0
      moves++; blunders += bad
      const mb = bin(k + 1, MOVE_EDGES); mv.n[mb]++; mv.b[mb] += bad
      if (g.left.length > k && k > 0) {
        const before = g.left[k - 1]
        const sb = bin(before, SEC_EDGES); sc.n[sb]++; sc.b[sb] += bad
        const pb = bin((before / start) * 100, PCT_EDGES); pc.n[pb]++; pc.b[pb] += bad
      }
    }
  }
  const rate = (a: { n: number[]; b: number[] }) => a.n.map((n, i) => (n >= MIN_MOVES ? (100 * a.b[i]) / n : null))
  let kk = 0
  for (let i = 0; i < K; i++) if (cnt[i] >= 8) kk = i + 1
  return {
    games: games.length, analysed, moves, blunderRate: moves >= MIN_MOVES ? blunders / moves : null,
    flagRate: games.length ? flagged / games.length : 0, avgTime: timeN ? timeSum / timeN : null,
    byMove: rate(mv), bySec: rate(sc), byPct: rate(pc),
    perMove: sum.slice(0, kk).map((s, i) => s / cnt[i]), clockLeft: lsum.slice(0, kk).map((s, i) => s / cnt[i]),
  }
}
function EDGES_ZERO(n: number) { return { n: new Array(n).fill(0) as number[], b: new Array(n).fill(0) as number[] } }

/** Two-sided z test of a rate against a reference rate. Returns the p-value. */
export function pValue(k: number, n: number, p0: number): number {
  if (n < 10 || p0 <= 0 || p0 >= 1) return 1
  const z = (k / n - p0) / Math.sqrt((p0 * (1 - p0)) / n)
  return 2 * (1 - normCdf(Math.abs(z)))
}
function normCdf(x: number) {      // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * x), d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x >= 0 ? 1 - p : p
}
export const pText = (p: number) => (p < 0.001 ? 'p < 0.001' : p < 0.01 ? 'p < 0.01' : p < 0.05 ? 'p < 0.05' : `p = ${p.toFixed(2)}`)
