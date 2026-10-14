import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import BoardView, { Arrow } from './BoardView'
import { fenAfter, moveArrows } from '../lib/positions'

/** Wrap anything: hovering shows a small board of the line (or position) with an optional caption. Mouse only; touch just navigates. */
export default function HoverBoard({ line, fen, title, caption, next, flipped, children, as: Tag = 'span', arrows }: {
  line?: string[] | null; fen?: string; title?: ReactNode; caption?: ReactNode; next?: [string, number][]; flipped?: boolean
  children: ReactNode; as?: 'span' | 'div'; arrows?: Arrow[]
}) {
  const none = !fen && !(line && line.length)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const el = useRef<HTMLElement | null>(null)

  const show = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const r = el.current!.getBoundingClientRect()
      const W = 252, H = 330
      let x = r.right + 12
      if (x + W > window.innerWidth - 8) x = Math.max(8, r.left - W - 12)
      let y = r.top + r.height / 2 - H / 2
      y = Math.max(8, Math.min(window.innerHeight - H - 8, y))
      setPos({ x, y })
    }, 220)
  }
  const hide = () => { window.clearTimeout(timer.current); setPos(null) }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const view = useMemo(() => {
    if (!pos) return null
    const f = fen ? { fen, last: null as [string, string] | null } : fenAfter(line ?? [])
    const arr = arrows ?? (next && next.length ? moveArrows(f.fen, next) : [])
    return { ...f, arr }
  }, [pos, line, fen, next, arrows])

  if (none) return <>{children}</>
  return (
    <Tag ref={el as never} onPointerEnter={show} onPointerLeave={hide} onPointerDown={hide} style={{ display: Tag === 'span' ? 'inline-block' : undefined }}>
      {children}
      {pos && view && createPortal(
        <div className="hover-board" style={{ left: pos.x, top: pos.y }} role="tooltip">
          <BoardView fen={view.fen} size={224} last={view.last} arrows={view.arr} flipped={flipped} />
          {title && <div className="hb-title">{title}</div>}
          {caption && <div className="hb-cap">{caption}</div>}
        </div>, document.body)}
    </Tag>
  )
}
