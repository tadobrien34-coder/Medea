import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import HoverBoard from './HoverBoard'
import { Chip, Segmented } from './ui'
import { num, openingPath, pct, signed } from '../lib/format'
import type { OpeningIndexItem } from '../lib/types'
import { toneOf } from '../pages/Openings'

type Sort = 'human' | 'engine' | 'games'

/** Variations of a family ranked by how they do for real players, with the engine view alongside. Hover for the board and plan. */
export default function VariationCompare({ items, baseScore, family, familySide }: { items: OpeningIndexItem[]; baseScore: number; family: string; familySide: 0 | 1 }) {
  const [sort, setSort] = useState<Sort>('human')
  const rows = useMemo(() => items.filter((k) => k.n >= 100).map((k) => {
    // everything below is from the family's side: a variation played by the other colour is flipped
    const flip = k.side !== familySide
    const bn = k.band_n ?? [], bs = (k.band_score ?? []).map((v) => (v == null ? null : flip ? 1 - v : v))
    const wavg = (idx: number[]) => { let n = 0, s = 0; idx.forEach((i) => { if (bs[i] != null && bn[i] >= 15) { n += bn[i]; s += bs[i]! * bn[i] } }); return n >= 25 ? s / n : null }
    const groups = [wavg([0, 1]), wavg([2]), wavg([3, 4])]
    const human = wavg([0, 1, 2, 3])
    const sc = flip ? 1 - k.score : k.score
    const engine = (flip ? -1 : 1) * (k.med?.['16'] ?? k.obj)
    return { k, flip, groups, human: human ?? sc, engine, rel: (flip ? -1 : 1) * k.rel_obj }
  }), [items, familySide])
  const sorted = useMemo(() => [...rows].sort((a, b) => (sort === 'human' ? b.human - a.human : sort === 'engine' ? b.rel - a.rel : b.k.n - a.k.n)), [rows, sort])
  const eligible = rows.filter((r) => r.k.n >= 150)
  const bestHuman = [...eligible].sort((a, b) => b.human - a.human)[0]?.k.key
  const bestEngine = [...eligible].sort((a, b) => b.rel - a.rel)[0]?.k.key
  if (!rows.length) return null
  const cell = (v: number | null) => (v == null ? <span className="muted">–</span> : <span style={{ fontWeight: 550, color: v - baseScore >= 0.02 ? 'var(--good)' : v - baseScore <= -0.03 ? 'var(--bad)' : undefined }}>{pct(v)}</span>)
  return (
    <section className="card">
      <div className="card-head">
        <h3>Variations for human players</h3>
        <Segmented value={sort} onChange={setSort} options={[{ value: 'human', label: 'Human results' }, { value: 'engine', label: 'Engine' }, { value: 'games', label: 'Popularity' }]} label="Sort" />
      </div>
      <div className="card-sub">
        Score is the share of points taken by the side playing {family} ({familySide === 0 ? 'White' : 'Black'}), from real games, split by rating. Lines chosen by the other side are shown from the same point of view. Green is above this opening’s average ({pct(baseScore)}). Hover a name for the position and its plan.
      </div>
      <div className="table-wrap" style={{ padding: '6px 8px 10px' }}>
        <table className="t compact">
          <thead><tr><th>Variation</th><th className="r">Games</th><th className="r">Under 1400</th><th className="r">1400–1800</th><th className="r">1800+</th><th className="r">Engine</th><th>Plan</th></tr></thead>
          <tbody>
            {sorted.map(({ k, groups, flip, engine }) => (
              <tr key={k.key}>
                <td>
                  <HoverBoard line={k.line} next={(k.next ?? []) as [string, number][]} flipped={k.side === 1} title={k.key.split(': ').slice(1).join(': ') || k.key}
                    caption={<>{k.plan || ''}<div style={{ marginTop: 4 }} className="muted">{pct(k.score)} · {num(k.n)} games</div></>}>
                    <Link to={openingPath(k.key)} className="name dotted" style={{ color: 'var(--ink)' }}>{k.key.split(': ').slice(1).join(': ') || k.key}</Link>
                  </HoverBoard>
                  <div className="row" style={{ gap: 4, marginTop: 3 }}>
                    {flip ? <Chip>{k.side === 0 ? 'White' : 'Black'}’s try</Chip> : <Chip tone={toneOf(k.verdict)}>{k.verdict}</Chip>}
                    {k.key === bestHuman && <Chip tone="good">Best for humans</Chip>}
                    {k.key === bestEngine && <Chip tone="accent">Best on the engine</Chip>}
                  </div>
                </td>
                <td className="r">{num(k.n)}</td>
                <td className="r">{cell(groups[0])}</td><td className="r">{cell(groups[1])}</td><td className="r">{cell(groups[2])}</td>
                <td className="r">{signed(engine, 2)}</td>
                <td className="small ink2" style={{ minWidth: 200 }}>{k.plan || '–'}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
