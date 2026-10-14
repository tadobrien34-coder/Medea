import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import BoardView from '../components/BoardView'
import { ARROW } from '../lib/palette'
import { BarChart } from '../components/charts/Charts'
import LinkCard from '../components/LinkCard'
import { Chip, HBars, PageHead, Segmented, Stat } from '../components/ui'
import { lossProfile } from '../lib/analysis'
import { num, pct } from '../lib/format'
import { missedId } from '../lib/mistakeIds'
import { PIECE_WORD, PK } from '../lib/pieces'
import { useUser } from '../lib/userdata'

type Tab = 'opening' | 'tactics' | 'lose'

export default function Mistakes() {
  const u = useUser()
  const [tab, setTab] = useState<Tab>('opening')
  const profile = useMemo(() => lossProfile(u.games), [u.games])
  const kinds = useKinds((u.scan?.missed ?? []).filter((m) => !(missedId(m) in u.dismissed)))
  if (!u.linked) return <><PageHead title="Frequent mistakes" sub="The errors you repeat." /><LinkCard /></>
  const scan = u.scan
  const openActive = scan?.opening.filter((m) => !(m.id in u.dismissed)) ?? []
  const missedActive = scan?.missed.filter((m) => !(missedId(m) in u.dismissed)) ?? []
  const pastOpen = scan?.opening.filter((m) => m.id in u.dismissed) ?? []
  const pastMissed = scan?.missed.filter((m) => missedId(m) in u.dismissed) ?? []
  const repeated = openActive.filter((m) => m.count >= 2)
  const pct1 = (a: number, b: number) => (b ? pct(a / b) : '–')
  const L = profile.analysed

  return (
    <>
      <PageHead title="Frequent mistakes" sub="Moves you repeat that lose ground, tactics you walk past, and the usual way your games are lost. Then practice them."
        actions={<>
          <button className="btn" onClick={() => u.runScan()} disabled={u.task.running || !u.games.length}>{scan ? 'Scan again' : 'Scan my games'}</button>
          {(openActive.length + missedActive.length) ? <Link className="btn primary" to="/me/practice">Practice<span style={{ opacity: .8 }}>{openActive.length + missedActive.length}</span></Link> : null}
        </>} />
      {u.task.running && (
        <div className="note" style={{ marginBottom: 16 }}>
          <div className="row"><span className="spinner" style={{ width: 14, height: 14 }} /> {u.task.label}… {u.task.done}/{u.task.total}
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={u.stopTask}>Stop</button></div>
        </div>
      )}
      {!scan && !u.task.running && (
        <div className="note" style={{ marginBottom: 16 }}>
          Press <strong>Scan my games</strong>. Medea checks the opening moves you repeat with the engine and looks through your analysed games for chances you missed. It runs in your browser, takes a few minutes, and is saved afterwards. Analyse your losses on <Link className="link" to="/me">My games</Link> first for the best results.
        </div>
      )}
      <div className="filters"><Segmented value={tab} onChange={setTab} options={[{ value: 'opening', label: `Opening mistakes${openActive.length ? ` · ${openActive.length}` : ''}` }, { value: 'tactics', label: `Missed tactics${missedActive.length ? ` · ${missedActive.length}` : ''}` }, { value: 'lose', label: 'How you lose' }]} label="Section" /></div>

      {tab === 'opening' && (
        <div className="stack">
          {scan && openActive.length === 0 && <div className="note">{pastOpen.length ? 'All cleared. Past mistakes are saved below.' : 'No opening mistakes found that you have repeated. Nice.'}</div>}
          {openActive.map((m) => (
            <section className="card" key={m.id}>
              <div className="wrong-grid" style={{ gridTemplateColumns: '240px minmax(0,1fr)' }}>
                <BoardView fen={m.fen} flipped={m.color === 1} size={240} id={`m-${m.id}`}
                  arrows={[{ startSquare: m.uci.slice(0, 2), endSquare: m.uci.slice(2, 4), color: ARROW.bad }]} />
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <h3 style={{ fontSize: 16 }}>You played {m.san}</h3>
                    {m.count >= 2 ? <Chip tone="bad">Repeated ×{m.count}</Chip> : <Chip tone="warn">Once</Chip>}
                    {m.known && <Chip>Common error</Chip>}
                    <button className="x-btn" style={{ marginLeft: 'auto' }} aria-label="Clear this mistake" title="Clear (saved under past mistakes)" onClick={() => u.dismiss(m.id)}>✕</button>
                  </div>
                  <ul className="bullets" style={{ marginTop: 10 }}>
                    <li>It costs about <strong>{(m.loss / 100).toFixed(1)} pawns</strong> against best play. Better: <strong>{m.best}</strong>{m.good.length > 1 ? ` (also fine: ${m.good.filter((x) => x !== m.best).slice(0, 2).join(', ')})` : ''}.</li>
                    <li>Your record after it: {m.results[0]} won, {m.results[1]} drawn, {m.results[2]} lost.</li>
                    {m.known && <li>{m.known}</li>}
                  </ul>
                  <div className="row" style={{ marginTop: 12 }}>
                    <Link className="btn" to={`/?line=${[...m.line, m.san].join('_')}`}>Open in Explore</Link>
                    <Link className="btn ghost" to="/me/practice">Practice</Link>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'tactics' && (
        <div className="stack-lg">
          {scan && missedActive.length === 0 && <div className="note">{pastMissed.length ? 'All cleared. Past tactics are saved below.' : 'No missed tactics found yet. Analyse more losses on My games, then scan again.'}</div>}
          {kinds.length > 0 && (
            <section className="card">
              <div className="card-head"><h3>What you tend to miss</h3></div>
              <BarChart items={kinds.map(([k, v]) => ({ label: k, value: v }))} yFormat={(v) => String(Math.round(v))} height={200} tipLabel="Times" />
            </section>
          )}
          <div className="grid-2">
            {missedActive.slice(0, 24).map((m, i) => (
              <section className="card card-pad" key={missedId(m)} style={{ position: 'relative' }}>
                <button className="x-btn" style={{ position: 'absolute', top: 10, right: 10, zIndex: 25 }} aria-label="Clear this tactic" title="Clear (saved under past mistakes)" onClick={() => u.dismiss(missedId(m))}>✕</button>
                <BoardView fen={m.fen} flipped={m.color === 1} id={`t-${i}`}
                  arrows={[{ startSquare: m.bestUci.slice(0, 2), endSquare: m.bestUci.slice(2, 4), color: ARROW.engine }]} />
                <div className="row" style={{ marginTop: 10, gap: 8 }}><Chip tone="good">{m.kind}</Chip><span className="small muted">move {m.move}</span></div>
                <p className="small ink2" style={{ marginTop: 6 }}>You played <strong>{m.played}</strong>. <strong>{m.best}</strong> was there, and it was worth about {m.gain} points of win chance.</p>
              </section>
            ))}
          </div>
        </div>
      )}

      {tab === 'lose' && (
        <div className="stack-lg">
          {L < 5 && <div className="note">Analyse at least a handful of losses on <Link className="link" to="/me">My games</Link> to see how you lose.</div>}
          <div className="grid-4">
            <Stat label="Lost from a winning position" value={pct1(profile.fromWinning, L)} hint="you were +2 or better at some point" />
            <Stat label="Lost on the clock" value={pct1(profile.flagged, profile.analysed + profile.unanalysed)} hint={`${profile.flaggedAhead} while clearly ahead`} />
            <Stat label="Blundered in time trouble" value={pct1(profile.timeTrouble, L)} hint="first blunder with under 10% of the clock" />
            <Stat label="Mated / resigned" value={`${profile.mated} / ${profile.resigned}`} hint="of all your losses" />
          </div>
          <div className="grid-2">
            <section className="card"><div className="card-head"><h3>When the first blunder comes</h3></div><div className="card-sub">Your worst move in each analysed loss, by phase of the game</div>
              <BarChart items={['Moves 1–10', 'Moves 11–30', 'Moves 31+'].map((l, i) => ({ label: l, value: profile.phase[i] }))} yFormat={(v) => String(Math.round(v))} height={200} tipLabel="Losses" color="var(--s2)" /></section>
            <section className="card"><div className="card-head"><h3>The piece you blunder with</h3></div><div className="card-sub">Piece moved in the first blunder of each loss</div>
              <HBars labels={PK.map((k) => PIECE_WORD[k][0].toUpperCase() + PIECE_WORD[k].slice(1))} values={profile.pieces} color="var(--s2)" fmt={(v) => `${((100 * v) / (profile.pieces.reduce((a, b) => a + b, 0) || 1)).toFixed(0)}% · ${num(v)}`} /></section>
          </div>
        </div>
      )}

      {(pastOpen.length > 0 || pastMissed.length > 0) && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ marginBottom: 4 }}>Review past mistakes</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>Mistakes you cleared. Restore one to bring it back.</p>
          <div className="grid-3">
            {pastOpen.map((m) => (
              <section className="card card-pad" key={m.id}>
                <BoardView fen={m.fen} flipped={m.color === 1} id={`p-${m.id}`} arrows={[{ startSquare: m.uci.slice(0, 2), endSquare: m.uci.slice(2, 4), color: ARROW.bad }]} />
                <div className="row" style={{ marginTop: 8, gap: 8 }}><strong className="small">You played {m.san}</strong><span className="small muted">×{m.count} · better {m.best}</span></div>
                <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => u.restore(m.id)}>Restore</button>
              </section>))}
            {pastMissed.map((m) => (
              <section className="card card-pad" key={missedId(m)}>
                <BoardView fen={m.fen} flipped={m.color === 1} id={`pm-${missedId(m)}`} arrows={[{ startSquare: m.bestUci.slice(0, 2), endSquare: m.bestUci.slice(2, 4), color: ARROW.engine }]} />
                <div className="row" style={{ marginTop: 8, gap: 8 }}><Chip tone="good">{m.kind}</Chip><span className="small muted">played {m.played} · better {m.best}</span></div>
                <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => u.restore(missedId(m))}>Restore</button>
              </section>))}
          </div>
        </section>
      )}
    </>
  )
}

function useKinds(missed: { kind: string }[]): [string, number][] {
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const x of missed) m.set(x.kind, (m.get(x.kind) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [missed])
}
