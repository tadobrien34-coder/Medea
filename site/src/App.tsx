import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Icon from './components/Icon'
import Explore from './pages/Explore'
import Levels from './pages/Levels'
import Openings from './pages/Openings'
import OpeningDetail from './pages/OpeningDetail'
import Tactics from './pages/Tactics'
import Players from './pages/Players'
import Repertoires from './pages/Repertoires'
import MyGames from './pages/MyGames'
import MyOpenings from './pages/MyOpenings'
import MyTree from './pages/MyTree'
import MyTime from './pages/MyTime'
import Mistakes from './pages/Mistakes'
import Practice from './pages/Practice'
import Play from './pages/Play'
import { useUser } from './lib/userdata'
import Method from './pages/Method'
import Updates from './pages/Updates'
import { VERSION } from './version'

const NAV: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: '/', label: 'Explore', icon: 'board', end: true },
  { to: '/levels', label: 'Levels', icon: 'levels' },
  { to: '/openings', label: 'Openings', icon: 'book' },
  { to: '/tactics', label: 'Tactics', icon: 'bolt' },
  { to: '/players', label: 'Players & time', icon: 'clock' },
  { to: '/repertoires', label: 'GM repertoires', icon: 'crown' },
  { to: '/play', label: 'Play vs computer', icon: 'board' },
]
const ME = [
  { to: '/me', label: 'My games', icon: 'user', end: true },
  { to: '/me/openings', label: 'My openings', icon: 'book' },
  { to: '/me/tree', label: 'My opening tree', icon: 'levels' },
  { to: '/me/time', label: 'My time', icon: 'clock' },
  { to: '/me/mistakes', label: 'Frequent mistakes', icon: 'bolt' },
]
const ABOUT = [
  { to: '/method', label: 'Method', icon: 'info' },
  { to: '/updates', label: 'Updates', icon: 'spark' },
]

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => {
    try { return (localStorage.getItem('medea-theme') as 'light' | 'dark' | null) ?? null } catch { return null }
  })
  useEffect(() => {
    const el = document.documentElement
    if (theme) el.setAttribute('data-theme', theme); else el.removeAttribute('data-theme')
    try { theme ? localStorage.setItem('medea-theme', theme) : localStorage.removeItem('medea-theme') } catch { /* private mode */ }
  }, [theme])
  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') }
}

export default function App() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const { dark, toggle } = useTheme()
  const user = useUser()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  return (
    <div className="shell">
      <div className="topbar">
        <button className="btn ghost icon" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
        <span>Medea</span>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19V6l7 8 7-8v13" /></svg></span>
          Medea<small>v{VERSION}</small>
        </div>
        <nav className="nav">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}</NavLink>)}
          <div className="nav-group">{user.linked ? `Me · ${user.profile.lichess ?? user.profile.chesscom}` : 'Me'}</div>
          {ME.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}</NavLink>)}
          <div className="nav-group">About</div>
          {ABOUT.map((n) => <NavLink key={n.to} to={n.to}><Icon name={n.icon} />{n.label}</NavLink>)}
        </nav>
        <div className="side-foot">
          <button className="btn ghost icon" onClick={toggle} aria-label="Toggle theme"><Icon name={dark ? 'sun' : 'moon'} /></button>
          <a className="btn ghost icon" href="https://github.com/tadobrien34-coder/Medea" target="_blank" rel="noreferrer" aria-label="GitHub"><Icon name="github" /></a>
          <span>Lichess data</span>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Explore />} />
          <Route path="/levels" element={<Levels />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/openings/:level/:slug" element={<OpeningDetail />} />
          <Route path="/tactics" element={<Tactics />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:id" element={<Players />} />
          <Route path="/repertoires" element={<Repertoires />} />
          <Route path="/me" element={<MyGames />} />
          <Route path="/me/openings" element={<MyOpenings />} />
          <Route path="/me/tree" element={<MyTree />} />
          <Route path="/me/time" element={<MyTime />} />
          <Route path="/me/mistakes" element={<Mistakes />} />
          <Route path="/me/practice" element={<Practice />} />
          <Route path="/play" element={<Play />} />
          <Route path="/method" element={<Method />} />
          <Route path="/updates" element={<Updates />} />
          <Route path="*" element={<Explore />} />
        </Routes>
      </main>
    </div>
  )
}
