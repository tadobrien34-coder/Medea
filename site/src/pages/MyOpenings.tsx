import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import HoverBoard from '../components/HoverBoard'
import LinkCard from '../components/LinkCard'
import { Chip, Filter, PageHead, Segmented, WDL } from '../components/ui'
import { openingStats } from '../lib/account'
import { useData } from '../lib/data'
import { TCS, num, openingPath, pct, variationKey } from '../lib/format'
import type { OpeningsFile } from '../lib/types'
import { useUser } from '../lib/userdata'

export function useOpeningLines() {
  const index = useData<OpeningsFile>('openings.json').data
  return index
}

export default function MyOpenings() {
  const u = useUser()
  const index = useOpeningLines()
  const [tc, setTc] = useState<'All' | (typeof TCS)[number]>('All')
  const [level, setLevel] = useState<'v' | 'f'>('v')
  const games = useMemo(() => u.games.filter((g) => tc === 'All' || g.tc === tc), [u.games, tc])
  const byKey = useMemo(() => new Map((index?.openings ?? []).map((o) => [o.key, o])), [index])
  const flagged = useMemo(() => {
    const idOpening = new Map(u.games.map((g) => [g.id, variationKey(g.opening)]))
    const m = new Map<string, number>()
    for (const x of u.scan?.opening ?? []) for (const id of new Set(x.games)) { const k = idOpening.get(id); if (k) m.set(k, (m.get(k) ?? 0) + (x.count >= 2 ? 1 : 0)) }
    return m
  }, [u.scan, u.games])
  if (!u.linked) return <><PageHead title="My openings" sub="Your most played openings, with a way to practise each one." /><LinkCard /></>

  const lineFor = (key: string, color: 0 | 1) => {
    const o = byKey.get(key)
    if (o?.line) return o.line
    const g = games.find((x) => x.color === color && (level === 'v' ? variationKey(x.opening) : x.opening.split(':')[0]) === key)
    return g ? g.sans.slice(0, g.opPly || 8) : []
  }
  const table = (color: 0 | 1) => {
    const rows = openingStats(games, color, level).slice(0, 12)
    return (
      <section className="card">
        <div className="card-head"><h3>As {color === 0 ? 'White' : 'Black'}</h3><span className="small muted">{rows.reduce((a, r) => a + r.n, 0)} games</span></div>
        {rows.length === 0 ? <div className="empty" style={{ padding: 24 }}>No games.</div> : (
          <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
            <table className="t compact">
              <thead><tr><th>Opening</th><th className="r">Games</th><th style={{ width: 110 }}>W / D / L</th><th className="r">Score</th><th /></tr></thead>
              <tbody>{rows.map((r) => {
                const line = lineFor(r.key, color), o = byKey.get(r.key), bad = flagged.get(r.key) ?? 0
                return (
                  <tr key={r.key}>
                    <td>
                      <HoverBoard line={line} flipped={color === 1} next={(o?.next ?? []) as [string, number][]} title={r.key} caption={o?.plan}>
                        {o ? <Link to={openingPath(r.key)} className="name dotted" style={{ color: 'var(--ink)' }}>{r.key}</Link> : <span className="name dotted">{r.key}</span>}
                      </HoverBoard>
                      {bad > 0 && <div style={{ marginTop: 3 }}><Chip tone="bad">{bad} repeated mistake{bad > 1 ? 's' : ''}</Chip></div>}
                    </td>
                    <td className="r">{r.n}</td>
                    <td><WDL w={r.w} d={r.d} l={r.l} /><div className="tiny muted num" style={{ marginTop: 2 }}>{pct(r.w / r.n)} · {pct(r.d / r.n)} · {pct(r.l / r.n)}</div></td>
                    <td className="r">{pct((r.w + 0.5 * r.d) / r.n)}</td>
                    <td className="r nowrap">
                      {line.length > 0 && <Link className="btn" to={`/play?line=${line.join('_')}&color=${color === 0 ? 'white' : 'black'}&name=${encodeURIComponent(r.key)}`}>Play vs computer</Link>}
                    </td>
                  </tr>)
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    )
  }
  return (
    <>
      <PageHead title="My openings" sub="Everything you play, by colour and time control. Hover a name to see the position. Play any of them against the computer at the rating you choose." />
      <div className="filters">
        <Filter label="Time control"><Segmented value={tc} onChange={setTc} options={[{ value: 'All', label: 'All' }, ...TCS.map((t) => ({ value: t, label: t }))]} /></Filter>
        <Filter label="Group by"><Segmented value={level} onChange={setLevel} options={[{ value: 'v', label: 'Variation' }, { value: 'f', label: 'Family' }]} /></Filter>
        <Link className="btn ghost" to="/me/tree">Opening tree</Link>
      </div>
      <div className="grid-2">{table(0)}{table(1)}</div>
      {num(games.length) === '0' && <div className="note" style={{ marginTop: 16 }}>No games for this time control.</div>}
    </>
  )
}
