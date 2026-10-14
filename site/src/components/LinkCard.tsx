import { useState } from 'react'
import { Segmented } from './ui'
import type { Platform } from '../lib/account'
import { useUser } from '../lib/userdata'

/** Link a Lichess or Chess.com username to your Medea profile (public API, nothing leaves the browser). */
export default function LinkCard() {
  const { link, error, status, progress, profile } = useUser()
  const [platform, setPlatform] = useState<Platform>(profile.lichess && !profile.chesscom ? 'chesscom' : 'lichess')
  const [name, setName] = useState('')
  const busy = status === 'loading'
  return (
    <section className="card card-pad">
      <h2>Link your account</h2>
      <p className="ink2" style={{ marginTop: 6, maxWidth: '62ch' }}>
        Add a Lichess or Chess.com username once and Medea keeps your games in this browser. My games, My openings, My opening tree, My time and Frequent mistakes
        all use them, so you never reload. Only public data is read; there is no password and nothing is uploaded.
      </p>
      <form className="row" style={{ gap: 12, marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) link(platform, name) }}>
        <Segmented value={platform} onChange={setPlatform} options={[{ value: 'lichess', label: 'Lichess' }, { value: 'chesscom', label: 'Chess.com' }]} label="Platform" />
        <input type="text" placeholder="Username" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Username" style={{ width: 220 }} />
        <button className="btn primary" disabled={busy || !name.trim()} type="submit">{busy ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Loading {progress}</> : 'Link account'}</button>
      </form>
      {error && <div className="note warn" style={{ marginTop: 12 }}>{error}</div>}
      {platform === 'chesscom' && <div className="small muted" style={{ marginTop: 10 }}>Chess.com has no engine analysis. Medea can run one in your browser to find your blunders.</div>}
    </section>
  )
}
