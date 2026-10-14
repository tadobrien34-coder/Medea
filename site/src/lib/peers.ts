import { useMemo } from 'react'
import { useData } from './data'
import type { LevelEntry, LevelsFile } from './types'

export interface Peers {
  group: LevelEntry | null       // players at your rating (400-point group)
  top: LevelEntry | null         // the 2800+ group
  flagRate: number | null        // per player: a game has one flagger out of two players
  blunderRate: number | null
  loading: boolean
}

/** Rating group for a rating, from the Levels data of one time control ('all' = every time control). */
export function usePeers(tc: string | null, rating: number | null): Peers {
  const file = tc ? `levels_${tc.toLowerCase()}.json` : null
  const { data, loading } = useData<LevelsFile>(file)
  return useMemo(() => {
    const list = data?.['400'] ?? []
    const ok = list.filter((e) => !e.thin)
    const group = rating == null ? null : ok.find((e) => rating >= e.lo && (e.hi == null || rating <= e.hi)) ?? null
    const top = ok.find((e) => e.hi == null && e.lo >= 2800) ?? null
    return { group, top, loading, flagRate: group?.time.flag_pct != null ? group.time.flag_pct / 2 : null, blunderRate: group?.blunder.overall ?? null }
  }, [data, rating, loading])
}

export const avgRating = (games: { rating: number | null }[]) => {
  const r = games.filter((g) => g.rating)
  return r.length ? Math.round(r.reduce((a, g) => a + (g.rating as number), 0) / r.length) : null
}
