import type { Missed } from './analysis'
export const missedId = (m: Missed) => `m:${m.gameId}:${m.move}`
