// Tile loader: distance-prioritised queue, concurrency limit, cancellation, retries with backoff, LRU cache.
import { key, type TileId } from '../tile/address.js';
import { decodeTile, type Tile } from '../tile/format.js';
import { LRUCache } from './lru.js';
import { PriorityQueue } from './queue.js';
import type { TileSource } from './sources.js';

export type TileState = 'queued' | 'loading' | 'loaded' | 'missing' | 'failed';
export interface LoaderOptions { maxConcurrent?: number; retries?: number; retryBaseMs?: number; cacheBytes?: number; onEvict?: (k: string, t: Tile) => void; onLoad?: (id: TileId, t: Tile | null) => void }
interface Req { id: TileId; k: string; attempt: number }

export class TileLoader {
  readonly cache: LRUCache<string, Tile>;
  private queue = new PriorityQueue<Req>(); private inflight = new Map<string, AbortController>();
  private state = new Map<string, TileState>(); private o: Required<Omit<LoaderOptions, 'onEvict' | 'onLoad'>> & LoaderOptions;
  constructor(public source: TileSource, opts: LoaderOptions = {}) {
    this.o = { maxConcurrent: 6, retries: 3, retryBaseMs: 200, cacheBytes: 512 * 2 ** 20, ...opts };
    this.cache = new LRUCache(this.o.cacheBytes, Infinity, (k, t) => { this.state.delete(k); opts.onEvict?.(k, t); });
  }
  getState(id: TileId) { return this.state.get(key(id)); }
  get(id: TileId) { return this.cache.get(key(id)); }
  get inflightCount() { return this.inflight.size; } get queuedCount() { return this.queue.length; }

  /**
   * Declare the tiles wanted this frame with their priority (e.g. camera distance; lower first).
   * Queued or in-flight tiles no longer wanted are cancelled.
   */
  request(wanted: { id: TileId; priority: number }[]) {
    const pri = new Map(wanted.map(w => [key(w.id), w.priority]));
    this.queue.reprioritise(r => { const p = pri.get(r.k); if (p === undefined) { this.state.delete(r.k); return null; } return p; });
    for (const [k, ac] of this.inflight) if (!pri.has(k)) this.cancel(k, ac);
    const queued = new Set(this.queue.toArray().map(r => r.k));
    for (const w of wanted) { const k = key(w.id); const st = this.state.get(k);
      if (w.id.z < this.source.minZoom || w.id.z > this.source.maxZoom) continue;
      if (st === 'loaded' || st === 'missing' || st === 'failed' || this.inflight.has(k) || queued.has(k)) continue;
      this.state.set(k, 'queued'); this.queue.push({ id: w.id, k, attempt: 0 }, w.priority); }
    this.pump();
  }
  cancelAll() { for (const [k, ac] of this.inflight) this.cancel(k, ac); this.queue.remove(() => true); }
  private cancel(k: string, ac: AbortController) { ac.abort(); this.inflight.delete(k); this.state.delete(k); }
  /** resolves when queue and in-flight are empty (tests/builder) */
  async idle() { while (this.queue.length || this.inflight.size) await new Promise(r => setTimeout(r, 5)); }

  private pump() {
    while (this.inflight.size < this.o.maxConcurrent && this.queue.length) { const r = this.queue.pop()!; this.start(r); }
  }
  private start(r: Req) {
    const ac = new AbortController(); this.inflight.set(r.k, ac); this.state.set(r.k, 'loading');
    this.source.fetchTile(r.id, ac.signal).then(bytes => {
      if (ac.signal.aborted || this.inflight.get(r.k) !== ac) return;
      this.inflight.delete(r.k);
      if (!bytes) { this.state.set(r.k, 'missing'); this.o.onLoad?.(r.id, null); }
      else { const t = decodeTile(bytes); this.cache.set(r.k, t, bytes.byteLength); this.state.set(r.k, 'loaded'); this.o.onLoad?.(r.id, t); }
      this.pump();
    }).catch(err => {
      if (ac.signal.aborted || err?.name === 'AbortError' || this.inflight.get(r.k) !== ac) return;
      this.inflight.delete(r.k);
      if (r.attempt < this.o.retries) { this.state.set(r.k, 'queued');
        setTimeout(() => { if (this.state.get(r.k) !== 'queued') return; this.queue.push({ ...r, attempt: r.attempt + 1 }, -1); this.pump(); }, this.o.retryBaseMs * 2 ** r.attempt); }
      else this.state.set(r.k, 'failed');
      this.pump();
    });
  }
}
