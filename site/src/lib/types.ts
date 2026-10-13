export type TreeMove = [san: string, n: number, w: number, d: number, l: number, med: number | null, status: Status]
export type Status = 'main' | 'sound' | 'rare' | 'dubious' | 'outrageous'
export interface TreeFile { root: string; nodes: Record<string, TreeMove[]> }

export interface OpeningIndexItem {
  key: string; level: 'v' | 'f'; slug: string; family: string; side: 0 | 1; eco: string | null; n: number; score: number
  wdl: [number, number, number]; obj: number; rel_obj: number; steady: number; play: number
  tier_obj: 'good' | 'sound' | 'dubious'; tier_play: 'high' | 'ok' | 'tricky'; verdict: string; sd30: number | null
  edge: { share: number | null; move: number | null }; win: { share: number | null; move: number | null }
  shifts_per_game: number; med: Record<string, number | null>; line: string[] | null
}
export interface OpeningsFile { baselines: Record<string, number[]>; min_games: number; openings: OpeningIndexItem[] }

export interface OpeningDetailFile extends OpeningIndexItem {
  traj: { med: number[]; sd: number[]; n: number[] }
  by_tc: Record<string, { n: number; score: number }>
  bands: { band: string; n: number; win: number; draw: number; loss: number }[]
  wins: { mate: number; resign: number; time: number; median_move: number | null }
  losses: { mate: number; resign: number; time: number; median_move: number | null }
  careful: number[]; target: number[]; punish: number[]
  careful_moves: [number, number] | null; target_moves: [number, number] | null
  signature: { yours: Sig[]; theirs: Sig[] }
  summary: string[]; children?: string[]
}
export interface Sig { id: string; name: string; per100: number; lift: number }

export interface GmOpeningEntry { id: string; name: string; title?: string; n: number; w: number; d: number; l: number; tcs: Record<string, number> }
export type GmOpeningsFile = Record<string, { n: number; gms: GmOpeningEntry[] }>

export interface LevelEntry {
  lo: number; hi: number | null; label: string; n: number; thin?: boolean
  result: { white: number; draw: number; black: number }
  end: { mean: number; median: number; p25: number; p75: number; hist: number[]; by: Record<'mate' | 'resign' | 'time' | 'draw', { share: number; mean: number }> }
  shifts: { mean: number; zero: number; hist: number[]; wire_to_wire: number }
  final_shift: { n: number; median: number | null; mean: number | null; p25: number | null; p75: number | null; hist: number[] }
  ponr: { n: number; median: number | null; hist: number[] }
  edge: { reached: number; both: number }; winning: { reached: number; both: number }
  pieces: { blunder: number[]; punish: number[]; by_phase: number[][]; blunder_all: number[]; mistake_all: number[]; moves: number[] }
  checks: { white: number; black: number; winner: number; loser: number; pct_white: number; pct_black: number; pct_winner: number; pct_loser: number; pct_all: number }
  captures: { white: number; black: number; winner: number; loser: number; pct_all: number; pct_winner: number; pct_loser: number }
  blunder: {
    n_moves: number; overall: number; mistake: number; inaccuracy: number
    by_move: { lo: number; hi: number | null; moves: number; blunder: number | null; mistake: number | null }[]
    by_clock_sec: { lo: number; hi: number | null; moves: number; blunder: number | null; mistake: number | null }[]
    by_clock_pct: { lo: number; hi: number | null; moves: number; blunder: number | null; mistake: number | null }[]
  }
  time: { avg_per_move: number | null; per_move_by_move: (number | null)[]; clock_pct_by_move: (number | null)[]; flag_pct: number | null; flag_while_ahead2: number | null; flag_while_winning: number | null }
}
export type LevelsFile = Record<string, LevelEntry[]>
