/** Binary min-heap priority queue (lower priority value = served first). Supports re-prioritising. */
export class PriorityQueue<T> {
  private h: { p: number; v: T }[] = [];
  get length() { return this.h.length; }
  push(v: T, p: number) { this.h.push({ v, p }); this.up(this.h.length - 1); }
  pop(): T | undefined { const h = this.h; if (!h.length) return; const top = h[0]; const last = h.pop()!; if (h.length) { h[0] = last; this.down(0); } return top.v; }
  /** rebuild with new priorities; items mapped to null are dropped */
  reprioritise(f: (v: T) => number | null) { const old = this.h; this.h = []; for (const e of old) { const p = f(e.v); if (p !== null) this.push(e.v, p); } }
  remove(pred: (v: T) => boolean) { this.reprioritise(v => pred(v) ? null : 0); }
  toArray() { return this.h.map(e => e.v); }
  private up(i: number) { const h = this.h; while (i > 0) { const p = (i - 1) >> 1; if (h[p].p <= h[i].p) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
  private down(i: number) { const h = this.h; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l].p < h[m].p) m = l; if (r < h.length && h[r].p < h[m].p) m = r; if (m === i) return; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
}
