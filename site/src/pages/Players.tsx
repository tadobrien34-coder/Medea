import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BarChart, ChartCard, LineChart } from '../components/charts/Charts'
import { Chip, Filter, HBars, Loading, Meter, PageHead, Segmented, Stat, WDL } from '../components/ui'
import { useData } from '../lib/data'
import { PIECES, SERIES, TCS, num, pct, secs } from '../lib/format'
import { MOVE_LABELS, rangeLabel } from '../lib/levelsUtil'

export interface PlayerTc {
  rating: number | null; games: number; analysed: number; wdl: [number, number, number]
  time: { avg_per_move: number | null; flag_pct: number | null; flag_ahead: number | null; flag_n: number; opp_flag_pct: number | null; per_move: (number | null)[]; clock_pct: (number | null)[]; score?: number }
  blunder: {
    overall: number | null; mistake: number | null; moves: number
    by_move: { moves: number; blunder: number | null }[]; by_clock_sec: { moves: number; blunder: number | null }[]; by_clock_pct: { moves: number; blunder: number | null }[]; pieces: number[]
  }
  pieces: { you: number[]; opp: number[]; you_cash: number[]; opp_cash: number[] }
  checks_pct: number | null; captures_pct: number | null; white_share: number; win_text: string | null; lose_text: string | null
}
export interface Player { id: string; name: string; title: string | null; tcs: Record<string, PlayerTc> }
export interface PlayersFile { players: Player[]; grades: Record<string, { good: string[]; bad: string[] }> }

const SEC_EDGES = [0, 5, 10, 20, 30, 60, 120, 300, 600, null]
const PCT_EDGES = [0, 5, 10, 20, 40, 60, 80, 100, null]
const lbl = (e: (number | null)[], i: number, u: string) => rangeLabel({ lo: e[i] as number, hi: e[i + 1] }, u)

export default function Players() {
  const { id } = useParams()
  const { data } = useData<PlayersFile>('gm/players.json')
  if (!data) return <><PageHead title="Players & time" /><Loading /></>
  return id ? <PlayerDetail data={data} id={id} /> : <PlayerList data={data} />
}

function PlayerList({ data }: { data: PlayersFile }) {
  const [tc, setTc] = useState<(typeof TCS)[number]>('Blitz')
  const nav = useNavigate()
  const rows = useMemo(() => data.players.filter((p) => p.tcs[tc]).sort((a, b) => (b.tcs[tc].time.score ?? -9) - (a.tcs[tc].time.score ?? -9)), [data, tc])
  const grade = data.grades[tc]
  const by = (id: string) => data.players.find((p) => p.id === id)!
  const tcs = TCS.filter((t) => data.players.some((p) => p.tcs[t]))
  const person = (id: string) => {
    const p = by(id), s = p.tcs[tc]
    return (
      <Link key={id} to={`/players/${id}`} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
        <span style={{ fontWeight: 550 }}>{p.title && <span className="muted">{p.title} </span>}{p.name}</span>
        <span className="small muted num">{secs(s.time.avg_per_move)} / move</span>
        <span className="small num" style={{ fontWeight: 600 }}>{pct(s.time.flag_pct, 1)} flag</span>
      </Link>
    )
  }
  return (
    <>
      <PageHead title="Players & time" sub="How the strongest Lichess players spend their clock: time per move, how often they flag, and how often they blunder. Click a player for the full picture." />
      <div className="filters"><Filter label="Time control"><Segmented value={tc} onChange={setTc} options={tcs.map((t) => ({ value: t, label: t }))} /></Filter></div>
      {grade && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <section className="card"><div className="card-head"><h3>Good with time</h3><Chip tone="good">flag least, outlast opponents</Chip></div><div style={{ padding: '6px 8px 10px' }}>{grade.good.map(person)}</div></section>
          <section className="card"><div className="card-head"><h3>Bad with time</h3><Chip tone="warn">flag most</Chip></div><div style={{ padding: '6px 8px 10px' }}>{grade.bad.map(person)}</div></section>
        </div>
      )}
      <section className="card">
        <div className="card-head"><h3>{tc} players</h3></div>
        <div className="card-sub">Time score blends how rarely a player flags with how often opponents flag against them, relative to this list. Blunder rate uses analysed games only.</div>
        <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
          <table className="t">
            <thead><tr><th>Player</th><th className="r">Rating</th><th className="r">Games</th><th className="r">Time / move</th><th className="r">Flag %</th><th className="r">Flag from +2</th><th className="r">Opponent flags</th><th className="r">Blunder %</th><th style={{ width: 110 }}>Time score</th></tr></thead>
            <tbody>
              {rows.map((p) => { const s = p.tcs[tc]; return (
                <tr key={p.id} className="click" onClick={() => nav(`/players/${p.id}`)}>
                  <td className="name">{p.title && <span className="muted">{p.title} </span>}{p.name}</td>
                  <td className="r">{s.rating ?? '–'}</td><td className="r">{num(s.games)}</td>
                  <td className="r">{secs(s.time.avg_per_move)}</td><td className="r">{pct(s.time.flag_pct, 1)}</td>
                  <td className="r">{s.time.flag_n >= 5 ? pct(s.time.flag_ahead) : '–'}</td><td className="r">{pct(s.time.opp_flag_pct, 1)}</td>
                  <td className="r">{pct(s.blunder.overall, 2)}</td>
                  <td>{s.time.score != null ? <Meter value={Math.max(0, Math.min(1, (s.time.score + 2.5) / 5))} /> : <span className="muted small">–</span>}</td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function PlayerDetail({ data, id }: { data: PlayersFile; id: string }) {
  const p = data.players.find((x) => x.id === id)
  const avail = TCS.filter((t) => p?.tcs[t])
  const [tc, setTc] = useState<(typeof TCS)[number]>(avail[0] ?? 'Blitz')
  if (!p) return <><PageHead title="Player not found" /><Link className="btn" to="/players">Back</Link></>
  const cur = p.tcs[tc] ?? p.tcs[avail[0]]
  const k = Math.min(40, Math.max(...avail.map((t) => p.tcs[t].time.per_move.length)))
  const xs = Array.from({ length: k }, (_, i) => i + 1)
  const colors = Object.fromEntries(TCS.map((t, i) => [t, SERIES[i]]))
  const perMove = avail.map((t) => ({ key: t, name: t, color: colors[t], values: p.tcs[t].time.per_move.slice(0, k) }))
  const clock = avail.map((t) => ({ key: t, name: t, color: colors[t], values: p.tcs[t].time.clock_pct.slice(0, k) }))
  const byMove = avail.map((t) => ({ key: t, name: t, color: colors[t], values: p.tcs[t].blunder.by_move.map((b) => (b.moves >= 60 && b.blunder != null ? b.blunder * 100 : null)) }))
  const legend = avail.map((t) => ({ name: t, color: colors[t] }))
  const bl = cur.blunder
  const secL = bl.by_clock_sec.map((_, i) => lbl(SEC_EDGES, i, 's'))
  const pctL = bl.by_clock_pct.map((_, i) => lbl(PCT_EDGES, i, '%'))
  const you = cur.pieces.you.reduce((a, b) => a + b, 0), opp = cur.pieces.opp.reduce((a, b) => a + b, 0)
  return (
    <>
      <PageHead title={`${p.title ? p.title + ' ' : ''}${p.name}`} sub={<Link className="link" to="/players">← All players</Link>}
        actions={<a className="btn" href={`https://lichess.org/@/${p.name}`} target="_blank" rel="noreferrer">Lichess profile</a>} />
      <div className="stack-lg">
        <div>
          <div className="section-title">Time per move and flagging, by time control</div>
          <div className="grid-4">
            {avail.map((t) => { const s = p.tcs[t]; return (
              <button key={t} className="stat" style={{ textAlign: 'left', cursor: 'pointer', outline: t === tc ? '2px solid var(--accent)' : undefined }} onClick={() => setTc(t)}>
                <div className="label">{t}{s.rating ? ` · ${s.rating}` : ''}</div>
                <div className="value">{secs(s.time.avg_per_move)}<small>/ move</small></div>
                <div className="hint">Flags in {pct(s.time.flag_pct, 1)} of games · {num(s.games)} games</div>
              </button>) })}
          </div>
        </div>

        <div className="grid-2">
          <ChartCard title="Time per move" sub="Seconds spent by move number" legend={legend}
            table={{ head: ['Move', ...avail], rows: xs.map((m, i) => [m, ...perMove.map((s) => (s.values[i] == null ? '–' : s.values[i]!.toFixed(1) + 's'))]) }}>
            <LineChart xs={xs} series={perMove} yMin={0} yFormat={(v) => `${v.toFixed(0)}s`} tipHeader={(x) => `Move ${x}`} height={240} />
          </ChartCard>
          <ChartCard title="Clock left" sub="Share of starting time remaining by move number" legend={legend}
            table={{ head: ['Move', ...avail], rows: xs.map((m, i) => [m, ...clock.map((s) => (s.values[i] == null ? '–' : s.values[i]!.toFixed(0) + '%'))]) }}>
            <LineChart xs={xs} series={clock} yMin={0} yMax={100} yFormat={(v) => `${v.toFixed(0)}%`} tipHeader={(x) => `Move ${x}`} height={240} />
          </ChartCard>
        </div>

        <ChartCard title="Blunder % by move number" sub={`Analysed games only (${num(avail.reduce((a, t) => a + p.tcs[t].analysed, 0))}). Ranges with fewer than 60 moves are hidden.`} legend={legend}
          table={{ head: ['Moves', ...avail], rows: MOVE_LABELS.map((l, i) => [l, ...byMove.map((s) => (s.values[i] == null ? '–' : s.values[i]!.toFixed(2) + '%'))]) }}>
          <LineChart xs={MOVE_LABELS.map((_, i) => i)} series={byMove} xFormat={(i) => MOVE_LABELS[i]} yFormat={(v) => `${v.toFixed(1)}%`} yMin={0} height={250} xTickCount={11} />
        </ChartCard>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{tc} detail</h2>
          <Segmented value={tc} onChange={setTc} options={avail.map((t) => ({ value: t, label: t }))} />
        </div>
        <div className="grid-4">
          <Stat label="Record" value={pct(cur.wdl[0])} hint={<WDL w={cur.wdl[0]} d={cur.wdl[1]} l={cur.wdl[2]} />} />
          <Stat label="Blunder rate" value={pct(bl.overall, 2)} hint={`${num(bl.moves)} analysed moves · mistakes ${pct(bl.mistake, 2)}`} />
          <Stat label="Checks" value={pct(cur.checks_pct, 1)} hint="of their moves" />
          <Stat label="Captures" value={pct(cur.captures_pct, 1)} hint={`plays White in ${pct(cur.white_share)} of games`} />
        </div>
        <div className="grid-2">
          <ChartCard title="Blunder % by time left" sub="Seconds on the clock at the start of the move" table={{ head: ['Time left', 'Moves', 'Blunder %'], rows: secL.map((l, i) => [l, bl.by_clock_sec[i].moves, bl.by_clock_sec[i].blunder == null ? '–' : (bl.by_clock_sec[i].blunder! * 100).toFixed(2) + '%']) }}>
            <BarChart items={secL.map((l, i) => ({ label: l, value: bl.by_clock_sec[i].moves >= 60 && bl.by_clock_sec[i].blunder != null ? bl.by_clock_sec[i].blunder! * 100 : null, note: `${bl.by_clock_sec[i].moves} moves` }))} yFormat={(v) => `${v.toFixed(1)}%`} height={200} tipLabel="Blunder rate" color="var(--s2)" />
          </ChartCard>
          <ChartCard title="Blunder % by share of clock left" sub="Percent of starting time remaining" table={{ head: ['Clock left', 'Moves', 'Blunder %'], rows: pctL.map((l, i) => [l, bl.by_clock_pct[i].moves, bl.by_clock_pct[i].blunder == null ? '–' : (bl.by_clock_pct[i].blunder! * 100).toFixed(2) + '%']) }}>
            <BarChart items={pctL.map((l, i) => ({ label: l, value: bl.by_clock_pct[i].moves >= 60 && bl.by_clock_pct[i].blunder != null ? bl.by_clock_pct[i].blunder! * 100 : null, note: `${bl.by_clock_pct[i].moves} moves` }))} yFormat={(v) => `${v.toFixed(1)}%`} height={200} tipLabel="Blunder rate" color="var(--s2)" />
          </ChartCard>
        </div>
        <div className="grid-2">
          <section className="card"><div className="card-head"><h3>Gives the lead away with</h3></div><div className="card-sub">Running count of the piece moved when {p.name} lost the advantage</div>
            <HBars labels={[...PIECES]} values={cur.pieces.you} total={you} color="var(--s2)" fmt={(v) => `${((100 * v) / (you || 1)).toFixed(0)}% · ${v}`} /></section>
          <section className="card"><div className="card-head"><h3>Opponents give it away with</h3></div><div className="card-sub">Pieces opponents moved when they lost the advantage against {p.name}</div>
            <HBars labels={[...PIECES]} values={cur.pieces.opp} total={opp} color="var(--s3)" fmt={(v) => `${((100 * v) / (opp || 1)).toFixed(0)}% · ${v}`} /></section>
        </div>
        {(cur.win_text || cur.lose_text) && (
          <section className="card card-pad"><ul className="bullets">{cur.win_text && <li><strong>Wins.</strong> {cur.win_text}</li>}{cur.lose_text && <li><strong>Losses.</strong> {cur.lose_text}</li>}</ul></section>
        )}
      </div>
    </>
  )
}
