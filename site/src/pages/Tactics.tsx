import { useState } from 'react'
import { BarChart } from '../components/charts/Charts'
import { Loading, Meter, PageHead, Stat } from '../components/ui'
import { useData } from '../lib/data'
import { PIECES, num, pct, signed } from '../lib/format'

interface Tactic {
  id: string; name: string; n: number; per100: number; saves: boolean
  win_adv_rate: number | null; clear_rate: number | null; kept_rate: number | null; game_win: number; game_score: number
  median_before: number; median_after: number; gifted: number; post_blunder: number; gave_back: number | null
  post_piece: number[]; phase: number[]
  by_band: { band: string; n: number; win_adv_rate: number | null }[]
  by_tc: { tc: string; n: number; win_adv_rate: number | null }[]
  what: string; recognize: string; hold: string; avoid: string; thoughts: string[]
}
interface TacticsFile { n_games: number; win_adv: number; generic_after: string[]; tactics: Tactic[] }

export default function Tactics() {
  const { data } = useData<TacticsFile>('tactics.json')
  const [sel, setSel] = useState('discovered-placeholder')
  if (!data) return <><PageHead title="Tactics" /><Loading /></>
  const attack = data.tactics.filter((t) => !t.saves && t.win_adv_rate != null)
  const finishers = data.tactics.filter((t) => !t.saves && t.win_adv_rate == null)
  const saves = data.tactics.filter((t) => t.saves)
  const cur = data.tactics.find((t) => t.id === sel) ?? attack[0]
  const row = (t: Tactic) => (
    <div key={t.id} className="tactic-row" role="option" aria-selected={t.id === cur.id} tabIndex={0} onClick={() => setSel(t.id)} onKeyDown={(e) => e.key === 'Enter' && setSel(t.id)}>
      <div><div style={{ fontWeight: 550 }}>{t.name}</div><div className="small muted num">{t.per100.toFixed(t.per100 < 1 ? 2 : 1)} per 100 games</div></div>
      {t.win_adv_rate != null ? <Meter value={t.win_adv_rate} max={0.5} /> : <span />}
      <div className="num right" style={{ fontWeight: 600 }}>{t.win_adv_rate != null ? pct(t.win_adv_rate) : t.saves ? 'draw' : 'mate'}</div>
    </div>
  )
  return (
    <>
      <PageHead title="Tactics" sub={`How often each tactic produces a winning advantage (+${data.win_adv.toFixed(0)} or better, held for three plies), what to look for, and how to avoid giving it back. Detected from ${num(data.n_games)} analysed games.`} />
      <div className="split">
        <div className="card sticky" style={{ padding: 8 }} role="listbox" aria-label="Tactics">
          <div className="section-title" style={{ padding: '8px 14px 0' }}>Wins +{data.win_adv.toFixed(0)} within four moves</div>
          {attack.map(row)}
          {finishers.length > 0 && <div className="section-title" style={{ padding: '14px 14px 0' }}>Finishers</div>}
          {finishers.map(row)}
          {saves.length > 0 && <div className="section-title" style={{ padding: '14px 14px 0' }}>Saving a lost game</div>}
          {saves.map(row)}
        </div>

        <div className="stack-lg">
          <section className="card card-pad">
            <h2>{cur.name}</h2>
            <p className="ink2" style={{ marginTop: 6 }}>{cur.what}</p>
            {cur.win_adv_rate == null && !cur.saves ? (
              <div className="grid-3" style={{ marginTop: 16 }}>
                <Stat label="Seen in" value={num(cur.n)} hint={`${cur.per100.toFixed(2)} per 100 games`} />
                <Stat label="Result" value="Checkmate" hint="The game ends on the spot" />
                <Stat label="Gifted by a mistake" value={pct(cur.gifted)} hint="the opponent’s previous move was a mistake" />
              </div>
            ) : cur.saves ? (
              <div className="grid-3" style={{ marginTop: 16 }}>
                <Stat label="Seen in" value={num(cur.n)} hint={`${cur.per100.toFixed(2)} per 100 games`} />
                <Stat label="Result" value="Half a point" hint="A lost position becomes a draw" />
                <Stat label="Blunder next" value={pct(cur.post_blunder)} hint="of savers slip again within three moves" />
              </div>
            ) : (
              <div className="grid-3" style={{ marginTop: 16 }}>
                <Stat label={`Reaches +${data.win_adv.toFixed(0)}`} value={pct(cur.win_adv_rate)} hint="within four moves, if not already winning" />
                <Stat label="Reaches +3 or more" value={pct(cur.clear_rate)} hint={`typical swing ${signed(cur.median_before, 1)} → ${signed(cur.median_after, 1)}`} />
                <Stat label="Kept once winning" value={pct(cur.kept_rate)} hint="never drops back under +1.0" />
                <Stat label="Wins the game" value={pct(cur.game_win)} hint={`${pct(cur.game_score)} score`} />
                <Stat label="Gifted by a mistake" value={pct(cur.gifted)} hint="the opponent’s previous move was a mistake" />
                <Stat label="Blunder within 3 moves" value={pct(cur.post_blunder)} hint={cur.gave_back != null ? `${pct(cur.gave_back)} of +3 edges thrown away within six moves` : undefined} />
              </div>
            )}
          </section>

          <div className="grid-3">
            <TextCard title="Recognise it" text={cur.recognize} />
            <TextCard title={cur.saves ? 'Use it' : cur.win_adv_rate == null ? 'Before you start' : 'Hold the advantage'} text={cur.hold} />
            <TextCard title="Avoid the blunder" text={cur.avoid} />
          </div>

          {cur.thoughts.length > 0 && (
            <section className="card card-pad">
              <div className="section-title">From the data</div>
              <ul className="bullets">{cur.thoughts.map((t, i) => <li key={i}>{t}</li>)}</ul>
              {cur.post_piece.reduce((a, b) => a + b, 0) >= 20 && (
                <p className="small muted" style={{ marginTop: 10 }}>
                  Piece moved in the first blunder after the tactic: {cur.post_piece.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 3)
                    .map((x) => `${PIECES[x.i].toLowerCase()} ${((100 * x.v) / cur.post_piece.reduce((a, b) => a + b, 0)).toFixed(0)}%`).join(', ')}.
                </p>
              )}
            </section>
          )}

          {!cur.saves && cur.win_adv_rate != null && (
            <div className="grid-2">
              <section className="card">
                <div className="card-head"><h3>By rating</h3></div>
                <div className="card-sub">Chance of reaching +{data.win_adv.toFixed(0)} within four moves</div>
                <BarChart items={cur.by_band.map((b) => ({ label: b.band, value: b.win_adv_rate, note: `${num(b.n)} cases` }))} yFormat={(v) => pct(v)} height={190} tipLabel="Reaches winning" />
              </section>
              <section className="card">
                <div className="card-head"><h3>By time control</h3></div>
                <div className="card-sub">Same measure, split by speed of play</div>
                <BarChart items={cur.by_tc.map((b) => ({ label: b.tc, value: b.win_adv_rate, note: `${num(b.n)} cases` }))} yFormat={(v) => pct(v)} height={190} tipLabel="Reaches winning" color="var(--s3)" />
              </section>
            </div>
          )}

          <section className="card card-pad">
            <div className="section-title">After any tactic</div>
            <ul className="bullets">{data.generic_after.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </section>
          <div className="note">Tactics are found by a rules-based scan of each game’s board (forks, pins, skewers, discovered attacks and so on) plus the material actually won in the next four plies. It is an approximation; a few real tactics fall into “Other material win”.</div>
        </div>
      </div>
    </>
  )
}

function TextCard({ title, text }: { title: string; text: string }) {
  return <section className="card card-pad"><div className="section-title">{title}</div><p className="ink2">{text}</p></section>
}
