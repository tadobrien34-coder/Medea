import { useEffect, useRef, useState } from 'react'
import { evalCache } from './analysis'
import { SF, whiteCp } from './sf'

/** Engine evaluation (white's point of view, centipawns) for each position, computed one after another and remembered. */
export function useEngineEvals(fens: string[], depth = 10): Record<string, number | null> {
  const [out, setOut] = useState<Record<string, number | null>>({})
  const sf = useRef<SF | null>(null)
  const key = fens.join('|')
  useEffect(() => {
    let live = true
    ;(async () => {
      const cache = await evalCache()
      const next: Record<string, number | null> = {}
      for (const f of fens) { const k = `${f.split(' ').slice(0, 4).join(' ')}|${depth}`; next[f] = cache.get(k) ?? null }
      if (live) setOut({ ...next })
      for (const f of fens) {
        if (!live) return
        const k = `${f.split(' ').slice(0, 4).join(' ')}|${depth}`
        if (cache.has(k)) continue
        if (!sf.current) sf.current = new SF()
        const r = await sf.current.search(f, { depth })
        if (!live) return
        const v = r.lines[0] ? Math.max(-1000, Math.min(1000, whiteCp(r.lines[0], f))) : 0
        cache.set(k, v); next[f] = v
        setOut({ ...next })
      }
    })()
    return () => { live = false; sf.current?.stop() }
  }, [key, depth]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => sf.current?.destroy(), [])
  return out
}
