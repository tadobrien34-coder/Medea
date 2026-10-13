import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { Chip, Filter, HBars, PageHead, Segmented, Stat, WDL } from '../components/ui'
import { AccountError, Platform, UGame, insights, loadChessCom, loadLichess, openingStats } from '../lib/account'
import type { Book } from '../lib/book'
import { load, useData } from '../lib/data'
import { PIECES, TCS, num, openingPath, pct, secs, slug } from '../lib/format'
import type { OpeningsFile } from '../lib/types'

const KEY = 'medea-account'
type TcSel = 'All' | (typeof TCS)[number]

function saved() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as { platform?: Platform; user?: string } } catch { return {} }
}

export default function MyGames() {
  const init = useMemo(saved, [])
  const [platform, setPlatform] = useState<Platform>(init.platform ?? 'lichess')
  const [user, setUser] = useState(init.user ?? '')
  const [count, setCount] = useState('500')
  const [games, setGames] = useState<UGame[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [tc, setTc] = useState<TcSel>('All')
  const [level, setLevel] = useState<'v' | 'f'>('v')
  const abort = useRef<AbortController | null>(null)
  const index = useData<OpeningsFile>('openings.json').data
  const pages = useMemo(() => new Set((index?.openings ?? []).map((o) => `${o.level}-${o.key}`)), [index])

  const run = async () => {
    const name = user.trim()
    if (!name) return
    abort.current?.abort()
    const ctl = new AbortController(); abort.current = ctl
    setBusy(true); setError(null); setProgress(0); setGames(null)
    try { localStorage.setItem(KEY, JSON.stringify({ platform, user: name })) } catch { /* private mode */ }
    try {
      const book = await load<Book>('book.json')
      const g = platform === 'lichess'
        ? await loadLichess(name, Number(count), setProgress, ctl.signal)
        : await loadChessCom(name, Number(count), book, setProgress, ctl.signal)
      if (!g.length) setError('No rated bullet, blitz, rapid or classical games found for that account.')
      setGames(g); setTc('All')
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e instanceof AccountError ? e.message : 'Could not load games. Check the username and your connection.')
    } finally { setBusy(false) }
  }

  const view = useMemo(() => (games ? games.filter((g) => tc === 'All' || g.tc === tc) : []), [games, tc])
  const counts = useMemo(() => Object.fromEntries(TCS.map((t) => [t, games?.filter((g) => g.tc === t).length ?? 0])), [games])
  const ins = useMemo(() => (view.length ? insights(view) : null), [view])
  const white = useMemo(() => openingStats(view, 0, level), [view, level])
  const black = useMemo(() => openingStats(view, 1, level), [view, level])

  return (
    <>
      <PageHead title="My games" sub="Link a Lichess or Chess.com account to see your most played openings by time control, with your results and a short read on how you tend to win and lose. Loaded straight from the public API into your browser; nothing is sent to us and no password is needed." />
      <section className="card card-pad" style={{ marginBottom: 24 }}>
        <form className="row" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); run() }}>
          <Segmented value={platform} onChange={setPlatform} options={[{ value: 'lichess', label: 'Lichess' }, { value: 'chesscom', label: 'Chess.com' }]} label="Platform" />
          <input type="text" placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Username" style={{ width: 220 }} />
          <select value={count} onChange={(e) => setCount(e.target.value)} aria-label="Games to load">
            <option value="200">Last 200 games</option><option value="500">Last 500 games</option><option value="1000">Last 1,000 games</option>
          </select>
          <button className="btn primary" disabled={busy || !user.trim()} type="submit">{busy ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Loading {progress}</> : 'Load games'}</button>
          {busy && <button type="button" className="btn ghost" onClick={() => abort.current?.abort()}>Cancel</button>}
        </form>
        {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}
        {platform === 'chesscom' && <div className="small muted" style={{ marginTop: 10 }}>Chess.com does not publish engine analysis, so blunder and lead-change stats need Lichess games with computer analysis.</div>}
      </section>

      {games && games.length > 0 && ins && (
        <div className="stack-lg">
          <div className="filters" style={{ marginBottom: 0 }}>
            <Filter label="Time control">
              <Segmented value={tc} onChange={setTc} options={[{ value: 'All', label: `All ${games.length}` }, ...TCS.filter((t) => counts[t]).map((t) => ({ value: t, label: `${t} ${counts[t]}` }))]} />
            </Filter>
            <Filter label="Group openings by"><Segmented value={level} onChange={setLevel} options={[{ value: 'v', label: 'Variation' }, { value: 'f', label: 'Family' }]} /></Filter>
          </div>
          <div className="grid-4">
            <Stat label="Record" value={pct(ins.wins / ins.n)} hint={<><WDL w={ins.wins} d={ins.draws} l={ins.losses} /><div style={{ marginTop: 4 }}>{ins.wins} W · {ins.draws} D · {ins.losses} L</div></>} />
            <Stat label="Time per move" value={ins.timePerMove != null ? secs(ins.timePerMove) : '–'} hint={`Flagged in ${pct(ins.flagRate, 1)} of games`} />
            <Stat label="Typical win / loss" value={`${ins.medianWin ?? '–'} / ${ins.medianLoss ?? '–'}`} unit="move" hint="Median game length" />
            <Stat label="Blunder rate" value={ins.blunderRate != null ? pct(ins.blunderRate, 1) : '–'} hint={ins.analysed ? `${ins.analysed} analysed games` : 'No analysed games'} />
          </div>

          <div className="grid-2">
            <section className="card card-pad"><div className="section-title">How you win</div>
              {ins.text.win.length ? <ul className="bullets">{ins.text.win.map((t, i) => <li key={i}>{t}</li>)}</ul> : <span className="muted">Not enough wins in this selection.</span>}</section>
            <section className="card card-pad"><div className="section-title">How you lose</div>
              {ins.text.lose.length ? <ul className="bullets">{ins.text.lose.map((t, i) => <li key={i}>{t}</li>)}</ul> : <span className="muted">Not enough losses in this selection.</span>}</section>
          </div>

          <div className="grid-2">
            <OpeningTable title="As White" rows={white} pages={pages} level={level} />
            <OpeningTable title="As Black" rows={black} pages={pages} level={level} />
          </div>

          {ins.analysed >= 5 && ins.youSlip.reduce((a, b) => a + b, 0) >= 8 && (
            <div className="grid-2">
              <section className="card"><div className="card-head"><h3>You lose the lead with</h3></div><div className="card-sub">Piece moved when the advantage changed hands, in {ins.analysed} analysed games</div>
                <HBars labels={[...PIECES]} values={ins.youSlip} color="var(--s2)" fmt={(v) => `${((100 * v) / (ins.youSlip.reduce((a, b) => a + b, 0) || 1)).toFixed(0)}% · ${v}`} /></section>
              <section className="card"><div className="card-head"><h3>Opponents lose it with</h3></div><div className="card-sub">Where to aim</div>
                <HBars labels={[...PIECES]} values={ins.theySlip} color="var(--s3)" fmt={(v) => `${((100 * v) / (ins.theySlip.reduce((a, b) => a + b, 0) || 1)).toFixed(0)}% · ${v}`} /></section>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function OpeningTable({ title, rows, pages, level }: { title: string; rows: ReturnType<typeof openingStats>; pages: Set<string>; level: 'v' | 'f' }) {
  const link = (key: string) => {
    const lvl = key.includes(':') ? 'v' : 'f'
    return pages.has(`${lvl}-${key}`) ? openingPath(key) : `${openingPath(key)}?name=${encodeURIComponent(key)}`
  }
  return (
    <section className="card">
      <div className="card-head"><h3>{title}</h3><span className="small muted">most played</span></div>
      {rows.length === 0 ? <div className="empty" style={{ padding: 24 }}>No games as {title.slice(3)}.</div> : (
        <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
          <table className="t compact">
            <thead><tr><th>Opening</th><th className="r">Games</th><th style={{ width: 120 }}>W / D / L</th><th className="r">Score</th></tr></thead>
            <tbody>{rows.slice(0, 8).map((o) => (
              <tr key={o.key}>
                <td className="name"><Link to={link(o.key)} className="link" style={{ color: 'var(--ink)' }}>{o.key}</Link></td>
                <td className="r">{o.n}</td>
                <td><WDL w={o.w} d={o.d} l={o.l} /><div className="tiny muted num" style={{ marginTop: 2 }}>{pct(o.w / o.n)} · {pct(o.d / o.n)} · {pct(o.l / o.n)}</div></td>
                <td className="r">{pct((o.w + 0.5 * o.d) / o.n)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
