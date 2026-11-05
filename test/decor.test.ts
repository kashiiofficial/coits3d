import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AreaClass, RoadClass, emptyTile, type Tile } from '../src/tile/format.js';
import { buildTileMeshes } from '../src/render/meshes.js';
import { Camera } from '../src/select/camera.js';
import { tileMercBounds } from '../src/tile/address.js';
import { c3dEnabled } from '../src/decor/gate.js';
import { signAtlas } from '../src/decor/atlas.js';
import { DECOR_SLOTS, TREE_SLOTS, WORK_SLOTS, decorBudget, fixedDecorBytes, writeInstance } from '../src/decor/budget.js';
import { WORKS_ONE_IN, decorMeshOptions, groupBySlot, placeDecorations, worksSelected, type DecorInstance } from '../src/decor/place.js';
import { PROTO_STRIDE, prototypeMeshes } from '../src/decor/prototypes.js';
import { tileLod } from '../src/decor/renderer.js';
import { prototype } from '../src/decor/veg-proto.js';
import type { DecorKind } from '../src/decor/slots.js';

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
  assert.equal(a.width, 128);
  assert.equal(a.height, 128);
  assert.equal(a.rgba.length, a.width * a.height * 4);
  assert.deepEqual(a.rgba, signAtlas().rgba);
  const red = pixel(a.rgba, a.width, 8, 8);
  const yellow = pixel(a.rgba, a.width, 8, a.height / 2 + 8);
  assert.ok(red[0] > 160 && red[0] > red[1] + 40 && red[0] > red[2] + 40, `closure corner ${red}`);
  assert.ok(yellow[0] > 180 && yellow[1] > 160 && yellow[2] < 80, `diversion corner ${yellow}`);
  assert.deepEqual(a.uv.closure, { u0: 0, v0: 0, u1: 1, v1: 0.5 });
  assert.deepEqual(a.uv.diversion, { u0: 0, v0: 0.5, u1: 1, v1: 1 });
});

test('10k trees and 1k works stay within the instancing budget', () => {
  const b = decorBudget(10_000, 1_000);
  assert.equal(DECOR_SLOTS.length, 16);
  assert.ok(DECOR_SLOTS.length <= 18, 'every slot drawing at once must stay under 18 draws');
  assert.equal(WORK_SLOTS.length, 5);
  assert.equal(TREE_SLOTS.length, 6);
  assert.equal(b.draws, 11);
  assert.ok(b.bytes <= 1_600_000, `decor bytes ${b.bytes} exceed the 1,600,000-byte budget`);
  assert.equal(b.instanceBytes, (10_000 + 1_000) * 64);
  assert.equal(b.bytes, b.instanceBytes + fixedDecorBytes());
  assert.ok(fixedDecorBytes() > signAtlas().rgba.byteLength);
});

test('Studio vegetation prototypes: broadleaf and conifer, three LODs each', () => {
  for (const mesh of ['tree-broad', 'tree-conifer', 'hedge'] as const) {
    const tris = ([0, 1, 2] as const).map(l => prototype(mesh, l).triangles);
    assert.ok(tris[0] > tris[1] && tris[1] > tris[2], `${mesh} LOD triangles ${tris}`);
  }
  assert.notEqual(prototype('tree-broad', 0).triangles, prototype('tree-conifer', 0).triangles);
  const bySlot = new Map(prototypeMeshes().map(m => [m.slot, m]));
  for (const slot of DECOR_SLOTS) assert.ok(bySlot.has(slot), `missing mesh for ${slot}`);
  for (const slot of TREE_SLOTS) {
    const m = bySlot.get(slot)!;
    assert.equal(m.vertices.length % PROTO_STRIDE, 0);
    let tinted = 0, fixed = 0, maxZ = -Infinity, minZ = Infinity;
    for (let i = 0; i < m.vertices.length; i += PROTO_STRIDE) {
      if (m.vertices[i + 11] > 0) tinted++; else fixed++;
      maxZ = Math.max(maxZ, m.vertices[i + 2]); minZ = Math.min(minZ, m.vertices[i + 2]);
    }
    assert.ok(tinted > 0 && fixed > 0, `${slot} needs a tinted crown and a fixed-colour trunk`);
    assert.ok(minZ >= -1e-6 && maxZ <= 1.0001 && maxZ > 0.85, `${slot} spans z ${minZ}..${maxZ}`);
  }
  const hedge = bySlot.get('hedge@0')!;
  for (let i = 0; i < hedge.vertices.length; i += PROTO_STRIDE) {
    const r = Math.hypot(hedge.vertices[i], hedge.vertices[i + 1], hedge.vertices[i + 2] - 0.5);
    assert.ok(Math.abs(r - 0.5) < 1e-5, 'hedge bush is a sphere of unit diameter on the ground');
  }
});

test('vegetation is gated, sourced from OSM classes, and does not mutate the tile', () => {
  const tile = sampleTile();
  const before = JSON.stringify(tile);
  const opt = decorMeshOptions(tile.id);
  assert.equal(placeDecorations(tile, opt, { enabled: false }).length, 0);
  const placed = placeDecorations(tile, opt, { enabled: true, works: 'never' });
  assert.equal(JSON.stringify(tile), before);
  const k = byKind(placed);
  assert.ok(k['tree-broad'].length > 0 && k['tree-conifer'].length > 0, 'parks and woods mix broadleaf and conifer');
  assert.ok(k['tree-broad'].length > k['tree-conifer'].length, 'parks are mostly broadleaf');
  assert.ok(k.hedge.length > 20, 'hedges are rows of bushes');
  assert.ok(k.planter.length > 0);
  for (const w of WORK_SLOTS) assert.equal(k[w].length, 0);
  const centre = buildingCentreMetres(tile, opt);
  for (const tree of [...k['tree-broad'], ...k['tree-conifer']]) {
    const dx = tree.x - centre[0], dy = tree.y - centre[1];
    assert.ok(dx * dx + dy * dy > 4, 'tree placed inside a building footprint');
  }
  const groups = groupBySlot(placed, 0);
  assert.ok(DECOR_SLOTS.filter(s => groups[s].length > 0).length <= 18);
  assert.equal(groupBySlot(placed, 2)['planter@1'].length, k.planter.length, 'planters fall back to LOD 1');
});

test('street trees line both pavements, off the carriageway', () => {
  const tile = emptyTile({ z: 16, x: 32744, y: 21792 });
  tile.roads.push({ cls: RoadClass.residential, width: 8, line: [200, 2000, 3800, 2000] });
  const opt = decorMeshOptions(tile.id);
  const s = opt.tileSizeM / tile.extent;
  const trees = byKind(placeDecorations(tile, opt, { enabled: true, works: 'never' }))['tree-broad'];
  assert.ok(trees.length >= 20, `only ${trees.length} street trees`);
  const roadY = -2000 * s, half = 8 / 2;
  let north = 0, south = 0;
  for (const t of trees) {
    const off = t.y - roadY;
    assert.ok(Math.abs(off) > half, 'street tree on the carriageway');
    assert.ok(Math.abs(off) < half + 6 * opt.heightScale, 'street tree too far from the kerb');
    if (off > 0) north++; else south++;
  }
  assert.ok(north > 5 && south > 5, `north ${north} south ${south}`);
});

test('works are gated per tile, so most tiles get none', () => {
  let hits = 0, n = 0;
  for (let x = 32700; x < 32764; x++) for (let y = 21760; y < 21824; y++) { n++; if (worksSelected({ z: 16, x, y })) hits++; }
  const rate = hits / n;
  assert.ok(Math.abs(rate - 1 / WORKS_ONE_IN) < 0.03, `works on ${(rate * 100).toFixed(1)}% of tiles`);
  assert.equal(worksSelected({ z: 16, x: 1, y: 2 }, 'always'), true);
  assert.equal(worksSelected({ z: 16, x: 1, y: 2 }, 'never'), false);

  const base = sampleTile();
  const pick = (want: boolean) => {
    for (let x = 32740; ; x++) if (worksSelected({ z: 16, x, y: 21792 }) === want) return { ...base, id: { z: 16, x, y: 21792 } };
  };
  const works = (t: Tile, mode: 'hash' | 'always' | 'never') => placeDecorations(t, decorMeshOptions(t.id), { enabled: true, works: mode }).filter(i => (WORK_SLOTS as readonly string[]).includes(i.kind));
  assert.equal(works(pick(false), 'hash').length, 0, "works: 'hash' must leave unselected tiles empty");
  assert.ok(works(pick(true), 'hash').length > 0);
  assert.equal(works(pick(true), 'never').length, 0);
});

test('a works site is laid out in real metres', () => {
  const tile = sampleTile();
  const opt = decorMeshOptions(tile.id);
  const k = byKind(placeDecorations(tile, opt, { enabled: true, works: 'always', sign: 'closure' }));
  assert.equal(k.cone.length, 10);
  assert.equal(k.barrier.length, 2);
  assert.equal(k.light.length, 2);
  assert.equal(k.closure.length, 1);
  assert.equal(k.diversion.length, 0);
  for (const w of WORK_SLOTS) for (const i of k[w]) assert.deepEqual(i.scale, [opt.heightScale, opt.heightScale, opt.heightScale], `${w} must be 1:1 in metres`);
  const cones = prototypeMeshes().find(m => m.slot === 'cone')!;
  let top = 0;
  for (let i = 0; i < cones.vertices.length; i += PROTO_STRIDE) top = Math.max(top, cones.vertices[i + 2]);
  assert.ok(Math.abs(top - 0.75) < 1e-6, `cone is ${top} m tall`);
  const [l0, l1] = k.light;
  const gap = Math.hypot(l0.x - l1.x, l0.y - l1.y) / opt.heightScale;
  assert.ok(gap > 30 && gap < 40, `signals ${gap.toFixed(1)} m apart`);
  const diverted = byKind(placeDecorations(tile, opt, { enabled: true, works: 'always', sign: 'diversion' }));
  assert.equal(diverted.diversion.length, 1);
  assert.equal(diverted.closure.length, 0);
});

test('tiles pick LOD by distance from the camera', () => {
  const id = { z: 16, x: 32744, y: 21792 };
  const b = tileMercBounds(id);
  const centre: [number, number] = [b.minX + b.size / 2, b.minY + b.size / 2];
  const cam = (distance: number) => new Camera({ centerMerc: centre, distance, pitchDeg: 0, bearingDeg: 0, fovDeg: 45, width: 800, height: 600 });
  const t = emptyTile(id);
  assert.equal(tileLod(t, cam(300)), 0);
  assert.equal(tileLod(t, cam(1200)), 1);
  assert.equal(tileLod(t, cam(5000)), 2);
});

test('instance matrices are column-major mat4s with the tint in the w row', () => {
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
  assert.deepEqual([m[3], m[7], m[11]], [1, 1, 1]);
  writeInstance(m, 0, 0, 0, 0, 0, 1, 1, 1, [0.5, 0.75, 0.25]);
  assert.deepEqual([m[3], m[7], m[11]], [0.5, 0.75, 0.25]);
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

function byKind(list: DecorInstance[]): Record<DecorKind, DecorInstance[]> {
  const out = {} as Record<DecorKind, DecorInstance[]>;
  for (const k of ['tree-broad', 'tree-conifer', 'hedge', 'planter', ...WORK_SLOTS] as DecorKind[]) out[k] = [];
  for (const i of list) out[i.kind].push(i);
  return out;
}

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
  t.roads.push({ cls: RoadClass.tertiary, width: 9, line: [100, 3100, 3000, 3100] });
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
