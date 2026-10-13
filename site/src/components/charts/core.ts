import { RefObject, useEffect, useState } from 'react'

export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 600) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))))
    ro.observe(el)
    setW(Math.max(200, Math.floor(el.getBoundingClientRect().width)))
    return () => ro.disconnect()
  }, [ref])
  return w
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) { max = min + 1 }
  const span = max - min
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10))
  return out
}
