import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { Chip, Filter, Loading, Meter, PageHead, Segmented, WDL } from '../components/ui'
import { useData } from '../lib/data'
import { num, openingPath, pct, signed } from '../lib/format'
import type { OpeningIndexItem, OpeningsFile } from '../lib/types'

interface Lines {
  white: { moves: string[]; n: number; eval: number; score: number; name: string | null }[]
  black: Record<string, { moves: string[]; n: number; eval: number; score: number; name: string | null }[]>
  pruned: { edges: number; outrageous: number; dubious: number; early_outrageous: [string, number, number, number, number][] }
}

export const toneOf = (v: string) => (v === 'Recommended' ? 'good' : v === 'Avoid' || v === 'Risky' ? 'bad' : v === 'Solid' ? 'accent' : undefined)
export const objLabel = { good: 'Good', sound: 'Sound', dubious: 'Dubious' } as const
export const playLabel = { high: 'High', ok: 'OK', tricky: 'Tricky' } as const
const objTone = { good: 'good', sound: undefined, dubious: 'bad' } as const
const playTone = { high: 'good', ok: undefined, tricky: 'warn' } as const

type SortKey = 'n' | 'name' | 'score' | 'obj' | 'play'

function movesText(m: string[], max = 10) {
  return m.slice(0, max).map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ')
}

export default function Openings() {
  const { data } = useData<OpeningsFile>('openings.json')
  const lines = useData<Lines>('lines.json').data
  const nav = useNavigate()
  const [level, setLevel] = useState<'f' | 'v' | 'all'>('f')
  const [side, setSide] = useState<'all' | '0' | '1'>('all')
  const [verdict, setVerdict] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'n', dir: -1 })

  const rows = useMemo(() => {
    if (!data) return []
    const t = q.trim().toLowerCase()
    let r = data.openings.filter((o) => (level === 'all' || o.level === level) && (side === 'all' || String(o.side) === side) &&
      (verdict === 'all' || o.verdict === verdict) && (!t || o.key.toLowerCase().includes(t) || (o.eco ?? '').toLowerCase() === t))
    const val = (o: OpeningIndexItem): number | string => (sort.k === 'name' ? o.key : sort.k === 'obj' ? o.rel_obj : sort.k === 'play' ? o.play : sort.k === 'score' ? o.score : o.n)
    r = [...r].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
    return r
  }, [data, level, side, verdict, q, sort])

  const best = useMemo(() => {
    if (!data) return { w: [], b: [] }
    const rank = (o: OpeningIndexItem) => 60 * o.rel_obj + 0.6 * (o.play - 50)
    const pool = data.openings.filter((o) => o.verdict === 'Recommended' && o.n >= 400 && o.level === 'f')
    return {
      w: pool.filter((o) => o.side === 0).sort((a, b) => rank(b) - rank(a)).slice(0, 5),
      b: pool.filter((o) => o.side === 1).sort((a, b) => rank(b) - rank(a)).slice(0, 5),
    }
  }, [data])

  const th = (k: SortKey, label: string, right = false) => (
    <th className={`sortable ${right ? 'r' : ''}`} onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : -1 })}>
      {label}{sort.k === k ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )
  if (!data) return <><PageHead title="Openings" /><Loading /></>
  return (
    <>
      <PageHead title="Openings" sub={`Every opening here has at least ${data.min_games} analysed games. “Objective” is the median engine score around moves 5–8 against the average for that side. “Playability” blends win rate with how steadily an edge is held.`} />

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {([['White', best.w], ['Black', best.b]] as const).map(([name, list]) => (
          <section className="card" key={name}>
            <div className="card-head"><h3>Best for {name}</h3><span className="small muted">objectively good and playable</span></div>
            <div style={{ padding: '4px 8px 10px' }}>
              {list.map((o) => (
                <Link key={o.key} to={openingPath(o.key)} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                  <span className="name" style={{ fontWeight: 550 }}>{o.key}</span>
                  <span className="small muted num">{pct(o.score)} · {num(o.n)}</span>
                  <Chip tone="good">{signed(o.med['16'] ?? o.obj, 2)}</Chip>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {lines && (
        <section className="card" style={{ marginBottom: 24 }}>
          <div className="card-head"><h3>Tree search</h3></div>
          <div className="card-sub">
            Depth-first through the opening tree, 10 plies deep. Of {num(lines.pruned.edges)} candidate moves, {num(lines.pruned.outrageous)} were cut as outrageous
            (−0.9 or worse against the position, or scoring under 30%) and {num(lines.pruned.dubious)} flagged dubious. The strongest surviving lines:
          </div>
          <div className="grid-2" style={{ padding: '8px 12px 14px', gap: 4 }}>
            <LineList title="White" lines={lines.white} />
            <LineList title="Black vs 1. e4" lines={lines.black['e4'] ?? []} />
          </div>
          {lines.pruned.early_outrageous.length > 0 && (
            <div className="small muted" style={{ padding: '0 20px 16px' }}>
              Pruned on move one or two: {lines.pruned.early_outrageous.slice(0, 6).map((e) => `${e[0]} (${e[2] > 0 ? '+' : '−'}${Math.abs(e[2]).toFixed(1)})`).join(', ')}.
            </div>
          )}
        </section>
      )}

      <div className="filters">
        <Filter label="Show"><Segmented value={level} onChange={setLevel} options={[{ value: 'f', label: 'Families' }, { value: 'v', label: 'Variations' }, { value: 'all', label: 'Both' }]} /></Filter>
        <Filter label="Side"><Segmented value={side} onChange={setSide} options={[{ value: 'all', label: 'All' }, { value: '0', label: 'White' }, { value: '1', label: 'Black' }]} /></Filter>
        <Filter label="Verdict">
          <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
            {['all', 'Recommended', 'Solid', 'Playable', 'Niche', 'Risky', 'Avoid'].map((v) => <option key={v} value={v}>{v === 'all' ? 'All verdicts' : v}</option>)}
          </select>
        </Filter>
        <input type="search" placeholder="Search name or ECO" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} aria-label="Search openings" />
        <span className="small muted">{rows.length} openings</span>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="t">
            <thead><tr>
              {th('name', 'Opening')}{th('n', 'Games', true)}{th('score', 'Score', true)}
              <th className="r">Eval, move 8</th>{th('obj', 'Objective')}{th('play', 'Playability')}<th>Verdict</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 250).map((o) => (
                <tr key={o.level + o.key} className="click" onClick={() => nav(openingPath(o.key))}>
                  <td><div className="name row" style={{ gap: 8, flexWrap: 'nowrap' }}><i className={`dot ${o.side === 0 ? 'w' : 'b'}`} title={o.side === 0 ? 'White opening' : 'Black defence'} />{o.key}</div>
                    <div className="sub" style={{ marginLeft: 17 }}>{o.eco}{o.level === 'v' ? ` · ${o.family}` : ''}</div></td>
                  <td className="r">{num(o.n)}</td>
                  <td className="r"><div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'nowrap' }}><span>{pct(o.score)}</span><div style={{ width: 66 }}><WDL w={o.wdl[0]} d={o.wdl[1]} l={o.wdl[2]} /></div></div></td>
                  <td className="r">{signed(o.med['16'], 2)}</td>
                  <td><Chip tone={objTone[o.tier_obj]}>{objLabel[o.tier_obj]}</Chip></td>
                  <td><div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><div style={{ width: 54 }}><Meter value={o.play} max={100} /></div><Chip tone={playTone[o.tier_play]}>{playLabel[o.tier_play]}</Chip></div></td>
                  <td><Chip tone={toneOf(o.verdict)}>{o.verdict}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 250 && <div className="small muted" style={{ padding: 14 }}>Showing the first 250. Narrow the filters to see the rest.</div>}
      </section>
    </>
  )
}

function LineList({ title, lines }: { title: string; lines: Lines['white'] }) {
  return (
    <div>
      <div className="section-title" style={{ padding: '4px 8px 0' }}>{title}</div>
      {lines.slice(0, 4).map((l, i) => (
        <Link key={i} to={`/?line=${l.moves.join('_')}`} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <span>
            <span style={{ fontWeight: 550 }}>{l.name ?? 'Unnamed line'}</span>
            <span className="small muted num" style={{ display: 'block' }}>{movesText(l.moves)}</span>
          </span>
          <span className="small num ink2" style={{ textAlign: 'right' }}>{signed(l.eval, 2)}<br /><span className="muted">{pct(l.score)} · {num(l.n)}</span></span>
        </Link>
      ))}
      {!lines.length && <div className="small muted" style={{ padding: 10 }}>Not enough data yet.</div>}
    </div>
  )
}
