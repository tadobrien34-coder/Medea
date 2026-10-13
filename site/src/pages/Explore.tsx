import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Board from '../components/Board'
import Icon from '../components/Icon'
import { Chip, PageHead, WDL } from '../components/ui'
import { openingAlong, posKey, useBook } from '../lib/book'
import { useData } from '../lib/data'
import { Engine, EngineInfo, evalText, winChance } from '../lib/engine'
import { lichessAnalysis, num, openingPath, variationKey } from '../lib/format'
import type { GmOpeningsFile, OpeningsFile, TreeFile } from '../lib/types'

const DEPTH = 12

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

function pvToSan(fen: string, uci: string[], max = 7) {
  const g = new Chess(fen)
  const out: string[] = []
  const turn0 = g.turn(), n0 = parseInt(fen.split(' ')[5] ?? '1', 10)
  for (let i = 0; i < Math.min(uci.length, max); i++) {
    try {
      const m = g.move({ from: uci[i].slice(0, 2), to: uci[i].slice(2, 4), promotion: uci[i][4] })
      const num = turn0 === 'w' ? n0 + Math.floor(i / 2) : n0 + Math.floor((i + 1) / 2)
      const white = (turn0 === 'w') === (i % 2 === 0)
      out.push(white ? `${num}. ${m.san}` : i === 0 ? `${num}… ${m.san}` : m.san)
    } catch { break }
  }
  return out.join(' ')
}

export default function Explore() {
  const [sp, setSp] = useSearchParams()
  const initial = useMemo(() => replay((sp.get('line') ?? '').split('_').filter(Boolean)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [line, setLine] = useState<string[]>(initial.sans)
  const [cursor, setCursor] = useState(initial.sans.length)
  const [flipped, setFlipped] = useState(false)
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

  // keep the URL shareable
  useEffect(() => {
    const v = line.join('_')
    if ((sp.get('line') ?? '') !== v) setSp(v ? { line: v } : {}, { replace: true })
  }, [line]) // eslint-disable-line react-hooks/exhaustive-deps
  // react to links elsewhere in the app that load a line
  useEffect(() => {
    const ext = (sp.get('line') ?? '')
    if (ext !== line.join('_')) { const r = replay(ext.split('_').filter(Boolean)); setLine(r.sans); setCursor(r.sans.length) }
  }, [sp]) // eslint-disable-line react-hooks/exhaustive-deps

  // engine
  useEffect(() => { engine.current = new Engine(); return () => engine.current?.destroy() }, [])
  useEffect(() => {
    setInfo(null)
    if (game.isGameOver()) return
    const t = setTimeout(() => engine.current?.analyse(fen, DEPTH, setInfo), 120)
    return () => clearTimeout(t)
  }, [fen, game])

  const play = (san: string) => {
    const next = line.slice(0, cursor)
    if (line[cursor] === san) { setCursor(cursor + 1); return }
    setLine([...next, san]); setCursor(cursor + 1)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') setCursor((c) => Math.max(0, c - 1))
      if (e.key === 'ArrowRight') setCursor((c) => Math.min(line.length, c + 1))
      if (e.key === 'ArrowUp') setCursor(0)
      if (e.key === 'ArrowDown') setCursor(line.length)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [line.length])

  const cands = tree?.nodes[posKey(fen)] ?? []
  const whiteToMove = fen.split(' ')[1] === 'w'
  const wChance = info ? (info.mate != null ? (info.mate > 0 ? 1 : 0) : winChance(info.cp ?? 0)) : 0.5
  const over = game.isGameOver()
  const result = game.isCheckmate() ? (whiteToMove ? 'Black wins by checkmate' : 'White wins by checkmate') : game.isDraw() ? 'Draw' : ''

  const vkey = named ? variationKey(named.name) : null
  const entry = openings?.openings.find((o) => o.key === vkey) ?? openings?.openings.find((o) => o.key === named?.name.split(':')[0])
  const gmList = (vkey && gms?.[vkey]) || (named && gms?.[named.name.split(':')[0]]) || null
  const best = info?.pv?.[0]
  const arrows = best && info && !over ? [{ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: 'rgba(42,120,214,0.75)' }] : []

  return (
    <>
      <PageHead title="Explore" sub="Play any line. See the opening, the engine’s view, and what real games did from here." />
      <div className="explore">
        <div>
          <div className="board-row">
            <div className="evalbar" style={{ transform: flipped ? 'rotate(180deg)' : undefined }} aria-label="Evaluation bar">
              <div className="fill" style={{ height: `${wChance * 100}%` }} />
            </div>
            <div className="board-col">
              <div className="board-frame">
                <Board fen={fen} flipped={flipped} onMove={play} arrows={arrows} lastMove={squares[Math.min(cursor, squares.length - 1)]} />
              </div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn icon" onClick={() => setCursor(0)} aria-label="Start" disabled={cursor === 0}><Icon name="first" /></button>
              <button className="btn icon" onClick={() => setCursor(cursor - 1)} aria-label="Back" disabled={cursor === 0}><Icon name="prev" /></button>
              <button className="btn icon" onClick={() => setCursor(cursor + 1)} aria-label="Forward" disabled={cursor >= line.length}><Icon name="next" /></button>
              <button className="btn icon" onClick={() => setCursor(line.length)} aria-label="End" disabled={cursor >= line.length}><Icon name="last" /></button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn" onClick={() => setFlipped(!flipped)}><Icon name="flip" />Flip</button>
              <button className="btn" onClick={() => { setLine([]); setCursor(0) }}><Icon name="reset" />Reset</button>
            </div>
          </div>
        </div>

        <div className="stack">
          <section className="card card-pad">
            <div className="section-title">Opening</div>
            <div className="opening-name">{named ? named.name : cursor === 0 ? 'Starting position' : 'Out of book'}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {named && <Chip>{named.eco}</Chip>}
              {entry && <Chip tone={entry.verdict === 'Recommended' ? 'good' : entry.verdict === 'Avoid' ? 'bad' : undefined}>{entry.verdict}</Chip>}
              {entry && <span className="small muted">{num(entry.n)} games · scores {(entry.score * 100).toFixed(0)}% for {entry.side === 0 ? 'White' : 'Black'}</span>}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {entry && <Link className="btn" to={openingPath(entry.key)}>Opening page<Icon name="arrow" /></Link>}
              <a className="btn ghost" href={lichessAnalysis(fen)} target="_blank" rel="noreferrer">Lichess<Icon name="external" /></a>
            </div>
            {gmList && gmList.gms.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="section-title">Played by</div>
                <div className="row" style={{ gap: 6 }}>
                  {gmList.gms.slice(0, 6).map((g) => <Chip key={g.id}>{g.name}<span className="muted">{g.n}</span></Chip>)}
                </div>
              </div>
            )}
          </section>

          <section className="card card-pad">
            <div className="row" style={{ alignItems: 'baseline' }}>
              <div className="section-title" style={{ margin: 0 }}>Engine</div>
              <span className="small muted" style={{ marginLeft: 'auto' }}>Stockfish 19 lite · depth {info?.depth ?? '…'}/{DEPTH}</span>
            </div>
            {over ? <div className="eval-big" style={{ marginTop: 6 }}>{result}</div> : (
              <>
                <div className="eval-big" style={{ marginTop: 4 }}>{evalText(info)}</div>
                <div className="pv" style={{ marginTop: 4, minHeight: 20 }}>{info ? pvToSan(fen, info.pv) : <span className="muted">Thinking…</span>}</div>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head"><h3>Next moves in real games</h3></div>
            <div className="card-sub">Result shown for the player making the move. Eval is the median engine score afterwards, from White’s side.</div>
            {cands.length === 0 ? <div className="empty" style={{ padding: 22 }}>{cursor === 0 && !tree ? 'Loading…' : 'Not enough games for this position.'}</div> : (
              <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
                <table className="t cand compact">
                  <thead><tr><th>Move</th><th className="r">Games</th><th style={{ width: 96 }}>W / D / L</th><th className="r">Eval (W)</th><th /></tr></thead>
                  <tbody>
                    {cands.slice(0, 9).map(([san, n, w, d, l, med, st]) => {
                      const mw = whiteToMove ? w : l, ml = whiteToMove ? l : w
                      return (
                        <tr key={san} className="click" onClick={() => play(san)}>
                          <td>{san}</td>
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

          <section className="card card-pad">
            <div className="section-title">Moves</div>
            {line.length === 0 ? <span className="muted">Drag a piece, or tap a piece and then a square.</span> : (
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
    </>
  )
}
