import { Chess } from 'chess.js'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChartCard, LineChart } from '../components/charts/Charts'
import HoverBoard from '../components/HoverBoard'
import Icon from '../components/Icon'
import OpeningExplorer, { GmGame } from '../components/OpeningExplorer'
import VariationCompare from '../components/VariationCompare'
import WrongPanel from '../components/WrongPanel'
import { Chip, HBars, Loading, PageHead, Segmented, Stat, WDL } from '../components/ui'
import { posKey } from '../lib/book'
import { useData } from '../lib/data'
import { BAND_LABELS, PIECES, TCS, lichessAnalysis, moveLabel, num, openingPath, pct, signed } from '../lib/format'
import type { GmOpeningsFile, OpeningDetailFile, OpeningsFile, TreeFile } from '../lib/types'
import { objLabel, playLabel, toneOf } from './Openings'

type Band = 'all' | '0' | '1' | '2' | '3' | '4'

export default function OpeningDetail() {
  const { level, slug } = useParams()
  const [sp] = useSearchParams()
  const { data: o, error } = useData<OpeningDetailFile>(`openings/${level}-${slug}.json`)
  const tree = useData<TreeFile>('tree.json').data
  const gms = useData<GmOpeningsFile>('gm/openings.json').data
  const gmGames = useData<Record<string, GmGame[]>>('gm/games.json').data
  const index = useData<OpeningsFile>('openings.json').data
  const [mode, setMode] = useState<'move' | 'ply'>('move')
  const [band, setBand] = useState<Band>('all')

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
        <PageHead title={nm ?? 'Opening not found'} sub="Fewer than 100 analysed games, so no full page yet." />
        {g && (
          <section className="card">
            <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
              <table className="t compact">
                <thead><tr><th>Player</th><th className="r">Games</th><th style={{ width: 150 }}>W / D / L</th><th>Time controls</th></tr></thead>
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
  const picks = t.med.map((_, i) => i).filter((i) => mode === 'ply' || i % 2 === 1)
  const xs = picks.map((i) => (mode === 'ply' ? i + 1 : (i + 1) / 2))
  const med = picks.map((i) => t.med[i])
  const bandSeries = { lo: picks.map((i) => clamp(t.med[i] - t.sd[i])), hi: picks.map((i) => clamp(t.med[i] + t.sd[i])) }
  const cands = tree && lineFen ? (tree.nodes[posKey(lineFen)] ?? []) : []
  const whiteToMove = lineFen ? lineFen.split(' ')[1] === 'w' : true
  const gm = gms?.[o.key]
  const cTot = o.careful.reduce((a, b) => a + b, 0), tTot = o.target.reduce((a, b) => a + b, 0)
  const fmt = (tot: number) => (v: number) => `${((100 * v) / (tot || 1)).toFixed(0)}% · ${num(v)}`
  const kids = (o.children ?? []).map((k) => index?.openings.find((x) => x.key === k)).filter(Boolean) as OpeningsFile['openings']

  // numbers for the chosen rating band
  const bi = band === 'all' ? null : +band
  const bd = bi == null ? null : o.bands.find((b) => b.band === BAND_LABELS[bi]) ?? null
  const n = bd ? bd.n : o.n
  const wdl: [number, number, number] = bd ? [bd.win, bd.draw, bd.loss] : o.wdl
  const score = bd ? bd.win + 0.5 * bd.draw : o.score
  const ev = bi != null && o.band_obj?.[bi] != null ? o.band_obj[bi]! : o.obj
  const rated = (['all', '0', '1', '2', '3', '4'] as Band[]).filter((b) => b === 'all' || o.bands.some((x) => x.band === BAND_LABELS[+b]))

  return (
    <>
      <PageHead
        title={o.key}
        sub={<span className="row" style={{ gap: 8 }}><Chip>{o.eco}</Chip><Chip><i className={`dot ${o.side === 0 ? 'w' : 'b'}`} />{sideName}’s {o.side === 0 ? 'opening' : 'defence'}</Chip>
          <Chip tone={toneOf(o.verdict)}>{o.verdict}</Chip><span className="small muted">{objLabel[o.tier_obj]} on the engine · {playLabel[o.tier_play].toLowerCase()} playability{o.n < 300 ? ' · limited sample' : ''}</span></span>}
        actions={lineFen ? <a className="btn" href={lichessAnalysis(lineFen)} target="_blank" rel="noreferrer">Lichess<Icon name="external" /></a> : undefined}
      />

      <div className="stack-lg">
        <div className="opening-top">
          {o.line && <OpeningExplorer line={o.line} side={o.side} heat={o.heat} tree={tree} gm={gmGames?.[o.key] ?? []} initialGm={sp.get('game')} />}
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="section-title" style={{ margin: 0 }}>Rating</span>
              <Segmented value={band} onChange={setBand} label="Rating band" options={rated.map((b) => ({ value: b, label: b === 'all' ? 'All' : BAND_LABELS[+b] }))} />
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <Stat label={`Score for ${sideName}`} value={pct(score)} hint={<WDL w={wdl[0]} d={wdl[1]} l={wdl[2]} />} />
              <Stat label="Median eval, moves 5–8" value={signed(ev, 2)} hint={bi == null ? `${signed(o.rel_obj, 2)} vs average` : 'at this rating'} />
              <Stat label="Games" value={num(n)} hint={`${o.shifts_per_game.toFixed(1)} lead swings per game`} />
              <Stat label="Spread at move 15" value={o.sd30 != null ? `±${o.sd30.toFixed(1)}` : '–'} hint="standard deviation of the eval" />
              <Stat label="Steady edge (+1.0)" value={o.edge.move ? `Move ${o.edge.move}` : '–'} hint={`${pct(o.edge.share)} of games`} />
              <Stat label="Winning (+6.0)" value={o.win.move ? `Move ${o.win.move}` : '–'} hint={`${pct(o.win.share)} of games`} />
            </div>
            <section className="card">
              <div className="table-wrap" style={{ padding: '6px 8px 8px' }}>
                <table className="t compact">
                  <thead><tr><th>Rating</th><th className="r">Games</th><th style={{ width: 170 }}>W / D / L</th><th className="r">Eval</th></tr></thead>
                  <tbody>{o.bands.map((b) => {
                    const bidx = BAND_LABELS.indexOf(b.band)
                    return (
                      <tr key={b.band} className="click" onClick={() => setBand(String(bidx) as Band)}>
                        <td className="name">{b.band}</td><td className="r">{num(b.n)}</td><td><WDL w={b.win} d={b.draw} l={b.loss} /></td>
                        <td className="r">{o.band_obj?.[bidx] != null ? signed(o.band_obj[bidx]!, 2) : '–'}</td>
                      </tr>)
                  })}</tbody>
                </table>
              </div>
            </section>
            <div className="grid-2" style={{ gap: 12 }}>
              <Stat label="Your wins end" value={`${pct(o.wins.resign)} resign`} hint={`${pct(o.wins.mate)} mate · ${pct(o.wins.time)} clock · move ${o.wins.median_move ?? '–'}`} />
              <Stat label="Your losses end" value={`${pct(o.losses.resign)} resign`} hint={`${pct(o.losses.mate)} mate · ${pct(o.losses.time)} clock · move ${o.losses.median_move ?? '–'}`} />
            </div>
          </div>
        </div>

        <ChartCard
          title={`Advantage for ${sideName}, every move`}
          sub="Median engine evaluation, band = one standard deviation (clipped at ±6)"
          legend={[{ name: 'Median', color: 'var(--s1)' }, { name: '± 1 SD', color: 'var(--s1)', kind: 'sq' }]}
          actions={<Segmented value={mode} onChange={setMode} options={[{ value: 'move', label: 'Per move' }, { value: 'ply', label: 'Per ply' }]} label="Resolution" />}
          table={{ head: ['Move', 'Median', 'Std dev', 'Games'], rows: picks.map((i) => [mode === 'ply' ? `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} (ply ${i + 1})` : `Move ${(i + 1) / 2}`, signed(t.med[i], 2), `±${t.sd[i].toFixed(2)}`, num(t.n[i])]) }}
        >
          <LineChart xs={xs} series={[{ key: 'm', name: 'Median', color: 'var(--s1)', values: med, band: bandSeries }]} zeroLine height={270} yMin={-6} yMax={6}
            xFormat={(x) => String(mode === 'ply' ? Math.ceil(x / 2) : x)} tipHeader={(x) => (mode === 'ply' ? `Move ${moveLabel(x)}` : `After move ${x}`)}
            yFormat={(v) => signed(v, 1)} xTickCount={9} />
        </ChartCard>

        <WrongPanel o={o} />

        <div className="grid-2">
          <section className="card">
            <div className="card-head"><h3>Your lead slips with</h3><span className="small muted">{o.careful_moves ? `moves ${o.careful_moves[0]}–${o.careful_moves[1]}` : ''}</span></div>
            <HBars labels={[...PIECES]} values={o.careful} fmt={fmt(cTot)} color="var(--s2)" marks={o.careful_lift} />
          </section>
          <section className="card">
            <div className="card-head"><h3>Their lead slips with</h3><span className="small muted">{o.target_moves ? `moves ${o.target_moves[0]}–${o.target_moves[1]}` : ''}</span></div>
            <HBars labels={[...PIECES]} values={o.target} fmt={fmt(tTot)} color="var(--s3)" marks={o.target_lift} />
          </section>
        </div>

        <div className="grid-2">
          <section className="card">
            <div className="card-head"><h3>Signature tactics</h3><span className="small muted">vs an average game</span></div>
            <div className="table-wrap" style={{ padding: '4px 8px 10px' }}>
              <table className="t compact">
                <tbody>
                  {o.signature.yours.map((s) => <tr key={'y' + s.id}><td><Chip tone="good">You</Chip></td><td className="name"><Link to="/tactics" className="link" style={{ color: 'var(--ink)' }}>{s.name}</Link></td><td className="r">{s.lift.toFixed(1)}×</td><td className="r muted">{s.per100.toFixed(1)}/100</td></tr>)}
                  {o.signature.theirs.map((s) => <tr key={'t' + s.id}><td><Chip tone="bad">Them</Chip></td><td className="name"><Link to="/tactics" className="link" style={{ color: 'var(--ink)' }}>{s.name}</Link></td><td className="r">{s.lift.toFixed(1)}×</td><td className="r muted">{s.per100.toFixed(1)}/100</td></tr>)}
                  {!o.signature.yours.length && !o.signature.theirs.length && <tr><td className="muted">No standout tactic.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Score by time control</h3></div>
            <div className="row" style={{ padding: '10px 20px 18px', gap: 8 }}>
              {TCS.map((tc) => o.by_tc[tc] ? <Chip key={tc}>{tc}<strong style={{ color: 'var(--ink)' }}>{pct(o.by_tc[tc].score)}</strong><span className="muted">{num(o.by_tc[tc].n)}</span></Chip> : null)}
            </div>
          </section>
        </div>

        {kids.length > 0 && <VariationCompare items={kids} baseScore={o.score} family={o.key} familySide={o.side} />}

        {cands.length > 0 && (
          <section className="card">
            <div className="card-head"><h3>What happens next</h3><span className="small muted">for the player moving</span></div>
            <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
              <table className="t compact">
                <thead><tr><th>Move</th><th className="r">Games</th><th style={{ width: 170 }}>W / D / L</th><th className="r">Eval (W)</th><th /></tr></thead>
                <tbody>{cands.slice(0, 8).map(([san, nn, w, d, l, m, st]) => (
                  <tr key={san} className="click" onClick={() => { window.location.hash = `#/?line=${[...(o.line ?? []), san].join('_')}` }}>
                    <td className="name">{san}</td><td className="r">{num(nn)}</td><td><WDL w={whiteToMove ? w : l} d={d} l={whiteToMove ? l : w} /></td>
                    <td className="r">{m == null ? '–' : signed(m / 100, 2)}</td><td className="r"><span className={`status ${st}`}>{st === 'outrageous' ? 'blunder' : st}</span></td>
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
                <thead><tr><th>Player</th><th className="r">Games</th><th style={{ width: 170 }}>W / D / L</th><th>Time controls</th></tr></thead>
                <tbody>{gm.gms.slice(0, 8).map((g) => (
                  <tr key={g.id}><td className="name">{g.title && <span className="muted">{g.title} </span>}{g.name}</td><td className="r">{g.n}</td><td><WDL w={g.w} d={g.d} l={g.l} /></td>
                    <td className="small muted">{Object.entries(g.tcs).map(([k, v]) => `${k} ${v}`).join(' · ')}</td></tr>))}</tbody>
              </table>
            </div>
          </section>
        )}

        {(o.tips?.length ?? 0) > 0 && (
          <section className="card card-pad">
            <div className="section-title">Key tips</div>
            <ol className="tips">{o.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ol>
          </section>
        )}

        {(o.similar?.length ?? 0) > 0 && (
          <section className="card">
            <div className="card-head"><h3>Similar openings</h3><span className="small muted">same colour, similar pawns or targets</span></div>
            <div style={{ padding: '4px 8px 10px' }}>
              {o.similar.map((s) => (
                <Link key={s.key} to={openingPath(s.key)} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                  <HoverBoard line={s.line} flipped={o.side === 1} title={s.key} caption={s.why}>
                    <span><span style={{ fontWeight: 550 }}>{s.key}</span><span className="small muted" style={{ display: 'block' }}>{s.why}</span></span>
                  </HoverBoard>
                  <span className="small muted num">{pct(s.score)} · {num(s.n)}</span><Chip tone={toneOf(s.verdict)}>{s.verdict}</Chip>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="card card-pad">
          <div className="section-title">Summary</div>
          <ul className="bullets">{o.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {o.plan && <p className="small ink2" style={{ marginTop: 12 }}>{o.plan}</p>}
        </section>
      </div>
    </>
  )
}
