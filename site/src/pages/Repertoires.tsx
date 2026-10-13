import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip, Filter, Loading, PageHead, Segmented, WDL } from '../components/ui'
import { useData } from '../lib/data'
import { TCS, num, openingPath, pct, slug } from '../lib/format'

interface Row { key: string; family: string; level: 'v' | 'f'; n: number; w: number; d: number; l: number; white: number; black: number; how_win: string | null; how_lose: string | null; page: boolean }
interface Gm { id: string; name: string; title: string | null; rating: number | null; games: number; wdl: [number, number, number]; win_text: string | null; lose_text: string | null; openings: Row[] }
type Reps = Record<string, Gm[]>

export default function Repertoires() {
  const { data } = useData<Reps>('gm/repertoires.json')
  const avail = data ? TCS.filter((t) => data[t]?.length) : []
  const [tc, setTc] = useState<(typeof TCS)[number]>('Bullet')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (!data) return <><PageHead title="GM repertoires" /><Loading /></>
  const cur = avail.includes(tc) ? tc : avail[0]
  const list = data[cur] ?? []
  const gmOnly = list.every((g) => g.title === 'GM')
  return (
    <>
      <PageHead title="GM repertoires" sub="The top-rated players on Lichess for each time control, their most played openings, and how those games are usually won and lost. Click an opening for its full page." />
      <div className="filters"><Filter label="Time control"><Segmented value={cur} onChange={setTc} options={avail.map((t) => ({ value: t, label: t }))} /></Filter></div>
      {!gmOnly && <div className="note" style={{ marginBottom: 16 }}>Few grandmasters play rated {cur.toLowerCase()} on Lichess, so this list also includes the highest-rated titled and untitled players.</div>}
      <div className="stack">
        {list.map((g) => {
          const show = open[g.id] ? g.openings : g.openings.slice(0, 4)
          return (
            <section className="card" key={g.id}>
              <div className="card-head" style={{ paddingBottom: 12 }}>
                <h2 style={{ fontSize: 16 }}>{g.title && <span className="muted">{g.title} </span>}{g.name}</h2>
                {g.rating && <Chip>{g.rating}</Chip>}
                <span className="small muted">{num(g.games)} games</span>
                <div style={{ width: 120 }}><WDL w={g.wdl[0]} d={g.wdl[1]} l={g.wdl[2]} /></div>
                <span className="small num ink2">{pct(g.wdl[0])} / {pct(g.wdl[1])} / {pct(g.wdl[2])}</span>
                <Link className="link small" to={`/players/${g.id}`}>Time & blunders</Link>
              </div>
              {(g.win_text || g.lose_text) && (
                <div className="grid-2" style={{ padding: '0 20px 12px', gap: 20 }}>
                  {g.win_text && <p className="small ink2"><strong style={{ color: 'var(--ink)' }}>Wins.</strong> {g.win_text}</p>}
                  {g.lose_text && <p className="small ink2"><strong style={{ color: 'var(--ink)' }}>Losses.</strong> {g.lose_text}</p>}
                </div>
              )}
              <div style={{ padding: '0 20px 6px' }}>
                {show.map((o) => {
                  const side = o.white && o.black ? (o.white / (o.white + o.black) > 0.8 ? 'White' : o.black / (o.white + o.black) > 0.8 ? 'Black' : 'Both') : o.white ? 'White' : 'Black'
                  const to = o.page ? openingPath(o.key) : `${openingPath(o.key)}?name=${encodeURIComponent(o.key)}`
                  return (
                    <div className="opening-line" key={o.key}>
                      <Link to={to} className="link" style={{ fontWeight: 600, color: 'var(--ink)' }}>{o.key}</Link>
                      <div><WDL w={o.w} d={o.d} l={o.l} /><div className="tiny muted num" style={{ marginTop: 3 }}>{pct(o.w / o.n)} · {pct(o.d / o.n)} · {pct(o.l / o.n)}</div></div>
                      <div className="small muted num">{o.n} games<br />{side === 'Both' ? 'both colours' : `as ${side}`}</div>
                      <div className="desc small ink2">
                        {o.how_win && <div><strong style={{ color: 'var(--ink)' }}>Win:</strong> {o.how_win}</div>}
                        {o.how_lose && <div style={{ marginTop: 3 }}><strong style={{ color: 'var(--ink)' }}>Lose:</strong> {o.how_lose}</div>}
                        {!o.how_win && !o.how_lose && <span className="muted">Too few decisive games to describe.</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {g.openings.length > 4 && (
                <div style={{ padding: '0 14px 12px' }}>
                  <button className="btn ghost" onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>{open[g.id] ? 'Show fewer' : `Show all ${g.openings.length} openings`}</button>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
