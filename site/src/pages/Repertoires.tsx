import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import HoverBoard from '../components/HoverBoard'
import PlayerSearch, { PlayerOpt } from '../components/PlayerSearch'
import { Chip, Filter, Loading, PageHead, ReadMore, Segmented, WDL } from '../components/ui'
import { useData } from '../lib/data'
import { TCS, num, openingPath, pct, secs } from '../lib/format'
import type { OpeningsFile } from '../lib/types'

interface Row { key: string; family: string; level: 'v' | 'f'; n: number; w: number; d: number; l: number; white: number; black: number; how_win: string | null; how_lose: string | null; page: boolean
  win_mix: number[] | null; loss_mix: number[] | null; win_move: number | null; loss_move: number | null }
interface Gm { id: string; name: string; title: string | null; rating: number | null; games: number; wdl: [number, number, number]; win_text: string | null; lose_text: string | null; openings: Row[]
  win_mix: number[]; loss_mix: number[]; win_move: number | null; loss_move: number | null; avg_time: number | null; flag: number | null }
type Reps = Record<string, Gm[]>
type TcSel = (typeof TCS)[number]

const mix = (m: number[] | null) => (m ? `${Math.round(m[1] * 100)} / ${Math.round(m[0] * 100)} / ${Math.round(m[2] * 100)}` : '–')

export default function Repertoires() {
  const { data } = useData<Reps>('gm/repertoires.json')
  const index = useData<OpeningsFile>('openings.json').data
  const byKey = useMemo(() => new Map((index?.openings ?? []).map((o) => [o.key, o])), [index])
  const avail = data ? TCS.filter((t) => data[t]?.length) : []
  const [tc, setTc] = useState<TcSel>('Bullet')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [pick, setPick] = useState<PlayerOpt | null>(null)
  const options = useMemo<PlayerOpt[]>(() => (data ? Object.entries(data).flatMap(([t, l]) => l.map((g) => ({ id: g.id, name: g.name, title: g.title, rating: g.rating, tc: t }))) : []), [data])
  if (!data) return <><PageHead title="GM repertoires" /><Loading /></>
  const cur = pick ? (pick.tc as TcSel) : avail.includes(tc) ? tc : avail[0]
  const list = (data[cur] ?? []).filter((g) => !pick || g.id === pick.id)
  return (
    <>
      <PageHead title="GM repertoires" sub="Top-rated players by time control: openings, results, and how games end." />
      <div className="filters">
        <Filter label="Time control"><Segmented value={cur} onChange={(t) => { setPick(null); setTc(t) }} options={avail.map((t) => ({ value: t, label: t }))} /></Filter>
        <PlayerSearch options={options} onPick={(o) => setPick(o)} placeholder="Find a player" />
        {pick && <Chip tone="accent">{pick.name} · {pick.tc}<button className="link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setPick(null)} aria-label="Clear search">✕</button></Chip>}
      </div>
      <div className="stack">
        {list.map((g) => {
          const rows = open[g.id] ? g.openings : g.openings.slice(0, 5)
          return (
            <section className="card" key={g.id}>
              <div className="card-head" style={{ paddingBottom: 10 }}>
                <h2 style={{ fontSize: 16 }}>{g.title && <span className="muted">{g.title} </span>}{g.name}</h2>
                {g.rating && <Chip>{g.rating}</Chip>}
                <span className="small muted">{num(g.games)} games</span>
                <div style={{ width: 150 }}><WDL w={g.wdl[0]} d={g.wdl[1]} l={g.wdl[2]} /></div>
                <Link className="link small" to={`/players/${g.id}`}>Time & blunders</Link>
              </div>
              <div className="stat-strip">
                <div><span>Wins end</span><strong className="num">{mix(g.win_mix)}</strong><em>resign / mate / clock %</em></div>
                <div><span>Median win</span><strong className="num">{g.win_move ?? '–'}</strong><em>move</em></div>
                <div><span>Losses end</span><strong className="num">{mix(g.loss_mix)}</strong><em>resign / mate / clock %</em></div>
                <div><span>Median loss</span><strong className="num">{g.loss_move ?? '–'}</strong><em>move</em></div>
                <div><span>Time / move</span><strong className="num">{g.avg_time != null ? secs(g.avg_time) : '–'}</strong><em>{g.flag != null ? `flags ${pct(g.flag, 1)}` : ''}</em></div>
              </div>
              <div className="table-wrap" style={{ padding: '4px 8px 6px' }}>
                <table className="t compact">
                  <thead><tr><th>Opening</th><th className="r">Games</th><th style={{ width: 170 }}>W / D / L</th><th className="r">Wins end</th><th className="r">Win move</th><th className="r">Losses end</th><th className="r">Loss move</th></tr></thead>
                  <tbody>
                    {rows.map((o) => {
                      const side = o.white && o.black ? (o.white / (o.white + o.black) > 0.8 ? 'W' : o.black / (o.white + o.black) > 0.8 ? 'B' : 'W/B') : o.white ? 'W' : 'B'
                      const to = o.page ? openingPath(o.key) : `${openingPath(o.key)}?name=${encodeURIComponent(o.key)}`
                      const ix = byKey.get(o.key)
                      return (
                        <tr key={o.key}>
                          <td>
                            <HoverBoard line={ix?.line} next={(ix?.next ?? []) as [string, number][]} flipped={ix?.side === 1} title={o.key} caption={ix?.plan}>
                              <Link to={to} className="name dotted" style={{ color: 'var(--ink)' }}>{o.key}</Link>
                            </HoverBoard>
                          </td>
                          <td className="r">{o.n} <span className="muted small">{side}</span></td>
                          <td><WDL w={o.w} d={o.d} l={o.l} /></td>
                          <td className="r small">{mix(o.win_mix)}</td><td className="r">{o.win_move ?? '–'}</td>
                          <td className="r small">{mix(o.loss_mix)}</td><td className="r">{o.loss_move ?? '–'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '0 14px 14px' }}>
                {g.openings.length > 5 && <button className="btn ghost" onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>{open[g.id] ? 'Show fewer' : `All ${g.openings.length} openings`}</button>}
                {(g.win_text || g.lose_text || g.openings.some((o) => o.how_win || o.how_lose)) && (
                  <ReadMore label="How they win and lose">
                    {g.win_text && <p><strong>Overall wins.</strong> {g.win_text}</p>}
                    {g.lose_text && <p><strong>Overall losses.</strong> {g.lose_text}</p>}
                    {g.openings.filter((o) => o.how_win || o.how_lose).slice(0, 8).map((o) => (
                      <p key={o.key}><strong>{o.key}.</strong>{o.how_win ? ` Wins: ${o.how_win}` : ''}{o.how_lose ? ` Losses: ${o.how_lose}` : ''}</p>
                    ))}
                  </ReadMore>
                )}
              </div>
            </section>
          )
        })}
        {pick && list.length === 0 && <div className="note">No data for that player.</div>}
      </div>
    </>
  )
}
