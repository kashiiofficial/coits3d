import { test } from 'node:test'; import assert from 'node:assert/strict';
import { encodeTile, decodeTile, emptyTile, FORMAT_VERSION, sampleHeight, LayerType } from '../src/tile/format.js';
function sample() { const t = emptyTile({ z: 16, x: 32744, y: 21792 });
  t.terrain = { size: 3, minH: 1, maxH: 9, heights: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  t.buildings.push({ height: 42.5, minHeight: 3, rings: [[0, 0, 100, 0, 100, 100, 0, 100], [10, 10, 20, 10, 20, 20]] });
  t.roads.push({ cls: 2, width: 11, line: [-50, 10, 4096, 2000, 5000, 4100] }); t.areas.push({ cls: 1, rings: [[0, 0, 50, 0, 50, 50]] });
  t.imagery = { mime: 'image/webp', source: 'test-pd', bytes: new Uint8Array([1, 2, 3, 250]) };
  t.spectrum = { grid: 16, periodStart: 1e12, periodEnd: 1.1e12, cells: [{ cx: 3, cy: 4, contributors: 7, traces: 7, surface: 1, condition: 0.75, signalDbm: -91, parkPath: true }] };
  t.robot = { version: 1, nodes: [], edges: [], noGo: [], dropPoints: [] }; t.businesses = []; return t; }
test('encode/decode round trip (all layers)', () => { const t = sample(); const d = decodeTile(encodeTile(t));
  assert.equal(d.version, FORMAT_VERSION); assert.deepEqual(d.id, t.id); assert.deepEqual([...d.terrain!.heights], [...t.terrain!.heights]);
  assert.deepEqual(d.buildings, t.buildings); assert.equal(d.roads[0].width, 11); assert.deepEqual(d.roads[0].line, t.roads[0].line); assert.deepEqual(d.areas, t.areas);
  assert.deepEqual(d.imagery, t.imagery); assert.deepEqual(d.spectrum, t.spectrum); assert.deepEqual(d.robot, t.robot); assert.deepEqual(d.businesses, []); });
test('empty tile round trip & encode is deterministic', () => { const e = emptyTile({ z: 0, x: 0, y: 0 }); assert.deepEqual(decodeTile(encodeTile(e)), e); assert.deepEqual(encodeTile(sample()), encodeTile(sample())); });
test('rejects bad magic and future version', () => { assert.throws(() => decodeTile(new Uint8Array(20))); const b = encodeTile(emptyTile({ z: 1, x: 0, y: 0 })); b[4] = 99; assert.throws(() => decodeTile(b), /version/); });
test('unknown layers are skipped (forward compat)', () => { const b = encodeTile(emptyTile({ z: 1, x: 1, y: 1 })); const extra = new Uint8Array([200, 3, 0, 0, 0, 9, 9, 9]);
  const out = new Uint8Array(b.length + extra.length); out.set(b); out.set(extra, b.length); new DataView(out.buffer).setUint16(17, 1, true); assert.equal(decodeTile(out).buildings.length, 0); assert.ok(LayerType.Terrain); });
test('sampleHeight bilinear', () => { const t = sample(); assert.equal(sampleHeight(t, 0, 0), 1); assert.equal(sampleHeight(t, 4096, 4096), 9); assert.equal(sampleHeight(t, 2048, 2048), 5); });
