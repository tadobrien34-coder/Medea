import { Chess } from 'chess.js'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Board from './Board'
import Icon from './Icon'
import { Chip, Segmented } from './ui'
import type { Arrow } from './ArrowLayer'
import { posKey } from '../lib/book'
import { ARROW, RING, TINT } from '../lib/palette'
import { SF, SfResult, whiteCp } from '../lib/sf'
import { fenAfter, loosePieces, moveArrows, sanOf, uciToArrow } from '../lib/positions'
import type { TreeFile } from '../lib/types'

export interface GmGame { id: string; w: string; b: string; wt: string; bt: string; wr: number; br: number; r: string; tc: string; mv: string }

const SQUARES = Array.from({ length: 64 }, (_, i) => String.fromCharCode(97 + (i % 8)) + (1 + Math.floor(i / 8)))
type Layer = 'common' | 'engine' | 'you' | 'them' | 'loose'

/** Flip whose turn it is (null move) so we can ask what the other side wants to play. Returns null when that is not a legal position. */
function otherSideFen(fen: string): string | null {
  try {
    const g = new Chess(fen)
    if (g.isCheck() || g.isGameOver()) return null
    const p = fen.split(' ')
    p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-'
    const flipped = p.join(' ')
    new Chess(flipped)
    return flipped
  } catch { return null }
}

/** The opening line playing out, an interactive board you can keep moving on, GM games under it, and a Plans overlay for both players. */
export default function OpeningExplorer({ line, side, heat, tree, gm, initialGm, children }: {
  line: string[]; side: 0 | 1; heat: { w: number[]; b: number[] }; tree: TreeFile | null; gm: GmGame[]; initialGm?: string | null; children?: ReactNode
}) {
  const wantGm = !!initialGm && gm.some((g) => g.id === initialGm)
  const [src, setSrc] = useState<'line' | 'gm'>(wantGm ? 'gm' : 'line')
  const [gmId, setGmId] = useState<string | null>(wantGm ? initialGm! : null)
  useEffect(() => { if (initialGm && gm.some((g) => g.id === initialGm)) { setGmId(initialGm); setSrc('gm') } }, [initialGm, gm])
  const [moves, setMoves] = useState<string[]>(line)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [flipped, setFlipped] = useState(side === 1)
  const [plans, setPlans] = useState(false)
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ common: true, engine: true, you: true, them: true, loose: true })
  const [eng, setEng] = useState<SfResult | null>(null)
  const [engOther, setEngOther] = useState<SfResult | null>(null)
  const sf = useRef<SF | null>(null)

  const gmGame = gm.find((g) => g.id === gmId) ?? null
  const base = useMemo(() => (src === 'gm' && gmGame ? gmGame.mv.split(' ') : line), [src, gmGame, line])

  // reload the source and play it through whenever it changes
  useEffect(() => { setMoves(base); setStep(0); setPlaying(true) }, [base])
  useEffect(() => { setFlipped(side === 1) }, [side, line])
  useEffect(() => {
    if (!playing) return
    if (step >= moves.length) { setPlaying(false); return }
    const t = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 450 : 700)
    return () => window.clearTimeout(t)
  }, [playing, step, moves.length])

  const { fen, last } = useMemo(() => fenAfter(moves, step), [moves, step])
  const atEnd = step >= moves.length
  const edited = moves.length !== base.length || moves.some((m, i) => m !== base[i])

  const play = (san: string) => {
    setPlaying(false)
    if (moves[step] === san) { setStep(step + 1); return }
    setMoves([...moves.slice(0, step), san]); setStep(step + 1)
  }

  // engine picks for both sides, only while Plans is on
  useEffect(() => {
    if (!plans) { setEng(null); setEngOther(null); return }
    if (!sf.current) sf.current = new SF()
    let live = true
    const t = window.setTimeout(async () => {
      const a = await sf.current!.search(fen, { depth: 12, multipv: 3 })
      if (live) setEng(a)
      const o = otherSideFen(fen)
      if (o) { const b = await sf.current!.search(o, { depth: 10, multipv: 2 }); if (live) setEngOther(b) } else if (live) setEngOther(null)
    }, 250)
    return () => { live = false; window.clearTimeout(t) }
  }, [plans, fen])
  useEffect(() => () => sf.current?.destroy(), [])

  // what people play, from the games
  const common = useMemo(() => {
    const kids = tree?.nodes[posKey(fen)] ?? []
    const tot = kids.reduce((a, k) => a + k[1], 0) || 1
    return { list: kids.slice(0, 3).map((k) => [k[0], k[1] / tot] as [string, number]), games: tot, sparse: !kids.length || tot < 30 }
  }, [tree, fen])
  const replyFen = useMemo(() => {            // the other side's most common reply, shown from the position after the top move
    const top = common.list[0]?.[0]
    if (!top) return null
    try { const g = new Chess(fen); g.move(top); return { fen: g.fen(), kids: (tree?.nodes[posKey(g.fen())] ?? []).slice(0, 1) } } catch { return null }
  }, [common, fen, tree])

  const arrows: Arrow[] = useMemo(() => {
    if (!plans) return []
    const out: Arrow[] = []
    const engineBest = eng?.lines[0]?.pv[0]
    const commonTop = common.list.map(([san]) => { try { const g = new Chess(fen); const m = g.move(san); return m.from + m.to + (m.promotion ?? '') } catch { return '' } })
    if (layers.common) {
      moveArrows(fen, common.list, '224,163,26').forEach((a, i) => {
        const agrees = layers.engine && engineBest && commonTop[i] === engineBest
        out.push(agrees ? { ...a, color: ARROW.agree } : { ...a, color: i === 0 ? ARROW.common : ARROW.commonSoft })
      })
      // the other side's usual answer to the main move
      const r = replyFen?.kids[0]
      if (replyFen && r) {
        try {
          const g = new Chess(replyFen.fen); const m = g.move(r[0])
          if (!out.some((x) => x.startSquare === m.from && x.endSquare === m.to)) out.push({ startSquare: m.from, endSquare: m.to, color: ARROW.commonSoft })
        } catch { /* ignore */ }
      }
    }
    if (layers.engine) {
      eng?.lines.forEach((l, i) => {
        if (!l.pv[0]) return
        const key = l.pv[0]
        const agreed = layers.common && commonTop.includes(key)
        if (!agreed) out.push(uciToArrow(key, i === 0 ? ARROW.engine : ARROW.engineSoft))
      })
      engOther?.lines.forEach((l) => { if (l.pv[0]) out.push(uciToArrow(l.pv[0], ARROW.engineSoft)) })
    }
    return out
  }, [plans, layers, fen, common, eng, engOther, replyFen])

  const youHeat = side === 0 ? heat.w : heat.b, themHeat = side === 0 ? heat.b : heat.w
  const maxHeat = Math.max(1, ...youHeat, ...themHeat)
  const tint = useMemo(() => {
    if (!plans) return undefined
    const t: Record<string, string> = {}
    SQUARES.forEach((sq, i) => {
      const a = layers.you ? youHeat[i] / maxHeat : 0, b = layers.them ? themHeat[i] / maxHeat : 0
      if (Math.max(a, b) < 0.55) return
      const strong = Math.max(a, b)
      const colour = a >= b ? TINT.you : TINT.them
      t[sq] = colour.replace(/[\d.]+\)$/, `${(0.18 + 0.4 * strong).toFixed(2)})`)
    })
    return t
  }, [plans, layers.you, layers.them, youHeat, themHeat, maxHeat])
  const rings = useMemo(() => {
    if (!plans || !layers.loose) return undefined
    const l = loosePieces(fen), o: Record<string, string> = {}
    for (const q of Object.keys(l)) o[q] = RING.loose
    return o
  }, [plans, layers.loose, fen])

  const toggle = (k: Layer) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  const engineLine = eng?.lines.length ? eng.lines.map((l) => `${sanOf(fen, l.pv[0])} ${fmtEval(whiteCp(l, fen))}`).join(' · ') : 'thinking…'
  const resultText = (r: string) => (r === '1-0' ? '1–0' : r === '0-1' ? '0–1' : '½–½')

  return (
    <section className="card card-pad">
      <div className="row" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
        <div className="section-title" style={{ margin: 0 }}>{src === 'gm' && gmGame ? 'GM game' : 'The line'}</div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost icon" onClick={() => setFlipped(!flipped)} aria-label="Flip board"><Icon name="flip" /></button>
          <button className={`btn ${plans ? 'primary' : ''}`} onClick={() => setPlans(!plans)} aria-pressed={plans}>Plans</button>
        </div>
      </div>
      <div className="board-frame">
        <Board fen={fen} flipped={flipped} lastMove={last} onMove={play} arrows={arrows} tint={tint} rings={rings} />
      </div>
      <input type="range" min={0} max={moves.length} value={step} onChange={(e) => { setPlaying(false); setStep(+e.target.value) }} aria-label="Move" style={{ width: '100%', marginTop: 12 }} />
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn icon" aria-label="Start" onClick={() => { setPlaying(false); setStep(0) }}><Icon name="first" /></button>
          <button className="btn icon" aria-label="Back" onClick={() => { setPlaying(false); setStep(Math.max(0, step - 1)) }}><Icon name="prev" /></button>
          <button className="btn icon" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (atEnd) setStep(0); setPlaying(!playing || atEnd) }}>
            {playing && !atEnd ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <Icon name="reset" />}
          </button>
          <button className="btn icon" aria-label="Forward" onClick={() => { setPlaying(false); setStep(Math.min(moves.length, step + 1)) }}><Icon name="next" /></button>
          <button className="btn icon" aria-label="End" onClick={() => { setPlaying(false); setStep(moves.length) }}><Icon name="last" /></button>
        </div>
        {edited && <button className="btn ghost" onClick={() => { setMoves(base); setStep(base.length) }}>Reset line</button>}
      </div>
      <div className="movelist" style={{ marginTop: 8 }}>
        {moves.map((s, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i % 2 === 0 && <span className="mn">{i / 2 + 1}.</span>}
            <button className={i + 1 === step ? 'on' : ''} onClick={() => { setPlaying(false); setStep(i + 1) }}>{s}</button>
          </span>
        ))}
      </div>

      {plans && (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 6 }}>
            <button className="toggle-chip" aria-pressed={layers.common} onClick={() => toggle('common')}><i className="sw" style={{ background: ARROW.common }} />Common moves</button>
            <button className="toggle-chip" aria-pressed={layers.engine} onClick={() => toggle('engine')}><i className="sw" style={{ background: ARROW.engine }} />Engine picks</button>
            <span className="toggle-chip" style={{ cursor: 'default', opacity: layers.common && layers.engine ? 1 : 0.45 }}><i className="sw" style={{ background: ARROW.agree }} />Both agree</span>
            <button className="toggle-chip" aria-pressed={layers.you} onClick={() => toggle('you')}><i className="sq" style={{ background: TINT.you }} />You win material here</button>
            <button className="toggle-chip" aria-pressed={layers.them} onClick={() => toggle('them')}><i className="sq" style={{ background: TINT.them }} />They do</button>
            <button className="toggle-chip" aria-pressed={layers.loose} onClick={() => toggle('loose')}><i className="sq" style={{ boxShadow: `inset 0 0 0 2px ${RING.loose}` }} />Loose piece</button>
          </div>
          <div className="small ink2">
            <div><strong style={{ color: 'var(--ink)' }}>Played:</strong> {common.list.length ? common.list.map(([m, p]) => `${m} ${(p * 100).toFixed(0)}%`).join(' · ') : 'no games here'}{common.sparse && <Chip tone="warn"> few games</Chip>}</div>
            <div style={{ marginTop: 3 }}><strong style={{ color: 'var(--ink)' }}>Engine:</strong> {engineLine}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Segmented value={src} onChange={(v) => { setSrc(v); if (v === 'gm' && !gmId && gm[0]) setGmId(gm[0].id) }} label="Source"
          options={[{ value: 'line', label: 'Line' }, { value: 'gm', label: `GM games${gm.length ? ` · ${gm.length}` : ''}` }]} />
      </div>
      {src === 'gm' && (
        <div style={{ marginTop: 10 }}>
          {gm.length === 0 ? <div className="small muted">No GM games for this opening yet.</div> : (
            <div className="gm-list">
              {gm.map((g) => (
                <button key={g.id} className={`gm-row ${g.id === gmId ? 'on' : ''}`} onClick={() => { setGmId(g.id); setSrc('gm') }}>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <strong>{g.wt && <span className="muted">{g.wt} </span>}{g.w}</strong> <span className="muted">{g.wr}</span><span className="muted"> vs </span>
                    <strong>{g.bt && <span className="muted">{g.bt} </span>}{g.b}</strong> <span className="muted">{g.br}</span>
                  </span>
                  <span className="num small">{resultText(g.r)}</span><span className="small muted">{g.tc}</span>
                </button>
              ))}
            </div>
          )}
          {gmGame && <a className="link small" href={`https://lichess.org/${gmGame.id}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>Open this game on Lichess</a>}
        </div>
      )}
      {children}
    </section>
  )
}

const fmtEval = (cp: number) => (Math.abs(cp) > 9000 ? (cp > 0 ? '+M' : '−M') : `${cp > 0 ? '+' : cp < 0 ? '−' : ''}${Math.abs(cp / 100).toFixed(1)}`)
