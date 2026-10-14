import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Arrow } from '../components/ArrowLayer'
import Board from '../components/Board'
import HoverBoard from '../components/HoverBoard'
import Icon from '../components/Icon'
import LinkCard from '../components/LinkCard'
import RangeFilter from '../components/RangeFilter'
import { Chip, Filter, PageHead, Segmented, WDL } from '../components/ui'
import { openingAlong, posKey, useBook } from '../lib/book'
import { useData } from '../lib/data'
import { Engine, EngineInfo, winChance } from '../lib/engine'
import { TCS, num, pct, signed } from '../lib/format'
import { ARROW } from '../lib/palette'
import type { TreeFile } from '../lib/types'
import { useEngineEvals } from '../lib/useEngineEvals'
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
  const [info, setInfo] = useState<EngineInfo | null>(null)
  const engine = useRef<Engine | null>(null)

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
  const turnIsMine = (g.turn() === 'w' ? 0 : 1) === color
  const kids = useMemo(() => [...(tree.get(posKey(fen))?.entries() ?? [])].sort((a, b) => b[1].n - a[1].n), [tree, fen])
  const total = kids.reduce((a, [, e]) => a + e.n, 0)
  const popKids = pop?.nodes[posKey(fen)] ?? []
  const popTot = popKids.reduce((a, k) => a + k[1], 0) || 1
  const bad = useMemo(() => (u.scan?.opening ?? []).filter((m) => m.color === color), [u.scan, color])
  const named = openingAlong(book, line)

  // engine: eval bar, best move, and an eval for every candidate
  useEffect(() => { engine.current = new Engine(); return () => engine.current?.destroy() }, [])
  useEffect(() => {
    setInfo(null)
    if (g.isGameOver()) return
    const t = setTimeout(() => engine.current?.analyse(fen, 12, setInfo), 120)
    return () => clearTimeout(t)
  }, [fen]) // eslint-disable-line react-hooks/exhaustive-deps
  const afterFen = (san: string) => { try { const c = new Chess(fen); c.move(san); return c.fen() } catch { return fen } }
  const candFens = useMemo(() => kids.slice(0, 10).map(([san]) => afterFen(san)), [kids, fen]) // eslint-disable-line react-hooks/exhaustive-deps
  const evals = useEngineEvals(candFens, 9)
  const best = info?.pv?.[0]

  // arrows for whoever is to move: their three most common moves (amber), the engine's (green), both (purple)
  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = []
    const top = kids.slice(0, 3).map(([san]) => { try { const m = new Chess(fen).move(san); return { u: m.from + m.to + (m.promotion ?? ''), from: m.from, to: m.to } } catch { return null } }).filter(Boolean) as { u: string; from: string; to: string }[]
    top.forEach((c, i) => out.push({ startSquare: c.from, endSquare: c.to, color: best === c.u ? ARROW.agree : i === 0 ? ARROW.common : ARROW.commonSoft }))
    if (best && !top.some((c) => c.u === best)) out.push({ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: ARROW.engine })
    return out
  }, [kids, fen, best])

  const forward = () => { if (kids.length) setLine([...line, kids[0][0]]) }
  const forwardRef = useRef(forward); forwardRef.current = forward
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') forwardRef.current()
      if (e.key === 'ArrowLeft') setLine((l) => l.slice(0, -1))
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  if (!u.linked) return <><PageHead title="My opening tree" /><LinkCard /></>

  const wChance = info ? (info.mate != null ? (info.mate > 0 ? 1 : 0) : winChance(info.cp ?? 0)) : 0.5
  const ev = (cp: number | null | undefined) => (cp == null ? '…' : Math.abs(cp) >= 990 ? (cp > 0 ? '+M' : '−M') : signed(cp / 100, 2))
  return (
    <>
      <PageHead title="My opening tree" sub="Every position in your games. Press → to follow your most common line." 
        actions={<a className="btn" href="https://www.openingtree.com/" target="_blank" rel="noreferrer">Open in OpeningTree<Icon name="external" /></a>} />
      <div className="filters">
        <Filter label="You play"><Segmented value={String(color)} onChange={(v) => setColor(+v as 0 | 1)} options={[{ value: '0', label: 'White' }, { value: '1', label: 'Black' }]} /></Filter>
        <Filter label="Time control"><Segmented value={tc} onChange={setTc} options={[{ value: 'All', label: 'All' }, ...TCS.map((t) => ({ value: t, label: t }))]} /></Filter>
        <RangeFilter />
        <span className="small muted">{num(games.length)} games</span>
      </div>
      <div className="explore">
        <div>
          <div className="board-row">
            <div className="evalbar" style={{ transform: color === 1 ? 'rotate(180deg)' : undefined }} aria-label="Evaluation bar"><div className="fill" style={{ height: `${wChance * 100}%` }} /></div>
            <div className="board-col"><div className="board-frame"><Board fen={fen} flipped={color === 1} onMove={(san) => setLine([...line, san])} arrows={arrows} /></div></div>
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn icon" onClick={() => setLine([])} aria-label="Start" disabled={!line.length}><Icon name="first" /></button>
              <button className="btn icon" onClick={() => setLine(line.slice(0, -1))} aria-label="Back" disabled={!line.length}><Icon name="prev" /></button>
              <button className="btn icon" onClick={forward} aria-label="Follow the most common move" disabled={!kids.length}><Icon name="next" /></button>
            </div>
            <Link className="btn ghost" to={`/?line=${line.join('_')}`}>Analyse in Explore</Link>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            <span className="toggle-chip" style={{ cursor: 'default' }}><i className="sw" style={{ background: ARROW.common }} />Your usual</span>
            <span className="toggle-chip" style={{ cursor: 'default' }}><i className="sw" style={{ background: ARROW.engine }} />Engine</span>
            <span className="toggle-chip" style={{ cursor: 'default' }}><i className="sw" style={{ background: ARROW.agree }} />Both</span>
            <span className="small muted">{turnIsMine ? 'Your move' : 'Opponent’s move'}</span>
          </div>
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head" style={{ paddingBottom: 6 }}>
              <h3>{turnIsMine ? 'What you play here' : 'What opponents play here'}</h3>
              {total > 0 && total < 8 && <Chip tone="warn">Few games ({total})</Chip>}
              <span className="small muted">{total} games</span>
            </div>
            {kids.length === 0 ? <div className="small muted" style={{ padding: '4px 20px 16px' }}>No games from here. Play on to explore with the engine.</div> : (
              <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
                <table className="t compact cand">
                  <thead><tr><th>Move</th><th>By</th><th className="r">% played</th><th className="r">Games</th><th style={{ width: 150 }}>Your W / D / L</th><th className="r">Eval (W)</th><th className="r">Typical</th><th /></tr></thead>
                  <tbody>{kids.slice(0, 10).map(([san, e], i) => {
                    const sameKey = (m: { fen: string; san: string }) => m.san === san && m.fen.split(' ').slice(0, 3).join(' ') === posKey(fen)
                    const m = bad.find(sameKey)
                    const share = popKids.find((k) => k[0] === san)?.[1]
                    const af = afterFen(san)
                    return (
                      <tr key={san} className="click" onClick={() => setLine([...line, san])}>
                        <td><HoverBoard fen={af} flipped={color === 1} title={san} caption={`${e.n} games`}><span>{san}</span></HoverBoard></td>
                        <td className="small muted">{e.mine ? 'You' : 'Opp'}</td>
                        <td className="r">{pct(e.n / total)}</td>
                        <td className="r">{e.n}</td>
                        <td><WDL w={e.w} d={e.d} l={e.l} /></td>
                        <td className="r">{ev(evals[af])}</td>
                        <td className="r small muted">{share ? pct(share / popTot) : '–'}</td>
                        <td className="r">{m && e.mine && <Chip tone="bad">{m.count >= 2 ? `Repeated ×${m.count}` : 'Mistake'}</Chip>}{i === 0 && void 0}</td>
                      </tr>)
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="card card-pad compact-card">
            <div className="opening-name">{named ? named.name : line.length ? 'Out of book' : 'Starting position'}</div>
            <div className="movelist" style={{ marginTop: 8 }}>{line.map((s, i) => <span key={i} style={{ display: 'contents' }}>{i % 2 === 0 && <span className="mn">{i / 2 + 1}.</span>}<button onClick={() => setLine(line.slice(0, i + 1))}>{s}</button></span>)}</div>
          </section>
          {!u.scan && <div className="note">Run <Link className="link" to="/me/mistakes">Frequent mistakes</Link> once to flag the moves you repeat that lose ground.</div>}
        </div>
      </div>
    </>
  )
}
