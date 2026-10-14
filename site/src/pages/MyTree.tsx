import { Chess } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Board from '../components/Board'
import HoverBoard from '../components/HoverBoard'
import Icon from '../components/Icon'
import LinkCard from '../components/LinkCard'
import { Chip, Filter, PageHead, Segmented, WDL } from '../components/ui'
import { openingAlong, posKey, useBook } from '../lib/book'
import { useData } from '../lib/data'
import { TCS, num, pct } from '../lib/format'
import type { TreeFile } from '../lib/types'
import { useUser } from '../lib/userdata'

interface Edge { n: number; w: number; d: number; l: number; mine: boolean }
const DEPTH = 24

/** Your own opening tree, built from your saved games: what you play, what you face, how it went, and which moves are repeated mistakes. */
export default function MyTree() {
  const u = useUser()
  const book = useBook()
  const pop = useData<TreeFile>('tree.json').data
  const [color, setColor] = useState<0 | 1>(0)
  const [tc, setTc] = useState<'All' | (typeof TCS)[number]>('All')
  const [line, setLine] = useState<string[]>([])

  const games = useMemo(() => u.games.filter((g) => g.color === color && (tc === 'All' || g.tc === tc)), [u.games, color, tc])
  const tree = useMemo(() => {
    const t = new Map<string, Map<string, Edge>>()
    for (const g of games) {
      const chess = new Chess()
      for (let i = 0; i < Math.min(g.sans.length, DEPTH); i++) {
        const key = posKey(chess.fen())
        let mv
        try { mv = chess.move(g.sans[i]) } catch { break }
        const m = t.get(key) ?? new Map<string, Edge>()
        const e = m.get(mv.san) ?? { n: 0, w: 0, d: 0, l: 0, mine: i % 2 === g.color }
        e.n++; if (g.res === 1) e.w++; else if (g.res === 0.5) e.d++; else e.l++
        m.set(mv.san, e); t.set(key, m)
      }
    }
    return t
  }, [games])
  useEffect(() => setLine([]), [color])

  const g = new Chess()
  for (const s of line) { try { g.move(s) } catch { break } }
  const fen = g.fen()
  const kids = [...(tree.get(posKey(fen))?.entries() ?? [])].sort((a, b) => b[1].n - a[1].n)
  const total = kids.reduce((a, [, e]) => a + e.n, 0)
  const popKids = pop?.nodes[posKey(fen)] ?? []
  const popTot = popKids.reduce((a, k) => a + k[1], 0) || 1
  const bad = useMemo(() => new Map((u.scan?.opening ?? []).map((m) => [m.id, m])), [u.scan])
  const named = openingAlong(book, line)
  if (!u.linked) return <><PageHead title="My opening tree" sub="Every position you reach, from your own games." /><LinkCard /></>

  return (
    <>
      <PageHead title="My opening tree" sub="Every position you have reached, built from your saved games. Click a move to follow it. Repeated mistakes carry a red tag."
        actions={<a className="btn" href="https://www.openingtree.com/" target="_blank" rel="noreferrer">Open in OpeningTree<Icon name="external" /></a>} />
      <div className="filters">
        <Filter label="You play"><Segmented value={String(color)} onChange={(v) => setColor(+v as 0 | 1)} options={[{ value: '0', label: 'White' }, { value: '1', label: 'Black' }]} /></Filter>
        <Filter label="Time control"><Segmented value={tc} onChange={setTc} options={[{ value: 'All', label: 'All' }, ...TCS.map((t) => ({ value: t, label: t }))]} /></Filter>
        <span className="small muted">{num(games.length)} games</span>
      </div>
      <div className="explore">
        <div>
          <div className="board-frame"><Board fen={fen} flipped={color === 1} onMove={(san) => setLine([...line, san])} /></div>
          <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn icon" onClick={() => setLine([])} aria-label="Start" disabled={!line.length}><Icon name="first" /></button>
              <button className="btn icon" onClick={() => setLine(line.slice(0, -1))} aria-label="Back" disabled={!line.length}><Icon name="prev" /></button>
            </div>
            <Link className="btn ghost" to={`/?line=${line.join('_')}`}>Analyse in Explore</Link>
          </div>
        </div>
        <div className="stack">
          <section className="card card-pad">
            <div className="section-title">Position</div>
            <div className="opening-name">{named ? named.name : line.length ? 'Out of book' : 'Starting position'}</div>
            <div className="movelist" style={{ marginTop: 8 }}>{line.map((s, i) => <span key={i} style={{ display: 'contents' }}>{i % 2 === 0 && <span className="mn">{i / 2 + 1}.</span>}<button onClick={() => setLine(line.slice(0, i + 1))}>{s}</button></span>)}</div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Next moves in your games</h3><span className="small muted">{total} games reached this position</span></div>
            {kids.length === 0 ? <div className="empty" style={{ padding: 22 }}>No games from here.</div> : (
              <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
                <table className="t compact cand">
                  <thead><tr><th>Move</th><th>By</th><th className="r">Games</th><th style={{ width: 100 }}>You: W / D / L</th><th className="r">Everyone</th><th /></tr></thead>
                  <tbody>{kids.slice(0, 12).map(([san, e]) => {
                    const id = `${posKey(fen).split(' ').slice(0, 3).join(' ')}|${san}`
                    const m = [...bad.values()].find((x) => x.san === san && x.fen.split(' ').slice(0, 3).join(' ') === posKey(fen).split(' ').slice(0, 3).join(' '))
                    const share = popKids.find((k) => k[0] === san)?.[1]
                    let after = fen; try { const c = new Chess(fen); c.move(san); after = c.fen() } catch { /* keep */ }
                    return (
                      <tr key={san} className="click" onClick={() => setLine([...line, san])}>
                        <td><HoverBoard fen={after} flipped={color === 1} title={san} caption={`${e.n} games`}><span>{san}</span></HoverBoard></td>
                        <td className="small muted">{e.mine ? 'You' : 'Opponent'}</td>
                        <td className="r">{e.n}</td>
                        <td><WDL w={e.w} d={e.d} l={e.l} /></td>
                        <td className="r small muted">{share ? pct(share / popTot) : '–'}</td>
                        <td className="r">{m && e.mine && <Chip tone="bad">{m.count >= 2 ? `Repeated mistake ×${m.count}` : 'Mistake'}</Chip>}{void id}</td>
                      </tr>)
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
          {!u.scan && <div className="note">Run <Link className="link" to="/me/mistakes">Frequent mistakes</Link> once to flag moves you repeat that lose ground.</div>}
        </div>
      </div>
    </>
  )
}
