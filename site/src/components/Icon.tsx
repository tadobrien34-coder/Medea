const P: Record<string, string> = {
  board: 'M4 4h16v16H4z M4 12h16 M12 4v16',
  levels: 'M5 20V10 M12 20V4 M19 20v-7',
  book: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h10',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  clock: 'M12 7v5l3 2 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M21 20v-1a4 4 0 0 0-3-3.9 M16 4.1a3.5 3.5 0 0 1 0 6.8',
  crown: 'M4 18h16 M5 18 4 8l5 4 3-6 3 6 5-4-1 10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
  spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5 18 18 M6 18l2.5-2.5 M15.5 8.5 18 6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  first: 'M6 5v14 M18 6l-8 6 8 6z',
  prev: 'M16 6l-8 6 8 6',
  next: 'M8 6l8 6-8 6',
  last: 'M18 5v14 M6 6l8 6-8 6z',
  flip: 'M7 4 3 8l4 4 M3 8h14a4 4 0 0 1 4 4 M17 20l4-4-4-4 M21 16H7a4 4 0 0 1-4-4',
  reset: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  external: 'M14 4h6v6 M20 4 10 14 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'M5 12.5 10 17.5 19 7',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  github: 'M9 19c-4 1.4-4-2-6-2.5 M15 21v-3.5a3 3 0 0 0-.9-2.3c3-.3 6.2-1.5 6.2-6.7a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.4 0C6.3 1.9 5.2 2.2 5.2 2.2a4.6 4.6 0 0 0-.1 3.5A5 5 0 0 0 3.7 9.2c0 5.2 3.2 6.4 6.2 6.7A3 3 0 0 0 9 18.2V21',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
}
export default function Icon({ name, size = 17 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {(P[name] ?? '').split(' M').map((d, i) => <path key={i} d={(i ? 'M' : '') + d} />)}
    </svg>
  )
}
