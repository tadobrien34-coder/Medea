# Medea

How chess games are won and lost at every rating, built from real Lichess games.

**Live site:** https://tadobrien34-coder.github.io/Medea/

| Page | What it shows |
| --- | --- |
| **Explore** | A board you can play on, a live Stockfish evaluation, the opening name, which grandmasters play it, and what real games did next. |
| **Levels** | Per-rating statistics in 100 / 200 / 400 / 600 / 800 Elo groups: when games end, advantage shifts, the final shift, the piece moved when the lead was thrown away, checks, captures, blunder % by move and by clock, and time use. |
| **Openings** | Every opening with 100+ analysed games, classified by objective strength and playability, with median advantage and standard deviation on every move. |
| **Tactics** | Twenty-two tactics ranked by how often they produce a winning advantage, with how to recognise them, hold the edge, and avoid the blunders that follow. |
| **Players & time** | Time per move, flag % and blunder % for the strongest players. |
| **GM repertoires** | Top-rated players per time control, their most played openings, results, and how they win and lose. |
| **Play vs computer** | Start from any opening and play Stockfish at a rating you choose. |
| **My games / openings / tree / time / mistakes** | Link a Lichess or Chess.com username once. Games are saved in your browser; sort by opening, see where you blundered, analyse with the in-browser engine, find repeated opening mistakes and missed tactics, and practise them. |
| **Method / Updates** | Definitions, the winning-advantage test, sample sizes, and the changelog. |

## Layout

```
site/        React + Vite front end (deployed to GitHub Pages)
  public/data/   generated JSON the site reads
  public/engine/ Stockfish 19 lite (single-threaded WASM)
pipeline/    Python pipeline that builds public/data
```

## Run the site

```bash
cd site
npm install
npm run dev
```

## Rebuild the data

Needs Python 3.10+ with `numpy`, `requests`, `zstandard`, `chess`.

```bash
cd pipeline
python stream_dump.py 2026-09 --cap 1500     # stream a Lichess monthly dump (resumable, stop with: touch raw/STOP)
python fetch_gm.py pool && python fetch_gm.py games --top 20
python build_dump.py                          # per-game analysis, in parallel -> out/dump_tables.pkl
python make_all.py                            # writes site/public/data/*.json
```

## Definitions

* **Advantage shift**: the side that is better by 1.0 or more changes.
* **Winning advantage**: +6.0, sustained for three plies. Chosen by testing how often an advantage reached at each threshold is kept to the end of the game (see the Method page).
* **Blunder / mistake**: a move costing at least 30 / 20 points of win chance (Lichess's thresholds).

Data: [Lichess open database](https://database.lichess.org/) (CC0) and the Lichess and Chess.com public APIs. Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings). Engine: [Stockfish.js](https://github.com/nmrugg/stockfish.js).
