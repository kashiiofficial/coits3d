import { test } from 'node:test'; import assert from 'node:assert/strict';
import { LRUCache } from '../src/loader/lru.js'; import { PriorityQueue } from '../src/loader/queue.js';
import { TileLoader } from '../src/loader/loader.js'; import { MemorySource, type TileSource } from '../src/loader/sources.js';
import { encodeTile, emptyTile } from '../src/tile/format.js'; import type { TileId } from '../src/tile/address.js';
test('LRU evicts least recently used by bytes and calls onEvict', () => { const ev: string[] = []; const c = new LRUCache<string, number>(10, Infinity, k => ev.push(k));
  c.set('a', 1, 4); c.set('b', 2, 4); c.get('a'); c.set('c', 3, 4); assert.deepEqual(ev, ['b']); assert.ok(c.has('a') && c.has('c')); assert.equal(c.totalBytes, 8); });
test('LRU respects pinned keys and entry limit', () => { const c = new LRUCache<string, number>(Infinity, 2); c.set('a', 1); c.set('b', 1); c.maxEntries = 1; c.trim(new Set(['a'])); assert.deepEqual(c.keys(), ['a']); });
test('priority queue orders and reprioritises', () => { const q = new PriorityQueue<string>(); for (const [v, p] of [['c', 3], ['a', 1], ['b', 2], ['d', 0.5]] as const) q.push(v, p);
  q.reprioritise(v => v === 'd' ? null : v === 'c' ? 0 : 1); const o: string[] = []; while (q.length) o.push(q.pop()!); assert.deepEqual(o.slice(0, 1), ['c']); assert.equal(o.length, 3); });
function src() { const s = new MemorySource(0, 22, 5); for (let x = 0; x < 4; x++) s.tiles.set(`2/${x}/0`, encodeTile(emptyTile({ z: 2, x, y: 0 }))); return s; }
test('loads in priority order with concurrency 1', async () => { const order: string[] = []; const l = new TileLoader(src(), { maxConcurrent: 1, onLoad: id => order.push(`${id.x}`) });
  l.request([3, 1, 0, 2].map((x, i) => ({ id: { z: 2, x, y: 0 }, priority: [9, 1, 5, 3][i] }))); await l.idle(); assert.deepEqual(order, ['1', '2', '0', '3']); assert.ok(l.get({ z: 2, x: 0, y: 0 })); });
test('missing tile -> missing state', async () => { const l = new TileLoader(src()); l.request([{ id: { z: 2, x: 0, y: 3 }, priority: 0 }]); await l.idle(); assert.equal(l.getState({ z: 2, x: 0, y: 3 }), 'missing'); });
test('cancellation: unwanted in-flight requests abort', async () => { let aborted = 0; const s: TileSource = { name: 's', minZoom: 0, maxZoom: 22,
  fetchTile: (_id, sig) => new Promise((_r, rej) => sig.addEventListener('abort', () => { aborted++; rej(new DOMException('a', 'AbortError')); })) };
  const l = new TileLoader(s, { maxConcurrent: 4 }); l.request([0, 1, 2].map(x => ({ id: { z: 2, x, y: 0 }, priority: x }))); assert.equal(l.inflightCount, 3);
  l.request([{ id: { z: 2, x: 0, y: 0 }, priority: 0 }]); assert.equal(aborted, 2); assert.equal(l.inflightCount, 1); l.cancelAll(); assert.equal(l.inflightCount, 0); });
test('retries transient failures then succeeds; gives up after max', async () => { let n = 0; const ok = encodeTile(emptyTile({ z: 1, x: 0, y: 0 }));
  const s: TileSource = { name: 'flaky', minZoom: 0, maxZoom: 22, fetchTile: async (id: TileId) => { if (id.x === 1) throw new Error('always'); if (++n < 3) throw new Error('flaky'); return ok; } };
  const l = new TileLoader(s, { retries: 3, retryBaseMs: 1 }); l.request([{ id: { z: 1, x: 0, y: 0 }, priority: 0 }, { id: { z: 1, x: 1, y: 0 }, priority: 1 }]);
  await new Promise(r => setTimeout(r, 100)); await l.idle(); assert.equal(n, 3); assert.equal(l.getState({ z: 1, x: 0, y: 0 }), 'loaded'); assert.equal(l.getState({ z: 1, x: 1, y: 0 }), 'failed'); });
test('cache eviction frees state', async () => { const ev: string[] = []; const l = new TileLoader(src(), { cacheBytes: 50, onEvict: k => ev.push(k) });
  l.request([0, 1, 2, 3].map(x => ({ id: { z: 2, x, y: 0 }, priority: x }))); await l.idle(); assert.ok(ev.length > 0); assert.ok(l.cache.totalBytes <= 50); });
