import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Arrow } from '../components/ArrowLayer'
import Board from '../components/Board'
import HoverBoard from '../components/HoverBoard'
import Icon from '../components/Icon'
import { Chip, Segmented, WDL } from '../components/ui'
import { openingAlong, posKey, useBook } from '../lib/book'
import { useData } from '../lib/data'
import { Engine, EngineInfo, evalText, winChance } from '../lib/engine'
import { lichessAnalysis, num, openingPath, pct, variationKey } from '../lib/format'
import { ARROW } from '../lib/palette'
import type { GmOpeningsFile, OpeningsFile, TreeFile } from '../lib/types'

const DEPTH = 12
const SPARSE = 30

function replay(sans: string[]) {
  const g = new Chess()
  const fens = [g.fen()]
  const ok: string[] = []
  const squares: ([string, string] | null)[] = [null]
  for (const s of sans) {
    try {
      const m = g.move(s)
      ok.push(m.san); fens.push(g.fen()); squares.push([m.from, m.to])
    } catch { break }
  }
  return { fens, sans: ok, squares }
}

function fenAfterMove(fen: string, san: string) {
  try { const g = new Chess(fen); g.move(san); return g.fen() } catch { return fen }
}

function pvToSan(fen: string, uci: string[], max = 6) {
  const g = new Chess(fen)
  const out: string[] = []
  const turn0 = g.turn(), n0 = parseInt(fen.split(' ')[5] ?? '1', 10)
  for (let i = 0; i < Math.min(uci.length, max); i++) {
    try {
      const m = g.move({ from: uci[i].slice(0, 2), to: uci[i].slice(2, 4), promotion: uci[i][4] })
      const mn = turn0 === 'w' ? n0 + Math.floor(i / 2) : n0 + Math.floor((i + 1) / 2)
      const white = (turn0 === 'w') === (i % 2 === 0)
      out.push(white ? `${mn}. ${m.san}` : i === 0 ? `${mn}… ${m.san}` : m.san)
    } catch { break }
  }
  return out.join(' ')
}

export default function Explore() {
  const [sp, setSp] = useSearchParams()
  const initial = useMemo(() => replay((sp.get('line') ?? '').split('_').filter(Boolean)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const atParam = sp.get('at')
  const [line, setLine] = useState<string[]>(initial.sans)
  const [cursor, setCursor] = useState(atParam != null && !isNaN(+atParam) ? Math.min(initial.sans.length, +atParam) : initial.sans.length)
  const [flipped, setFlipped] = useState(false)
  const [follow, setFollow] = useState<'played' | 'engine'>('played')
  const [layers, setLayers] = useState({ common: true, engine: true })
  const [info, setInfo] = useState<EngineInfo | null>(null)
  const engine = useRef<Engine | null>(null)
  const book = useBook()
  const tree = useData<TreeFile>('tree.json').data
  const openings = useData<OpeningsFile>('openings.json').data
  const gms = useData<GmOpeningsFile>('gm/openings.json').data

  const { fens, squares } = useMemo(() => replay(line), [line])
  const fen = fens[Math.min(cursor, fens.length - 1)]
  const game = useMemo(() => new Chess(fen), [fen])
  const named = useMemo(() => openingAlong(book, line.slice(0, cursor)), [book, line, cursor])

  // keep the URL shareable, and react to links elsewhere that load a line
  useEffect(() => {
    const v = line.join('_')
    if ((sp.get('line') ?? '') !== v) setSp(v ? { line: v } : {}, { replace: true })
  }, [line]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ext = (sp.get('line') ?? '')
    if (ext !== line.join('_')) { const r = replay(ext.split('_').filter(Boolean)); const at = sp.get('at'); setLine(r.sans); setCursor(at != null && !isNaN(+at) ? Math.min(r.sans.length, +at) : r.sans.length) }
  }, [sp]) // eslint-disable-line react-hooks/exhaustive-deps

  // engine
  useEffect(() => { engine.current = new Engine(); return () => engine.current?.destroy() }, [])
  useEffect(() => {
    setInfo(null)
    if (game.isGameOver()) return
    const t = setTimeout(() => engine.current?.analyse(fen, DEPTH, setInfo), 120)
    return () => clearTimeout(t)
  }, [fen, game])

  const cands = tree?.nodes[posKey(fen)] ?? []
  const total = cands.reduce((a, c) => a + c[1], 0)
  const sparse = total < SPARSE
  const best = info?.pv?.[0]
  const whiteToMove = fen.split(' ')[1] === 'w'

  const play = (san: string) => {
    if (line[cursor] === san) { setCursor(cursor + 1); return }
    setLine([...line.slice(0, cursor), san]); setCursor(cursor + 1)
  }
  /** One step of "click through": the most played move, or the engine's, falling back to the engine when there is no data. */
  const next = () => {
    if (cursor < line.length) { setCursor(cursor + 1); return }
    if (game.isGameOver()) return
    if (follow === 'played' && cands.length) { play(cands[0][0]); return }
    if (best) { try { const m = new Chess(fen).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] }); play(m.san) } catch { /* ignore */ } }
  }
  const nextRef = useRef(next); nextRef.current = next
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') setCursor((c) => Math.max(0, c - 1))
      if (e.key === 'ArrowRight') nextRef.current()
      if (e.key === 'ArrowUp') setCursor(0)
      if (e.key === 'ArrowDown') setCursor(line.length)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [line.length])

  // arrows: what people play (amber), what the engine prefers (green), both (purple)
  const arrows = useMemo<Arrow[]>(() => {
    if (game.isGameOver()) return []
    const out: Arrow[] = []
    const commonUci = cands.slice(0, 3).map(([san]) => { try { const m = new Chess(fen).move(san); return { san, u: m.from + m.to + (m.promotion ?? ''), from: m.from, to: m.to } } catch { return null } }).filter(Boolean) as { san: string; u: string; from: string; to: string }[]
    commonUci.forEach((c, i) => {
      if (!layers.common) return
      const agree = layers.engine && best === c.u
      out.push({ startSquare: c.from, endSquare: c.to, color: agree ? ARROW.agree : i === 0 ? ARROW.common : ARROW.commonSoft })
    })
    if (layers.engine && best && !(layers.common && commonUci.some((c) => c.u === best))) out.push({ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: ARROW.engine })
    return out
  }, [cands, fen, best, layers, game])

  const wChance = info ? (info.mate != null ? (info.mate > 0 ? 1 : 0) : winChance(info.cp ?? 0)) : 0.5
  const over = game.isGameOver()
  const result = game.isCheckmate() ? (whiteToMove ? 'Black wins by checkmate' : 'White wins by checkmate') : game.isDraw() ? 'Draw' : ''
  const vkey = named ? variationKey(named.name) : null
  const entry = openings?.openings.find((o) => o.key === vkey) ?? openings?.openings.find((o) => o.key === named?.name.split(':')[0])
  const gmList = (vkey && gms?.[vkey]) || (named && gms?.[named.name.split(':')[0]]) || null

  return (
    <div className="explore">
      <div>
        <div className="board-row">
          <div className="evalbar" style={{ transform: flipped ? 'rotate(180deg)' : undefined }} aria-label="Evaluation bar"><div className="fill" style={{ height: `${wChance * 100}%` }} /></div>
          <div className="board-col">
            <div className="board-frame"><Board fen={fen} flipped={flipped} onMove={play} arrows={arrows} lastMove={squares[Math.min(cursor, squares.length - 1)]} /></div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn icon" onClick={() => setCursor(0)} aria-label="Start" disabled={cursor === 0}><Icon name="first" /></button>
            <button className="btn icon" onClick={() => setCursor(cursor - 1)} aria-label="Back" disabled={cursor === 0}><Icon name="prev" /></button>
            <button className="btn icon" onClick={next} aria-label="Next move" disabled={over}><Icon name="next" /></button>
            <button className="btn icon" onClick={() => setCursor(line.length)} aria-label="End" disabled={cursor >= line.length}><Icon name="last" /></button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost" onClick={() => setFlipped(!flipped)}><Icon name="flip" />Flip</button>
            <button className="btn ghost" onClick={() => { setLine([]); setCursor(0) }}><Icon name="reset" />Reset</button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <span className="small muted">→ plays</span>
          <Segmented value={follow} onChange={setFollow} label="Which move the right arrow plays" options={[{ value: 'played', label: 'Most played' }, { value: 'engine', label: 'Engine' }]} />
        </div>
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          <button className="toggle-chip" aria-pressed={layers.common} onClick={() => setLayers((l) => ({ ...l, common: !l.common }))}><i className="sw" style={{ background: ARROW.common }} />Played</button>
          <button className="toggle-chip" aria-pressed={layers.engine} onClick={() => setLayers((l) => ({ ...l, engine: !l.engine }))}><i className="sw" style={{ background: ARROW.engine }} />Engine</button>
          <span className="toggle-chip" style={{ cursor: 'default', opacity: layers.common && layers.engine ? 1 : 0.45 }}><i className="sw" style={{ background: ARROW.agree }} />Both</span>
        </div>
      </div>

      <div className="stack">
        <section className="card">
          <div className="card-head" style={{ paddingBottom: 6 }}>
            <h3>Next moves in real games</h3>
            {sparse && <Chip tone="warn">{total === 0 ? 'No games here' : `Few games (${total})`}</Chip>}
            <span className="small muted">{total ? `${num(total)} games` : ''}</span>
          </div>
          {cands.length === 0 ? (
            <div className="small muted" style={{ padding: '4px 20px 16px' }}>{tree ? 'No data past this point. Keep playing: the arrow key follows the engine.' : 'Loading…'}</div>
          ) : (
            <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
              <table className="t cand compact">
                <thead><tr><th>Move</th><th className="r">% played</th><th className="r">Games</th><th style={{ width: 150 }}>Mover W / D / L</th><th className="r">Eval (W)</th><th /></tr></thead>
                <tbody>
                  {cands.slice(0, 9).map(([san, n, w, d, l, med, st]) => {
                    const mw = whiteToMove ? w : l, ml = whiteToMove ? l : w
                    return (
                      <tr key={san} className="click" onClick={() => play(san)}>
                        <td><HoverBoard fen={fenAfterMove(fen, san)} flipped={flipped} title={`${whiteToMove ? '' : '…'}${san}`} caption={`${num(n)} games`}><span>{san}</span></HoverBoard></td>
                        <td className="r">{pct(n / total)}</td>
                        <td className="r">{num(n)}</td>
                        <td><WDL w={mw} d={d} l={ml} /></td>
                        <td className="r">{med == null ? '–' : (med / 100 > 0 ? '+' : med < 0 ? '−' : '') + Math.abs(med / 100).toFixed(2)}</td>
                        <td className="r"><span className={`status ${st}`}>{st === 'outrageous' ? 'blunder' : st}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card card-pad compact-card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="opening-name">{named ? named.name : cursor === 0 ? 'Starting position' : 'Out of book'}</div>
            {named && <Chip>{named.eco}</Chip>}
          </div>
          <div className="row" style={{ marginTop: 6, gap: 8 }}>
            {entry && <Chip tone={entry.verdict === 'Recommended' ? 'good' : entry.verdict === 'Avoid' ? 'bad' : undefined}>{entry.verdict}</Chip>}
            {entry && <span className="small muted">{num(entry.n)} games · {pct(entry.score)} for {entry.side === 0 ? 'White' : 'Black'}</span>}
            {entry && <Link className="link small" to={openingPath(entry.key)}>Opening page</Link>}
            <a className="link small" href={lichessAnalysis(fen)} target="_blank" rel="noreferrer">Lichess</a>
          </div>
          <div className="hr-soft" />
          {over ? <div className="eval-big">{result}</div> : (
            <div className="row" style={{ gap: 14, alignItems: 'baseline', flexWrap: 'nowrap' }}>
              <span className="eval-big">{evalText(info)}</span>
              <span className="pv grow">{info ? pvToSan(fen, info.pv) : <span className="muted">thinking…</span>}</span>
              <span className="tiny muted nowrap">depth {info?.depth ?? '…'}</span>
            </div>
          )}
          {gmList && gmList.gms.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <span className="small muted">Played by</span>
              {gmList.gms.slice(0, 5).map((g) => <Chip key={g.id}>{g.name}<span className="muted">{g.n}</span></Chip>)}
            </div>
          )}
        </section>

        <section className="card card-pad compact-card">
          {line.length === 0 ? <span className="small muted">Drag a piece, or click a piece then a square. → follows the most played move.</span> : (
            <div className="movelist">
              {line.map((s, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  {i % 2 === 0 && <span className="mn">{i / 2 + 1}.</span>}
                  <button className={i + 1 === cursor ? 'on' : ''} onClick={() => setCursor(i + 1)}>{s}</button>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
