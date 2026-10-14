import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ArrowLayer from './ArrowLayer'
import BoardView from './BoardView'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('arrows are present on the very first render', () => {
  it('ArrowLayer draws one group per arrow', () => {
    const html = renderToStaticMarkup(<ArrowLayer arrows={[{ startSquare: 'e2', endSquare: 'e4', color: 'red' }, { startSquare: 'g1', endSquare: 'f3', color: 'blue' }]} />)
    expect(html).toContain('data-arrow="e2e4"')
    expect(html).toContain('data-arrow="g1f3"')
    expect(html).toContain('data-arrow-count="2"')
  })

  it('BoardView renders its arrows in the initial markup (no effects, no second pass)', () => {
    const html = renderToStaticMarkup(<BoardView fen={START} arrows={[{ startSquare: 'd2', endSquare: 'd4', color: 'green' }]} />)
    expect(html).toContain('data-arrow="d2d4"')
  })

  it('arrow geometry follows the board orientation', () => {
    const white = renderToStaticMarkup(<ArrowLayer arrows={[{ startSquare: 'a1', endSquare: 'a2', color: 'red' }]} />)
    const black = renderToStaticMarkup(<ArrowLayer arrows={[{ startSquare: 'a1', endSquare: 'a2', color: 'red' }]} flipped />)
    expect(white).not.toEqual(black)
    expect(white).toContain('x1="50" y1="732"')   // a1 sits bottom-left from White's side (shaft starts just above its centre)
    expect(black).toContain('x1="750" y1="68"')   // and top-right when the board is flipped
  })

  it('draws nothing for an empty list or a zero-length arrow', () => {
    expect(renderToStaticMarkup(<ArrowLayer arrows={[]} />)).toContain('data-arrow-count="0"')
    expect(renderToStaticMarkup(<ArrowLayer arrows={[{ startSquare: 'e4', endSquare: 'e4', color: 'red' }]} />)).not.toContain('data-arrow="e4e4"')
  })
})
