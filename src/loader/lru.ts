/** Byte-size-aware LRU cache. onEvict lets the renderer free GPU buffers. */
export class LRUCache<K, V> {
  private m = new Map<K, { v: V; size: number }>(); private bytes = 0;
  constructor(public maxBytes: number, public maxEntries = Infinity, private onEvict?: (k: K, v: V) => void) {}
  get size() { return this.m.size; } get totalBytes() { return this.bytes; }
  has(k: K) { return this.m.has(k); }
  get(k: K): V | undefined { const e = this.m.get(k); if (!e) return; this.m.delete(k); this.m.set(k, e); return e.v; }
  peek(k: K) { return this.m.get(k)?.v; }
  set(k: K, v: V, size = 1) { this.delete(k); this.m.set(k, { v, size }); this.bytes += size; this.trim(); }
  delete(k: K) { const e = this.m.get(k); if (!e) return false; this.m.delete(k); this.bytes -= e.size; this.onEvict?.(k, e.v); return true; }
  /** evict least-recently-used entries, never those in `pinned` */
  trim(pinned?: Set<K>) {
    for (const k of this.m.keys()) { if (this.bytes <= this.maxBytes && this.m.size <= this.maxEntries) break; if (pinned?.has(k)) continue; this.delete(k); }
  }
  keys() { return [...this.m.keys()]; }
  clear() { for (const k of [...this.m.keys()]) this.delete(k); }
}
