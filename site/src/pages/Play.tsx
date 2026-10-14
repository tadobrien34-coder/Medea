import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Board from '../components/Board'
import Icon from '../components/Icon'
import { Chip, Filter, PageHead, Segmented } from '../components/ui'
import { openingAlong, useBook } from '../lib/book'
import { useData } from '../lib/data'
import { SF } from '../lib/sf'
import type { OpeningsFile } from '../lib/types'

type Phase = 'setup' | 'play'

function replay(sans: string[]) {
  const g = new Chess(); const ok: string[] = []; let last: [string, string] | null = null
  for (const s of sans) { try { const m = g.move(s); ok.push(m.san); last = [m.from, m.to] } catch { break } }
  return { g, sans: ok, last }
}

/** Below Stockfish's own floor (about 1320) we weaken it ourselves by sometimes choosing a lower-ranked move. */
async function engineMove(sf: SF, fen: string, elo: number): Promise<string | null> {
  if (elo >= 1320) return (await sf.search(fen, { elo, movetime: 450 })).best
  const r = await sf.search(fen, { depth: 6, multipv: 5 })
  if (!r.lines.length) return r.best
  const weak = Math.min(1, (1320 - elo) / 920)
  const goodShare = 0.9 - 0.75 * weak
  if (Math.random() < goodShare) return r.lines[0].pv[0]
  const rest = r.lines.slice(1)
  const pick = rest.length ? rest[Math.min(rest.length - 1, Math.floor(Math.random() * (1 + weak * rest.length)))] : r.lines[0]
  return pick.pv[0]
}

export default function Play() {
  const [sp] = useSearchParams()
  const book = useBook()
  const index = useData<OpeningsFile>('openings.json').data
  const [phase, setPhase] = useState<Phase>('setup')
  const [line, setLine] = useState<string[]>(() => (sp.get('line') ?? '').split('_').filter(Boolean))
  const [name, setName] = useState(sp.get('name') ?? '')
  const [colorPick, setColorPick] = useState<'white' | 'black' | 'random'>(((sp.get('color') as 'white' | 'black') ?? 'white'))
  const [elo, setElo] = useState(1500)
  const [startAt, setStartAt] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [me, setMe] = useState<0 | 1>(0)
  const [moves, setMoves] = useState<string[]>([])
  const [thinking, setThinking] = useState(false)
  const [resigned, setResigned] = useState(false)
  const sf = useRef<SF | null>(null)
  useEffect(() => () => sf.current?.destroy(), [])

  const valid = useMemo(() => replay(line).sans, [line])
  const cut = startAt == null ? valid.length : Math.min(startAt, valid.length)
  const g = useMemo(() => replay(moves).g, [moves])
  const lastMove = useMemo(() => replay(moves).last, [moves])
  const over = g.isGameOver() || resigned
  const myTurn = (g.turn() === 'w' ? 0 : 1) === me
  const named = openingAlong(book, moves)
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? (index?.openings ?? []).filter((o) => o.line && o.key.toLowerCase().includes(t)).slice(0, 8) : []
  }, [q, index])

  const start = () => {
    const c: 0 | 1 = colorPick === 'random' ? (Math.random() < 0.5 ? 0 : 1) : colorPick === 'white' ? 0 : 1
    setMe(c); setMoves(valid.slice(0, cut)); setResigned(false); setPhase('play')
    if (!sf.current) sf.current = new SF()
  }

  // the computer's turn
  useEffect(() => {
    if (phase !== 'play' || over || myTurn || !sf.current) return
    let live = true
    setThinking(true)
    const t = window.setTimeout(async () => {
      const best = await engineMove(sf.current!, g.fen(), elo)
      if (!live || !best) { setThinking(false); return }
      try {
        const c = new Chess(g.fen()); const m = c.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] })
        setMoves((ms) => [...ms, m.san])
      } catch { /* ignore */ }
      setThinking(false)
    }, 350)
    return () => { live = false; window.clearTimeout(t) }
  }, [phase, moves, over, myTurn, elo]) // eslint-disable-line react-hooks/exhaustive-deps

  const result = resigned ? 'You resigned' : g.isCheckmate() ? (myTurn ? 'Checkmate. The computer wins.' : 'Checkmate. You win!') : g.isDraw() ? 'Draw' : ''
  const label = elo < 700 ? 'Beginner' : elo < 1100 ? 'Casual' : elo < 1500 ? 'Club' : elo < 1900 ? 'Strong club' : elo < 2300 ? 'Expert' : elo < 2700 ? 'Master' : 'Engine'

  if (phase === 'setup') {
    return (
      <>
        <PageHead title="Play vs computer" sub="Start from any opening and play it out against Stockfish at a strength you choose." />
        <div className="grid-2">
          <section className="card card-pad stack">
            <div className="section-title">Position</div>
            <input type="search" placeholder="Search an opening (e.g. Najdorf, London, Caro-Kann)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search openings" />
            {results.map((o) => <button key={o.key} className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => { setLine(o.line!); setName(o.key); setStartAt(null); setQ(''); setColorPick(o.side === 0 ? 'white' : 'black') }}>{o.key}</button>)}
            <div className="note">{valid.length ? <><strong>{name || 'Custom line'}</strong><div className="movelist" style={{ marginTop: 6 }}>{valid.map((s, i) => <span key={i} style={{ display: 'contents' }}>{i % 2 === 0 && <span className="mn">{i / 2 + 1}.</span>}<span style={{ padding: '2px 4px', fontWeight: i < cut ? 600 : 400, opacity: i < cut ? 1 : 0.4 }}>{s}</span></span>)}</div></> : 'Start from the initial position, or search an opening above.'}</div>
            {valid.length > 0 && <label className="small ink2">Start after move {Math.ceil(cut / 2)}{cut % 2 ? ' (White)' : ''}<input type="range" min={0} max={valid.length} value={cut} onChange={(e) => setStartAt(+e.target.value)} style={{ width: '100%' }} /></label>}
          </section>
          <section className="card card-pad stack">
            <div className="section-title">You</div>
            <Segmented value={colorPick} onChange={setColorPick} options={[{ value: 'white', label: 'White' }, { value: 'black', label: 'Black' }, { value: 'random', label: 'Random' }]} label="Colour" />
            <div className="section-title" style={{ marginTop: 6 }}>Computer strength</div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontSize: 28, fontWeight: 650 }}>{elo}</span><Chip>{label}</Chip></div>
            <input type="range" min={400} max={3000} step={50} value={elo} onChange={(e) => setElo(+e.target.value)} aria-label="Computer Elo" style={{ width: '100%' }} />
            <div className="small muted">Stockfish’s strength setting runs from 1320. Below that, Medea makes it miss moves on purpose.</div>
            <button className="btn primary" style={{ marginTop: 6 }} onClick={start}>Start game</button>
          </section>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead title="Play vs computer" sub={<span className="row" style={{ gap: 8 }}><Chip>{elo}</Chip><Chip>You are {me === 0 ? 'White' : 'Black'}</Chip>{named && <span className="small muted">{named.name}</span>}</span>}
        actions={<><button className="btn" onClick={() => setPhase('setup')}>New game</button></>} />
      <div className="explore">
        <div>
          <div className="board-frame">
            <Board fen={g.fen()} flipped={me === 1} interactive={!over && myTurn && !thinking} lastMove={lastMove} onMove={(san) => setMoves((ms) => [...ms, san])} />
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 8 }}>
              {!over && <button className="btn" onClick={() => setMoves((ms) => ms.slice(0, Math.max(cut, ms.length - (myTurn ? 2 : 1))))} disabled={moves.length <= cut}><Icon name="prev" />Take back</button>}
              {!over && <button className="btn ghost" onClick={() => setResigned(true)}>Resign</button>}
            </div>
            <Link className="btn ghost" to={`/?line=${moves.join('_')}`}>Analyse in Explore</Link>
          </div>
        </div>
        <div className="stack">
          <section className="card card-pad">
            <div className="section-title">{over ? 'Game over' : thinking ? 'Computer is thinking' : myTurn ? 'Your move' : 'Computer to move'}</div>
            {result && <h2 style={{ marginBottom: 8 }}>{result}</h2>}
            {over && <div className="row" style={{ gap: 8 }}><button className="btn primary" onClick={start}>Rematch</button><button className="btn" onClick={() => setPhase('setup')}>Change settings</button></div>}
            <div className="movelist" style={{ marginTop: 10 }}>
              {moves.map((s, i) => <span key={i} style={{ display: 'contents' }}>{i % 2 === 0 && <span className="mn">{i / 2 + 1}.</span>}<span style={{ padding: '2px 5px', fontWeight: i >= cut ? 600 : 400, opacity: i < cut ? 0.55 : 1 }}>{s}</span></span>)}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
