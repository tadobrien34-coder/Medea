import { ChartCard, LineChart } from '../components/charts/Charts'
import { Loading, PageHead } from '../components/ui'
import { useData } from '../lib/data'
import { SERIES, TCS, num, pct } from '../lib/format'
import type { LevelsFile } from '../lib/types'

interface Row { t: number; reached: number; win: number | null; kept: number | null }
interface MethodFile {
  win_adv: number; lead: number; sustain: number; grid: number[]; n_games: number; built: string; months?: string[]; gm_games?: number
  all: Row[]; by_band: { band: string; rows: Row[] }[]; by_tc: { tc: string; rows: Row[] }[]
}

export default function Method() {
  const { data: m } = useData<MethodFile>('method.json')
  const b = useData<LevelsFile>('levels_bullet.json').data, z = useData<LevelsFile>('levels_blitz.json').data
  const r = useData<LevelsFile>('levels_rapid.json').data, c = useData<LevelsFile>('levels_classical.json').data
  if (!m) return <><PageHead title="Method" /><Loading /></>
  const at = (rows: Row[]) => rows.find((x) => x.t === m.win_adv)
  const sel = at(m.all)!
  const labels = (b?.['100'] ?? []).map((e) => e.label)
  const grid: [string, LevelsFile | null][] = [['Bullet', b], ['Blitz', z], ['Rapid', r], ['Classical', c]]
  const max = Math.max(1, ...grid.flatMap(([, f]) => (f?.['100'] ?? []).map((e) => e.n)))
  return (
    <>
      <PageHead title="Method" sub="Where the numbers come from, how each term is defined, and what to keep in mind when reading them." />
      <div className="stack-lg">
        <section className="card card-pad">
          <div className="section-title">Data</div>
          <ul className="bullets">
            <li><strong>{num(m.n_games)} Lichess games</strong> with computer analysis, from the public monthly database{m.months ? ` (${m.months.join(', ')})` : ''}. Engine evaluations and clock times come from Lichess itself. Games are rated, standard, and between players within 250 points of each other.</li>
            <li><strong>Rating groups</strong> use the average rating of both players, in 100-point steps, merged into 200, 400, 600 and 800 point groups on demand.</li>
            <li><strong>Grandmaster data</strong> comes from each player’s most recent rated games through the Lichess API{m.gm_games ? ` (${num(m.gm_games)} games)` : ''}. Blunder statistics use only the games Lichess has analysed.</li>
            <li><strong>Your own games</strong> are fetched in your browser from Lichess or Chess.com and never leave it.</li>
          </ul>
        </section>

        <ChartCard
          title={`Why +${m.win_adv.toFixed(0)} is a winning advantage`}
          sub={`For each threshold: once a player’s evaluation reaches it and holds for ${m.sustain} plies, how often do they go on to win, and how often do they keep at least +${m.lead.toFixed(1)} for the rest of the game?`}
          legend={[{ name: 'Went on to win', color: SERIES[0] }, { name: `Never dropped below +${m.lead.toFixed(1)}`, color: SERIES[1] }]}
          table={{ head: ['Threshold', 'Cases', 'Won', 'Kept'], rows: m.all.map((x) => [`+${x.t}`, num(x.reached), pct(x.win, 1), pct(x.kept, 1)]) }}
        >
          <LineChart xs={m.all.map((x) => x.t)} height={260} xFormat={(x) => `+${x}`} yFormat={(v) => `${v.toFixed(0)}%`} yMin={40} yMax={100} xTickCount={8}
            series={[{ key: 'w', name: 'Went on to win', color: SERIES[0], values: m.all.map((x) => (x.win ?? 0) * 100) }, { key: 'k', name: `Kept ≥ +${m.lead.toFixed(1)}`, color: SERIES[1], values: m.all.map((x) => (x.kept ?? 0) * 100) }]} />
        </ChartCard>
        <div className="note">
          At +{m.win_adv.toFixed(0)}, {pct(sel.kept)} of reached advantages are never given back and {pct(sel.win)} become wins. Gains flatten after that, so +{m.win_adv.toFixed(0)} is the smallest round number that is usually kept at every level (below, the lowest group is the most volatile). A single static value is used everywhere on the site.
        </div>
        <section className="card">
          <div className="card-head"><h3>The same test by rating</h3></div>
          <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
            <table className="t compact">
              <thead><tr><th>Rating</th>{m.grid.map((g) => <th key={g} className="r" style={g === m.win_adv ? { color: 'var(--accent)' } : undefined}>+{g}</th>)}</tr></thead>
              <tbody>
                {m.by_band.map((bd) => (
                  <tr key={bd.band}><td className="name">{bd.band}</td>{bd.rows.map((x) => <td key={x.t} className="r" style={x.t === m.win_adv ? { background: 'var(--accent-wash)', fontWeight: 600 } : undefined}>{pct(x.kept)}</td>)}</tr>
                ))}
                {m.by_tc.map((bd) => (
                  <tr key={bd.tc}><td className="name">{bd.tc}</td>{bd.rows.map((x) => <td key={x.t} className="r" style={x.t === m.win_adv ? { background: 'var(--accent-wash)', fontWeight: 600 } : undefined}>{pct(x.kept)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-sub" style={{ paddingBottom: 14 }}>Share of reached advantages never given back (kept ≥ +{m.lead.toFixed(1)}).</div>
        </section>

        <div className="grid-2">
          <Terms />
          <section className="card card-pad">
            <div className="section-title">Reading the openings</div>
            <ul className="bullets">
              <li><strong>Objective</strong> is the median engine score at moves 5–8 against the average for that colour: good (+0.08 or better), sound, or dubious (−0.15 or worse).</li>
              <li><strong>Playability</strong> blends the score, against what that colour usually scores, with how often the player keeps a +0.3 edge at moves 10 and 15.</li>
              <li><strong>Tree search</strong> walks the move tree to ten plies and drops lines scoring under 30%, or a full −0.9 below the position. What survives is ranked by evaluation and results.</li>
              <li>Every page needs at least 100 games. Pages under 300 games are marked as a limited sample.</li>
              <li><strong>Tactics</strong> are rules-based scans of the board plus the material actually won in the next four plies. They are good guides, not proofs.</li>
            </ul>
          </section>
        </div>

        <section className="card">
          <div className="card-head"><h3>Sample sizes</h3></div>
          <div className="card-sub">Games per 100-point rating group and time control. Thin cells are flagged on the Levels page.</div>
          <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
            <table className="t compact">
              <thead><tr><th>Rating</th>{TCS.map((t) => <th key={t} className="r">{t}</th>)}</tr></thead>
              <tbody>{labels.map((l, i) => (
                <tr key={l}><td className="name">{l}</td>{grid.map(([t, f]) => { const n = f?.['100']?.[i]?.n ?? 0; return (
                  <td key={t} className="r" style={{ background: `rgba(42,120,214,${Math.min(0.28, 0.28 * Math.sqrt(n / max)).toFixed(3)})` }}>{num(n)}</td>) })}</tr>))}</tbody>
            </table>
          </div>
        </section>
        <div className="note warn">
          Analysed games are the ones someone asked Lichess to review, which skews a little toward games players found interesting. Each rating group is capped at the same number of games, so overall figures are rating-balanced rather than a picture of everything played on Lichess. Built {m.built}.
        </div>
      </div>
    </>
  )
}

function Terms() {
  const rows: [string, string][] = [
    ['Advantage shift', 'The side that is better by 1.0 or more changes. The move that did it is the “piece moved when the lead was thrown away”; the reply is the piece that cashed in.'],
    ['Final shift', 'The last advantage shift of the game.'],
    ['Point of no return', 'The move after which the winner stays at +1.0 or better to the end.'],
    ['Blunder / mistake', 'A move that costs at least 30 / 20 points of win chance (Lichess’s thresholds).'],
    ['Flag %', 'Share of games a player loses on the clock. “From +2” counts those where they were clearly better.'],
    ['Time on clock', 'Seconds on your clock when the move started, or the share of your starting time.'],
  ]
  return (
    <section className="card card-pad">
      <div className="section-title">Terms</div>
      <dl className="kv" style={{ gap: '10px 16px' }}>{rows.map(([k, v]) => <><dt key={k} style={{ fontWeight: 550, color: 'var(--ink)' }}>{k}</dt><dd key={k + 'd'} style={{ fontWeight: 400, color: 'var(--ink-2)' }}>{v}</dd></>)}</dl>
    </section>
  )
}
