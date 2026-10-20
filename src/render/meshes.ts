// CPU mesh building from decoded tiles (pure functions, unit-testable, worker-friendly).
// Vertex layout (interleaved float32, 11 floats): position xyz | normal xyz | colour rgb | uv
// Positions are metres relative to the tile's north-west corner (x east, y north, z up).
import earcut from 'earcut';
import { AreaClass, RoadClass, sampleHeight, type Ring, type Tile } from '../tile/format.js';
export const STRIDE = 11;
export interface MeshData { vertices: Float32Array; indices: Uint32Array }
export interface MeshOptions { tileSizeM: number; heightScale: number } // heightScale = mercator metres per real metre (1/cos lat)
export interface TileMeshes { terrain: MeshData; buildings: MeshData; flat: MeshData }

class B { v: number[] = []; i: number[] = []; get n() { return this.v.length / STRIDE; }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: number[], u = 0, w = 0) { this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], u, w); }
  done(): MeshData { return { vertices: new Float32Array(this.v), indices: new Uint32Array(this.i) }; } }

const ROAD_COL: Record<number, number[]> = { [RoadClass.motorway]: [0.85, 0.55, 0.35], [RoadClass.primary]: [0.95, 0.8, 0.5], [RoadClass.secondary]: [0.95, 0.9, 0.6] };
const AREA_COL: Record<number, number[]> = { [AreaClass.park]: [0.55, 0.78, 0.5], [AreaClass.grass]: [0.65, 0.85, 0.55], [AreaClass.wood]: [0.4, 0.65, 0.4], [AreaClass.water]: [0.55, 0.72, 0.9], [AreaClass.pedestrian]: [0.88, 0.86, 0.82] };

export function buildTileMeshes(t: Tile, o: MeshOptions): TileMeshes {
  const s = o.tileSizeM / t.extent; const px = (x: number) => x * s, py = (y: number) => -y * s; const hz = (x: number, y: number) => sampleHeight(t, x, y) * o.heightScale;
  return { terrain: terrainMesh(t, o), buildings: buildingMesh(t, px, py, hz, o.heightScale), flat: flatMesh(t, px, py, hz, s) };
}

export function terrainMesh(t: Tile, o: MeshOptions): MeshData {
  const b = new B(); const n = t.terrain?.size ?? 2; const H = t.terrain?.heights ?? new Float32Array(4); const step = o.tileSizeM / (n - 1);
  const h = (i: number, j: number) => H[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))] * o.heightScale;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const nx = (h(i - 1, j) - h(i + 1, j)) / (2 * step), ny = (h(i, j + 1) - h(i, j - 1)) / (2 * step); const l = Math.hypot(nx, ny, 1);
    b.vert(i * step, -j * step, h(i, j), nx / l, ny / l, 1 / l, [0.93, 0.92, 0.88], i / (n - 1), j / (n - 1)); }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; b.i.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
  return b.done();
}

function buildingMesh(t: Tile, px: (x: number) => number, py: (y: number) => number, hz: (x: number, y: number) => number, hs: number): MeshData {
  const b = new B();
  for (const bd of t.buildings) {
    const outer = bd.rings[0]; if (!outer || outer.length < 6) continue;
    let cx = 0, cy = 0; for (let k = 0; k < outer.length; k += 2) { cx += outer[k]; cy += outer[k + 1]; } cx /= outer.length / 2; cy /= outer.length / 2;
    const base = hz(cx, cy), top = base + bd.height * hs, bot = base + bd.minHeight * hs - (bd.minHeight ? 0 : 2); // sink 2 m to hide slope gaps
    const shade = 0.78 + 0.12 * Math.min(1, bd.height / 60); const col = [shade, shade * 0.97, shade * 0.93];
    // roof
    const flat: number[] = [], holes: number[] = [];
    for (const r of bd.rings) { if (flat.length) holes.push(flat.length / 2); for (let k = 0; k < r.length; k += 2) flat.push(px(r[k]), py(r[k + 1])); }
    const tri = earcut(flat, holes); const o0 = b.n;
    for (let k = 0; k < flat.length; k += 2) b.vert(flat[k], flat[k + 1], top, 0, 0, 1, col);
    for (const ix of tri) b.i.push(o0 + ix);
    // walls
    for (const r of bd.rings) for (let k = 0; k < r.length; k += 2) {
      const k2 = (k + 2) % r.length; const x0 = px(r[k]), y0 = py(r[k + 1]), x1 = px(r[k2]), y1 = py(r[k2 + 1]);
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy); if (l < 1e-6) continue; const nx = dy / l, ny = -dx / l; const v = b.n; const wc = col.map(c => c * 0.85);
      b.vert(x0, y0, bot, nx, ny, 0, wc); b.vert(x1, y1, bot, nx, ny, 0, wc); b.vert(x1, y1, top, nx, ny, 0, wc); b.vert(x0, y0, top, nx, ny, 0, wc);
      b.i.push(v, v + 1, v + 2, v, v + 2, v + 3, v, v + 2, v + 1, v, v + 3, v + 2); // double-sided (ring winding not guaranteed)
    }
  }
  return b.done();
}

function flatMesh(t: Tile, px: (x: number) => number, py: (y: number) => number, hz: (x: number, y: number) => number, s: number): MeshData {
  const b = new B();
  for (const a of t.areas) {
    const flat: number[] = [], holes: number[] = [], z: number[] = [];
    for (const r of a.rings) { if (flat.length) holes.push(flat.length / 2); for (let k = 0; k < r.length; k += 2) { flat.push(px(r[k]), py(r[k + 1])); z.push(hz(r[k], r[k + 1]) + 0.2); } }
    if (flat.length < 6) continue; const tri = earcut(flat, holes); const o0 = b.n; const col = AREA_COL[a.cls] ?? [0.85, 0.85, 0.8];
    for (let k = 0; k < flat.length; k += 2) b.vert(flat[k], flat[k + 1], z[k / 2], 0, 0, 1, col);
    for (const ix of tri) b.i.push(o0 + ix);
  }
  for (const r of t.roads) roadStrip(b, r.line, r.width, ROAD_COL[r.cls] ?? (r.cls >= RoadClass.footway ? [0.82, 0.78, 0.72] : [1, 1, 1]), px, py, hz, r.cls >= RoadClass.footway ? 0.5 : 0.6);
  return b.done();
}
function roadStrip(b: B, line: Ring, width: number, col: number[], px: (x: number) => number, py: (y: number) => number, hz: (x: number, y: number) => number, lift: number) {
  const n = line.length / 2; if (n < 2) return; const hw = width / 2;
  for (let k = 0; k < n - 1; k++) {
    const x0 = px(line[2 * k]), y0 = py(line[2 * k + 1]), x1 = px(line[2 * k + 2]), y1 = py(line[2 * k + 3]);
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy); if (l < 1e-6) continue; const ox = -dy / l * hw, oy = dx / l * hw;
    const z0 = hz(line[2 * k], line[2 * k + 1]) + lift, z1 = hz(line[2 * k + 2], line[2 * k + 3]) + lift; const v = b.n;
    b.vert(x0 + ox, y0 + oy, z0, 0, 0, 1, col); b.vert(x0 - ox, y0 - oy, z0, 0, 0, 1, col); b.vert(x1 - ox, y1 - oy, z1, 0, 0, 1, col); b.vert(x1 + ox, y1 + oy, z1, 0, 0, 1, col);
    b.i.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
}
