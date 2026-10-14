import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import HoverBoard from '../components/HoverBoard'
import Icon from '../components/Icon'
import LinkCard from '../components/LinkCard'
import { Chip, Filter, PageHead, Segmented, Stat, WDL } from '../components/ui'
import type { UGame } from '../lib/account'
import { findBlunder } from '../lib/analysis'
import { TCS, num, pct, signed, variationKey } from '../lib/format'
import { useUser } from '../lib/userdata'
import { useData } from '../lib/data'
import type { OpeningsFile } from '../lib/types'

type View = 'games' | 'openings'
type Sort = 'date' | 'opening' | 'result' | 'length' | 'blunder'

const ev = (cp: number) => (Math.abs(cp) >= 990 ? (cp > 0 ? '+M' : '−M') : signed(cp / 100, 1))

export const blunderOf = (g: UGame) => (g.blunder !== undefined ? g.blunder : g.evs ? findBlunder(g) : undefined)

export function BlunderCell({ g }: { g: UGame }) {
  if (g.res !== 0) return <span className="muted">–</span>
  const b = blunderOf(g)
  if (b === undefined) return <span className="muted small">Not analysed</span>
  if (b === null) return <span className="muted small">No single blunder</span>
  const mv = Math.floor(b.ply / 2) + 1
  return (
    <Link to={`/?line=${g.sans.join('_')}&at=${b.ply}`} className="small" style={{ color: 'var(--ink)' }} title="Open the position just before it">
      <strong>Move {mv}{g.color === 1 ? '…' : '.'} {b.san}</strong>
      <span className="muted"> {ev(b.before)} → {ev(b.after)}{b.best ? ` · better ${b.best}` : ''}</span>
    </Link>
  )
}

export default function MyGames() {
  const u = useUser()
  const index = useData<OpeningsFile>('openings.json').data
  const [tc, setTc] = useState<'All' | (typeof TCS)[number]>('All')
  const [color, setColor] = useState<'all' | '0' | '1'>('all')
  const [result, setResult] = useState<'all' | 'win' | 'loss' | 'draw'>('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>('games')
  const [sort, setSort] = useState<{ k: Sort; dir: 1 | -1 }>({ k: 'date', dir: -1 })
  const [limit, setLimit] = useState(150)
  const [depth, setDepth] = useState<9 | 12>(9)
  const [open, setOpen] = useState<string | null>(null)

  const list = useMemo(() => u.games.filter((g) =>
    (tc === 'All' || g.tc === tc) && (color === 'all' || String(g.color) === color) &&
    (result === 'all' || (result === 'win' ? g.res === 1 : result === 'loss' ? g.res === 0 : g.res === 0.5)) &&
    (!q.trim() || g.opening.toLowerCase().includes(q.trim().toLowerCase()))), [u.games, tc, color, result, q])

  const sorted = useMemo(() => {
    const val = (g: UGame): number | string => {
      switch (sort.k) {
        case 'opening': return g.opening
        case 'result': return g.res
        case 'length': return g.plies
        case 'blunder': return blunderOf(g)?.ply ?? 999
        default: return g.ts
      }
    }
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  }, [list, sort])

  const groups = useMemo(() => {
    const m = new Map<string, UGame[]>()
    for (const g of list) { const k = g.opening === '?' ? 'Unknown' : variationKey(g.opening); m.set(k, [...(m.get(k) ?? []), g]) }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [list])

  const losses = u.games.filter((g) => g.res === 0)
  const analysed = losses.filter((g) => g.blunder !== undefined || g.evs).length
  const th = (k: Sort, label: string) => (
    <th className="sortable" onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : k === 'date' ? -1 : 1 })}>{label}{sort.k === k ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}</th>
  )
  const lineFor = (key: string) => index?.openings.find((o) => o.key === key)

  if (!u.linked) return <><PageHead title="My games" sub="Your own games, saved in this browser." /><LinkCard /></>
  return (
    <>
      <PageHead title="My games" sub="Saved in this browser, so leaving this page never reloads them. Sort by opening, and see the move you blundered on in each loss."
        actions={<>
          <button className="btn" onClick={() => u.refresh()} disabled={u.status === 'loading'}>{u.status === 'loading' ? <><span className="spinner" style={{ width: 14, height: 14 }} /> {u.progress}</> : 'Refresh'}</button>
        </>} />
      <div className="row" style={{ marginBottom: 16, gap: 8 }}>
        {u.profile.lichess && <Chip>Lichess · {u.profile.lichess}<button className="link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => u.unlink('lichess')} aria-label="Unlink Lichess">✕</button></Chip>}
        {u.profile.chesscom && <Chip>Chess.com · {u.profile.chesscom}<button className="link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => u.unlink('chesscom')} aria-label="Unlink Chess.com">✕</button></Chip>}
        {(!u.profile.lichess || !u.profile.chesscom) && <details><summary className="link small" style={{ cursor: 'pointer' }}>Link another account</summary><div style={{ marginTop: 10 }}><LinkCard /></div></details>}
        <span className="small muted">{num(u.games.length)} games saved</span>
      </div>
      {u.error && <div className="note warn" style={{ marginBottom: 12 }}>{u.error}</div>}

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Stat label="Record" value={pct(list.filter((g) => g.res === 1).length / Math.max(1, list.length))} hint={<WDL w={list.filter((g) => g.res === 1).length} d={list.filter((g) => g.res === 0.5).length} l={list.filter((g) => g.res === 0).length} />} />
        <Stat label="Games shown" value={num(list.length)} hint={`${num(losses.length)} losses in total`} />
        <Stat label="Losses analysed" value={`${analysed}/${losses.length}`} hint="blunder move found" />
        <section className="stat">
          <div className="label">Find my blunders</div>
          {u.task.running ? (
            <div className="hint" style={{ marginTop: 6 }}>{u.task.label}… {u.task.done}/{u.task.total}<div style={{ marginTop: 6 }}><button className="btn" onClick={u.stopTask}>Stop</button></div></div>
          ) : (
            <div className="row" style={{ marginTop: 6, gap: 8 }}>
              <select value={depth} onChange={(e) => setDepth(+e.target.value as 9 | 12)} aria-label="Analysis depth"><option value={9}>Quick</option><option value={12}>Deeper</option></select>
              <button className="btn primary" onClick={() => u.analyseLosses(depth)} disabled={analysed >= losses.length}>Analyse losses</button>
            </div>
          )}
        </section>
      </div>

      <div className="filters">
        <Filter label="View"><Segmented value={view} onChange={setView} options={[{ value: 'games', label: 'Games' }, { value: 'openings', label: 'By opening' }]} /></Filter>
        <Filter label="Time control"><Segmented value={tc} onChange={setTc} options={[{ value: 'All', label: 'All' }, ...TCS.map((t) => ({ value: t, label: t }))]} /></Filter>
        <Filter label="Colour"><Segmented value={color} onChange={setColor} options={[{ value: 'all', label: 'Both' }, { value: '0', label: 'White' }, { value: '1', label: 'Black' }]} /></Filter>
        <Filter label="Result"><Segmented value={result} onChange={setResult} options={[{ value: 'all', label: 'All' }, { value: 'win', label: 'Wins' }, { value: 'loss', label: 'Losses' }, { value: 'draw', label: 'Draws' }]} /></Filter>
        <input type="search" placeholder="Filter by opening" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by opening" style={{ minWidth: 180 }} />
      </div>

      {view === 'games' ? (
        <section className="card">
          <div className="table-wrap">
            <table className="t compact">
              <thead><tr>{th('date', 'Date')}<th>Time</th>{th('opening', 'Opening')}<th>Opponent</th>{th('result', 'Result')}{th('length', 'Moves')}{th('blunder', 'Where you blundered')}</tr></thead>
              <tbody>
                {sorted.slice(0, limit).map((g) => {
                  const o = lineFor(variationKey(g.opening))
                  return (
                    <tr key={g.id}>
                      <td className="small muted nowrap">{g.ts ? new Date(g.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '–'}</td>
                      <td className="small">{g.tc}</td>
                      <td><HoverBoard line={g.sans.slice(0, g.opPly || 8)} flipped={g.color === 1} title={g.opening}>
                        <span className="row" style={{ gap: 7, flexWrap: 'nowrap' }}><i className={`dot ${g.color === 0 ? 'w' : 'b'}`} />
                          {o ? <Link to={`/openings/${o.level}/${o.slug}`} className="name dotted" style={{ color: 'var(--ink)' }}>{g.opening}</Link> : <span className="name">{g.opening}</span>}</span></HoverBoard></td>
                      <td className="small muted">{g.oppName}{g.opp ? ` (${g.opp})` : ''}</td>
                      <td><Chip tone={g.res === 1 ? 'good' : g.res === 0 ? 'bad' : undefined}>{g.res === 1 ? 'Win' : g.res === 0 ? 'Loss' : 'Draw'}{g.term === 'time' ? ' · clock' : ''}</Chip></td>
                      <td className="r">{Math.ceil(g.plies / 2)}</td>
                      <td><BlunderCell g={g} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > limit && <div style={{ padding: 12 }}><button className="btn" onClick={() => setLimit(limit + 200)}>Show more ({sorted.length - limit} left)</button></div>}
        </section>
      ) : (
        <div className="stack">
          {groups.map(([key, gs]) => {
            const o = lineFor(key), w = gs.filter((g) => g.res === 1).length, d = gs.filter((g) => g.res === 0.5).length, l = gs.length - w - d
            return (
              <section className="card" key={key}>
                <div className="card-head" style={{ cursor: 'pointer', paddingBottom: 12 }} onClick={() => setOpen(open === key ? null : key)}>
                  <HoverBoard line={o?.line ?? gs[0].sans.slice(0, gs[0].opPly || 8)} flipped={gs[0].color === 1} title={key}><h3 className="dotted">{key}</h3></HoverBoard>
                  <span className="small muted">{gs.length} games</span>
                  <div style={{ width: 110 }}><WDL w={w} d={d} l={l} /></div>
                  <span className="small num ink2">{pct(w / gs.length)} · {pct(d / gs.length)} · {pct(l / gs.length)}</span>
                  {o && <Link className="link small" to={`/openings/${o.level}/${o.slug}`} onClick={(e) => e.stopPropagation()}>Opening page</Link>}
                  <Icon name="arrow" size={14} />
                </div>
                {open === key && (
                  <div className="table-wrap" style={{ padding: '0 8px 10px' }}>
                    <table className="t compact"><tbody>{gs.slice(0, 40).map((g) => (
                      <tr key={g.id}><td className="small muted nowrap">{new Date(g.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td><td className="small">{g.tc}</td>
                        <td><i className={`dot ${g.color === 0 ? 'w' : 'b'}`} /></td><td><Chip tone={g.res === 1 ? 'good' : g.res === 0 ? 'bad' : undefined}>{g.res === 1 ? 'Win' : g.res === 0 ? 'Loss' : 'Draw'}</Chip></td>
                        <td className="r">{Math.ceil(g.plies / 2)}</td><td><BlunderCell g={g} /></td></tr>))}</tbody></table>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
