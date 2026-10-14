import { useMemo, useState } from 'react'
import BoardView from './BoardView'
import { Chip, Segmented } from './ui'
import { PK, PIECE_PLURAL, PIECE_WORD, PieceKey, joinList, pieceName, pc } from '../lib/pieces'
import { fenAfter } from '../lib/positions'
import { RING, TINT } from '../lib/palette'
import type { OpeningDetailFile } from '../lib/types'

type Who = 'you' | 'them'
type Mode = 'slip' | 'lost'

/** Which piece goes wrong in an opening, where it ends up, and how it is lost. */
export default function WrongPanel({ o }: { o: OpeningDetailFile }) {
  const [who, setWho] = useState<Who>('them')
  const [mode, setMode] = useState<Mode>('slip')
  const slip = o.slip[who], lost = o.lost[who]
  const keys = PK.filter((k) => slip[k] || lost[k])
  const best = (Object.entries(slip).sort((a, b) => b[1].n - a[1].n)[0]?.[0] ?? keys[0] ?? 'N') as PieceKey
  const [pk, setPk] = useState<PieceKey>('N')
  const cur: PieceKey = keys.includes(pk) ? pk : best
  const ownerSide = who === 'you' ? o.side : 1 - o.side
  const s = slip[cur], l = lost[cur]
  const owner = who === 'you' ? 'Your' : 'Their'
  const { fen } = useMemo(() => fenAfter(o.line ?? []), [o.line])

  const spots: [string, number][] = mode === 'slip' ? (s?.to ?? []) : (l?.sq ?? [])
  const maxv = Math.max(0.0001, ...spots.map((x) => x[1]))
  const tint: Record<string, string> = {}
  spots.forEach(([q, v]) => { tint[q] = TINT.slip.replace(/[\d.]+\)$/, `${(0.3 + 0.5 * (v / maxv)).toFixed(2)})`) })
  const rings: Record<string, string> = {}
  ;(mode === 'slip' ? s?.ids : l?.ids)?.forEach(([q]) => { rings[q] = RING.piece })

  const name = (id: string) => pieceName(cur, id)
  const slipTxt = s && [
    `${owner} ${PIECE_WORD[cur]} is the piece that gives the lead away in ${pc(s.share)} of these swings (${s.n.toLocaleString()} cases).`,
    cur !== 'Q' && cur !== 'K' && s.ids.length > 1 ? `Which one: ${joinList(s.ids.slice(0, 3).map(([q, v]) => `the ${name(q)} (${q}) ${pc(v)}`))}.` : null,
    s.to.length ? `It usually lands on ${joinList(s.to.slice(0, 3).map(([q, v]) => `${q} (${pc(v)})`))}.` : null,
    s.cap >= 0.05 ? `The reply simply wins it ${pc(s.cap)} of the time${s.by.length ? `, mostly with a ${joinList(s.by.slice(0, 2).map(([k]) => PIECE_WORD[k as PieceKey]))}` : ''}.` : 'It is rarely won outright; the damage comes from what the move allows.',
  ].filter(Boolean) as string[]
  const lostTxt = l && [
    `${owner} ${PIECE_PLURAL[cur]} are captured ${l.per100.toFixed(0)} times per 100 games; ${pc(l.clean)} are not recaptured straight away.`,
    l.ids.length ? `Most often the ${joinList(l.ids.slice(0, 2).map(([q, v]) => `${name(q)} (${q}, ${v.toFixed(0)} per 100)`))}.` : null,
    l.sq.length ? `Typical squares: ${joinList(l.sq.slice(0, 3).map(([q, v]) => `${q} (${v.toFixed(0)})`))}.` : null,
    l.by.length ? `Taken by a ${joinList(l.by.slice(0, 3).map(([k, v]) => `${PIECE_WORD[k as PieceKey]} ${pc(v)}`))}.` : null,
  ].filter(Boolean) as string[]

  return (
    <section className="card">
      <div className="card-head">
        <h3>Where it goes wrong</h3>
        <Segmented value={who} onChange={setWho} options={[{ value: 'them', label: 'Their pieces' }, { value: 'you', label: 'Your pieces' }]} label="Whose pieces" />
      </div>
      <div className="card-sub">Pick a piece. Orange squares: where it lands when the lead slips, or where it is captured. Red rings: which one it is.</div>
      <div className="row" style={{ padding: '12px 20px 0', gap: 6 }}>
        {keys.map((k) => (
          <button key={k} className="chip" aria-pressed={k === cur} onClick={() => setPk(k)}>
            {PIECE_WORD[k]}{slip[k] && <span className="muted">{pc(slip[k].share)}</span>}
          </button>
        ))}
        <span style={{ marginLeft: 'auto' }}><Segmented value={mode} onChange={setMode} options={[{ value: 'slip', label: 'Where it slips' }, { value: 'lost', label: 'Where it is lost' }]} label="View" /></span>
      </div>
      <div className="wrong-grid">
        <div><BoardView fen={fen} size={300} flipped={o.side === 1} tint={tint} rings={rings} id={`wrong-${who}-${cur}-${mode}`} notation /></div>
        <div style={{ minWidth: 0 }}>
          <ul className="bullets">{(mode === 'slip' ? slipTxt : lostTxt)?.map((t, i) => <li key={i}>{t}</li>) ?? <li className="muted">Not enough games for this piece.</li>}</ul>
          <div className="row" style={{ marginTop: 14, gap: 6 }}>
            {(mode === 'slip' ? s?.ids : l?.ids)?.slice(0, 3).map(([q, v]) => <Chip key={q}><i className="dot" style={{ boxShadow: `inset 0 0 0 2px ${RING.piece}`, borderRadius: 2, background: 'transparent' }} />{name(q)} · {q}{mode === 'lost' ? ` · ${(v as number).toFixed(0)}/100` : ` · ${pc(v)}`}</Chip>)}
          </div>
        </div>
      </div>
    </section>
  )
}
