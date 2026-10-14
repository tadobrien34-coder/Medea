import { useMemo, useState } from 'react'
import { BarChart, ChartCard, LineChart } from '../components/charts/Charts'
import LinkCard from '../components/LinkCard'
import RangeFilter from '../components/RangeFilter'
import { Filter, PageHead, Segmented, Stat } from '../components/ui'
import { TCS, YOU, num, pct, secAxis, secs } from '../lib/format'
import { avgRating, usePeers } from '../lib/peers'
import { userStats } from '../lib/userstats'
import { useUser } from '../lib/userdata'

const BINS = [0, 1, 2, 3, 5, 10, 20, 40, 1e9]
const BIN_LABELS = ['<1s', '1–2s', '2–3s', '3–5s', '5–10s', '10–20s', '20–40s', '40s+']

export default function MyTime() {
  const u = useUser()
  const present = TCS.filter((t) => u.games.some((g) => g.tc === t && g.spent.length))
  const [tc, setTc] = useState<(typeof TCS)[number] | null>(null)
  const cur = tc && present.includes(tc) ? tc : present.includes('Blitz') ? 'Blitz' : present[0]
  const games = useMemo(() => u.games.filter((g) => g.tc === cur && g.spent.length > 4), [u.games, cur])
  const rating = avgRating(games)
  const peers = usePeers(cur ?? null, rating)
  const me = useMemo(() => userStats(games), [games])

  const hist = useMemo(() => {
    const h = new Array(BINS.length - 1).fill(0); let n = 0; const phase = [0, 0, 0]; let tot = 0
    for (const g of games) g.spent.forEach((s, k) => {
      if (k === 0) return
      n++; tot += s; phase[k < 10 ? 0 : k < 30 ? 1 : 2] += s
      const b = BINS.findIndex((x, i) => s >= x && s < BINS[i + 1]); if (b >= 0) h[b]++
    })
    return { share: h.map((x: number) => x / Math.max(1, n)), phase: phase.map((p) => p / Math.max(1, tot)) }
  }, [games])

  if (!u.linked) return <><PageHead title="My time" /><LinkCard /></>
  if (!cur) return <><PageHead title="My time" /><div className="note">None of your saved games have clock data yet. Press Refresh on My games.</div></>

  const xs = me.perMove.map((_, i) => i + 1)
  const g1 = peers.group?.time, top = peers.top?.time
  const series = (mine: (number | null)[], pick: (t: NonNullable<typeof g1>) => (number | null)[]) => [
    { key: 'me', name: 'You', color: YOU, values: mine, dotted: true },
    ...(g1 ? [{ key: 'peer', name: `Players at ${peers.group!.label}`, color: 'var(--s1)', values: pick(g1).slice(0, xs.length) }] : []),
    ...(top ? [{ key: 'top', name: '2800+', color: 'var(--s2)', values: pick(top).slice(0, xs.length) }] : []),
  ]
  const perMove = series(me.perMove, (t) => t.per_move_by_move)
  const clock = series(me.clockLeft, (t) => t.clock_pct_by_move)
  const legend = perMove.map((s) => ({ name: s.name, color: s.color }))
  const flagged = games.filter((g) => g.res === 0 && g.term === 'time').length
  const losses = games.filter((g) => g.res === 0).length
  const winsOnTime = games.filter((g) => g.res === 1 && g.term === 'time').length
  const pctLabels = ['<5%', '5–10%', '10–20%', '20–40%', '40–60%', '60–80%', '80–100%', '100%+']
  const gp = peers.group?.blunder.by_clock_pct ?? []

  return (
    <>
      <PageHead title="My time" sub="Your clock against players at your rating." />
      <div className="filters"><Filter label="Time control"><Segmented value={cur} onChange={setTc} options={present.map((t) => ({ value: t, label: `${t} · ${u.games.filter((g) => g.tc === t).length}` }))} /></Filter><RangeFilter /></div>
      <div className="stack-lg">
        <div className="grid-4">
          <Stat label="Time per move" value={me.avgTime != null ? secs(me.avgTime) : '–'} hint={g1?.avg_per_move != null ? `${peers.group!.label}: ${secs(g1.avg_per_move)}${top?.avg_per_move != null ? ` · 2800+: ${secs(top.avg_per_move)}` : ''}` : undefined} />
          <Stat label="Lost on the clock" value={pct(games.length ? flagged / games.length : 0, 1)} hint={`${flagged} of ${losses} losses · peers ${peers.flagRate != null ? pct(peers.flagRate, 1) : '–'}`} />
          <Stat label="Blunder rate" value={me.blunderRate != null ? pct(me.blunderRate, 1) : '–'} hint={`peers ${peers.blunderRate != null ? pct(peers.blunderRate, 1) : '–'}`} />
          <Stat label="Won on the clock" value={num(winsOnTime)} hint={`${num(games.length)} games`} />
        </div>
        <div className="grid-2">
          <ChartCard title="Time per move" sub="Seconds, by move number" legend={legend}
            table={{ head: ['Move', ...perMove.map((s) => s.name)], rows: xs.map((x, i) => [x, ...perMove.map((s) => (s.values[i] == null ? '–' : `${s.values[i]!.toFixed(1)}s`))]) }}>
            <LineChart xs={xs} yMin={0} height={250} yFormat={secAxis} tipHeader={(x) => `Move ${x}`} series={perMove} />
          </ChartCard>
          <ChartCard title="Clock left" sub="Share of starting time, by move number" legend={legend}
            table={{ head: ['Move', ...clock.map((s) => s.name)], rows: xs.map((x, i) => [x, ...clock.map((s) => (s.values[i] == null ? '–' : `${s.values[i]!.toFixed(0)}%`))]) }}>
            <LineChart xs={xs} yMin={0} yMax={100} height={250} yFormat={(v) => `${v.toFixed(0)}%`} tipHeader={(x) => `Move ${x}`} series={clock} />
          </ChartCard>
        </div>
        <div className="grid-2">
          <ChartCard title="How long your moves take" sub="Share of your moves by time spent" table={{ head: ['Time', 'Share'], rows: BIN_LABELS.map((l, i) => [l, pct(hist.share[i], 1)]) }}>
            <BarChart items={BIN_LABELS.map((l, i) => ({ label: l, value: hist.share[i] * 100 }))} yFormat={(v) => `${v.toFixed(0)}%`} height={210} tipLabel="Moves" />
          </ChartCard>
          <ChartCard title="Blunders by clock left" sub="Plenty of time on the left, running out on the right"
            legend={[{ name: 'You', color: YOU }, ...(gp.length ? [{ name: `Players at ${peers.group!.label}`, color: 'var(--s1)' }] : [])]}
            table={{ head: ['Clock left', 'You', 'Peers'], rows: [7, 6, 5, 4, 3, 2, 1, 0].map((i) => [pctLabels[i], me.byPct[i] == null ? '–' : `${me.byPct[i]!.toFixed(1)}%`, gp[i]?.blunder != null ? pct(gp[i].blunder, 1) : '–']) }}>
            <LineChart xs={[0, 1, 2, 3, 4, 5, 6, 7]} height={210} yMin={0} yFormat={(v) => `${v.toFixed(1)}%`} xTickCount={5}
              xFormat={(i) => pctLabels[i] ?? ''} reverse
              series={[{ key: 'me', name: 'You', color: YOU, values: me.byPct, dotted: true }, ...(gp.length ? [{ key: 'peer', name: `Players at ${peers.group!.label}`, color: 'var(--s1)', values: gp.map((b) => (b.blunder == null || b.moves < 300 ? null : b.blunder * 100)) }] : [])]} />
          </ChartCard>
        </div>
        <section className="card card-pad">
          <div className="section-title">Where your time goes</div>
          <div className="row" style={{ gap: 28 }}>
            {['Moves 1–10', 'Moves 11–30', 'Moves 31+'].map((l, i) => <div key={l}><div className="small muted">{l}</div><div className="big-num" style={{ fontSize: 24 }}>{pct(hist.phase[i])}</div></div>)}
          </div>
        </section>
      </div>
    </>
  )
}
