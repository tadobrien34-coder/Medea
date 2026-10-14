import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import HoverBoard from '../components/HoverBoard'
import { SortState, SortTh, sortRows } from '../components/Sort'
import { Chip, Filter, Loading, Meter, PageHead, ReadMore, Segmented, WDL } from '../components/ui'
import { useData } from '../lib/data'
import { BAND_LABELS, num, openingPath, pct, signed } from '../lib/format'
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

const BAND_EDGE = [0, 1000, 1400, 1800, 2200, 4000]
const bandOf = (elo: number) => { for (let i = 0; i < 5; i++) if (elo >= BAND_EDGE[i] && elo < BAND_EDGE[i + 1]) return i; return 4 }

export default function Openings() {
  const { data } = useData<OpeningsFile>('openings.json')
  const lines = useData<Lines>('lines.json').data
  const nav = useNavigate()
  const [level, setLevel] = useState<'f' | 'v' | 'all'>('f')
  const [side, setSide] = useState<'all' | '0' | '1'>('all')
  const [verdict, setVerdict] = useState('all')
  const [objF, setObjF] = useState('all')
  const [playF, setPlayF] = useState('all')
  const [elo, setElo] = useState('')
  const [bandSel, setBandSel] = useState<'all' | '0' | '1' | '2' | '3' | '4'>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortState>({ k: 'n', dir: -1 })

  // a typed rating picks its band; otherwise the band selector decides
  const typed = /^\d{3,4}$/.test(elo.trim()) ? bandOf(+elo.trim()) : null
  const bi = typed ?? (bandSel === 'all' ? null : +bandSel)

  const rows = useMemo(() => {
    if (!data) return []
    const t = q.trim().toLowerCase()
    const view = data.openings.filter((o) => (level === 'all' || o.level === level) && (side === 'all' || String(o.side) === side) &&
      (verdict === 'all' || o.verdict === verdict) && (objF === 'all' || o.tier_obj === objF) && (playF === 'all' || o.tier_play === playF) && (!t || o.key.toLowerCase().includes(t) || (o.eco ?? '').toLowerCase() === t)
      && (bi == null || (o.band_n?.[bi] ?? 0) >= 30))
    const n = (o: OpeningIndexItem) => (bi == null ? o.n : o.band_n![bi])
    const sc = (o: OpeningIndexItem) => (bi == null ? o.score : o.band_score![bi]!)
    const ev = (o: OpeningIndexItem) => (bi == null ? (o.med['16'] == null ? null : (o.side === 0 ? 1 : -1) * o.med['16']!) : o.band_obj?.[bi] ?? null)   // from the opening's own side
    return sortRows(view, (o, k) => {
      switch (k) {
        case 'name': return o.key.toLowerCase()
        case 'n': return n(o)
        case 'score': return sc(o)
        case 'eval': return ev(o)
        case 'obj': return o.rel_obj
        case 'play': return o.play
        case 'verdict': return o.verdict
        default: return n(o)
      }
    }, sort).map((o) => ({ o, n: n(o), score: sc(o), ev: ev(o) }))
  }, [data, level, side, verdict, objF, playF, q, sort, bi])

  const best = useMemo(() => {
    if (!data) return { w: [], b: [] }
    const rank = (o: OpeningIndexItem) => 60 * o.rel_obj + 0.6 * (o.play - 50)
    const pool = data.openings.filter((o) => o.verdict === 'Recommended' && o.n >= 400 && o.level === 'f')
    return {
      w: pool.filter((o) => o.side === 0).sort((a, b) => rank(b) - rank(a)).slice(0, 5),
      b: pool.filter((o) => o.side === 1).sort((a, b) => rank(b) - rank(a)).slice(0, 5),
    }
  }, [data])

  if (!data) return <><PageHead title="Openings" /><Loading /></>
  return (
    <>
      <PageHead title="Openings" sub={`${data.openings.length} openings with ${data.min_games}+ analysed games.`} />

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {([['White', best.w], ['Black', best.b]] as const).map(([name, list]) => (
          <section className="card" key={name}>
            <div className="card-head"><h3>Best for {name}</h3><span className="small muted">good on the engine and playable</span></div>
            <div style={{ padding: '4px 8px 10px' }}>
              {list.map((o) => (
                <Link key={o.key} to={openingPath(o.key)} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                  <HoverBoard line={o.line} next={(o.next ?? []) as [string, number][]} flipped={o.side === 1} title={o.key} caption={o.plan}><span className="name" style={{ fontWeight: 550 }}>{o.key}</span></HoverBoard>
                  <span className="small muted num">{pct(o.score)} · {num(o.n)}</span>
                  <Chip tone="good">{signed(o.med['16'] ?? o.obj, 2)}</Chip>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {lines && (
        <section className="card" style={{ marginBottom: 20 }}>
          <div className="card-head"><h3>Tree search</h3><span className="small muted">10 plies, prunes weak moves</span></div>
          <div className="grid-2" style={{ padding: '8px 12px 6px', gap: 4 }}>
            <LineList title="White" lines={lines.white} />
            <LineList title="Black vs 1. e4" lines={lines.black['e4'] ?? []} />
          </div>
          <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', paddingTop: 6 }}>
            <div><span>Moves examined</span><strong className="num">{num(lines.pruned.edges)}</strong><em>edges with enough games</em></div>
            <div><span>Cut as outrageous</span><strong className="num">{num(lines.pruned.outrageous)}</strong><em>{pct(lines.pruned.outrageous / lines.pruned.edges, 1)}</em></div>
            <div><span>Flagged dubious</span><strong className="num">{num(lines.pruned.dubious)}</strong><em>{pct(lines.pruned.dubious / lines.pruned.edges, 1)}</em></div>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            <ReadMore label="How the search works">
              <p><strong>The tree.</strong> Every position reached in the first 14 plies of the analysed games. A move is an edge, with its games, results and the median engine evaluation after it.</p>
              <p><strong>Grading a move.</strong> Compare the median evaluation after the move with the position before it, from the mover’s side. <em>Outrageous</em>: 20+ games and either 0.9 pawns worse or a score under 30%. <em>Dubious</em>: 0.4 pawns worse, or a score under 40% over 30+ games. Otherwise <em>main</em> (12%+ of the games from that position), <em>sound</em> (3%+) or <em>rare</em>.</p>
              <p><strong>The search.</strong> Depth-first from the start, 10 plies deep. It only follows <em>main</em> and <em>sound</em> moves with at least 60 games. On the opener’s turn it takes the best-valued continuation; on the opponent’s turn it averages their four most common replies, weighted by how often they were played.</p>
              <p><strong>What a value is.</strong> The median engine evaluation of real games at the end of the line, from the opener’s side. It is not a fresh engine search, so it reflects how the line is actually played at these ratings. The lines shown are the best-valued continuations from each first move.</p>
              {lines.pruned.early_outrageous.length > 0 && <p><strong>Cut on move one or two:</strong> {lines.pruned.early_outrageous.slice(0, 6).map((e) => `${e[0]} (${e[2] > 0 ? '+' : '−'}${Math.abs(e[2]).toFixed(1)})`).join(', ')}.</p>}
            </ReadMore>
          </div>
        </section>
      )}

      <div className="filters">
        <Filter label="Show"><Segmented value={level} onChange={setLevel} options={[{ value: 'f', label: 'Families' }, { value: 'v', label: 'Variations' }, { value: 'all', label: 'Both' }]} /></Filter>
        <Filter label="Side"><Segmented value={side} onChange={setSide} options={[{ value: 'all', label: 'All' }, { value: '0', label: 'White' }, { value: '1', label: 'Black' }]} /></Filter>
        <Filter label="Rating">
          <input type="text" inputMode="numeric" placeholder="Your Elo" value={elo} onChange={(e) => setElo(e.target.value)} style={{ width: 92 }} aria-label="Your rating" />
          <select value={typed != null ? String(typed) : bandSel} onChange={(e) => { setElo(''); setBandSel(e.target.value as typeof bandSel) }} aria-label="Rating band">
            <option value="all">All ratings</option>{BAND_LABELS.map((b, i) => <option key={b} value={i}>{b}</option>)}
          </select>
        </Filter>
        <Filter label="Verdict">
          <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
            {['all', 'Recommended', 'Solid', 'Playable', 'Niche', 'Risky', 'Avoid'].map((v) => <option key={v} value={v}>{v === 'all' ? 'All' : v}</option>)}
          </select>
        </Filter>
        <Filter label="Objective">
          <select value={objF} onChange={(e) => setObjF(e.target.value)} aria-label="Objective strength">
            <option value="all">Any</option><option value="good">Good</option><option value="sound">Sound</option><option value="dubious">Dubious</option>
          </select>
        </Filter>
        <Filter label="Playability">
          <select value={playF} onChange={(e) => setPlayF(e.target.value)} aria-label="Playability">
            <option value="all">Any</option><option value="high">High</option><option value="ok">OK</option><option value="tricky">Tricky</option>
          </select>
        </Filter>
        <input type="search" placeholder="Search name or ECO" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 180 }} aria-label="Search openings" />
        <span className="small muted">{rows.length} openings{bi != null ? ` · ${BAND_LABELS[bi]}` : ''}</span>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="t">
            <thead><tr>
              <SortTh k="name" label="Opening" sort={sort} onSort={setSort} first={1} /><SortTh k="n" label="Games" right sort={sort} onSort={setSort} />
              <SortTh k="score" label="Score" right sort={sort} onSort={setSort} /><SortTh k="eval" label="Eval, move 8" right sort={sort} onSort={setSort} />
              <SortTh k="obj" label="Objective" sort={sort} onSort={setSort} /><SortTh k="play" label="Playability" sort={sort} onSort={setSort} /><SortTh k="verdict" label="Verdict" sort={sort} onSort={setSort} first={1} />
            </tr></thead>
            <tbody>
              {rows.slice(0, 250).map(({ o, n, score, ev }) => (
                <tr key={o.level + o.key} className="click" onClick={() => nav(openingPath(o.key))}>
                  <td><HoverBoard as="div" line={o.line} next={(o.next ?? []) as [string, number][]} flipped={o.side === 1} title={o.key} caption={<>{o.plan || ''}<div className="muted" style={{ marginTop: 4 }}>{pct(o.score)} · {num(o.n)} games</div></>}>
                    <div className="name row" style={{ gap: 8, flexWrap: 'nowrap' }}><i className={`dot ${o.side === 0 ? 'w' : 'b'}`} title={o.side === 0 ? 'White opening' : 'Black defence'} />{o.key}</div></HoverBoard>
                    <div className="sub" style={{ marginLeft: 17 }}>{o.eco}{o.level === 'v' ? ` · ${o.family}` : ''}</div></td>
                  <td className="r">{num(n)}</td>
                  <td className="r"><span className="num">{pct(score)}</span></td>
                  <td className="r">{signed(ev, 2)}</td>
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
      <ReadMore label="What the verdicts mean">
        <p><strong>Objective</strong> is the median engine score around moves 5–8, against the average for that colour. <strong>Playability</strong> blends results with how steadily an edge is held. <strong>Recommended</strong>: engine-approved and easy to play. <strong>Solid</strong>: engine-approved, harder in practice. <strong>Playable</strong>: sound and practical. <strong>Niche</strong>: sound on paper, scores poorly. <strong>Risky</strong>: dubious but scores well. <strong>Avoid</strong>: dubious and hard to play. A rating filter recomputes games, score and evaluation for that band only.</p>
      </ReadMore>
    </>
  )
}

function LineList({ title, lines }: { title: string; lines: Lines['white'] }) {
  return (
    <div>
      <div className="section-title" style={{ padding: '4px 8px 0' }}>{title}</div>
      {lines.slice(0, 4).map((l, i) => (
        <Link key={i} to={`/?line=${l.moves.join('_')}`} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <HoverBoard line={l.moves} title={l.name ?? 'Unnamed line'} caption={`${signed(l.eval, 2)} · ${pct(l.score)} score · ${num(l.n)} games`}><span>
            <span style={{ fontWeight: 550 }}>{l.name ?? 'Unnamed line'}</span>
            <span className="small muted num" style={{ display: 'block' }}>{movesText(l.moves)}</span>
          </span></HoverBoard>
          <span className="small num ink2" style={{ textAlign: 'right' }}>{signed(l.eval, 2)}<br /><span className="muted">{pct(l.score)} · {num(l.n)}</span></span>
        </Link>
      ))}
      {!lines.length && <div className="small muted" style={{ padding: 10 }}>Not enough data yet.</div>}
    </div>
  )
}
