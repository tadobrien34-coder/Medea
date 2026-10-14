/** Promise-based Stockfish wrapper (single-threaded lite WASM). Searches are queued one at a time. */
export interface SfLine { multipv: number; cp: number | null; mate: number | null; pv: string[]; depth: number }   // cp/mate from the side to move
export interface SfResult { lines: SfLine[]; best: string | null }
export interface SearchOpts { depth?: number; movetime?: number; multipv?: number; elo?: number | null; skill?: number }

const BASE = import.meta.env.BASE_URL

export class SF {
  private w: Worker
  private ready: Promise<void>
  private chain: Promise<unknown> = Promise.resolve()
  private cur: { lines: Map<number, SfLine>; resolve: (r: SfResult) => void } | null = null
  private opts = { multipv: 1, elo: null as number | null, skill: 20 }
  dead = false

  constructor() {
    this.w = new Worker(`${BASE}engine/stockfish-19-lite-single.js`)
    let ok!: () => void
    this.ready = new Promise<void>((r) => (ok = r))
    this.w.onmessage = (e: MessageEvent) => {
      const line = String(e.data)
      if (line === 'uciok') this.w.postMessage('isready')
      else if (line === 'readyok') ok()
      else if (line.startsWith('info ') && this.cur) this.info(line)
      else if (line.startsWith('bestmove') && this.cur) {
        const c = this.cur; this.cur = null
        const best = line.split(' ')[1]
        c.resolve({ lines: [...c.lines.values()].sort((a, b) => a.multipv - b.multipv), best: best && best !== '(none)' ? best : null })
      }
    }
    this.w.postMessage('uci')
  }

  private info(line: string) {
    const m = /depth (\d+).*?(?:multipv (\d+) )?.*?score (cp|mate) (-?\d+).*? pv (.+)$/.exec(line)
    if (!m || !this.cur) return
    const mp = /multipv (\d+)/.exec(line)
    const k = mp ? parseInt(mp[1], 10) : 1
    this.cur.lines.set(k, { multipv: k, depth: parseInt(m[1], 10), cp: m[3] === 'cp' ? parseInt(m[4], 10) : null, mate: m[3] === 'mate' ? parseInt(m[4], 10) : null, pv: m[5].split(' ') })
  }

  private async configure(o: SearchOpts) {
    const mp = o.multipv ?? 1
    if (mp !== this.opts.multipv) { this.w.postMessage(`setoption name MultiPV value ${mp}`); this.opts.multipv = mp }
    const elo = o.elo ?? null
    if (elo !== this.opts.elo) {
      if (elo) { this.w.postMessage('setoption name UCI_LimitStrength value true'); this.w.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`) }
      else this.w.postMessage('setoption name UCI_LimitStrength value false')
      this.opts.elo = elo
    }
    const sk = o.skill ?? 20
    if (sk !== this.opts.skill) { this.w.postMessage(`setoption name Skill Level value ${sk}`); this.opts.skill = sk }
  }

  search(fen: string, o: SearchOpts = {}): Promise<SfResult> {
    const run = async (): Promise<SfResult> => {
      if (this.dead) return { lines: [], best: null }
      await this.ready
      await this.configure(o)
      return new Promise<SfResult>((resolve) => {
        this.cur = { lines: new Map(), resolve }
        this.w.postMessage(`position fen ${fen}`)
        this.w.postMessage(o.movetime ? `go movetime ${o.movetime}` : `go depth ${o.depth ?? 12}`)
      })
    }
    const p = this.chain.then(run, run)
    this.chain = p.catch(() => undefined)
    return p
  }

  /** Abort the running search (its promise still resolves with what it had). */
  stop() { if (this.cur) this.w.postMessage('stop') }
  destroy() { this.dead = true; this.w.terminate() }
}

/** White-perspective centipawns from a line scored for the side to move. */
export function whiteCp(line: Pick<SfLine, 'cp' | 'mate'>, fen: string): number {
  const sgn = fen.split(' ')[1] === 'w' ? 1 : -1
  if (line.mate != null) return sgn * (line.mate > 0 ? 1 : -1) * (10000 - Math.min(Math.abs(line.mate), 100))
  return sgn * (line.cp ?? 0)
}
