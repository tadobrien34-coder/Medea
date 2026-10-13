import { Book, openingAlong } from './book'
import { TC, variationKey } from './format'

export type Platform = 'lichess' | 'chesscom'
export interface UGame {
  id: string; tc: TC; color: 0 | 1; res: 1 | 0.5 | 0; term: 'mate' | 'resign' | 'time' | 'draw' | 'other'
  plies: number; opening: string; base: number; inc: number; rating: number | null; opp: number | null
  spent: number[]            // seconds per own move
  sans?: string[]; evs?: number[]
}

const TCSET: Record<string, TC> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical' }
export class AccountError extends Error {}

/* ---------------------------------------------------------------- Lichess */
export async function loadLichess(user: string, max: number, onProgress: (n: number) => void, signal: AbortSignal): Promise<UGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&rated=true&perfType=bullet,blitz,rapid,classical` +
    '&opening=true&clocks=true&evals=true&moves=true&ongoing=false'
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' }, signal })
  if (res.status === 404) throw new AccountError(`No Lichess account called “${user}”.`)
  if (res.status === 429) throw new AccountError('Lichess is rate limiting this browser. Wait a minute and try again.')
  if (!res.ok || !res.body) throw new AccountError(`Lichess returned ${res.status}.`)
  const out: UGame[] = []
  const reader = res.body.getReader(), dec = new TextDecoder()
  let buf = ''
  const lc = user.toLowerCase()
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = done ? '' : lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const g = parseLichess(JSON.parse(line), lc)
      if (g) { out.push(g); if (out.length % 20 === 0) onProgress(out.length) }
    }
    if (done) break
  }
  onProgress(out.length)
  return out
}

function parseLichess(d: any, lc: string): UGame | null {
  const tc = TCSET[d.speed]
  if (!tc || d.variant !== 'standard') return null
  const w = d.players?.white, b = d.players?.black
  const color = (w?.user?.name ?? '').toLowerCase() === lc ? 0 : (b?.user?.name ?? '').toLowerCase() === lc ? 1 : -1
  if (color < 0) return null
  const sans: string[] = (d.moves ?? '').split(' ').filter(Boolean)
  if (sans.length < 4) return null
  const status = d.status as string
  if (['aborted', 'noStart', 'created', 'started'].includes(status)) return null
  const winner = d.winner === 'white' ? 0 : d.winner === 'black' ? 1 : -1
  const res = winner < 0 ? 0.5 : winner === color ? 1 : 0
  const term = status === 'mate' ? 'mate' : status === 'resign' ? 'resign' : status === 'outoftime' ? 'time' : (status === 'draw' || status === 'stalemate') ? 'draw' : 'other'
  const inc = d.clock?.increment ?? 0, base = d.clock?.initial ?? 0
  const spent: number[] = []
  if (Array.isArray(d.clocks) && d.clocks.length >= sans.length) {   // the API appends one extra trailing entry
    for (let i = color; i < sans.length; i += 2) {
      if (i < 2) { spent.push(0); continue }          // first moves are not timed
      spent.push(Math.max(0, d.clocks[i - 2] / 100 + inc - d.clocks[i] / 100))
    }
  }
  let evs: number[] | undefined
  if (Array.isArray(d.analysis) && d.analysis.length >= sans.length - 1) {
    const e: number[] = d.analysis.slice(0, sans.length).map((a: any) => ('eval' in a ? Math.max(-1000, Math.min(1000, a.eval)) : a.mate > 0 ? 1000 : -1000))
    while (e.length < sans.length) e.push(e[e.length - 1] ?? 0)
    evs = e
  }
  return {
    id: d.id, tc, color: color as 0 | 1, res, term, plies: sans.length, opening: d.opening?.name ?? '?', base, inc,
    rating: (color === 0 ? w : b)?.rating ?? null, opp: (color === 0 ? b : w)?.rating ?? null, spent, sans, evs,
  }
}

/* ---------------------------------------------------------------- Chess.com */
export async function loadChessCom(user: string, max: number, book: Book | null, onProgress: (n: number) => void, signal: AbortSignal): Promise<UGame[]> {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games`
  const arch = await fetch(`${base}/archives`, { signal })
  if (arch.status === 404) throw new AccountError(`No Chess.com account called “${user}”.`)
  if (!arch.ok) throw new AccountError(`Chess.com returned ${arch.status}.`)
  const months: string[] = (await arch.json()).archives ?? []
  const out: UGame[] = []
  const lc = user.toLowerCase()
  for (let i = months.length - 1; i >= 0 && out.length < max; i--) {
    const r = await fetch(months[i], { signal })
    if (!r.ok) continue
    const games: any[] = (await r.json()).games ?? []
    for (const g of games.reverse()) {
      const u = parseChessCom(g, lc, book)
      if (u) out.push(u)
      if (out.length >= max) break
    }
    onProgress(out.length)
  }
  return out
}

function parseChessCom(g: any, lc: string, book: Book | null): UGame | null {
  const tc = TCSET[g.time_class]
  if (!tc || g.rules !== 'chess' || !g.rated || !g.pgn) return null
  const color = g.white?.username?.toLowerCase() === lc ? 0 : g.black?.username?.toLowerCase() === lc ? 1 : -1
  if (color < 0) return null
  const me = color === 0 ? g.white : g.black, opp = color === 0 ? g.black : g.white
  const pgn: string = g.pgn
  const body = pgn.replace(/^\[.*\]\s*$/gm, '')                  // header lines only; keep the [%clk] tags in comments
  const clks = [...body.matchAll(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g)].map((m) => +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]))
  const sans = body.replace(/\{[^}]*\}/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ').split(/\s+/).filter(Boolean)
  if (sans.length < 4) return null
  const [bs, is] = String(g.time_control).split('+')
  const baseS = parseInt(bs, 10) || 0, inc = parseInt(is ?? '0', 10) || 0
  const spent: number[] = []
  if (clks.length === sans.length) {
    for (let i = color; i < sans.length; i += 2) {
      if (i < 2) { spent.push(0); continue }          // first moves are not timed
      spent.push(Math.max(0, clks[i - 2] + inc - clks[i]))
    }
  }
  const draws = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']
  const res = me.result === 'win' ? 1 : draws.includes(me.result) ? 0.5 : 0
  const loserResult = res === 1 ? opp.result : res === 0 ? me.result : 'draw'
  const term = res === 0.5 ? 'draw' : loserResult === 'checkmated' ? 'mate' : loserResult === 'resigned' ? 'resign' : (loserResult === 'timeout' || loserResult === 'abandoned') ? 'time' : 'other'
  const named = openingAlong(book, sans.slice(0, 40))
  return {
    id: String(g.url).split('/').pop() ?? '', tc, color: color as 0 | 1, res: res as 1 | 0.5 | 0, term, plies: sans.length,
    opening: named?.name ?? '?', base: baseS, inc, rating: me.rating ?? null, opp: opp.rating ?? null, spent, sans,
  }
}

/* ---------------------------------------------------------------- analysis */
export interface OpenStat { key: string; n: number; w: number; d: number; l: number; color: 0 | 1 | -1 }
export function openingStats(games: UGame[], color: 0 | 1, level: 'v' | 'f'): OpenStat[] {
  const m = new Map<string, OpenStat>()
  for (const g of games) {
    if (g.color !== color || g.opening === '?') continue
    const key = level === 'v' ? variationKey(g.opening) : g.opening.split(':')[0]
    const s = m.get(key) ?? { key, n: 0, w: 0, d: 0, l: 0, color }
    s.n++; if (g.res === 1) s.w++; else if (g.res === 0.5) s.d++; else s.l++
    m.set(key, s)
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)
const PIECE = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
const pieceOf = (san: string) => (san[0] === 'O' ? 5 : 'NBRQK'.indexOf(san[0]) >= 0 ? 'PNBRQK'.indexOf(san[0]) : 0)

export interface Insight {
  n: number; analysed: number; wins: number; draws: number; losses: number
  term: { win: Record<string, number>; loss: Record<string, number> }
  medianWin: number | null; medianLoss: number | null
  timePerMove: number | null; flagged: number; flagRate: number; oppFlagged: number
  blunderRate: number | null; youSlip: number[]; theySlip: number[]; blunderByPhase: [number | null, number | null, number | null]
  text: { win: string[]; lose: string[] }
}
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

export function insights(games: UGame[]): Insight {
  const wins = games.filter((g) => g.res === 1), losses = games.filter((g) => g.res === 0)
  const draws = games.filter((g) => g.res === 0.5)
  const count = (arr: UGame[]) => arr.reduce<Record<string, number>>((m, g) => ({ ...m, [g.term]: (m[g.term] ?? 0) + 1 }), {})
  const tw = count(wins), tl = count(losses)
  const spent = games.flatMap((g) => g.spent)
  const youSlip = [0, 0, 0, 0, 0, 0], theySlip = [0, 0, 0, 0, 0, 0]
  let moves = 0, blunders = 0, analysed = 0
  const ph = [[0, 0], [0, 0], [0, 0]]
  for (const g of games) {
    if (!g.evs || !g.sans) continue
    analysed++
    let hold = 0
    for (let i = 0; i < g.evs.length; i++) {
      const prev = i ? g.evs[i - 1] : 15
      const mine = i % 2 === g.color
      const loss = (i % 2 === 0 ? winPct(prev) - winPct(g.evs[i]) : winPct(g.evs[i]) - winPct(prev))
      if (mine) {
        moves++
        const k = Math.floor(i / 2) + 1 <= 10 ? 0 : Math.floor(i / 2) + 1 <= 30 ? 1 : 2
        ph[k][0]++
        if (loss >= 30) { blunders++; ph[k][1]++ }
      }
      const p = g.evs[i] / 100
      const state = p >= 1 ? 1 : p <= -1 ? -1 : 0
      if (state !== 0) {
        if (hold !== 0 && state !== hold && i % 2 === (hold === 1 ? 0 : 1)) {
          if (mine) youSlip[pieceOf(g.sans[i])]++; else theySlip[pieceOf(g.sans[i])]++
        }
        hold = state
      }
    }
  }
  const flagged = losses.filter((g) => g.term === 'time').length
  const text = describe({ wins, losses, tw, tl, games, flagged, spent, youSlip, theySlip, analysed })
  return {
    n: games.length, analysed, wins: wins.length, draws: draws.length, losses: losses.length, term: { win: tw, loss: tl },
    medianWin: median(wins.map((g) => Math.ceil(g.plies / 2))), medianLoss: median(losses.map((g) => Math.ceil(g.plies / 2))),
    timePerMove: spent.length ? spent.reduce((a, b) => a + b, 0) / spent.length : null, flagged, flagRate: games.length ? flagged / games.length : 0,
    oppFlagged: wins.filter((g) => g.term === 'time').length,
    blunderRate: moves ? blunders / moves : null, youSlip, theySlip, blunderByPhase: [0, 1, 2].map((k) => (ph[k][0] >= 80 ? ph[k][1] / ph[k][0] : null)) as [number | null, number | null, number | null],
    text,
  }
}

function describe(a: { wins: UGame[]; losses: UGame[]; tw: Record<string, number>; tl: Record<string, number>; games: UGame[]; flagged: number; spent: number[]; youSlip: number[]; theySlip: number[]; analysed: number }) {
  const NAME: Record<string, string> = { mate: 'checkmate', resign: 'resignation', time: 'the clock', draw: 'a draw', other: 'other endings' }
  const top = (t: Record<string, number>, n: number) => Object.entries(t).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ k, share: v / (n || 1) }))
  const win: string[] = [], lose: string[] = []
  if (a.wins.length >= 8) {
    const t = top(a.tw, a.wins.length)
    win.push(`Most wins come by ${NAME[t[0].k]} (${(t[0].share * 100).toFixed(0)}%)${t[1] && t[1].share >= 0.15 ? `, then ${NAME[t[1].k]} (${(t[1].share * 100).toFixed(0)}%)` : ''}.`)
    const mw = median(a.wins.map((g) => Math.ceil(g.plies / 2))); if (mw) win.push(`A typical win ends around move ${mw}.`)
    const tp = a.theySlip.reduce((x, y) => x + y, 0)
    if (tp >= 10) win.push(`Opponents give up the lead with the ${PIECE[a.theySlip.indexOf(Math.max(...a.theySlip))]} most often.`)
  }
  if (a.losses.length >= 8) {
    const t = top(a.tl, a.losses.length)
    lose.push(`Most losses end by ${NAME[t[0].k]} (${(t[0].share * 100).toFixed(0)}%)${t[1] && t[1].share >= 0.15 ? `, then ${NAME[t[1].k]} (${(t[1].share * 100).toFixed(0)}%)` : ''}.`)
    if (a.flagged / a.losses.length >= 0.2) lose.push(`${(100 * a.flagged / a.losses.length).toFixed(0)}% of losses are on the clock, so time is costing you games.`)
    const ml = median(a.losses.map((g) => Math.ceil(g.plies / 2))); if (ml) lose.push(`A typical loss ends around move ${ml}.`)
    const sp = a.youSlip.reduce((x, y) => x + y, 0)
    if (sp >= 10) lose.push(`The lead slips with the ${PIECE[a.youSlip.indexOf(Math.max(...a.youSlip))]} most often.`)
    else if (!a.analysed) lose.push('Engine analysis is needed to see where the lead slips (available for analysed Lichess games).')
  }
  return { win, lose }
}
