export interface Arrow { startSquare: string; endSquare: string; color: string }

const centre = (sq: string, flipped: boolean): [number, number] => {
  const f = sq.charCodeAt(0) - 97, r = parseInt(sq[1], 10) - 1
  return [(flipped ? 7 - f : f) * 100 + 50, (flipped ? r : 7 - r) * 100 + 50]
}

/** Arrows drawn as plain SVG over a board. No measuring and no effects, so they are present on the very first render. */
export default function ArrowLayer({ arrows, flipped = false }: { arrows: Arrow[]; flipped?: boolean }) {
  return (
    <svg className="arrow-layer" viewBox="0 0 800 800" aria-hidden="true" data-arrow-count={arrows.length}>
      {arrows.map((a, i) => {
        if (a.startSquare === a.endSquare) return null
        const [x1, y1] = centre(a.startSquare, flipped), [x2, y2] = centre(a.endSquare, flipped)
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len
        const head = 40, half = 30
        const bx = x2 - ux * head, by = y2 - uy * head          // where the shaft meets the head
        const sx = x1 + ux * 18, sy = y1 + uy * 18
        const tipX = x2 - ux * 6, tipY = y2 - uy * 6
        const px = -uy, py = ux
        return (
          <g key={`${a.startSquare}${a.endSquare}${i}`} data-arrow={`${a.startSquare}${a.endSquare}`} fill={a.color} stroke={a.color}>
            <line x1={sx} y1={sy} x2={bx} y2={by} strokeWidth={16} strokeLinecap="round" />
            <polygon points={`${tipX},${tipY} ${bx + px * half},${by + py * half} ${bx - px * half},${by - py * half}`} strokeWidth={2} strokeLinejoin="round" />
          </g>
        )
      })}
    </svg>
  )
}
