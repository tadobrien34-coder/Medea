import { Chess } from 'chess.js'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChartCard, LineChart } from '../components/charts/Charts'
import Icon from '../components/Icon'
import { Chip, HBars, Loading, PageHead, Segmented, Stat, WDL } from '../components/ui'
import { posKey } from '../lib/book'
import { useData } from '../lib/data'
import { PIECES, TCS, lichessAnalysis, moveLabel, num, openingPath, pct, signed } from '../lib/format'
import type { GmOpeningsFile, OpeningDetailFile, OpeningsFile, TreeFile } from '../lib/types'
import { objLabel, playLabel, toneOf } from './Openings'

export default function OpeningDetail() {
  const { level, slug } = useParams()
  const [sp] = useSearchParams()
  const { data: o, error } = useData<OpeningDetailFile>(`openings/${level}-${slug}.json`)
  const [mode, setMode] = useState<'move' | 'ply'>('move')
  const tree = useData<TreeFile>('tree.json').data
  const gms = useData<GmOpeningsFile>('gm/openings.json').data
  const index = useData<OpeningsFile>('openings.json').data

  const lineFen = useMemo(() => {
    if (!o?.line) return null
    const g = new Chess()
    try { o.line.forEach((s) => g.move(s)) } catch { return null }
    return g.fen()
  }, [o])

  if (error && !o) {
    const nm = sp.get('name')
    const g = nm ? gms?.[nm] : null
    return (
      <>
        <PageHead title={nm ?? 'Opening not found'} sub={`There are fewer than 100 analysed games for this opening, so the full page is not available yet.${g ? ' Here is who plays it.' : ''}`}
          actions={<Link className="btn" to="/openings">All openings</Link>} />
        {g && (
          <section className="card">
            <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
              <table className="t compact">
                <thead><tr><th>Player</th><th className="r">Games</th><th style={{ width: 140 }}>W / D / L</th><th>Time controls</th></tr></thead>
                <tbody>{g.gms.map((p) => (
                  <tr key={p.id}><td className="name">{p.title && <span className="muted">{p.title} </span>}{p.name}</td><td className="r">{p.n}</td><td><WDL w={p.w} d={p.d} l={p.l} /></td>
                    <td className="small muted">{Object.entries(p.tcs).map(([k, v]) => `${k} ${v}`).join(' · ')}</td></tr>))}</tbody>
              </table>
            </div>
          </section>
        )}
      </>
    )
  }
  if (!o) return <Loading />

  const sideName = o.side === 0 ? 'White' : 'Black'
  const t = o.traj
  const clamp = (v: number) => Math.max(-6, Math.min(6, v))
  // one point per full move (after Black's reply) removes the side-to-move sawtooth
  const picks = t.med.map((_, i) => i).filter((i) => mode === 'ply' || i % 2 === 1)
  const xs = picks.map((i) => (mode === 'ply' ? i + 1 : (i + 1) / 2))
  const med = picks.map((i) => t.med[i])
  const band = { lo: picks.map((i) => clamp(t.med[i] - t.sd[i])), hi: picks.map((i) => clamp(t.med[i] + t.sd[i])) }
  const cands = tree && lineFen ? (tree.nodes[posKey(lineFen)] ?? []) : []
  const whiteToMove = lineFen ? lineFen.split(' ')[1] === 'w' : true
  const gm = gms?.[o.key]
  const cTot = o.careful.reduce((a, b) => a + b, 0), tTot = o.target.reduce((a, b) => a + b, 0), pTot = o.punish.reduce((a, b) => a + b, 0)
  const fmt = (tot: number) => (v: number) => `${((100 * v) / (tot || 1)).toFixed(0)}% · ${num(v)}`
  const kids = (o.children ?? []).map((k) => index?.openings.find((x) => x.key === k)).filter(Boolean) as OpeningsFile['openings']

  return (
    <>
      <PageHead
        title={o.key}
        sub={<span className="row" style={{ gap: 8 }}><Chip>{o.eco}</Chip><Chip><i className={`dot ${o.side === 0 ? 'w' : 'b'}`} />{sideName}’s {o.side === 0 ? 'opening' : 'defence'}</Chip>
          <Chip tone={toneOf(o.verdict)}>{o.verdict}</Chip><span className="small muted">Objective {objLabel[o.tier_obj].toLowerCase()} · playability {playLabel[o.tier_play].toLowerCase()} · {num(o.n)} analysed games{o.n < 300 ? ' (limited sample)' : ''}</span></span>}
        actions={<>
          {o.line && <Link className="btn primary" to={`/?line=${o.line.join('_')}`}>Play on board<Icon name="arrow" /></Link>}
          {lineFen && <a className="btn" href={lichessAnalysis(lineFen)} target="_blank" rel="noreferrer">Lichess<Icon name="external" /></a>}
        </>}
      />

      <div className="stack-lg">
        <section className="card card-pad">
          <div className="section-title">Summary</div>
          <ul className="bullets">{o.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </section>

        <div className="grid-4">
          <Stat label={`Score for ${sideName}`} value={pct(o.score)} hint={<WDL w={o.wdl[0]} d={o.wdl[1]} l={o.wdl[2]} />} />
          <Stat label="Median eval, moves 5–8" value={signed(o.obj, 2)} hint={`${o.rel_obj >= 0 ? '+' : '−'}${Math.abs(o.rel_obj).toFixed(2)} vs the average ${sideName.toLowerCase()} opening`} />
          <Stat label="Steady edge (+1.0)" value={o.edge.move ? `Move ${o.edge.move}` : '–'} hint={`${pct(o.edge.share)} of games get there`} />
          <Stat label="Winning advantage (+6.0)" value={o.win.move ? `Move ${o.win.move}` : '–'} hint={`${pct(o.win.share)} of games get there`} />
        </div>

        <ChartCard
          title={`Advantage for ${sideName}, every move`}
          sub={`Median engine evaluation with a band of one standard deviation (clipped at ±6). ${o.sd30 != null ? `Spread at move 15: ±${o.sd30.toFixed(1)}.` : ''}`}
          legend={[{ name: 'Median', color: 'var(--s1)' }, { name: '± 1 SD', color: 'var(--s1)', kind: 'sq' }]}
          actions={<Segmented value={mode} onChange={setMode} options={[{ value: 'move', label: 'Per move' }, { value: 'ply', label: 'Per ply' }]} label="Resolution" />}
          table={{ head: ['Move', 'Median', 'Std dev', 'Games'], rows: picks.map((i) => [mode === 'ply' ? `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} (ply ${i + 1})` : `Move ${(i + 1) / 2}`, signed(t.med[i], 2), `±${t.sd[i].toFixed(2)}`, num(t.n[i])]) }}
        >
          <LineChart xs={xs} series={[{ key: 'm', name: 'Median', color: 'var(--s1)', values: med, band }]} zeroLine height={290} yMin={-6} yMax={6}
            xFormat={(x) => String(mode === 'ply' ? Math.ceil(x / 2) : x)} tipHeader={(x) => (mode === 'ply' ? `Move ${moveLabel(x)}` : `After move ${x}`)}
            yFormat={(v) => signed(v, 1)} xTickCount={9} />
        </ChartCard>

        <div className="grid-2">
          <section className="card">
            <div className="card-head"><h3>Careful with</h3></div>
            <div className="card-sub">The piece you moved when the lead changed hands (a tag shows pieces that slip more than usual){o.careful_moves ? `, usually around moves ${o.careful_moves[0]}–${o.careful_moves[1]}` : ''}.</div>
            <HBars labels={[...PIECES]} values={o.careful} fmt={fmt(cTot)} color="var(--s2)" marks={o.careful_lift} />
          </section>
          <section className="card">
            <div className="card-head"><h3>Target</h3></div>
            <div className="card-sub">The opponent’s piece when they gave the lead away{o.target_moves ? `, usually around moves ${o.target_moves[0]}–${o.target_moves[1]}` : ''}.</div>
            <HBars labels={[...PIECES]} values={o.target} fmt={fmt(tTot)} color="var(--s3)" marks={o.target_lift} />
            {pTot > 0 && <div className="card-sub" style={{ paddingBottom: 14 }}>You cash in with the {PIECES[o.punish.indexOf(Math.max(...o.punish))].toLowerCase()} most often ({((100 * Math.max(...o.punish)) / pTot).toFixed(0)}%).</div>}
          </section>
        </div>

        <div className="grid-2">
          <section className="card">
            <div className="card-head"><h3>Signature tactics</h3></div>
            <div className="card-sub">Compared with how often they happen in an average game.</div>
            <div style={{ padding: '10px 20px 16px' }} className="stack">
              <div>
                <div className="section-title">You win with</div>
                {o.signature.yours.length ? o.signature.yours.map((s) => <div className="row" key={s.id} style={{ justifyContent: 'space-between' }}><Link className="link" to="/tactics">{s.name}</Link><span className="small muted num">{s.lift.toFixed(1)}× typical · {s.per100.toFixed(1)} per 100 games</span></div>) : <span className="muted small">No standout tactic.</span>}
              </div>
              <div>
                <div className="section-title">Watch out for</div>
                {o.signature.theirs.length ? o.signature.theirs.map((s) => <div className="row" key={s.id} style={{ justifyContent: 'space-between' }}><Link className="link" to="/tactics">{s.name}</Link><span className="small muted num">{s.lift.toFixed(1)}× typical · {s.per100.toFixed(1)} per 100 games</span></div>) : <span className="muted small">No standout tactic.</span>}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>How games end</h3></div>
            <div className="table-wrap" style={{ padding: '8px 8px 4px' }}>
              <table className="t compact">
                <thead><tr><th /><th className="r">Mate</th><th className="r">Resign</th><th className="r">Clock</th><th className="r">Median move</th></tr></thead>
                <tbody>
                  <tr><td className="name">Your wins</td><td className="r">{pct(o.wins.mate)}</td><td className="r">{pct(o.wins.resign)}</td><td className="r">{pct(o.wins.time)}</td><td className="r">{o.wins.median_move ?? '–'}</td></tr>
                  <tr><td className="name">Your losses</td><td className="r">{pct(o.losses.mate)}</td><td className="r">{pct(o.losses.resign)}</td><td className="r">{pct(o.losses.time)}</td><td className="r">{o.losses.median_move ?? '–'}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="card-sub" style={{ padding: '10px 20px 4px' }}>Score by time control</div>
            <div className="row" style={{ padding: '4px 20px 16px', gap: 8 }}>
              {TCS.map((tc) => o.by_tc[tc] ? <Chip key={tc}>{tc}<strong style={{ color: 'var(--ink)' }}>{pct(o.by_tc[tc].score)}</strong><span className="muted">{num(o.by_tc[tc].n)}</span></Chip> : null)}
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-head"><h3>Results by rating</h3></div>
          <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
            <table className="t compact">
              <thead><tr><th>Rating</th><th className="r">Games</th><th className="r">Win</th><th className="r">Draw</th><th className="r">Loss</th><th style={{ width: 160 }} /></tr></thead>
              <tbody>{o.bands.map((b) => (
                <tr key={b.band}><td className="name">{b.band}</td><td className="r">{num(b.n)}</td><td className="r">{pct(b.win)}</td><td className="r">{pct(b.draw)}</td><td className="r">{pct(b.loss)}</td><td><WDL w={b.win} d={b.draw} l={b.loss} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        {cands.length > 0 && (
          <section className="card">
            <div className="card-head"><h3>What happens next</h3></div>
            <div className="card-sub">Moves played from the end of the main line, for the player moving.</div>
            <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
              <table className="t compact">
                <thead><tr><th>Move</th><th className="r">Games</th><th style={{ width: 140 }}>W / D / L</th><th className="r">Eval</th><th /></tr></thead>
                <tbody>{cands.slice(0, 8).map(([san, n, w, d, l, med, st]) => (
                  <tr key={san} className="click" onClick={() => window.location.hash = `#/?line=${[...(o.line ?? []), san].join('_')}`}>
                    <td className="name">{san}</td><td className="r">{num(n)}</td><td><WDL w={whiteToMove ? w : l} d={d} l={whiteToMove ? l : w} /></td>
                    <td className="r">{med == null ? '–' : signed(med / 100, 2)}</td><td className="r"><span className={`status ${st}`}>{st === 'outrageous' ? 'blunder' : st}</span></td>
                  </tr>))}</tbody>
              </table>
            </div>
          </section>
        )}

        {gm && (
          <section className="card">
            <div className="card-head"><h3>Played by</h3><Link className="link small" to="/repertoires">GM repertoires</Link></div>
            <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
              <table className="t compact">
                <thead><tr><th>Player</th><th className="r">Games</th><th style={{ width: 140 }}>W / D / L</th><th>Time controls</th></tr></thead>
                <tbody>{gm.gms.slice(0, 10).map((g) => (
                  <tr key={g.id}><td className="name">{g.title && <span className="muted">{g.title} </span>}{g.name}</td><td className="r">{g.n}</td><td><WDL w={g.w} d={g.d} l={g.l} /></td>
                    <td className="small muted">{Object.entries(g.tcs).map(([k, v]) => `${k} ${v}`).join(' · ')}</td></tr>))}</tbody>
              </table>
            </div>
          </section>
        )}

        {kids.length > 0 && (
          <section className="card">
            <div className="card-head"><h3>Variations</h3></div>
            <div style={{ padding: '4px 8px 10px' }}>
              {kids.slice(0, 14).map((k) => (
                <Link key={k.key} to={openingPath(k.key)} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                  <span style={{ fontWeight: 550 }}>{k.key.split(': ').slice(1).join(': ')}</span>
                  <span className="small muted num">{pct(k.score)} · {num(k.n)}</span><Chip tone={toneOf(k.verdict)}>{k.verdict}</Chip>
                </Link>))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
