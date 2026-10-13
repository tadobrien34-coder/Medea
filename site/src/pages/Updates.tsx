import { PageHead } from '../components/ui'
import { BUILT, REPO, VERSION } from '../version'

const RELEASES = [
  {
    v: VERSION, date: BUILT, title: 'First release',
    groups: [
      ['Explore', ['Interactive board with drag, click and keyboard moves, a live Stockfish evaluation, opening names, and the moves real players chose next.', 'Which grandmasters play the line you are on, with a link to the full opening page.']],
      ['Levels', ['Statistics for every rating, grouped in 100, 200, 400, 600 or 800 Elo steps: when games end, advantage shifts, the final shift, pieces moved when the lead was thrown away, checks, captures.', 'Blunder % by move number and by time left, plus time-per-move and clock curves for each time control.']],
      ['Openings', ['Every opening with at least 100 analysed games, classified by objective strength and by playability.', 'Median advantage and standard deviation on every move, pieces to be careful with, targets, and how fast a steady edge arrives.', 'Depth-first tree search that prunes outrageous moves.']],
      ['Tactics', ['Twenty-two tactics ranked by how often they reach a winning advantage, with the pattern to recognise, how to hold the edge, and the blunders that follow.']],
      ['Players & time', ['Time per move, flag % and blunder % for the strongest Lichess players, with who is good and bad with the clock.']],
      ['GM repertoires', ['Top-rated players for bullet, blitz, rapid and classical with their most played openings, results, and how those games are won and lost.']],
      ['My games', ['Link a Lichess or Chess.com username to see your openings by time control with win / draw / loss, and a short read on how you win and lose.']],
      ['Method', ['A winning advantage is defined as +6.0, chosen by testing how often advantages are kept at every threshold.']],
    ] as [string, string[]][],
  },
]

export default function Updates() {
  return (
    <>
      <PageHead title="Updates" sub="What changed in each version." actions={<a className="btn" href={REPO} target="_blank" rel="noreferrer">GitHub</a>} />
      <div className="stack-lg">
        {RELEASES.map((r) => (
          <section className="card card-pad" key={r.v}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h2>v{r.v}</h2><span className="chip accent">Latest</span><span className="muted small">{r.date} · {r.title}</span>
            </div>
            <div className="stack">
              {r.groups.map(([g, items]) => (
                <div key={g}>
                  <div className="section-title">{g}</div>
                  <ul className="bullets">{items.map((i) => <li key={i}>{i}</li>)}</ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
