import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import HoverBoard from '../components/HoverBoard'
import LinkCard from '../components/LinkCard'
import RangeFilter from '../components/RangeFilter'
import { Chip, Filter, PageHead, ReadMore, Segmented } from '../components/ui'
import { lossProfile } from '../lib/analysis'
import { useData } from '../lib/data'
import { BAND_LABELS, TCS, num, openingPath, pct, secs, variationKey } from '../lib/format'
import { avgRating, usePeers } from '../lib/peers'
import { GmRep, GmStyle, matchGms, userStyle } from '../lib/styleMatch'
import { MOVE_EDGES, pText, pValue, userStats } from '../lib/userstats'
import { useUser } from '../lib/userdata'
import type { OpeningsFile } from '../lib/types'
import type { GmGame } from '../components/OpeningExplorer'

type Tc = (typeof TCS)[number]
const BAND_EDGE = [0, 1000, 1400, 1800, 2200, 4000]
const bandOf = (r: number) => { for (let i = 0; i < 5; i++) if (r >= BAND_EDGE[i] && r < BAND_EDGE[i + 1]) return i; return 4 }

function Verdict({ ratio, p, good = 'lower' }: { ratio: number | null; p: number; good?: 'lower' | 'higher' }) {
  if (ratio == null) return null
  const sig = p < 0.05
  const higher = ratio > 1
  const tone = !sig ? undefined : (higher === (good === 'higher') ? 'good' : 'bad')
  return <Chip tone={tone as 'good' | 'bad' | undefined}>{!sig ? 'Typical' : higher ? `${ratio.toFixed(1)}× higher` : `${(1 / ratio).toFixed(1)}× lower`} · {pText(p)}</Chip>
}

export default function Report() {
  const u = useUser()
  const present = TCS.filter((t) => u.games.some((g) => g.tc === t))
  const most = present.map((t) => [t, u.games.filter((g) => g.tc === t).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0]
  const [pick, setPick] = useState<Tc | null>(null)
  const tc = pick && present.includes(pick) ? pick : most
  const games = useMemo(() => u.games.filter((g) => g.tc === tc), [u.games, tc])
  const rating = avgRating(games)
  const peers = usePeers(tc ?? null, rating)
  const index = useData<OpeningsFile>('openings.json').data
  const reps = useData<Record<string, (GmRep & { openings: GmRep['openings'] })[]>>('gm/repertoires.json').data
  const players = useData<{ players: { id: string; tcs: Record<string, GmStyle> }[] }>('gm/players.json').data
  const gmGames = useData<Record<string, GmGame[]>>('gm/games.json').data
  const me = useMemo(() => userStats(games), [games])
  const prof = useMemo(() => lossProfile(games), [games])
  const style = useMemo(() => userStyle(games), [games])
  const band = rating ? bandOf(rating) : null
  const byKey = useMemo(() => new Map((index?.openings ?? []).map((o) => [o.key, o])), [index])

  // ---- headline tests
  const flagged = games.filter((g) => g.res === 0 && g.term === 'time').length
  const flagP = peers.flagRate != null ? pValue(flagged, games.length, peers.flagRate) : 1
  const flagRatio = peers.flagRate ? flagged / games.length / peers.flagRate : null
  const bMoves = me.moves, bK = me.blunderRate != null ? Math.round(me.blunderRate * bMoves) : 0
  const bP = peers.blunderRate != null && me.blunderRate != null ? pValue(bK, bMoves, peers.blunderRate) : 1
  const bRatio = peers.blunderRate && me.blunderRate != null ? me.blunderRate / peers.blunderRate : null
  const tRatio = peers.group?.time.avg_per_move && me.avgTime ? me.avgTime / peers.group.time.avg_per_move : null

  // ---- where blunders cluster, against players at your rating
  const cluster = useMemo(() => {
    const pb = peers.group?.blunder.by_move
    if (!pb) return null
    let best: { bin: number; mine: number; theirs: number } | null = null
    me.byMove.forEach((v, i) => {
      const th = pb[i]?.blunder
      if (v == null || th == null || pb[i].moves < 300) return
      if (!best || v / 100 - th > best.mine - best.theirs) best = { bin: i, mine: v / 100, theirs: th }
    })
    return best as { bin: number; mine: number; theirs: number } | null
  }, [me, peers.group])
  const binLabel = (i: number) => (i >= MOVE_EDGES.length - 1 ? '100+' : `${MOVE_EDGES[i]}–${MOVE_EDGES[i + 1] - 1}`)
  const timeShare = useMemo(() => {
    const sum = (a: (number | null)[], from: number, to: number) => a.slice(from, to).reduce<number>((x, y) => x + (y ?? 0), 0)
    const mine = me.perMove, theirs = peers.group?.time.per_move_by_move ?? []
    if (mine.length < 20 || theirs.length < 20) return null
    return { mine: sum(mine, 0, 10) / Math.max(1, sum(mine, 0, mine.length)), theirs: sum(theirs, 0, 10) / Math.max(1, sum(theirs, 0, theirs.length)) }
  }, [me, peers.group])

  // ---- openings: keep, practice or drop
  const opens = useMemo(() => {
    const m = new Map<string, { key: string; color: 0 | 1; n: number; pts: number }>()
    for (const g of games) {
      if (g.opening === '?') continue
      const key = variationKey(g.opening), k = `${g.color}|${key}`
      const e = m.get(k) ?? { key, color: g.color, n: 0, pts: 0 }
      e.n++; e.pts += g.res; m.set(k, e)
    }
    const repeated = new Map<string, number>()
    for (const mm of u.scan?.opening ?? []) if (mm.count >= 2) for (const id of new Set(mm.games)) { const g = games.find((x) => x.id === id); if (g) repeated.set(variationKey(g.opening), (repeated.get(variationKey(g.opening)) ?? 0) + 1) }
    return [...m.values()].filter((e) => e.n >= 6).map((e) => {
      const ix = byKey.get(e.key)
      const score = e.pts / e.n
      const peer = ix ? (band != null && ix.band_score?.[band] != null && (ix.band_n?.[band] ?? 0) >= 30 ? ix.band_score[band]! : ix.score) : null
      // an opening's score is only comparable for the same colour; flip when the index lists it for the other side
      const peerForMe = peer == null ? null : ix!.side === e.color ? peer : 1 - peer
      const diff = peerForMe == null ? null : score - peerForMe
      const p = peerForMe == null ? 1 : pValue(e.pts, e.n, peerForMe)
      const rep = repeated.get(e.key) ?? 0
      let verdict: 'Keep' | 'Practice' | 'Drop' | 'Fine' = 'Fine'
      if (diff != null && diff <= -0.1 && (p < 0.15 || e.n >= 12) && score < 0.45) verdict = 'Drop'
      else if ((diff != null && diff < -0.04 && e.n >= 10) || rep > 0) verdict = 'Practice'
      else if ((diff != null && diff >= 0.06 && e.n >= 8) || (score >= 0.6 && e.n >= 8)) verdict = 'Keep'
      return { ...e, score, peer: peerForMe, diff, p, rep, verdict, ix }
    }).sort((a, b) => b.n * Math.abs(b.diff ?? 0.05) - a.n * Math.abs(a.diff ?? 0.05))
  }, [games, byKey, band, u.scan])

  // ---- GMs who play like you, and games to study
  const matches = useMemo(() => {
    if (!reps || !players || !tc) return []
    const styles: Record<string, GmStyle | undefined> = {}
    for (const p of players.players) styles[p.id] = p.tcs[tc]
    const mine = new Set([u.profile.lichess, u.profile.chesscom].filter(Boolean).map((x) => x!.toLowerCase()))
    return matchGms(style, (reps[tc] ?? []).filter((g) => !mine.has(g.id) && !mine.has(g.name.toLowerCase())), styles).slice(0, 3)
  }, [reps, players, tc, style, u.profile])
  const study = useMemo(() => {
    if (!gmGames) return []
    const top = opens.filter((o) => o.n >= 6).sort((a, b) => b.n - a.n).slice(0, 4)
    const names = new Set(matches.map((m) => m.gm.name.toLowerCase()))
    const out: { opening: string; g: GmGame; by: boolean }[] = []
    for (const o of top) {
      const pool = (gmGames[o.key] ?? []).slice()
      const mine = pool.filter((g) => names.has(g.w.toLowerCase()) || names.has(g.b.toLowerCase()))
      const pick = (mine[0] ?? pool[0])
      if (pick) out.push({ opening: o.key, g: pick, by: !!mine[0] })
    }
    return out
  }, [gmGames, opens, matches])

  if (!u.linked) return <><PageHead title="General report" /><LinkCard /></>
  if (!tc || games.length < 20) return <><PageHead title="General report" /><div className="note">Needs at least 20 saved games in one time control. You have {u.games.length} games in range.</div></>

  const tips: string[] = []
  if (peers.flagRate != null && flagP < 0.05 && flagRatio && flagRatio > 1) tips.push(`You lose on the clock ${flagRatio.toFixed(1)}× as often as players around ${peers.group?.label} (${pText(flagP)}). ${timeShare && timeShare.mine > timeShare.theirs + 0.04 ? `${pct(timeShare.mine)} of your thinking time goes on the first 10 moves, against ${pct(timeShare.theirs)} for your peers: play known openings faster.` : 'Budget the clock: decide your move by about 70% of the time you used last game.'}`)
  if (bP < 0.05 && bRatio && bRatio > 1 && cluster) tips.push(`You blunder ${bRatio.toFixed(1)}× as often as your peers (${pText(bP)}), most of all on moves ${binLabel(cluster.bin)}: ${pct(cluster.mine, 1)} against ${pct(cluster.theirs, 1)}. Spend extra time there, and check what each move leaves undefended.`)
  else if (bP >= 0.05 && me.blunderRate != null && peers.blunderRate != null) tips.push(`Your blunder rate (${pct(me.blunderRate, 1)}) is typical for ${peers.group?.label}.${cluster && cluster.mine > cluster.theirs * 1.15 ? ` It runs highest on moves ${binLabel(cluster.bin)} (${pct(cluster.mine, 1)} against ${pct(cluster.theirs, 1)}): slow down there.` : ' No phase stands out, so the gain is in checking every move.'}`)
  const lowBin = me.byPct.findIndex((v, i) => i > 0 && v != null)
  if (prof.timeTrouble >= 3 && prof.analysed >= 8) tips.push(`${pct(prof.timeTrouble / prof.analysed)} of your losses start with a blunder made under 10% of the clock. Keep a reserve: stop spending more than ~10 seconds a move once you are below 25% of your time.`)
  if ((u.scan?.opening ?? []).filter((m) => m.count >= 2 && !(m.id in u.dismissed)).length) tips.push(`You repeat ${(u.scan?.opening ?? []).filter((m) => m.count >= 2 && !(m.id in u.dismissed)).length} opening mistake(s). Fixing them is the cheapest rating gain: practice them.`)
  const kinds = new Map<string, number>(); for (const m of u.scan?.missed ?? []) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1)
  const topMiss = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topMiss && topMiss[1] >= 4 && topMiss[0] !== 'Other advantage') tips.push(`You most often miss: ${topMiss[0].toLowerCase()} (${topMiss[1]} times). Before each move, ask what their last move left loose.`)
  void lowBin

  return (
    <>
      <PageHead title="General report" sub={`${num(games.length)} ${tc} games${rating ? ` · rating about ${rating}` : ''} · compared with ${peers.group ? `players at ${peers.group.label}` : 'players at your level'}`} />
      <div className="filters">
        <Filter label="Time control"><Segmented value={tc} onChange={setPick} options={present.map((t) => ({ value: t, label: `${t} · ${u.games.filter((g) => g.tc === t).length}` }))} /></Filter>
        <RangeFilter />
      </div>

      <div className="stack-lg">
        <div className="grid-3">
          <section className="card card-pad">
            <div className="section-title">Flagging</div>
            <div className="big-num">{pct(flagged / games.length, 1)}</div>
            <div className="small muted">of your games lost on time · peers {peers.flagRate != null ? pct(peers.flagRate, 1) : '–'}</div>
            <div style={{ marginTop: 10 }}><Verdict ratio={flagRatio} p={flagP} /></div>
          </section>
          <section className="card card-pad">
            <div className="section-title">Blunders</div>
            <div className="big-num">{me.blunderRate != null ? pct(me.blunderRate, 1) : '–'}</div>
            <div className="small muted">of your moves · peers {peers.blunderRate != null ? pct(peers.blunderRate, 1) : '–'} · {num(me.moves)} moves analysed</div>
            <div style={{ marginTop: 10 }}>{me.blunderRate != null ? <Verdict ratio={bRatio} p={bP} /> : <span className="small muted">Analyse your losses on My games first.</span>}</div>
          </section>
          <section className="card card-pad">
            <div className="section-title">Time per move</div>
            <div className="big-num">{me.avgTime != null ? secs(me.avgTime) : '–'}</div>
            <div className="small muted">peers {peers.group?.time.avg_per_move != null ? secs(peers.group.time.avg_per_move) : '–'}{peers.top?.time.avg_per_move != null ? ` · 2800+ ${secs(peers.top.time.avg_per_move)}` : ''}</div>
            <div style={{ marginTop: 10 }}>{tRatio != null && <Chip>{tRatio >= 1 ? `${tRatio.toFixed(1)}× slower` : `${(1 / tRatio).toFixed(1)}× faster`}</Chip>}</div>
          </section>
        </div>

        {tips.length > 0 && (
          <section className="card card-pad">
            <div className="section-title">What to do</div>
            <ol className="tips">{tips.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </section>
        )}

        <section className="card">
          <div className="card-head"><h3>Openings: keep, practice, drop</h3><span className="small muted">vs players at {band != null ? BAND_LABELS[band] : 'your level'}</span></div>
          <div className="table-wrap" style={{ padding: '4px 8px 10px' }}>
            <table className="t compact">
              <thead><tr><th>Opening</th><th className="r">Games</th><th className="r">You</th><th className="r">Peers</th><th className="r">Gap</th><th className="r">p</th><th>Verdict</th></tr></thead>
              <tbody>
                {opens.slice(0, 14).map((o) => (
                  <tr key={o.color + o.key}>
                    <td><HoverBoard line={o.ix?.line} flipped={o.color === 1} next={(o.ix?.next ?? []) as [string, number][]} title={o.key} caption={o.ix?.plan}>
                      <span className="row" style={{ gap: 7, flexWrap: 'nowrap' }}><i className={`dot ${o.color === 0 ? 'w' : 'b'}`} />{o.ix ? <Link to={openingPath(o.key)} className="name dotted" style={{ color: 'var(--ink)' }}>{o.key}</Link> : <span className="name">{o.key}</span>}</span></HoverBoard>
                      {o.rep > 0 && <div className="tiny" style={{ color: 'var(--bad)', marginLeft: 16 }}>{o.rep} repeated mistake{o.rep > 1 ? 's' : ''}</div>}</td>
                    <td className="r">{o.n}</td><td className="r">{pct(o.score)}</td><td className="r muted">{o.peer != null ? pct(o.peer) : '–'}</td>
                    <td className="r" style={{ color: o.diff == null ? undefined : o.diff >= 0.04 ? 'var(--good)' : o.diff <= -0.04 ? 'var(--bad)' : undefined }}>{o.diff != null ? `${o.diff >= 0 ? '+' : '−'}${Math.abs(o.diff * 100).toFixed(0)}` : '–'}</td>
                    <td className="r small muted">{o.diff != null && o.n >= 10 ? (o.p < 0.001 ? '<.001' : o.p.toFixed(2)) : '–'}</td>
                    <td><Chip tone={o.verdict === 'Keep' ? 'good' : o.verdict === 'Drop' ? 'bad' : o.verdict === 'Practice' ? 'warn' : undefined}>{o.verdict}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {matches.length > 0 && (
          <section className="card">
            <div className="card-head"><h3>Players who play like you</h3><span className="small muted">openings and style, {tc.toLowerCase()}</span></div>
            <div style={{ padding: '4px 8px 6px' }}>
              {matches.map((m) => (
                <Link key={m.gm.id} to={`/players/${m.gm.id}`} className="tactic-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <span><span style={{ fontWeight: 600 }}>{m.gm.title && <span className="muted">{m.gm.title} </span>}{m.gm.name}</span><span className="small muted" style={{ display: 'block' }}>{m.note}</span></span>
                  <span className="num small">{Math.round(m.score * 100)}% match</span>
                </Link>
              ))}
            </div>
            {study.length > 0 && (
              <div style={{ padding: '4px 20px 16px' }}>
                <div className="section-title">Games to study</div>
                {study.map(({ opening, g, by }) => (
                  <div key={g.id} className="row" style={{ justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid var(--grid)' }}>
                    <span className="small"><strong>{opening}</strong> · {g.w} <span className="muted">{g.wr}</span> vs {g.b} <span className="muted">{g.br}</span> {by && <Chip tone="good">your match</Chip>}</span>
                    <span className="row" style={{ gap: 10 }}><Link className="link small" to={`${openingPath(opening)}?game=${g.id}`}>Replay</Link><a className="link small" href={`https://lichess.org/${g.id}`} target="_blank" rel="noreferrer">Lichess</a></span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <ReadMore label="How this is calculated">
          <p><strong>Peers</strong> are the games in Medea’s dataset with the same time control and average rating in your 400-point group{peers.group ? ` (${peers.group.label}, ${num(peers.group.n)} games)` : ''}. Flagging compares your share of games lost on time with one player’s share in the dataset (half of the games with a flag). Blunders compare your share of moves that lose 30+ points of win chance, from your analysed games.</p>
          <p><strong>p-values</strong> are two-sided z-tests of your rate against the peer rate. Below 0.05 is shown as higher or lower; otherwise it is called typical. Small samples are noisy, so treat a single result as a hint.</p>
          <p><strong>Openings</strong> compare your score with players in the same rating band in that exact opening, from the same colour. Keep: clearly above peers. Practice: below peers, or a repeated mistake. Drop: well below peers and under 45%.</p>
          <p><strong>Style match</strong> blends how much your openings overlap with each player’s (60%) and how close your checking, capturing, game length and speed are (40%).</p>
        </ReadMore>
      </div>
    </>
  )
}
