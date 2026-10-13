export interface EngineInfo { depth: number; cp: number | null; mate: number | null; pv: string[]; fen: string }

const BASE = import.meta.env.BASE_URL

/** Thin UCI wrapper around the single-threaded lite Stockfish build (WASM, no special headers needed). */
export class Engine {
  private w: Worker
  private ready: Promise<void>
  private current: { fen: string; onInfo: (i: EngineInfo) => void; onDone: () => void } | null = null
  private pending: { fen: string; depth: number; onInfo: (i: EngineInfo) => void; onDone: () => void } | null = null
  private running = false

  constructor() {
    this.w = new Worker(`${BASE}engine/stockfish-19-lite-single.js`)
    let resolve!: () => void
    this.ready = new Promise<void>((r) => (resolve = r))
    this.w.onmessage = (e: MessageEvent) => {
      const line = String(e.data)
      if (line === 'uciok') { this.w.postMessage('isready') }
      else if (line === 'readyok') resolve()
      else if (line.startsWith('info ') && this.current) this.parse(line)
      else if (line.startsWith('bestmove')) {
        this.running = false
        this.current?.onDone()
        this.current = null
        if (this.pending) { const p = this.pending; this.pending = null; this.start(p.fen, p.depth, p.onInfo, p.onDone) }
      }
    }
    this.w.postMessage('uci')
  }

  private parse(line: string) {
    const m = /depth (\d+).* score (cp|mate) (-?\d+).* pv (.+)$/.exec(line)
    if (!m || !this.current) return
    const fen = this.current.fen
    const white = fen.split(' ')[1] === 'w'
    const v = parseInt(m[3], 10) * (white ? 1 : -1)
    this.current.onInfo({ depth: parseInt(m[1], 10), cp: m[2] === 'cp' ? v : null, mate: m[2] === 'mate' ? v : null, pv: m[4].split(' '), fen })
  }

  private async start(fen: string, depth: number, onInfo: (i: EngineInfo) => void, onDone: () => void) {
    await this.ready
    this.current = { fen, onInfo, onDone }
    this.running = true
    this.w.postMessage(`position fen ${fen}`)
    this.w.postMessage(`go depth ${depth}`)
  }

  /** Analyse a position; any search in flight is stopped first. */
  analyse(fen: string, depth: number, onInfo: (i: EngineInfo) => void, onDone: () => void = () => {}) {
    if (this.running) {
      this.pending = { fen, depth, onInfo, onDone }
      this.w.postMessage('stop')
    } else {
      this.start(fen, depth, onInfo, onDone)
    }
  }

  stop() { this.pending = null; if (this.running) this.w.postMessage('stop') }
  destroy() { this.w.terminate() }
}

/** Win chance (0..1) for White from centipawns. */
export function winChance(cp: number) {
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)
}
export function evalText(i: { cp: number | null; mate: number | null } | null) {
  if (!i) return '…'
  if (i.mate != null) return i.mate === 0 ? '#' : `${i.mate > 0 ? '+' : '−'}M${Math.abs(i.mate)}`
  if (i.cp == null) return '…'
  const v = i.cp / 100
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`
}
