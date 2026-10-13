# Pipeline

Builds everything in `site/public/data` from Lichess games. Run from this folder.

```bash
pip install -r requirements.txt
```

| Step | Script | Output |
| --- | --- | --- |
| 1. Stream analysed games from a monthly dump | `stream_dump.py YYYY-MM --cap 1500` | `raw/games_YYYY-MM.jsonl` |
| 2. Pick the GM / top-player pool and fetch their games | `fetch_gm.py pool`, `fetch_gm.py games --top 15 [--tcs bullet,blitz]` | `ref/gm_pool.json`, `raw/gm/*.ndjson` |
| 3. Top up thin rating cells with analysed API games | `convert_gm.py` | `raw/games_gm.jsonl` |
| 4. Per-game analysis, in parallel | `build_dump.py` | `out/dump_tables.pkl` |
| 5. Write the site's JSON | `make_all.py` | `../site/public/data/**` |

`stream_dump.py` keeps at most `--cap` games per (time control, 100-Elo group), reads Lichess's own evaluations and clocks from the PGN, resumes dropped connections, and stops cleanly when `raw/STOP` exists.

## Modules

* `lib.py` – constants and definitions (lead 1.0, winning advantage 6.0, blunder thresholds).
* `features.py` – per-game features: shifts, blunders, edge / winning advantage timing, clocks.
* `agg_levels.py` – additive per-rating aggregates, rendered by `mk_levels.py`.
* `board_pass.py` – python-chess pass: opening-tree edges and tactic detection.
* `mk_openings.py`, `mk_tree.py`, `mk_tactics.py`, `mk_gm.py`, `mk_method.py` – JSON builders.
* `threshold_test*.py` – the original winning-advantage retention experiments.
