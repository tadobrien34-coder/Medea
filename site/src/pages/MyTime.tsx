import { useMemo, useState } from 'react'
import { BarChart, ChartCard, LineChart } from '../components/charts/Charts'
import LinkCard from '../components/LinkCard'
import { Filter, PageHead, Segmented, Stat } from '../components/ui'
import type { UGame } from '../lib/account'
import { useData } from '../lib/data'
import { TCS, num, pct, secs } from '../lib/format'
import type { LevelsFile } from '../lib/types'
import { useUser } from '../lib/userdata'

const BINS = [0, 1, 2, 3, 5, 10, 20, 40, 1e9]
const BIN_LABELS = ['<1s', '1s', '2s', '3–4s', '5–9s', '10–19s', '20–39s', '40s+']
const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)

export default function MyTime() {
  const u = useUser()
  const present = TCS.filter((t) => u.games.some((g) => g.tc === t && g.spent.length))
  const [tc, setTc] = useState<(typeof TCS)[number] | null>(null)
  const cur = tc && present.includes(tc) ? tc : present.includes('Blitz') ? 'Blitz' : present[0]
  const levels = useData<LevelsFile>(cur ? `levels_${cur.toLowerCase()}.json` : null).data
  const games = useMemo(() => u.games.filter((g) => g.tc === cur && g.spent.length > 4), [u.games, cur])

  const stats = useMemo(() => {
    const K = 60
    const sum = new Array(K).fill(0), cnt = new Array(K).fill(0), lsum = new Array(K).fill(0)
    const hist = new Array(BINS.length - 1).fill(0)
    let total = 0, phase = [0, 0, 0], moves = 0
    const blun = [0, 0, 0, 0, 0].map(() => ({ n: 0, b: 0 }))   // by share of clock left
    for (const g of games) {
      const start = g.left[0] || g.base || 1
      g.spent.forEach((s, k) => {
        if (k < K) { sum[k] += s; cnt[k]++; lsum[k] += (g.left[k] / start) * 100 }
        if (k > 0) { total += s; phase[k < 10 ? 0 : k < 30 ? 1 : 2] += s; moves++; const b = BINS.findIndex((x, i) => s >= x && s < BINS[i + 1]); if (b >= 0) hist[b]++ }
      })
      if (g.evs && g.evs.length === g.sans.length) {
        for (let k = 1; k < g.spent.length; k++) {
          const i = g.color + 2 * k
          if (i >= g.evs.length) break
          const prev = g.evs[i - 1], drop = g.color === 0 ? winPct(prev) - winPct(g.evs[i]) : winPct(g.evs[i]) - winPct(prev)
          const share = (g.left[k - 1] / start) * 100
          const bin = share >= 60 ? 0 : share >= 40 ? 1 : share >= 20 ? 2 : share >= 10 ? 3 : 4
          blun[bin].n++; if (drop >= 30) blun[bin].b++
        }
      }
    }
    let kk = 0
    for (let i = 0; i < K; i++) if (cnt[i] >= 8) kk = i + 1
    return {
      per: sum.slice(0, kk).map((s: number, i: number) => s / cnt[i]), left: lsum.slice(0, kk).map((s: number, i: number) => s / cnt[i]),
      hist: hist.map((h: number) => h / Math.max(1, moves)), avg: moves ? total / moves : null,
      phase: phase.map((p) => p / Math.max(1, total)), blun,
    }
  }, [games])

  if (!u.linked) return <><PageHead title="My time" sub="How you spend your clock." /><LinkCard /></>
  if (!cur) return <><PageHead title="My time" sub="How you spend your clock." /><div className="note">None of your saved games have clock data yet. Press Refresh on My games.</div></>

  const avgRating = Math.round(games.reduce((a, g) => a + (g.rating ?? 0), 0) / Math.max(1, games.filter((g) => g.rating).length))
  const group = levels?.['400']?.find((e) => !e.thin && avgRating >= e.lo && (e.hi == null || avgRating <= e.hi))
  const xs = stats.per.map((_, i) => i + 1)
  const peerPer = group ? group.time.per_move_by_move.slice(0, xs.length) : []
  const peerLeft = group ? group.time.clock_pct_by_move.slice(0, xs.length) : []
  const flagged = games.filter((g) => g.res === 0 && g.term === 'time').length
  const losses = games.filter((g) => g.res === 0).length
  const winsOnTime = games.filter((g) => g.res === 1 && g.term === 'time').length
  const fast = stats.hist.slice(0, 3).reduce((a, b) => a + b, 0)
  const lines = [
    stats.phase[0] > 0.3 ? `${pct(stats.phase[0])} of your thinking time goes on the first 10 moves. That is a lot for an opening you already know.` : null,
    losses >= 8 && flagged / losses >= 0.2 ? `${pct(flagged / losses)} of your losses are on the clock. Moving a little faster early would save games.` : null,
    group && stats.avg != null && group.time.avg_per_move ? `You average ${secs(stats.avg)} a move; players around ${group.label} average ${secs(group.time.avg_per_move)}.` : null,
    fast > 0.4 ? `${pct(fast)} of your moves take under 3 seconds. Fast is fine in the opening, risky when the position is sharp.` : null,
  ].filter(Boolean) as string[]
  const labels = ['60%+', '40–60%', '20–40%', '10–20%', '<10%']

  return (
    <>
      <PageHead title="My time" sub="How you spend your clock across your saved games, set against players at your rating." />
      <div className="filters"><Filter label="Time control"><Segmented value={cur} onChange={setTc} options={present.map((t) => ({ value: t, label: `${t} · ${u.games.filter((g) => g.tc === t).length}` }))} /></Filter></div>
      <div className="stack-lg">
        <div className="grid-4">
          <Stat label="Time per move" value={stats.avg != null ? secs(stats.avg) : '–'} hint={group ? `players at ${group.label}: ${secs(group.time.avg_per_move)}` : undefined} />
          <Stat label="Lost on the clock" value={pct(losses ? flagged / losses : 0)} hint={`${flagged} of ${losses} losses`} />
          <Stat label="Won on the clock" value={num(winsOnTime)} hint="opponents who flagged" />
          <Stat label="Games" value={num(games.length)} hint={avgRating ? `average rating ${avgRating}` : undefined} />
        </div>
        {lines.length > 0 && <section className="card card-pad"><div className="section-title">What stands out</div><ul className="bullets">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul></section>}
        <div className="grid-2">
          <ChartCard title="Time per move" sub="Seconds spent, by move number" legend={group ? [{ name: 'You', color: 'var(--s1)' }, { name: `Players at ${group.label}`, color: 'var(--s2)' }] : undefined}
            table={{ head: ['Move', 'You', 'Peers'], rows: xs.map((x, i) => [x, `${stats.per[i].toFixed(1)}s`, peerPer[i] != null ? `${peerPer[i]!.toFixed(1)}s` : '–']) }}>
            <LineChart xs={xs} yMin={0} height={250} yFormat={(v) => `${v.toFixed(0)}s`} tipHeader={(x) => `Move ${x}`}
              series={[{ key: 'me', name: 'You', color: 'var(--s1)', values: stats.per }, ...(group ? [{ key: 'peer', name: `Players at ${group.label}`, color: 'var(--s2)', values: peerPer, dashed: true }] : [])]} />
          </ChartCard>
          <ChartCard title="Clock left" sub="Share of your starting time remaining, by move number" legend={group ? [{ name: 'You', color: 'var(--s1)' }, { name: `Players at ${group.label}`, color: 'var(--s2)' }] : undefined}
            table={{ head: ['Move', 'You', 'Peers'], rows: xs.map((x, i) => [x, `${stats.left[i].toFixed(0)}%`, peerLeft[i] != null ? `${peerLeft[i]!.toFixed(0)}%` : '–']) }}>
            <LineChart xs={xs} yMin={0} yMax={100} height={250} yFormat={(v) => `${v.toFixed(0)}%`} tipHeader={(x) => `Move ${x}`}
              series={[{ key: 'me', name: 'You', color: 'var(--s1)', values: stats.left }, ...(group ? [{ key: 'peer', name: `Players at ${group.label}`, color: 'var(--s2)', values: peerLeft, dashed: true }] : [])]} />
          </ChartCard>
        </div>
        <div className="grid-2">
          <ChartCard title="How long your moves take" sub="Share of your moves by time spent" table={{ head: ['Time', 'Share'], rows: BIN_LABELS.map((l, i) => [l, pct(stats.hist[i], 1)]) }}>
            <BarChart items={BIN_LABELS.map((l, i) => ({ label: l, value: stats.hist[i] * 100 }))} yFormat={(v) => `${v.toFixed(0)}%`} height={210} tipLabel="Moves" />
          </ChartCard>
          <ChartCard title="Blunders by time left" sub="Share of your moves that were blunders, by clock left (analysed games)" table={{ head: ['Clock left', 'Moves', 'Blunder %'], rows: labels.map((l, i) => [l, stats.blun[i].n, stats.blun[i].n ? pct(stats.blun[i].b / stats.blun[i].n, 1) : '–']) }}>
            <BarChart items={labels.map((l, i) => ({ label: l, value: stats.blun[i].n >= 40 ? (100 * stats.blun[i].b) / stats.blun[i].n : null, note: `${stats.blun[i].n} moves` }))} yFormat={(v) => `${v.toFixed(1)}%`} height={210} tipLabel="Blunder rate" color="var(--s2)" />
          </ChartCard>
        </div>
        <section className="card card-pad">
          <div className="section-title">Where the time goes</div>
          <div className="row" style={{ gap: 24 }}>
            {['Moves 1–10', 'Moves 11–30', 'Moves 31+'].map((l, i) => <div key={l}><div className="small muted">{l}</div><div style={{ fontSize: 22, fontWeight: 600 }}>{pct(stats.phase[i])}</div></div>)}
          </div>
        </section>
      </div>
    </>
  )
}
