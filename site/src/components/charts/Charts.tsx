import { ReactNode, useMemo, useRef, useState } from 'react'
import { niceTicks, useWidth } from './core'

export interface Series {
  key: string; name: string; color: string; values: (number | null)[]
  band?: { lo: (number | null)[]; hi: (number | null)[] }
  dashed?: boolean
}
const M = { l: 46, r: 14, t: 10, b: 30 }

/* ---------------------------------------------------------------- line / band chart */
export function LineChart({ xs, series, xFormat = (x) => String(x), yFormat = (v) => String(v), height = 260, yMin, yMax,
  tipHeader, xTickCount = 7, zeroLine }: {
  xs: number[]; series: Series[]; xFormat?: (x: number) => string; yFormat?: (v: number) => string; height?: number
  yMin?: number; yMax?: number; tipHeader?: (x: number) => string; xTickCount?: number; zeroLine?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const w = useWidth(ref)
  const [hover, setHover] = useState<number | null>(null)
  const iw = w - M.l - M.r, ih = height - M.t - M.b
  const { lo, hi } = useMemo(() => {
    let a = Infinity, b = -Infinity
    for (const s of series) {
      for (const v of s.values) if (v != null) { a = Math.min(a, v); b = Math.max(b, v) }
      if (s.band) { for (const v of s.band.lo) if (v != null) a = Math.min(a, v); for (const v of s.band.hi) if (v != null) b = Math.max(b, v) }
    }
    if (!isFinite(a)) { a = 0; b = 1 }
    if (yMin != null) a = yMin
    if (yMax != null) b = yMax
    const pad = (b - a) * 0.06 || 0.5
    return { lo: yMin != null ? a : a - pad, hi: yMax != null ? b : b + pad }
  }, [series, yMin, yMax])
  const ticks = niceTicks(lo, hi, 5)
  const y0 = ticks[0] < lo ? lo : Math.min(lo, ticks[0]), y1 = Math.max(hi, ticks[ticks.length - 1])
  const xmin = xs[0], xmax = xs[xs.length - 1]
  const X = (x: number) => M.l + ((x - xmin) / (xmax - xmin || 1)) * iw
  const Y = (v: number) => M.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih
  const xt = useMemo(() => {
    const n = Math.min(xTickCount, xs.length)
    const idx = new Set<number>()
    for (let i = 0; i < n; i++) idx.add(Math.round((i * (xs.length - 1)) / Math.max(1, n - 1)))
    return [...idx].map((i) => xs[i])
  }, [xs, xTickCount])

  const path = (vals: (number | null)[]) => {
    let d = '', pen = false
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const bandPath = (b: { lo: (number | null)[]; hi: (number | null)[] }) => {
    const idx = xs.map((_, i) => i).filter((i) => b.lo[i] != null && b.hi[i] != null)
    if (!idx.length) return ''
    return 'M' + idx.map((i) => `${X(xs[i]).toFixed(1)} ${Y(b.hi[i]!).toFixed(1)}`).join('L') + 'L' +
      [...idx].reverse().map((i) => `${X(xs[i]).toFixed(1)} ${Y(b.lo[i]!).toFixed(1)}`).join('L') + 'Z'
  }
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * iw + M.l
    let best = 0, bd = Infinity
    xs.forEach((x, i) => { const d = Math.abs(X(x) - px); if (d < bd) { bd = d; best = i } })
    setHover(best)
  }
  const tipLeft = hover != null ? Math.max(90, Math.min(w - 90, X(xs[hover]))) : 0
  return (
    <div className="chart" ref={ref} style={{ height: height + 18 }}>
      <svg width={w} height={height} role="img">
        <g className="grid">{ticks.map((t) => <line key={t} x1={M.l} x2={w - M.r} y1={Y(t)} y2={Y(t)} />)}</g>
        {zeroLine && lo < 0 && hi > 0 && <line x1={M.l} x2={w - M.r} y1={Y(0)} y2={Y(0)} stroke="var(--axis)" />}
        <g>{ticks.map((t) => <text key={t} x={M.l - 8} y={Y(t) + 4} textAnchor="end">{yFormat(t)}</text>)}</g>
        <g className="axis"><line x1={M.l} x2={w - M.r} y1={M.t + ih} y2={M.t + ih} /></g>
        <g>{xt.map((x) => <text key={x} x={X(x)} y={height - 8} textAnchor="middle">{xFormat(x)}</text>)}</g>
        {series.map((s) => s.band && <path key={s.key + 'b'} d={bandPath(s.band)} fill={s.color} opacity={0.12} />)}
        {series.map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={s.dashed ? '5 4' : undefined} />
        ))}
        {hover != null && (
          <g>
            <line className="hover-line" x1={X(xs[hover])} x2={X(xs[hover])} y1={M.t} y2={M.t + ih} />
            {series.map((s) => s.values[hover] != null && (
              <circle key={s.key} cx={X(xs[hover])} cy={Y(s.values[hover]!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: tipLeft, top: 6 }}>
          <div className="th">{tipHeader ? tipHeader(xs[hover]) : xFormat(xs[hover])}</div>
          {series.filter((s) => s.values[hover] != null).map((s) => (
            <div className="tr" key={s.key}>
              <span className="tk" style={{ background: s.color }} />
              <span className="tn">{s.name}</span>
              <span className="tv">{yFormat(s.values[hover]!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- bar chart */
export interface Bar { label: string; value: number | null; color?: string; note?: string }
export function BarChart({ items, yFormat = (v) => String(v), height = 220, color = 'var(--s1)', highlight, onSelect, refLine, yMax, tipLabel }: {
  items: Bar[]; yFormat?: (v: number) => string; height?: number; color?: string; highlight?: number | null
  onSelect?: (i: number) => void; refLine?: number; yMax?: number; tipLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const w = useWidth(ref)
  const [hover, setHover] = useState<number | null>(null)
  const iw = w - M.l - M.r, ih = height - M.t - M.b
  const vals = items.map((i) => i.value ?? 0)
  const top = yMax ?? Math.max(...vals, refLine ?? 0, 1e-9) * 1.08
  const ticks = niceTicks(0, top, 4)
  const hi = Math.max(top, ticks[ticks.length - 1])
  const Y = (v: number) => M.t + ih - (v / hi) * ih
  const band = iw / items.length
  const bw = Math.min(24, band * 0.62)
  const every = Math.ceil(items.length / Math.max(1, Math.floor(iw / 56)))
  return (
    <div className="chart" ref={ref} style={{ height: height + 18 }}>
      <svg width={w} height={height} role="img">
        <g className="grid">{ticks.map((t) => <line key={t} x1={M.l} x2={w - M.r} y1={Y(t)} y2={Y(t)} />)}</g>
        <g>{ticks.map((t) => <text key={t} x={M.l - 8} y={Y(t) + 4} textAnchor="end">{yFormat(t)}</text>)}</g>
        <g className="axis"><line x1={M.l} x2={w - M.r} y1={M.t + ih} y2={M.t + ih} /></g>
        {items.map((it, i) => {
          const cx = M.l + band * (i + 0.5), v = it.value
          const h = v == null ? 0 : Math.max(2, (v / hi) * ih)
          const dim = highlight != null && highlight !== i
          const on = hover === i
          return (
            <g key={i}>
              {v != null && (
                <path d={`M${cx - bw / 2} ${M.t + ih}V${M.t + ih - h + 4}a4 4 0 0 1 4-4h${bw - 8}a4 4 0 0 1 4 4V${M.t + ih}Z`}
                  fill={it.color ?? color} opacity={dim ? 0.35 : on ? 0.85 : 1} />
              )}
              {i % every === 0 && <text x={cx} y={height - 8} textAnchor="middle">{it.label}</text>}
              <rect x={cx - band / 2} y={M.t} width={band} height={ih} fill="transparent" style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={() => onSelect?.(i)} />
            </g>
          )
        })}
        {refLine != null && <line x1={M.l} x2={w - M.r} y1={Y(refLine)} y2={Y(refLine)} stroke="var(--muted)" strokeDasharray="4 4" />}
      </svg>
      {hover != null && items[hover].value != null && (
        <div className="chart-tip" style={{ left: Math.max(70, Math.min(w - 70, M.l + band * (hover + 0.5))), top: Math.max(0, Y(items[hover].value!) - 62) }}>
          <div className="th">{items[hover].label}</div>
          <div className="tr"><span className="tn">{tipLabel ?? 'Value'}</span><span className="tv">{yFormat(items[hover].value!)}</span></div>
          {items[hover].note && <div className="tr"><span className="tn">{items[hover].note}</span></div>}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- card with table view */
export interface TableData { head: string[]; rows: (string | number | null)[][] }
export function ChartCard({ title, sub, legend, table, children, actions }: {
  title: string; sub?: ReactNode; legend?: { name: string; color: string; kind?: 'line' | 'sq' }[]; table?: TableData; children: ReactNode; actions?: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <section className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {actions}
        {table && (
          <div className="view-toggle" role="group" aria-label="View">
            <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
            <button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
          </div>
        )}
      </div>
      {sub && <div className="card-sub">{sub}</div>}
      {legend && legend.length > 1 && view === 'chart' && (
        <div className="legend">
          {legend.map((l) => <span className="li" key={l.name}><i className={l.kind === 'sq' ? 'sq' : ''} style={{ background: l.color }} />{l.name}</span>)}
        </div>
      )}
      {view === 'chart' || !table ? children : (
        <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto', padding: '8px 8px 12px' }}>
          <table className="t compact">
            <thead><tr>{table.head.map((h, i) => <th key={h} className={i ? 'r' : ''}>{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'r' : ''}>{c ?? '–'}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
