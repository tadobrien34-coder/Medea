export const TCS = ['Bullet', 'Blitz', 'Rapid', 'Classical'] as const
export type TC = (typeof TCS)[number]
export const PIECES = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'] as const

export const pct = (x: number | null | undefined, d = 0) => (x == null ? '–' : `${(x * 100).toFixed(d)}%`)
export const num = (x: number | null | undefined, d = 0) =>
  x == null ? '–' : x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
export const signed = (x: number | null | undefined, d = 2) =>
  x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
export const secs = (s: number | null | undefined) => {
  if (s == null) return '–'
  if (s < 10) return `${s.toFixed(1)}s`
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
}
export const moveLabel = (ply: number) => `${Math.floor((ply - 1) / 2) + 1}${ply % 2 === 1 ? '.' : '…'}`
export const share = (arr: number[]) => {
  const t = arr.reduce((a, b) => a + b, 0)
  return arr.map((x) => (t ? x / t : 0))
}

export function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
export const variationKey = (op: string) => (op.includes(':') ? op.split(',')[0] : op)
export const familyKey = (op: string) => op.split(':')[0]
export function openingPath(name: string) {
  const v = variationKey(name)
  const level = v.includes(':') ? 'v' : 'f'
  return `/openings/${level}/${slug(v)}`
}
export const lichessAnalysis = (fen: string) => `https://lichess.org/analysis/${fen.replace(/ /g, '_')}`
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)']
export const SEQ = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)']
export const seqColor = (i: number, n: number) => SEQ[n <= 1 ? 2 : Math.round((i / (n - 1)) * (SEQ.length - 1))]

/** Seconds for chart axes: whole numbers stay whole, halves show one decimal (0.5s, 1.5s) so labels never repeat. */
export const secAxis = (v: number) => (Number.isInteger(v) ? `${v}s` : `${v.toFixed(1)}s`)
export const YOU = '#e0a31a'          // the yellow dotted line that marks you on every comparison chart

export const BAND_LABELS = ['<1000', '1000-1399', '1400-1799', '1800-2199', '2200+']
