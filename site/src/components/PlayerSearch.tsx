import { useEffect, useMemo, useRef, useState } from 'react'

export interface PlayerOpt { id: string; name: string; title: string | null; rating: number | null; tc: string }

/** Type a name and pick from the matches (name, rating and time control shown). */
export default function PlayerSearch({ options, onPick, placeholder = 'Find a player' }: { options: PlayerOpt[]; onPick: (o: PlayerOpt) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return options.filter((o) => o.name.toLowerCase().includes(t)).sort((a, b) => Number(b.name.toLowerCase().startsWith(t)) - Number(a.name.toLowerCase().startsWith(t)) || (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 8)
  }, [q, options])
  useEffect(() => { setHi(0) }, [q])
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away); return () => document.removeEventListener('mousedown', away)
  }, [])
  const pick = (o: PlayerOpt) => { onPick(o); setQ(''); setOpen(false) }
  return (
    <div className="combo" ref={box}>
      <input type="search" value={q} placeholder={placeholder} aria-label={placeholder} role="combobox" aria-expanded={open && matches.length > 0}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(matches.length - 1, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
          else if (e.key === 'Enter' && matches[hi]) { e.preventDefault(); pick(matches[hi]) }
          else if (e.key === 'Escape') setOpen(false)
        }} />
      {open && matches.length > 0 && (
        <ul className="combo-list" role="listbox">
          {matches.map((o, i) => (
            <li key={o.id + o.tc} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o) }}>
              <span>{o.title && <span className="muted">{o.title} </span>}<strong>{o.name}</strong></span>
              <span className="muted small num">{o.rating ?? '–'} · {o.tc}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
