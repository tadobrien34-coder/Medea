import type { UGame } from './account'

export interface GmRep { id: string; name: string; title: string | null; rating: number | null; openings: { key: string; white: number; black: number; n: number }[] }
export interface GmStyle { checks_pct: number | null; captures_pct: number | null; median_len?: number | null; time: { avg_per_move: number | null } }

const family = (key: string) => key.split(':')[0]
const vecOf = (rows: { fam: string; w: number; b: number }[]) => {
  const v = new Map<string, number>()
  for (const r of rows) { if (r.w) v.set(`W|${r.fam}`, (v.get(`W|${r.fam}`) ?? 0) + r.w); if (r.b) v.set(`B|${r.fam}`, (v.get(`B|${r.fam}`) ?? 0) + r.b) }
  return v
}
const cosine = (a: Map<string, number>, b: Map<string, number>) => {
  let dot = 0, na = 0, nb = 0
  for (const [k, x] of a) { na += x * x; const y = b.get(k); if (y) dot += x * y }
  for (const y of b.values()) nb += y * y
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export interface UserStyle { checks: number; captures: number; length: number; time: number | null; openings: Map<string, number> }
export function userStyle(games: UGame[]): UserStyle {
  let moves = 0, chk = 0, cap = 0
  const lens: number[] = [], spent: number[] = []
  const rows = new Map<string, { fam: string; w: number; b: number }>()
  for (const g of games) {
    for (let i = g.color; i < g.sans.length; i += 2) { moves++; if (g.sans[i].includes('+') || g.sans[i].includes('#')) chk++; if (g.sans[i].includes('x')) cap++ }
    lens.push(Math.ceil(g.plies / 2)); spent.push(...g.spent.slice(1))
    if (g.opening !== '?') { const fam = family(g.opening); const r = rows.get(fam) ?? { fam, w: 0, b: 0 }; if (g.color === 0) r.w++; else r.b++; rows.set(fam, r) }
  }
  lens.sort((a, b) => a - b)
  return { checks: moves ? chk / moves : 0, captures: moves ? cap / moves : 0, length: lens.length ? lens[Math.floor(lens.length / 2)] : 0, time: spent.length ? spent.reduce((a, b) => a + b, 0) / spent.length : null, openings: vecOf([...rows.values()]) }
}

export interface Match { gm: GmRep; score: number; shared: string[]; opening: number; style: number; note: string }
/** Rank GMs by how much their openings and style resemble yours. */
export function matchGms(me: UserStyle, reps: GmRep[], styles: Record<string, GmStyle | undefined>): Match[] {
  const out: Match[] = []
  for (const gm of reps) {
    const v = vecOf(gm.openings.map((o) => ({ fam: family(o.key), w: o.white, b: o.black })))
    const op = cosine(me.openings, v)
    const s = styles[gm.id]
    let d = 0, parts = 0
    if (s?.checks_pct != null) { d += Math.abs(s.checks_pct - me.checks) / 0.03; parts++ }
    if (s?.captures_pct != null) { d += Math.abs(s.captures_pct - me.captures) / 0.05; parts++ }
    if (s?.median_len && me.length) { d += Math.abs(s.median_len - me.length) / 15; parts++ }
    if (s?.time.avg_per_move && me.time) { d += Math.abs(Math.log(s.time.avg_per_move / me.time)) / 0.7; parts++ }
    const style = parts ? 1 / (1 + d / parts) : 0.5
    const shared = [...me.openings.keys()].filter((k) => v.has(k)).sort((a, b) => (me.openings.get(b)! * (v.get(b)!)) - (me.openings.get(a)! * (v.get(a)!))).slice(0, 3).map((k) => k.slice(2))
    const sc = 0.6 * op + 0.4 * style
    const note = [shared.length ? `plays ${shared.slice(0, 2).join(' and ')} too` : '', s?.checks_pct != null ? `checks on ${(s.checks_pct * 100).toFixed(1)}% of moves (you ${(me.checks * 100).toFixed(1)}%)` : ''].filter(Boolean).join('; ')
    out.push({ gm, score: sc, shared, opening: op, style, note })
  }
  return out.sort((a, b) => b.score - a.score)
}
