import { Chess } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import BoardView, { Arrow } from './BoardView'
import Icon from './Icon'
import { Chip } from './ui'
import { posKey } from '../lib/book'
import { SF, SfResult, whiteCp } from '../lib/sf'
import { fenAfter, loosePieces, moveArrows, sanOf, uciToArrow } from '../lib/positions'
import type { TreeFile } from '../lib/types'

const SQUARES = Array.from({ length: 64 }, (_, i) => String.fromCharCode(97 + (i % 8)) + (1 + Math.floor(i / 8)))

/** The opening line playing out move by move, with a "Plans" overlay: common moves, engine picks, and where material is usually won. */
export default function OpeningBoard({ line, side, heat, tree, onTargets }: {
  line: string[]; side: 0 | 1; heat: { w: number[]; b: number[] }; tree: TreeFile | null
  onTargets?: (t: { you: [string, number][]; them: [string, number][] }) => void
}) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [plans, setPlans] = useState(false)
  const [eng, setEng] = useState<SfResult | null>(null)
  const sf = useRef<SF | null>(null)

  // animate the line on arrival
  useEffect(() => { setStep(0); setPlaying(true) }, [line.join(' ')])
  useEffect(() => {
    if (!playing) return
    if (step >= line.length) { setPlaying(false); return }
    const t = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 450 : 720)
    return () => window.clearTimeout(t)
  }, [playing, step, line.length])

  const { fen, last } = useMemo(() => fenAfter(line, step), [line, step])
  const atEnd = step >= line.length

  // engine picks when plans are on
  useEffect(() => {
    if (!plans) { setEng(null); return }
    if (!sf.current) sf.current = new SF()
    let live = true
    const t = window.setTimeout(() => { sf.current!.search(fen, { depth: 12, multipv: 3 }).then((r) => live && setEng(r)) }, 250)
    return () => { live = false; window.clearTimeout(t) }
  }, [plans, fen])
  useEffect(() => () => sf.current?.destroy(), [])

  const youHeat = side === 0 ? heat.w : heat.b, themHeat = side === 0 ? heat.b : heat.w
  const maxHeat = Math.max(1, ...youHeat, ...themHeat)
  const tint = useMemo(() => {
    if (!plans) return undefined
    const t: Record<string, string> = {}
    SQUARES.forEach((sq, i) => {
      const a = youHeat[i] / maxHeat, b = themHeat[i] / maxHeat
      if (Math.max(a, b) < 0.4) return
      t[sq] = a >= b ? `rgba(27,175,122,${(0.14 + 0.38 * a).toFixed(2)})` : `rgba(235,104,52,${(0.14 + 0.38 * b).toFixed(2)})`
    })
    return t
  }, [plans, youHeat, themHeat, maxHeat])

  const common = useMemo(() => {
    const kids = tree?.nodes[posKey(fen)] ?? []
    const tot = kids.reduce((a, k) => a + k[1], 0) || 1
    return kids.slice(0, 3).map((k) => [k[0], k[1] / tot] as [string, number])
  }, [tree, fen])

  const arrows: Arrow[] = useMemo(() => {
    if (!plans) return []
    const a = moveArrows(fen, common)
    for (const l of eng?.lines ?? []) if (l.pv[0]) a.push(uciToArrow(l.pv[0], l.multipv === 1 ? 'rgba(27,175,122,0.85)' : 'rgba(27,175,122,0.45)'))
    return a
  }, [plans, fen, common, eng])

  const rings = useMemo(() => (plans ? loosePieces(fen) : undefined), [plans, fen])
  const top = (arr: number[]): [string, number][] => arr.map((v, i) => [SQUARES[i], v] as [string, number]).filter((x) => x[1] >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4)
  useEffect(() => { onTargets?.({ you: top(youHeat), them: top(themHeat) }) }, [heat, side]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card card-pad">
      <div className="row" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
        <div className="section-title" style={{ margin: 0 }}>The line</div>
        <button className={`btn ${plans ? 'primary' : ''}`} onClick={() => setPlans(!plans)} aria-pressed={plans}>Plans</button>
      </div>
      <div className="board-frame"><BoardView fen={fen} flipped={side === 1} last={last} arrows={arrows} tint={tint} rings={rings} id="opening-board" notation /></div>
      <input type="range" min={0} max={line.length} value={step} onChange={(e) => { setPlaying(false); setStep(+e.target.value) }} aria-label="Move" style={{ width: '100%', marginTop: 12 }} />
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn icon" aria-label="Start" onClick={() => { setPlaying(false); setStep(0) }}><Icon name="first" /></button>
          <button className="btn icon" aria-label="Back" onClick={() => { setPlaying(false); setStep(Math.max(0, step - 1)) }}><Icon name="prev" /></button>
          <button className="btn icon" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (atEnd) { setStep(0) } setPlaying(!playing || atEnd) }}>
            {playing && !atEnd ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <Icon name="reset" />}
          </button>
          <button className="btn icon" aria-label="Forward" onClick={() => { setPlaying(false); setStep(Math.min(line.length, step + 1)) }}><Icon name="next" /></button>
          <button className="btn icon" aria-label="End" onClick={() => { setPlaying(false); setStep(line.length) }}><Icon name="last" /></button>
        </div>
        <div className="movelist" style={{ justifyContent: 'flex-end' }}>
          {line.map((s, i) => (
            <span key={i} style={{ display: 'contents' }}>
              {i % 2 === 0 && <span className="mn">{i / 2 + 1}.</span>}
              <button className={i + 1 === step ? 'on' : ''} onClick={() => { setPlaying(false); setStep(i + 1) }}>{s}</button>
            </span>
          ))}
        </div>
      </div>

      {plans && (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 6 }}>
            <Chip tone="accent"><i className="dot" style={{ background: 'var(--s1)', width: 8, height: 8 }} /> Common moves</Chip>
            <Chip tone="good"><i className="dot" style={{ background: 'var(--s3)', width: 8, height: 8 }} /> Engine picks</Chip>
            <Chip><i className="dot" style={{ background: 'rgba(27,175,122,.6)', width: 8, height: 8 }} /> You win material here</Chip>
            <Chip><i className="dot" style={{ background: 'rgba(235,104,52,.7)', width: 8, height: 8 }} /> They do</Chip>
            <Chip><i className="dot" style={{ boxShadow: 'inset 0 0 0 2px rgba(208,59,59,.85)', width: 10, height: 10, borderRadius: 2, background: 'transparent' }} /> Loose piece</Chip>
          </div>
          <ul className="bullets">
            <li><strong>Common here:</strong> {common.length ? common.map(([m, p]) => `${m} (${(p * 100).toFixed(0)}%)`).join(', ') : 'no data for this position'}.</li>
            <li><strong>Engine picks:</strong> {eng?.lines.length ? eng.lines.map((l) => `${sanOf(fen, l.pv[0])} (${fmtEval(whiteCp(l, fen))})`).join(', ') : 'thinking…'}.</li>
          </ul>
        </div>
      )}
    </section>
  )
}

const fmtEval = (cp: number) => (Math.abs(cp) > 9000 ? (cp > 0 ? '+M' : '−M') : `${cp > 0 ? '+' : cp < 0 ? '−' : ''}${Math.abs(cp / 100).toFixed(1)}`)
