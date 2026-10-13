import { useEffect, useMemo, useState } from 'react'
import { BarChart, ChartCard, LineChart } from '../components/charts/Charts'
import { Filter, HBars, Loading, PageHead, Segmented, Stat, WDL } from '../components/ui'
import { useData } from '../lib/data'
import { PIECES, SERIES, TCS, num, pct, seqColor, secs } from '../lib/format'
import { MOVE_LABELS, SHIFT_LABELS, defaultSelection, rangeLabel } from '../lib/levelsUtil'
import type { LevelEntry, LevelsFile } from '../lib/types'

type Tab = 'overview' | 'blunders' | 'time'
type TcSel = 'All' | (typeof TCS)[number]
const SIZES = ['100', '200', '400', '600', '800']

const METRICS = {
  end: { label: 'Game ends', unit: 'move', get: (e: LevelEntry) => e.end.mean, fmt: (v: number) => v.toFixed(1) },
  shifts: { label: 'Advantage shifts', unit: 'per game', get: (e: LevelEntry) => e.shifts.mean, fmt: (v: number) => v.toFixed(2) },
  final: { label: 'Final shift', unit: 'move', get: (e: LevelEntry) => e.final_shift.median, fmt: (v: number) => v.toFixed(0) },
  checks: { label: 'Checks', unit: 'per game', get: (e: LevelEntry) => e.checks.white + e.checks.black, fmt: (v: number) => v.toFixed(1) },
  captures: { label: 'Captures', unit: 'per game', get: (e: LevelEntry) => e.captures.white + e.captures.black, fmt: (v: number) => v.toFixed(1) },
} as const
type MetricKey = keyof typeof METRICS

export default function Levels() {
  const [tab, setTab] = useState<Tab>('overview')
  const [tc, setTc] = useState<TcSel>('All')
  const [size, setSize] = useState('400')
  const [selected, setSelected] = useState(0)
  const [plot, setPlot] = useState<number[]>([])
  const { data, loading } = useData<LevelsFile>(`levels_${tc.toLowerCase()}.json`)
  const entries = data?.[size] ?? []

  // reset selections when the grouping changes
  const sig = `${tc}|${size}|${entries.length}|${entries.filter((e) => !e.thin).length}`
  useEffect(() => {
    if (!entries.length) return
    const def = defaultSelection(entries)
    setPlot(def)
    setSelected(def.length ? def[Math.floor(def.length / 2)] : 0)
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = entries[selected]
  return (
    <>
      <PageHead
        title="Levels"
        sub="How games are won and lost at every rating. Built from Lichess games that carry engine analysis, grouped by the average rating of both players."
      />
      <div className="filters">
        <Filter label="Group size"><Segmented value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s, label: s }))} label="Rating group size" /></Filter>
        <Filter label="Time control"><Segmented value={tc} onChange={(v) => setTc(v as TcSel)} options={(['All', ...TCS] as TcSel[]).map((t) => ({ value: t, label: t }))} label="Time control" /></Filter>
        <Filter label="View"><Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'blunders', label: 'Blunders' }, { value: 'time', label: 'Time' }]} label="View" /></Filter>
      </div>
      {!data ? <Loading /> : (
        <div className={loading ? 'fade' : ''}>
          {tab !== 'overview' && <Picker entries={entries} plot={plot} setPlot={setPlot} />}
          {tab === 'overview' && <Overview entries={entries} selected={selected} setSelected={setSelected} sel={sel} />}
          {tab === 'blunders' && <Blunders entries={entries} plot={plot} sel={sel} selected={selected} setSelected={setSelected} />}
          {tab === 'time' && <TimeTab entries={entries} plot={plot} size={size} tc={tc} />}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------------- shared */
function Picker({ entries, plot, setPlot }: { entries: LevelEntry[]; plot: number[]; setPlot: (p: number[]) => void }) {
  return (
    <div className="row" style={{ marginBottom: 16, gap: 6 }}>
      <span className="small muted" style={{ marginRight: 6 }}>Plot</span>
      {entries.map((e, i) => (
        <button key={e.label} className="chip" aria-pressed={plot.includes(i)} disabled={e.thin}
          style={{ opacity: e.thin ? 0.4 : 1 }}
          onClick={() => setPlot(plot.includes(i) ? plot.filter((x) => x !== i) : [...plot, i].sort((a, b) => a - b).slice(-7))}>
          {plot.includes(i) && <i className="dot" style={{ background: seqColor(plot.indexOf(i), plot.length), width: 8, height: 8 }} />}
          {e.label}
        </button>
      ))}
    </div>
  )
}

function seriesFor(entries: LevelEntry[], plot: number[], pick: (e: LevelEntry) => (number | null)[]) {
  return plot.filter((i) => entries[i] && !entries[i].thin).map((i, k, arr) => ({
    key: entries[i].label, name: entries[i].label, color: seqColor(k, arr.length), values: pick(entries[i]),
  }))
}

/* ------------------------------------------------------------------------- overview */
function Overview({ entries, selected, setSelected, sel }: { entries: LevelEntry[]; selected: number; setSelected: (i: number) => void; sel?: LevelEntry }) {
  const [metric, setMetric] = useState<MetricKey>('end')
  const M = METRICS[metric]
  const items = entries.map((e) => ({ label: e.label, value: e.thin ? null : M.get(e), note: `${num(e.n)} games` }))
  return (
    <div className="stack-lg">
      <ChartCard
        title={`${M.label} by rating`}
        sub={`Average ${M.unit === 'move' ? 'move number' : M.unit}. Click a bar to see that group in detail.`}
        actions={<Segmented value={metric} onChange={setMetric} options={(Object.keys(METRICS) as MetricKey[]).map((k) => ({ value: k, label: METRICS[k].label }))} label="Metric" />}
        table={{ head: ['Rating', 'Games', M.label], rows: entries.map((e) => [e.label, num(e.n), e.thin ? '–' : M.fmt(M.get(e) ?? 0)]) }}
      >
        <BarChart items={items} yFormat={(v) => M.fmt(v)} highlight={selected} onSelect={setSelected} tipLabel={M.label} />
      </ChartCard>

      <section className="card">
        <div className="card-head"><h3>All groups</h3></div>
        <div className="card-sub">Move numbers are full moves. A shift is when the better side changes (±1.0 or more). Click a row for detail.</div>
        <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
          <table className="t compact">
            <thead><tr>
              <th>Rating</th><th className="r">Games</th><th className="r">Ends (avg)</th><th className="r">Shifts / game</th><th className="r">No shift</th>
              <th className="r">Final shift</th><th className="r">Checks W / B</th><th className="r">% moves check</th><th className="r">Captures W / B</th><th style={{ width: 110 }}>White / draw / Black</th>
            </tr></thead>
            <tbody>
              {entries.map((e, i) => e.thin ? (
                <tr key={e.label}><td className="name">{e.label}</td><td className="r muted">{num(e.n)}</td><td colSpan={8} className="muted small">Not enough analysed games yet</td></tr>
              ) : (
                <tr key={e.label} className={`click ${i === selected ? 'sel' : ''}`} onClick={() => setSelected(i)}>
                  <td className="name">{e.label}</td><td className="r">{num(e.n)}{e.n < 300 && <span className="chip warn" style={{ marginLeft: 6, padding: '0 6px', fontSize: 11 }} title="Fewer than 300 analysed games: read with caution">few</span>}</td>
                  <td className="r">{e.end.mean.toFixed(1)}</td><td className="r">{e.shifts.mean.toFixed(2)}</td><td className="r">{pct(e.shifts.zero)}</td>
                  <td className="r">{e.final_shift.median ?? '–'}</td>
                  <td className="r">{e.checks.white.toFixed(1)} / {e.checks.black.toFixed(1)}</td><td className="r">{pct(e.checks.pct_all, 1)}</td>
                  <td className="r">{e.captures.white.toFixed(1)} / {e.captures.black.toFixed(1)}</td>
                  <td><WDL w={e.result.white} d={e.result.draw} l={e.result.black} title={`White ${pct(e.result.white)} · draw ${pct(e.result.draw)} · Black ${pct(e.result.black)}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {sel && !sel.thin && <Detail e={sel} />}
    </div>
  )
}

function Detail({ e }: { e: LevelEntry }) {
  const phases = ['Moves 1–10', 'Moves 11–30', 'Moves 31+']
  const bt = e.pieces.blunder.reduce((a, b) => a + b, 0) || 1
  const pt = e.pieces.punish.reduce((a, b) => a + b, 0) || 1
  const fmtB = (v: number) => `${((100 * v) / bt).toFixed(0)}% · ${num(v)}`
  const fmtP = (v: number) => `${((100 * v) / pt).toFixed(0)}% · ${num(v)}`
  return (
    <div className="stack-lg">
      <div>
        <h2>Rating {e.label} <span className="muted" style={{ fontWeight: 450, fontSize: 14 }}>· {num(e.n)} games</span></h2>
      </div>
      <div className="grid-4">
        <Stat label="Game ends" value={`Move ${e.end.median}`} hint={`Middle half: ${e.end.p25}–${e.end.p75} · mate ${pct(e.end.by.mate.share)}, resign ${pct(e.end.by.resign.share)}, clock ${pct(e.end.by.time.share)}`} />
        <Stat label="Advantage shifts" value={e.shifts.mean.toFixed(2)} unit="per game" hint={`${pct(e.shifts.zero)} of games never change hands`} />
        <Stat label="Final shift" value={e.final_shift.median != null ? `Move ${e.final_shift.median}` : '–'} hint={`Middle half: ${e.final_shift.p25 ?? '–'}–${e.final_shift.p75 ?? '–'}`} />
        <Stat label="Point of no return" value={e.ponr.median != null ? `Move ${e.ponr.median}` : '–'} hint="Winner is ≥ +1.0 from here to the end" />
      </div>
      <div className="grid-3">
        <ChartCard title="When games end" sub="Share of games by move range" table={{ head: ['Moves', 'Games'], rows: MOVE_LABELS.map((l, i) => [l, e.end.hist[i]]) }}>
          <BarChart items={MOVE_LABELS.map((l, i) => ({ label: l, value: e.end.hist[i] }))} yFormat={(v) => num(v)} height={190} tipLabel="Games" />
        </ChartCard>
        <ChartCard title="Shifts per game" sub="How often the advantage changes hands" table={{ head: ['Shifts', 'Share'], rows: SHIFT_LABELS.map((l, i) => [l, pct(e.shifts.hist[i], 1)]) }}>
          <BarChart items={SHIFT_LABELS.map((l, i) => ({ label: l, value: e.shifts.hist[i] }))} yFormat={(v) => pct(v)} height={190} tipLabel="Games" />
        </ChartCard>
        <ChartCard title="Move of the final shift" sub={`Games with at least one shift (${num(e.final_shift.n)})`} table={{ head: ['Moves', 'Games'], rows: MOVE_LABELS.map((l, i) => [l, e.final_shift.hist[i]]) }}>
          <BarChart items={MOVE_LABELS.map((l, i) => ({ label: l, value: e.final_shift.hist[i] }))} yFormat={(v) => num(v)} height={190} tipLabel="Games" color="var(--s2)" />
        </ChartCard>
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Piece moved when the lead was thrown away</h3></div>
          <div className="card-sub">Running count of the move that changed who is better, and the reply that cashed in.</div>
          <div className="section-title" style={{ padding: '12px 20px 0', margin: 0 }}>Gave it away with</div>
          <HBars labels={[...PIECES]} values={e.pieces.blunder} total={bt} fmt={fmtB} color="var(--s2)" />
          <div className="section-title" style={{ padding: '0 20px', margin: 0 }}>Cashed in with</div>
          <HBars labels={[...PIECES]} values={e.pieces.punish} total={pt} fmt={fmtP} color="var(--s3)" />
        </section>
        <section className="card">
          <div className="card-head"><h3>Checks and captures</h3></div>
          <div className="card-sub">Per game, and as a share of that side’s moves.</div>
          <div className="table-wrap" style={{ padding: '8px 8px 4px' }}>
            <table className="t compact">
              <thead><tr><th /><th className="r">White</th><th className="r">Black</th><th className="r">Winner</th><th className="r">Loser</th></tr></thead>
              <tbody>
                <tr><td className="name">Checks / game</td><td className="r">{e.checks.white.toFixed(2)}</td><td className="r">{e.checks.black.toFixed(2)}</td><td className="r">{e.checks.winner.toFixed(2)}</td><td className="r">{e.checks.loser.toFixed(2)}</td></tr>
                <tr><td className="name">% of moves</td><td className="r">{pct(e.checks.pct_white, 1)}</td><td className="r">{pct(e.checks.pct_black, 1)}</td><td className="r">{pct(e.checks.pct_winner, 1)}</td><td className="r">{pct(e.checks.pct_loser, 1)}</td></tr>
                <tr><td className="name">Captures / game</td><td className="r">{e.captures.white.toFixed(2)}</td><td className="r">{e.captures.black.toFixed(2)}</td><td className="r">{e.captures.winner.toFixed(2)}</td><td className="r">{e.captures.loser.toFixed(2)}</td></tr>
                <tr><td className="name">% of moves</td><td className="r">{pct(e.captures.pct_all, 1)}</td><td className="r">{pct(e.captures.pct_all, 1)}</td><td className="r">{pct(e.captures.pct_winner, 1)}</td><td className="r">{pct(e.captures.pct_loser, 1)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="note" style={{ margin: '8px 20px 16px' }}>
            Winners check {(e.checks.pct_winner / Math.max(e.checks.pct_loser, 1e-9)).toFixed(1)}× as often as losers and capture {(e.captures.pct_winner / Math.max(e.captures.pct_loser, 1e-9)).toFixed(2)}× as often.
          </div>
          <div className="section-title" style={{ padding: '4px 20px 0' }}>By phase: piece moved when the lead was thrown away</div>
          <div className="table-wrap" style={{ padding: '0 8px 12px' }}>
            <table className="t compact">
              <thead><tr><th />{PIECES.map((p) => <th key={p} className="r">{p}</th>)}</tr></thead>
              <tbody>{e.pieces.by_phase.map((row, i) => {
                const t = row.reduce((a, b) => a + b, 0) || 1
                return <tr key={i}><td className="name">{phases[i]}</td>{row.map((v, j) => <td key={j} className="r">{((100 * v) / t).toFixed(0)}%</td>)}</tr>
              })}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- blunders */
function Blunders({ entries, plot, sel, selected, setSelected }: { entries: LevelEntry[]; plot: number[]; sel?: LevelEntry; selected: number; setSelected: (i: number) => void }) {
  const [kind, setKind] = useState<'blunder' | 'mistake'>('blunder')
  const first = entries.find((e) => !e.thin)
  // bins with fewer than 300 moves are too noisy to plot
  const ser = (pick: (e: LevelEntry) => { moves: number; blunder: number | null; mistake: number | null }[]) =>
    seriesFor(entries, plot, (e) => pick(e).map((b) => (b[kind] == null || b.moves < 300 ? null : b[kind]! * 100)))
  const byMove = ser((e) => e.blunder.by_move)
  const bySec = ser((e) => e.blunder.by_clock_sec)
  const byPct = ser((e) => e.blunder.by_clock_pct)
  const lbl = kind === 'blunder' ? 'Blunder %' : 'Mistake %'
  const mk = (series: ReturnType<typeof ser>, labels: string[]) => ({
    head: ['Range', ...series.map((s) => s.name)],
    rows: labels.map((l, i) => [l, ...series.map((s) => (s.values[i] == null ? '–' : `${s.values[i]!.toFixed(2)}%`))]),
  })
  const mvLabels = MOVE_LABELS
  const secLabels = first ? first.blunder.by_clock_sec.map((b) => rangeLabel(b, 's')) : []
  const pctLabels = first ? first.blunder.by_clock_pct.map((b) => rangeLabel(b, '%')) : []
  const legend = byMove.map((s) => ({ name: s.name, color: s.color }))
  const xs = (n: number) => Array.from({ length: n }, (_, i) => i)
  const pieceRates = sel && !sel.thin ? sel.pieces.blunder_all.map((v, i) => v / Math.max(1, sel.pieces.moves[i])) : []
  return (
    <div className="stack-lg">
      <div className="row"><Segmented value={kind} onChange={setKind} options={[{ value: 'blunder', label: 'Blunders' }, { value: 'mistake', label: 'Mistakes' }]} label="Error type" />
        <span className="small muted">A blunder gives up at least 30 points of win chance, a mistake 20–30 (Lichess’s thresholds).</span></div>
      <ChartCard title={`${lbl} by move number`} sub="Share of a player’s moves that were errors, by the move number of the game" legend={legend} table={mk(byMove, mvLabels)}>
        <LineChart xs={xs(mvLabels.length)} series={byMove} xFormat={(i) => mvLabels[i]} yFormat={(v) => `${v.toFixed(1)}%`} yMin={0} height={270} xTickCount={11} />
      </ChartCard>
      <div className="grid-2">
        <ChartCard title={`${lbl} by time left`} sub="Seconds on your clock when you started the move" legend={legend} table={mk(bySec, secLabels)}>
          <LineChart xs={xs(secLabels.length)} series={bySec} xFormat={(i) => secLabels[i]} yFormat={(v) => `${v.toFixed(1)}%`} yMin={0} height={250} xTickCount={5} />
        </ChartCard>
        <ChartCard title={`${lbl} by share of clock left`} sub="Percent of your starting time still on the clock" legend={legend} table={mk(byPct, pctLabels)}>
          <LineChart xs={xs(pctLabels.length)} series={byPct} xFormat={(i) => pctLabels[i]} yFormat={(v) => `${v.toFixed(1)}%`} yMin={0} height={250} xTickCount={5} />
        </ChartCard>
      </div>
      {sel && !sel.thin && (
        <section className="card">
          <div className="card-head"><h3>Blunders by piece</h3>
            <Segmented value={String(selected)} onChange={(v) => setSelected(Number(v))} options={plot.map((i) => ({ value: String(i), label: entries[i]?.label }))} label="Group" />
          </div>
          <div className="card-sub">Rating {sel.label}. Left: what the blunders were made with. Right: how often each piece’s moves are blunders.</div>
          <div className="grid-2" style={{ gap: 0 }}>
            <div><div className="section-title" style={{ padding: '12px 20px 0', margin: 0 }}>Share of all blunders</div>
              <HBars labels={[...PIECES]} values={sel.pieces.blunder_all} color="var(--s2)"
                fmt={(v) => `${((100 * v) / (sel.pieces.blunder_all.reduce((a, b) => a + b, 0) || 1)).toFixed(0)}% · ${num(v)}`} /></div>
            <div><div className="section-title" style={{ padding: '12px 20px 0', margin: 0 }}>Blunder rate per move of that piece</div>
              <HBars labels={[...PIECES]} values={pieceRates} color="var(--s7)" fmt={(v) => `${(v * 100).toFixed(1)}%`} /></div>
          </div>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------- time */
function TimeTab({ entries, plot, size, tc }: { entries: LevelEntry[]; plot: number[]; size: string; tc: TcSel }) {
  const bullet = useData<LevelsFile>('levels_bullet.json').data
  const blitz = useData<LevelsFile>('levels_blitz.json').data
  const rapid = useData<LevelsFile>('levels_rapid.json').data
  const classical = useData<LevelsFile>('levels_classical.json').data
  const perMove = seriesFor(entries, plot, (e) => e.time.per_move_by_move)
  const cap = Math.min(60, Math.max(0, ...perMove.map((s) => s.values.length)))
  const trim = <T extends { values: (number | null)[] }>(arr: T[]) => arr.map((s) => ({ ...s, values: s.values.slice(0, cap) }))
  const clock = seriesFor(entries, plot, (e) => e.time.clock_pct_by_move)
  const xs = Array.from({ length: cap }, (_, i) => i + 1)
  const legend = perMove.map((s) => ({ name: s.name, color: s.color }))
  const byTc = [['Bullet', bullet], ['Blitz', blitz], ['Rapid', rapid], ['Classical', classical]] as const
  const tcSeries = byTc.map(([name, f], k) => ({
    key: name, name, color: SERIES[k],
    values: (f?.[size] ?? []).map((e) => (e.thin ? null : e.time.avg_per_move)),
  }))
  const tcLabels = (byTc[1][1]?.[size] ?? entries).map((e) => e.label)
  const flagItems = entries.map((e) => ({ label: e.label, value: e.thin || e.time.flag_pct == null ? null : e.time.flag_pct * 100, note: `${pct(e.time.flag_while_ahead2)} of flags were from a +2 position` }))
  return (
    <div className="stack-lg">
      <div className="grid-2">
        <ChartCard title="Time per move" sub="Average seconds spent, by move number" legend={legend}
          table={{ head: ['Move', ...perMove.map((s) => s.name)], rows: xs.map((m, i) => [m, ...trim(perMove).map((s) => (s.values[i] == null ? '–' : s.values[i]!.toFixed(1) + 's'))]) }}>
          <LineChart xs={xs} series={trim(perMove)} yFormat={(v) => `${v.toFixed(0)}s`} xFormat={(x) => String(x)} tipHeader={(x) => `Move ${x}`} yMin={0} height={260} />
        </ChartCard>
        <ChartCard title="Clock left" sub="Average share of starting time still on the clock, by move number" legend={legend}
          table={{ head: ['Move', ...clock.map((s) => s.name)], rows: xs.map((m, i) => [m, ...trim(clock).map((s) => (s.values[i] == null ? '–' : s.values[i]!.toFixed(0) + '%'))]) }}>
          <LineChart xs={xs} series={trim(clock)} yFormat={(v) => `${v.toFixed(0)}%`} xFormat={(x) => String(x)} tipHeader={(x) => `Move ${x}`} yMin={0} yMax={100} height={260} />
        </ChartCard>
      </div>
      <ChartCard title="Time per move across time controls" sub={`Average seconds per move by rating group (${size} Elo groups)`} legend={tcSeries.map((s) => ({ name: s.name, color: s.color }))}
        table={{ head: ['Rating', ...tcSeries.map((s) => s.name)], rows: tcLabels.map((l, i) => [l, ...tcSeries.map((s) => (s.values[i] == null ? '–' : s.values[i]!.toFixed(1) + 's'))]) }}>
        <LineChart xs={tcLabels.map((_, i) => i)} series={tcSeries} xFormat={(i) => tcLabels[i] ?? ''} yFormat={(v) => `${v.toFixed(0)}s`} yMin={0} height={270} xTickCount={Math.min(8, tcLabels.length)} />
      </ChartCard>
      <ChartCard title="Games lost on the clock" sub={`${tc === 'All' ? 'All time controls' : tc}: share of games where a player flagged. Hover for how often the flagger was ahead.`}
        table={{ head: ['Rating', 'Flag %', 'Ahead by 2+', 'Winning (+6)'], rows: entries.map((e) => [e.label, e.time.flag_pct == null ? '–' : (e.time.flag_pct * 100).toFixed(1) + '%', pct(e.time.flag_while_ahead2), pct(e.time.flag_while_winning)]) }}>
        <BarChart items={flagItems} yFormat={(v) => `${v.toFixed(0)}%`} tipLabel="Games lost on time" color="var(--s4)" />
      </ChartCard>
      <div className="note">Time is read from the clock after each move. Bullet games compress the early moves and spend almost nothing past move 25; classical games are still using real thinking time at move 40.</div>
    </div>
  )
}
