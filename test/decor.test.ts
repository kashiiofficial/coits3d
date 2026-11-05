import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AreaClass, RoadClass, emptyTile } from '../src/tile/format.js';
import { buildTileMeshes } from '../src/render/meshes.js';
import { c3dEnabled } from '../src/decor/gate.js';
import { signAtlas } from '../src/decor/atlas.js';
import { DECOR_SLOTS, WORK_SLOTS, decorBudget, fixedDecorBytes, writeInstance } from '../src/decor/budget.js';
import { decorMeshOptions, groupBySlot, placeDecorations } from '../src/decor/place.js';

test('?c3d is off unless the query asks for it and 3D is on', () => {
  assert.equal(c3dEnabled('', true), false);
  assert.equal(c3dEnabled('?lng=-0.12&lat=51.5', true), false);
  assert.equal(c3dEnabled('?flag=off', false), false);
  assert.equal(c3dEnabled('?c3d', false), false);
  assert.equal(c3dEnabled('?c3d', true), true);
  assert.equal(c3dEnabled('?c3d=1', true), true);
  assert.equal(c3dEnabled('?c3d=on&lng=-0.1', true), true);
  assert.equal(c3dEnabled('?c3d=0', true), false);
  assert.equal(c3dEnabled('?c3d=false', true), false);
  assert.equal(c3dEnabled('?c3d=off', true), false);
});

test('sign atlas is a shared closure and diversion texture', () => {
  const a = signAtlas();
  assert.equal(a.width, 256);
  assert.equal(a.height, 256);
  assert.equal(a.rgba.length, a.width * a.height * 4);
  assert.deepEqual(a.rgba, signAtlas().rgba);
  const red = pixel(a.rgba, a.width, 8, 8);
  const yellow = pixel(a.rgba, a.width, a.width / 2 + 8, 8);
  assert.ok(red[0] > 160 && red[0] > red[1] + 40 && red[0] > red[2] + 40, `closure corner ${red}`);
  assert.ok(yellow[0] > 180 && yellow[1] > 160 && yellow[2] < 80, `diversion corner ${yellow}`);
  assert.deepEqual(a.uv.closure, { u0: 0, v0: 0, u1: 0.5, v1: 1 });
  assert.deepEqual(a.uv.diversion, { u0: 0.5, v0: 0, u1: 1, v1: 1 });
});

test('10k trees and 1k works stay within the instancing budget', () => {
  const b = decorBudget(10_000, 1_000);
  assert.equal(DECOR_SLOTS.length, 9);
  assert.ok(DECOR_SLOTS.length <= 18);
  assert.equal(WORK_SLOTS.length, 5);
  assert.equal(b.draws, 7);
  assert.ok(b.draws <= 18);
  const target = 1_600_000;
  const rel = Math.abs(b.bytes - target) / target;
  assert.ok(rel < 0.08, `decor bytes ${b.bytes} (${(rel * 100).toFixed(2)}% from 1.6 MB)`);
  assert.equal(b.instanceBytes, (10_000 * 2 + 1_000) * 64);
  assert.equal(b.bytes, b.instanceBytes + fixedDecorBytes());
  assert.ok(fixedDecorBytes() > signAtlas().rgba.byteLength);
});

test('decorations are gated, sourced from OSM classes, and do not mutate the tile', () => {
  const tile = sampleTile();
  const before = JSON.stringify(tile);
  const opt = decorMeshOptions(tile.id);
  assert.equal(placeDecorations(tile, opt, { enabled: false }).length, 0);
  const placed = placeDecorations(tile, opt, { enabled: true, works: 'always', sign: 'closure' });
  assert.equal(JSON.stringify(tile), before);
  const groups = groupBySlot(placed);
  const draws = DECOR_SLOTS.filter(s => groups[s].length > 0).length;
  assert.ok(draws <= 18);
  assert.ok(draws >= 7);
  assert.ok(groups.trunk.length > 0);
  assert.equal(groups.trunk.length, groups.canopy.length);
  assert.ok(groups.hedge.length > 0);
  assert.ok(groups.planter.length > 0);
  assert.ok(groups.cone.length >= 4);
  assert.equal(groups.barrier.length, 1);
  assert.equal(groups.light.length, 2);
  assert.equal(groups.closure.length, 1);
  assert.equal(groups.diversion.length, 0);
  const diverted = placeDecorations(tile, opt, { enabled: true, works: 'always', sign: 'diversion' });
  assert.equal(groupBySlot(diverted).diversion.length, 1);
  assert.equal(groupBySlot(diverted).closure.length, 0);
  const centre = buildingCentreMetres(tile, opt);
  for (const tree of groups.trunk) {
    const dx = tree.x - centre[0], dy = tree.y - centre[1];
    assert.ok(dx * dx + dy * dy > 4, 'tree placed inside a building footprint');
  }
});

test('instance matrices are column-major mat4s', () => {
  const m = new Float32Array(16);
  writeInstance(m, 0, 10, 20, 30, 0, 2, 3, 4);
  assert.equal(m.byteLength, 64);
  assert.equal(m[0], 2);
  assert.equal(m[5], 3);
  assert.equal(m[10], 4);
  assert.equal(m[12], 10);
  assert.equal(m[13], 20);
  assert.equal(m[14], 30);
  assert.equal(m[15], 1);
});

test('base tile meshes stay byte-stable when decor is loaded', () => {
  const t = emptyTile({ z: 16, x: 32744, y: 21792 });
  t.terrain = { size: 3, minH: 1, maxH: 9, heights: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  t.buildings.push({ height: 42.5, minHeight: 3, rings: [[0, 0, 100, 0, 100, 100, 0, 100]] });
  t.roads.push({ cls: 2, width: 11, line: [0, 10, 400, 20] });
  t.areas.push({ cls: 1, rings: [[0, 0, 50, 0, 50, 50]] });
  const m = buildTileMeshes(t, { tileSizeM: 600, heightScale: 1.2 });
  const h = createHash('sha256');
  for (const part of [m.terrain, m.buildings, m.flat]) {
    h.update(Buffer.from(part.vertices.buffer, part.vertices.byteOffset, part.vertices.byteLength));
    h.update(Buffer.from(part.indices.buffer, part.indices.byteOffset, part.indices.byteLength));
  }
  assert.equal(h.digest('hex'), 'b66e1fb4324e70ded844b4d3dcd4b954a809caf372918193e83c0d2bd72adeaf');
});

function pixel(rgba: Uint8Array, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
}

function sampleTile() {
  const t = emptyTile({ z: 16, x: 32744, y: 21792 });
  t.terrain = { size: 2, minH: 0, maxH: 0, heights: new Float32Array([0, 0, 0, 0]) };
  t.areas.push({ cls: AreaClass.park, rings: [[100, 100, 3000, 100, 3000, 3000, 100, 3000]] });
  t.areas.push({ cls: AreaClass.wood, rings: [[3200, 100, 4000, 100, 4000, 900, 3200, 900]] });
  t.areas.push({ cls: AreaClass.pedestrian, rings: [[100, 3300, 900, 3300, 900, 4000, 100, 4000]] });
  t.roads.push({ cls: RoadClass.residential, width: 8, line: [400, 1800, 2800, 1900] });
  t.buildings.push({ height: 18, minHeight: 0, rings: [[1400, 1400, 1700, 1400, 1700, 1700, 1400, 1700]] });
  return t;
}

function buildingCentreMetres(tile: ReturnType<typeof sampleTile>, opt: { tileSizeM: number }) {
  const ring = tile.buildings[0].rings[0];
  let sx = 0, sy = 0, n = 0;
  const s = opt.tileSizeM / tile.extent;
  for (let i = 0; i < ring.length; i += 2) { sx += ring[i]; sy += ring[i + 1]; n++; }
  return [sx / n * s, -(sy / n) * s];
}
