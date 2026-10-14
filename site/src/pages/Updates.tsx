import { PageHead } from '../components/ui'
import { BUILT, REPO } from '../version'

const RELEASES = [
  {
    v: '1.1.0', date: BUILT, title: 'Your games, saved. Boards everywhere.',
    groups: [
      ['Openings', ['Each opening page now opens with the line playing out move by move, plus a Plans button: common moves, engine picks, squares where material is won, and loose pieces drawn on the board.', 'Where it goes wrong: pick a piece to see which one slips (for example the king’s knight or the queen’s knight), where it lands, and how it is lost.', 'Variations for human players: every variation of a family ranked by real results at under 1400, 1400–1800 and 1800+, next to the engine view, with a plan for each.']],
      ['Boards on hover', ['Hover any opening, variation, candidate move, repertoire line or tree line to see the position, the plan and the common next moves.', 'The Tactics page shows real example positions with the move and the squares where material was won.']],
      ['My profile', ['Link Lichess and Chess.com once. Games are kept in your browser, so leaving the page never reloads them. Refresh fetches only new games.', 'My games: sort by opening or group by opening, and see the move you blundered on in every loss. Medea runs the engine in your browser for games Lichess has not analysed.', 'My openings: your openings by colour, with a Play vs computer button on each.', 'My opening tree: every position you have reached, with repeated mistakes flagged, and a link out to OpeningTree.', 'My time: time per move and clock left against players at your rating, plus blunders by time left.', 'Frequent mistakes: repeated opening mistakes, missed tactics and how you lose. Practise them in a drill that remembers what you got right.']],
      ['Play vs computer', ['Start from any opening and play Stockfish at the rating you choose, from 400 to 3000.']],
      ['Fixes', ['Opening piece statistics now attribute every swing to the right game (an indexing bug made some opening pages show the wrong piece shares).', 'Clock handling fixed for berserked games; interrupted downloads keep the games already received.']],
    ] as [string, string[]][],
  },
  {
    v: '1.0.0', date: BUILT, title: 'First release',
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
        {RELEASES.map((r, ri) => (
          <section className="card card-pad" key={r.v}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h2>v{r.v}</h2>{ri === 0 && <span className="chip accent">Latest</span>}<span className="muted small">{r.date} · {r.title}</span>
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
