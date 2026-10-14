import type { ReactNode } from 'react'

export interface SortState { k: string; dir: 1 | -1 }

/** Sort rows by a key; empty values always go last. */
export function sortRows<T>(rows: T[], get: (r: T, k: string) => number | string | null | undefined, s: SortState): T[] {
  return [...rows].sort((a, b) => {
    const x = get(a, s.k), y = get(b, s.k)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (x < y ? -1 : x > y ? 1 : 0) * s.dir
  })
}

export function SortTh({ k, label, sort, onSort, right, first = -1 }: { k: string; label: ReactNode; sort: SortState; onSort: (s: SortState) => void; right?: boolean; first?: 1 | -1 }) {
  const on = sort.k === k
  return (
    <th className={`sortable ${right ? 'r' : ''}`} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort({ k, dir: on ? ((-sort.dir) as 1 | -1) : first })}>
      {label}<span className="sort-mark">{on ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}</span>
    </th>
  )
}
