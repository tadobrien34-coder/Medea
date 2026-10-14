import { Chess } from 'chess.js'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Board from '../components/Board'
import BoardView from '../components/BoardView'
import LinkCard from '../components/LinkCard'
import { Chip, PageHead, Stat } from '../components/ui'
import { missedId } from '../lib/mistakeIds'
import { useUser } from '../lib/userdata'

interface Item { id: string; fen: string; color: 0 | 1; good: string[]; best: string; avoid?: string; kind: string; why: string }

export default function Practice() {
  const u = useUser()
  const items = useMemo<Item[]>(() => {
    const a: Item[] = (u.scan?.opening ?? []).filter((m) => !(m.id in u.dismissed)).map((m) => ({ id: m.id, fen: m.fen, color: m.color, good: m.good.length ? m.good : [m.best], best: m.best, avoid: m.san, kind: 'Opening',
      why: `You have played ${m.san} ${m.count} time${m.count > 1 ? 's' : ''}; it costs about ${(m.loss / 100).toFixed(1)} pawns.` }))
    const b: Item[] = (u.scan?.missed ?? []).filter((m) => !(missedId(m) in u.dismissed)).map((m) => ({ id: missedId(m), fen: m.fen, color: m.color, good: [m.best], best: m.best, avoid: m.played, kind: m.kind, why: `You played ${m.played} here and missed ${m.best}.` }))
    return [...a, ...b]
  }, [u.scan, u.dismissed])
  const order = useMemo(() => [...items].sort((x, y) => {
    const px = u.practice[x.id], py = u.practice[y.id]
    const sx = (px?.right ?? 0) - (px?.wrong ?? 0) * 0.5, sy = (py?.right ?? 0) - (py?.wrong ?? 0) * 0.5
    return sx - sy
  }), [items]) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [state, setState] = useState<'ask' | 'right' | 'wrong'>('ask')
  const [tried, setTried] = useState<string | null>(null)
  const [hint, setHint] = useState(false)
  const [key, setKey] = useState(0)

  if (!u.linked) return <><PageHead title="Practice" sub="Drill the mistakes you repeat." /><LinkCard /></>
  if (!items.length) return <><PageHead title="Practice" sub="Drill the mistakes you repeat." /><div className="note">Nothing to practice yet. <Link className="link" to="/me/mistakes">Scan your games</Link> to find your repeated mistakes.</div></>
  const it = order[i % order.length]
  const mastered = items.filter((x) => (u.practice[x.id]?.right ?? 0) >= 2 && (u.practice[x.id]?.wrong ?? 0) <= (u.practice[x.id]?.right ?? 0)).length

  const answer = (san: string) => {
    const ok = it.good.includes(san)
    setTried(san); setState(ok ? 'right' : 'wrong')
    u.recordPractice(it.id, ok)
  }
  const next = () => { setI(i + 1); setState('ask'); setTried(null); setHint(false); setKey(key + 1) }
  const retry = () => { setState('ask'); setTried(null); setKey(key + 1) }
  let bestUci: [string, string] | null = null
  try { const m = new Chess(it.fen).move(it.best); bestUci = [m.from, m.to] } catch { /* ignore */ }
  const toMove = it.fen.split(' ')[1] === 'w' ? 'White' : 'Black'

  return (
    <>
      <PageHead title="Practice" sub="Find the better move in positions where you went wrong. Right answers are remembered, so the hardest come back first." actions={<Link className="btn ghost" to="/me/mistakes">All mistakes</Link>} />
      <div className="explore">
        <div>
          <div className="board-frame" key={key}>
            {state === 'ask' || state === 'wrong'
              ? <Board fen={it.fen} flipped={it.color === 1} onMove={answer} interactive={state === 'ask'} arrows={hint && bestUci ? [{ startSquare: bestUci[0], endSquare: bestUci[1], color: 'rgba(27,175,122,0.9)' }] : []} />
              : <BoardView fen={(() => { try { const g = new Chess(it.fen); g.move(tried!); return g.fen() } catch { return it.fen } })()} flipped={it.color === 1} id="practice-right" />}
          </div>
        </div>
        <div className="stack">
          <section className="card card-pad">
            <div className="row" style={{ gap: 8 }}><Chip>{it.kind}</Chip><span className="small muted">{(i % order.length) + 1} of {order.length}</span></div>
            <h2 style={{ marginTop: 10 }}>{toMove} to move. Find a better move.</h2>
            <p className="ink2" style={{ marginTop: 6 }}>{it.why}</p>
            {state === 'ask' && <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={() => setHint(true)} disabled={hint}>Show hint</button><button className="btn ghost" onClick={next}>Skip</button></div>}
            {state === 'right' && (
              <div style={{ marginTop: 14 }}>
                <div className="note" style={{ background: 'var(--good-wash)', borderColor: 'transparent' }}><strong>Correct.</strong> {tried} is one of the engine’s choices{it.good.length > 1 ? ` (so is ${it.good.filter((g) => g !== tried).slice(0, 2).join(' or ')})` : ''}.</div>
                <button className="btn primary" style={{ marginTop: 12 }} onClick={next}>Next</button>
              </div>
            )}
            {state === 'wrong' && (
              <div style={{ marginTop: 14 }}>
                <div className="note" style={{ background: 'var(--bad-wash)', borderColor: 'transparent' }}>
                  <strong>Not quite.</strong> {tried === it.avoid ? `${tried} is the move you keep playing.` : `${tried} is not one of the engine’s top moves.`} The engine prefers <strong>{it.best}</strong>.
                </div>
                <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={retry}>Try again</button><button className="btn ghost" onClick={next}>Next</button></div>
              </div>
            )}
          </section>
          <div className="grid-2" style={{ gap: 12 }}>
            <Stat label="Positions" value={items.length} />
            <Stat label="Learned" value={mastered} hint="answered right twice" />
          </div>
        </div>
      </div>
    </>
  )
}
