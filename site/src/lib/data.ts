import { useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL
const cache = new Map<string, Promise<unknown>>()

export function load<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(`${BASE}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

export interface Loaded<T> { data: T | null; loading: boolean; error: string | null }

/** Fetches a JSON data file. Keeps the previous result on screen while the next one loads. */
export function useData<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: !!path, error: null })
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return }
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    load<T>(path).then(
      (d) => live && setState({ data: d, loading: false, error: null }),
      (e) => live && setState((s) => ({ ...s, loading: false, error: String(e.message ?? e) })),
    )
    return () => { live = false }
  }, [path])
  return state
}
