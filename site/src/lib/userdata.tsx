import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AccountError, Platform, UGame, loadChessCom, loadLichess } from './account'
import { OpeningMistake, Missed, bestAt, evaluateGame, findBlunder, findMissedTactics, findOpeningMistakes, saveEvalCache } from './analysis'
import type { Book } from './book'
import { load } from './data'
import { kvGet, kvSet } from './idb'
import { SF } from './sf'
import type { TreeFile } from './types'

export interface Profile { lichess?: string; chesscom?: string }
export interface Scan { opening: OpeningMistake[]; missed: Missed[]; at: number }
export interface Task { running: boolean; label: string; done: number; total: number }
export type PracticeLog = Record<string, { right: number; wrong: number; last: number }>

interface Ctx {
  profile: Profile
  linked: boolean
  games: UGame[]
  status: 'idle' | 'loading' | 'ready'
  progress: number
  error: string | null
  link: (platform: Platform, user: string) => Promise<void>
  unlink: (platform: Platform) => void
  refresh: () => Promise<void>
  task: Task
  analyseLosses: (depth: 9 | 12) => void
  scan: Scan | null
  runScan: () => void
  stopTask: () => void
  practice: PracticeLog
  recordPractice: (id: string, ok: boolean) => void
}

const UserCtx = createContext<Ctx | null>(null)
export const useUser = () => {
  const c = useContext(UserCtx)
  if (!c) throw new Error('UserDataProvider missing')
  return c
}

const PROFILE_KEY = 'medea-profile'
const gk = (p: Platform, u: string) => `games:${p}:${u.toLowerCase()}`
const IDLE: Task = { running: false, label: '', done: 0, total: 0 }

function readProfile(): Profile {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as Profile } catch { return {} }
}

export function UserDataProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(readProfile)
  const [stored, setStored] = useState<Record<Platform, UGame[]>>({ lichess: [], chesscom: [] })
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [task, setTask] = useState<Task>(IDLE)
  const [scan, setScan] = useState<Scan | null>(null)
  const [practice, setPractice] = useState<PracticeLog>({})
  const stop = useRef(false)
  const sf = useRef<SF | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const storedRef = useRef(stored)
  storedRef.current = stored

  const engine = () => (sf.current ??= new SF())
  useEffect(() => () => sf.current?.destroy(), [])

  const games = useMemo(() => [...stored.lichess, ...stored.chesscom].sort((a, b) => b.ts - a.ts), [stored])
  const linked = !!(profile.lichess || profile.chesscom)
  const profileKey = `${profile.lichess ?? ''}|${profile.chesscom ?? ''}`

  const persist = useCallback(async (platform: Platform, user: string, list: UGame[]) => { await kvSet(gk(platform, user), list) }, [])

  // restore from the browser's storage: instant, no network
  useEffect(() => {
    let live = true
    ;(async () => {
      const next: Record<Platform, UGame[]> = { lichess: [], chesscom: [] }
      if (profile.lichess) next.lichess = (await kvGet<UGame[]>(gk('lichess', profile.lichess))) ?? []
      if (profile.chesscom) next.chesscom = (await kvGet<UGame[]>(gk('chesscom', profile.chesscom))) ?? []
      if (!live) return
      setStored(next); setStatus(next.lichess.length + next.chesscom.length ? 'ready' : 'idle')
      setScan((await kvGet<Scan>(`scan:${profileKey}`)) ?? null)
      setPractice((await kvGet<PracticeLog>('practice')) ?? {})
      if ((profile.lichess || profile.chesscom) && !next.lichess.length && !next.chesscom.length) fetchNew(profile, next)
    })()
    return () => { live = false }
  }, [profileKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNew = useCallback(async (p: Profile, cur: Record<Platform, UGame[]>) => {
    ctl.current?.abort()
    const c = new AbortController(); ctl.current = c
    setStatus('loading'); setError(null); setProgress(0)
    try {
      const book = await load<Book>('book.json')
      const next = { ...cur }
      let got = 0, partial = false
      for (const platform of ['lichess', 'chesscom'] as Platform[]) {
        const user = p[platform]
        if (!user) continue
        const have = cur[platform]
        const since = have.length ? Math.max(...have.map((g) => g.ts)) : null
        const fresh = platform === 'lichess'
          ? await loadLichess(user, since ? 500 : 800, since, (n) => setProgress(got + n), c.signal)
          : await loadChessCom(user, since ? 500 : 800, book, since, (n) => setProgress(got + n), c.signal)
        got += fresh.length; partial = partial || !!fresh.partial
        const ids = new Set(have.map((g) => g.id))
        next[platform] = [...fresh.filter((g) => !ids.has(g.id)), ...have].sort((a, b) => b.ts - a.ts)
        await persist(platform, user, next[platform])
      }
      setStored(next); setStatus('ready')
      if (partial) setError('The connection dropped part-way. Your games so far are saved; press Refresh to fetch the rest.')
    } catch (e: any) {
      if (e?.name === 'AbortError') { setStatus(storedRef.current.lichess.length + storedRef.current.chesscom.length ? 'ready' : 'idle'); return }
      setError(e instanceof AccountError ? e.message : 'Could not load games. Check the username and your connection.')
      setStatus(storedRef.current.lichess.length + storedRef.current.chesscom.length ? 'ready' : 'idle')
    }
  }, [persist])

  const link = useCallback(async (platform: Platform, user: string) => {
    const p = { ...readProfile(), [platform]: user.trim() }
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch { /* private mode */ }
    setProfile(p)
  }, [])

  const unlink = useCallback((platform: Platform) => {
    const p = { ...readProfile() }
    delete p[platform]
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch { /* private mode */ }
    setProfile(p)
    setStored((s) => ({ ...s, [platform]: [] }))
  }, [])

  const refresh = useCallback(() => fetchNew(profile, storedRef.current), [fetchNew, profile])

  const patchGame = useCallback((g: UGame) => {
    setStored((s) => ({ ...s, [g.platform]: s[g.platform].map((x) => (x.id === g.id ? g : x)) }))
  }, [])

  const analyseLosses = useCallback(async (depth: 9 | 12) => {
    stop.current = false
    const todo = games.filter((g) => g.res === 0 && g.blunder === undefined).slice(0, 80)
    if (!todo.length) return
    setTask({ running: true, label: 'Finding your blunders', done: 0, total: todo.length })
    const s = engine()
    for (let n = 0; n < todo.length && !stop.current; n++) {
      setTask({ running: true, label: 'Finding your blunders', done: n, total: todo.length })
      let g = todo[n]
      let evs = g.evs && g.evs.length === g.sans.length ? g.evs : null
      if (!evs) { evs = await evaluateGame(s, g, depth, () => stop.current); if (!evs) break }
      g = { ...g, evs, evSrc: g.evSrc ?? 'local' }
      const b = findBlunder(g, 20)
      if (b) b.best = await bestAt(s, g, b.ply, 12)
      g = { ...g, blunder: b }
      patchGame(g)
      if (n % 4 === 3) await saveEvalCache()
    }
    await saveEvalCache()
    setTask(IDLE)
    for (const platform of ['lichess', 'chesscom'] as Platform[]) { const u = profile[platform]; if (u) await persist(platform, u, storedRef.current[platform]) }
  }, [games, patchGame, persist, profile])

  const runScan = useCallback(async () => {
    stop.current = false
    const s = engine()
    const tree = await load<TreeFile>('tree.json').catch(() => null)
    setTask({ running: true, label: 'Checking your openings', done: 0, total: 1 })
    const opening = await findOpeningMistakes(s, games, tree, (p) => setTask({ running: true, label: 'Checking your openings', ...p }), () => stop.current)
    setTask({ running: true, label: 'Looking for missed tactics', done: 0, total: 1 })
    const missed = await findMissedTactics(s, games, (p) => setTask({ running: true, label: 'Looking for missed tactics', ...p }), () => stop.current)
    const res = { opening, missed, at: Date.now() }
    setScan(res); await kvSet(`scan:${profileKey}`, res); await saveEvalCache()
    setTask(IDLE)
  }, [games, profileKey])

  const stopTask = useCallback(() => { stop.current = true; sf.current?.stop() }, [])

  const recordPractice = useCallback((id: string, ok: boolean) => {
    setPractice((p) => {
      const cur = p[id] ?? { right: 0, wrong: 0, last: 0 }
      const next = { ...p, [id]: { right: cur.right + (ok ? 1 : 0), wrong: cur.wrong + (ok ? 0 : 1), last: Date.now() } }
      kvSet('practice', next)
      return next
    })
  }, [])

  const value: Ctx = { profile, linked, games, status, progress, error, link, unlink, refresh, task, analyseLosses, scan, runScan, stopTask, practice, recordPractice }
  return <UserCtx.Provider value={value}>{children}</UserCtx.Provider>
}
