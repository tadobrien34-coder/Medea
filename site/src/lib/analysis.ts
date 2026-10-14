import { Chess } from 'chess.js'
import { kvGet, kvSet } from './idb'
import { SF, SfLine, whiteCp } from './sf'
import { classifyMove } from './tactics'
import { posKey } from './book'
import type { Blunder, UGame } from './account'
import type { TreeFile } from './types'

const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)
const clip = (cp: number) => Math.max(-1000, Math.min(1000, cp))
const fenKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/* ---------------------------------------------------------------- eval cache (persisted) */
let cache: Map<string, number> | null = null
export async function evalCache() {
  if (!cache) cache = new Map((await kvGet<[string, number][]>('evalcache')) ?? [])
  return cache
}
export async function saveEvalCache() { if (cache) await kvSet('evalcache', [...cache.entries()].slice(-60000)) }

/* ---------------------------------------------------------------- whole-game evaluation */
export interface Progress { done: number; total: number }

/** Evaluate the position after every ply (white's point of view, centipawns). */
export async function evaluateGame(sf: SF, g: UGame, depth: number, shouldStop: () => boolean): Promise<number[] | null> {
  const c = await evalCache()
  const chess = new Chess()
  const out: number[] = []
  for (let i = 0; i < g.sans.length; i++) {
    if (shouldStop()) return null
    try { chess.move(g.sans[i]) } catch { return null }
    if (chess.isCheckmate()) { out.push(chess.turn() === 'w' ? -1000 : 1000); continue }
    if (chess.isDraw() || chess.isStalemate()) { out.push(0); continue }
    const fen = chess.fen(), k = `${fenKey(fen)}|${depth}`
    let v = c.get(k)
    if (v === undefined) {
      const r = await sf.search(fen, { depth })
      v = r.lines[0] ? clip(whiteCp(r.lines[0], fen)) : 0
      c.set(k, v)
    }
    out.push(v)
  }
  return out
}

/** The user's worst move by win-chance, with the engine's preferred move found separately. */
export function findBlunder(g: UGame, minDrop = 20): Blunder | null {
  if (!g.evs || g.evs.length !== g.sans.length) return null
  let worst: Blunder | null = null
  const chess = new Chess()
  for (let i = 0; i < g.sans.length; i++) {
    const san = g.sans[i]
    try { chess.move(san) } catch { return worst }
    if (i % 2 !== g.color) continue
    const prev = i ? g.evs[i - 1] : 15
    const drop = g.color === 0 ? winPct(prev) - winPct(g.evs[i]) : winPct(g.evs[i]) - winPct(prev)
    if (drop >= minDrop && (!worst || drop > worst.drop)) {
      const me = g.color === 0 ? 1 : -1
      worst = { ply: i, san, drop: Math.round(drop), before: prev * me, after: g.evs[i] * me }
    }
  }
  return worst
}

/** Fill in the engine's preferred move for a blunder (one search). */
export async function bestAt(sf: SF, g: UGame, ply: number, depth = 12): Promise<string | undefined> {
  const chess = new Chess()
  for (let i = 0; i < ply; i++) chess.move(g.sans[i])
  const fen = chess.fen()
  const r = await sf.search(fen, { depth })
  if (!r.best) return undefined
  try { return new Chess(fen).move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best[4] }).san } catch { return undefined }
}

/** What the opponent could do right after the blunder, named: a free piece, a fork, a check, a trade. */
export async function punishAt(sf: SF, g: UGame, ply: number, depth = 10): Promise<string | undefined> {
  const chess = new Chess()
  try { for (let i = 0; i <= ply; i++) chess.move(g.sans[i]) } catch { return undefined }
  if (chess.isGameOver()) return 'Allowed checkmate'
  const fen = chess.fen()
  const r = await sf.search(fen, { depth })
  if (!r.best) return undefined
  return BLUNDER_TYPE[classifyMove(fen, r.best)] ?? 'Positional slip'
}
const BLUNDER_TYPE: Record<string, string> = {
  Checkmate: 'Allowed checkmate', 'Free piece': 'Hung a piece', Fork: 'Walked into a fork', 'Winning trade': 'Lost to a trade',
  'Check that wins material': 'Missed a check', Promotion: 'Allowed a promotion', Capture: 'Lost material', 'Other advantage': 'Positional slip',
}

/* ---------------------------------------------------------------- opening mistakes */
export interface OpeningMistake {
  id: string; fen: string; san: string; uci: string; color: 0 | 1; count: number; results: [number, number, number]
  loss: number; best: string; good: string[]; known: string | null; games: string[]; line: string[]
}

interface Cand { fen: string; san: string; uci: string; color: 0 | 1; count: number; results: [number, number, number]; games: string[]; line: string[]; status: string | null }

export async function findOpeningMistakes(sf: SF, games: UGame[], tree: TreeFile | null, onProgress: (p: Progress) => void, shouldStop: () => boolean): Promise<OpeningMistake[]> {
  const map = new Map<string, Cand>()
  for (const g of games) {
    const chess = new Chess()
    for (let i = 0; i < Math.min(g.sans.length, 18); i++) {
      const fen = chess.fen()
      let mv
      try { mv = chess.move(g.sans[i]) } catch { break }
      if (i % 2 !== g.color) continue
      const key = `${fenKey(fen)}|${mv.san}`
      const c = map.get(key) ?? { fen, san: mv.san, uci: mv.from + mv.to + (mv.promotion ?? ''), color: g.color, count: 0, results: [0, 0, 0] as [number, number, number], games: [], line: g.sans.slice(0, i), status: null }
      c.count++; c.results[g.res === 1 ? 0 : g.res === 0.5 ? 1 : 2]++; c.games.push(g.id)
      const kids = tree?.nodes[posKey(fen)]
      if (kids) { const hit = kids.find((k) => k[0] === mv.san); c.status = hit ? hit[6] : (kids.reduce((a, k) => a + k[1], 0) >= 200 ? 'rare' : null) }
      map.set(key, c)
    }
  }
  const cands = [...map.values()].filter((c) => c.count >= 2 || c.status === 'dubious' || c.status === 'outrageous').sort((a, b) => b.count - a.count).slice(0, 70)
  const out: OpeningMistake[] = []
  for (let n = 0; n < cands.length; n++) {
    if (shouldStop()) break
    onProgress({ done: n, total: cands.length })
    const c = cands[n]
    const r = await sf.search(c.fen, { depth: 12, multipv: 4 })
    if (!r.lines.length) continue
    const best = r.lines[0]
    const bestCp = score(best)
    let loss: number
    const played = r.lines.find((l) => l.pv[0] === c.uci)
    if (played) loss = bestCp - score(played)
    else {
      const after = new Chess(c.fen); after.move(c.san)
      const ra = await sf.search(after.fen(), { depth: 12 })
      loss = ra.lines[0] ? bestCp + score(ra.lines[0]) : 0
    }
    const toSan = (u: string) => { try { return new Chess(c.fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san } catch { return u } }
    const flagged = loss >= 70 || (loss >= 40 && (c.status === 'dubious' || c.status === 'outrageous'))
    if (!flagged) continue
    out.push({
      id: `${fenKey(c.fen)}|${c.san}`, fen: c.fen, san: c.san, uci: c.uci, color: c.color, count: c.count, results: c.results, loss: Math.round(loss),
      best: toSan(best.pv[0]), good: r.lines.filter((l) => bestCp - score(l) <= 50).map((l) => toSan(l.pv[0])),
      known: c.status === 'dubious' || c.status === 'outrageous' ? 'Players at every level lose ground with this move too.' : null, games: c.games, line: c.line,
    })
  }
  onProgress({ done: cands.length, total: cands.length })
  return out.sort((a, b) => b.count * b.loss - a.count * a.loss)
}

const score = (l: SfLine) => (l.mate != null ? (l.mate > 0 ? 1 : -1) * 1000 : clip(l.cp ?? 0))

/* ---------------------------------------------------------------- missed tactics */
export interface Missed { gameId: string; fen: string; played: string; best: string; bestUci: string; kind: string; gain: number; move: number; color: 0 | 1 }

export async function findMissedTactics(sf: SF, games: UGame[], onProgress: (p: Progress) => void, shouldStop: () => boolean): Promise<Missed[]> {
  const cand: { g: UGame; i: number }[] = []
  for (const g of games) {
    if (!g.evs || g.evs.length !== g.sans.length) continue
    const me = g.color === 0 ? 1 : -1
    for (let i = g.color; i < g.sans.length; i += 2) {
      if (i < 3) continue
      const before = g.evs[i - 1] * me, prevOwn = g.evs[i - 2] * me, after = g.evs[i] * me
      const gifted = winPct(before) - winPct(prevOwn) >= 12           // their last move handed over something
      const dropped = winPct(before) - winPct(after) >= 15            // and this move did not take it
      if (gifted && dropped && before > -150) cand.push({ g, i })
    }
  }
  cand.sort((a, b) => b.g.ts - a.g.ts)
  const pick = cand.slice(0, 60)
  const out: Missed[] = []
  for (let n = 0; n < pick.length; n++) {
    if (shouldStop()) break
    onProgress({ done: n, total: pick.length })
    const { g, i } = pick[n]
    const chess = new Chess()
    for (let k = 0; k < i; k++) chess.move(g.sans[k])
    const fen = chess.fen()
    const r = await sf.search(fen, { depth: 12 })
    if (!r.best || r.best === undefined) continue
    let best = r.best
    if (best.slice(0, 4) === (() => { try { const m = new Chess(fen).move(g.sans[i]); return m.from + m.to } catch { return '' } })()) continue
    let bestSan = best
    try { bestSan = new Chess(fen).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] }).san } catch { /* keep uci */ }
    const me = g.color === 0 ? 1 : -1
    out.push({ gameId: g.id, fen, played: g.sans[i], best: bestSan, bestUci: best, kind: classifyMove(fen, best), gain: Math.round(winPct(g.evs![i - 1] * me) - winPct(g.evs![i] * me)), move: Math.floor(i / 2) + 1, color: g.color })
  }
  onProgress({ done: pick.length, total: pick.length })
  return out
}

/* ---------------------------------------------------------------- how you lose */
export interface LossProfile {
  analysed: number; unanalysed: number
  phase: [number, number, number]           // first blunder in moves 1-10 / 11-30 / 31+
  fromWinning: number; flagged: number; flaggedAhead: number; mated: number; resigned: number
  timeTrouble: number                        // blunders made with under 10% of the clock left
  pieces: number[]                           // piece moved in the first blunder, P N B R Q K
}
export function lossProfile(games: UGame[]): LossProfile {
  const losses = games.filter((g) => g.res === 0)
  const P: LossProfile = { analysed: 0, unanalysed: 0, phase: [0, 0, 0], fromWinning: 0, flagged: 0, flaggedAhead: 0, mated: 0, resigned: 0, timeTrouble: 0, pieces: [0, 0, 0, 0, 0, 0] }
  for (const g of losses) {
    if (g.term === 'time') P.flagged++
    if (g.term === 'mate') P.mated++
    if (g.term === 'resign') P.resigned++
    if (!g.evs || g.evs.length !== g.sans.length) { P.unanalysed++; continue }
    P.analysed++
    const me = g.color === 0 ? 1 : -1
    if (Math.max(...g.evs.map((e) => e * me)) >= 200) P.fromWinning++
    if (g.term === 'time' && g.evs[g.evs.length - 1] * me >= 200) P.flaggedAhead++
    const b = g.blunder ?? findBlunder(g, 30)
    if (b) {
      const mvn = Math.floor(b.ply / 2) + 1
      P.phase[mvn <= 10 ? 0 : mvn <= 30 ? 1 : 2]++
      const c = g.sans[b.ply][0]
      P.pieces['PNBRQK'.indexOf('NBRQK'.includes(c) ? c : g.sans[b.ply][0] === 'O' ? 'K' : 'P')]++
      const k = Math.floor(b.ply / 2)
      if (g.left[k] != null && g.base > 0 && g.left[k] / g.base < 0.1) P.timeTrouble++
    }
  }
  return P
}
