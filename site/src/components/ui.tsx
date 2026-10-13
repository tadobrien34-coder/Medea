import { ReactNode, useState } from 'react'
import Icon from './Icon'

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <div className="filter"><label>{label}</label>{children}</div>
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="grow"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}

export function Stat({ label, value, hint, unit }: { label: string; value: ReactNode; hint?: ReactNode; unit?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}{unit && <small>{unit}</small>}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function WDL({ w, d, l, title }: { w: number; d: number; l: number; title?: string }) {
  const t = w + d + l || 1
  return (
    <div className="wdl" title={title ?? `${(100 * w / t).toFixed(0)}% win · ${(100 * d / t).toFixed(0)}% draw · ${(100 * l / t).toFixed(0)}% loss`}>
      <i style={{ flex: Math.max(w, 0.0001) }} /><i style={{ flex: Math.max(d, 0.0001) }} /><i style={{ flex: Math.max(l, 0.0001) }} />
    </div>
  )
}

export function Meter({ value, max = 1 }: { value: number; max?: number }) {
  return <div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, (100 * value) / max))}%` }} /></div>
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  return <span className={`chip ${tone ?? ''}`}>{children}</span>
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>{label}…</span></div>
}

export function Collapsible({ title, children, open: o = false }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(o)
  return (
    <div>
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open} style={{ padding: '4px 8px' }}>
        <Icon name="arrow" size={14} /> {title}
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

/** Horizontal share bars for the six pieces. */
export function HBars({ labels, values, color, fmt, total, marks }: { labels: string[]; values: number[]; color?: string; fmt?: (v: number) => string; total?: number; marks?: (number | null)[] }) {
  const t = total ?? (values.reduce((a, b) => a + b, 0) || 1)
  const max = Math.max(...values, 1)
  return (
    <div className="hbars">
      {labels.map((l, i) => (
        <div className="hbar" key={l}>
          <span className="ink2">{l}</span>
          <span className="track"><i style={{ width: `${(100 * values[i]) / max}%`, background: color ?? 'var(--s1)' }} /></span>
          <span className="v">{fmt ? fmt(values[i]) : `${((100 * values[i]) / t).toFixed(0)}%`}
            {marks?.[i] != null && marks[i]! >= 1.2 && <span className="chip warn" style={{ marginLeft: 6, padding: '0 6px', fontSize: 11 }} title="Share compared with all openings">{marks[i]!.toFixed(1)}×</span>}</span>
        </div>
      ))}
    </div>
  )
}
