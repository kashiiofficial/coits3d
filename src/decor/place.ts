// Place trees, hedges, planters and road works from geometry already in the tile.
// Positions are scene units in the same frame as buildTileMeshes: x east, y north,
// z up, with real metres multiplied by heightScale. Nothing here is drawn unless the
// caller asked for ?c3d.
import { EARTH_CIRC, mercToLngLat, metresPerMercUnit, tileMercBounds, type TileId } from '../tile/address.js';
import { AreaClass, RoadClass, sampleHeight, type Ring, type Tile } from '../tile/format.js';
import type { MeshOptions } from '../render/meshes.js';
import { DECOR_SLOTS, slotFor, type DecorKind, type DecorSlot, type Lod, type Tint, type WorkSlot } from './slots.js';

export interface DecorInstance { kind: DecorKind; x: number; y: number; z: number; yaw: number; scale: [number, number, number]; tint?: Tint }
/**
 * `works`: tiles carry no road-works features (the builder keeps only buildings, roads and
 * areas), so 'hash' picks about one tile in WORKS_ONE_IN deterministically from its id.
 * 'always' and 'never' override that for tests and screenshots.
 */
export interface PlaceOptions { enabled: boolean; works?: 'hash' | 'always' | 'never'; sign?: 'hash' | 'closure' | 'diversion' }

export const WORKS_ONE_IN = 8;

export function decorMeshOptions(id: TileId): MeshOptions {
  const b = tileMercBounds(id);
  const lat = mercToLngLat(0, (b.minY + b.maxY) / 2)[1];
  return { tileSizeM: b.size * EARTH_CIRC, heightScale: EARTH_CIRC / metresPerMercUnit(lat) };
}

export function groupBySlot(instances: DecorInstance[], lod: Lod = 0): Record<DecorSlot, DecorInstance[]> {
  const groups = Object.fromEntries(DECOR_SLOTS.map(slot => [slot, [] as DecorInstance[]])) as Record<DecorSlot, DecorInstance[]>;
  for (const inst of instances) groups[slotFor(inst.kind, lod)].push(inst);
  return groups;
}

export function worksSelected(id: TileId, mode: PlaceOptions['works'] = 'hash'): boolean {
  switch (mode) {
    case 'always': return true;
    case 'never': return false;
    case 'hash': return hash(id.x, id.y, id.z * 7919 + 17) % WORKS_ONE_IN === 0;
    default: return assertNever(mode);
  }
}

const PARK_TREE_CAP = 600;
const STREET_TREE_CAP = 400;
const HEDGE_CAP = 480;
/** Roads that get street trees and that a park hedge may face. */
const STREET_MIN = RoadClass.primary, STREET_MAX = RoadClass.residential;

export function placeDecorations(tile: Tile, o: MeshOptions, opts: PlaceOptions): DecorInstance[] {
  if (!opts.enabled) return [];
  const out: DecorInstance[] = [];
  const ctx = context(tile, o);
  for (const area of tile.areas) {
    const ring = area.rings[0]; if (!ring || ring.length < 6) continue;
    const holes = area.rings.slice(1);
    if (area.cls === AreaClass.park || area.cls === AreaClass.wood) {
      const broadShare = area.cls === AreaClass.park ? 0.8 : 0.45;
      scatter(ring, holes, ctx.buildings, ctx.m(22), PARK_TREE_CAP, 0.2, (x, y) => treeAt(out, ctx, x, y, broadShare, 'park'));
    }
    if (area.cls === AreaClass.park) hedgesAlong(out, ctx, ring);
    if (area.cls === AreaClass.pedestrian) scatter(ring, holes, ctx.buildings, ctx.m(14), 40, 0, (x, y) => planterAt(out, ctx, x, y));
  }
  streetTrees(out, ctx);
  if (worksSelected(tile.id, opts.works)) worksAt(out, ctx, opts);
  return out;
}

interface Ctx {
  tile: Tile; s: number; hs: number;
  buildings: Ring[];
  /** water, parks and woods: street trees stay out of them */
  blockers: Ring[];
  roads: SegGrid;
  /** real metres to tile units */
  m: (metres: number) => number;
  ground: (tx: number, ty: number) => number;
}

function context(tile: Tile, o: MeshOptions): Ctx {
  const s = o.tileSizeM / tile.extent, hs = o.heightScale;
  const buildings = tile.buildings.map(b => b.rings[0]).filter((r): r is Ring => !!r && r.length >= 6);
  const blockers = tile.areas.filter(a => a.cls === AreaClass.water || a.cls === AreaClass.park || a.cls === AreaClass.wood)
    .map(a => a.rings[0]).filter((r): r is Ring => !!r && r.length >= 6);
  const roads = new SegGrid(tile.extent / 32);
  for (const r of tile.roads) if (r.cls <= RoadClass.service) roads.addLine(r.line, r.width / 2 / s);
  return { tile, s, hs, buildings, blockers, roads, m: metres => metres * hs / s, ground: (tx, ty) => sampleHeight(tile, tx, ty) * hs };
}

type TreeSite = 'park' | 'street';

function treeAt(out: DecorInstance[], c: Ctx, tx: number, ty: number, broadShare: number, site: TreeSite) {
  const h = hash(Math.round(tx), Math.round(ty), c.tile.id.x ^ (c.tile.id.y << 1) ^ (site === 'street' ? 0x5bd1 : 0));
  const u = (k: number) => unit(hash(h, k, 0x2c1b));
  const broad = u(1) < broadShare;
  let height: number, radius: number;
  if (site === 'street') { height = 8 + u(2) * 5; radius = 2.6 + u(3) * 1.6; }
  else if (broad) { height = 9 + u(2) * 7; radius = 3.6 + u(3) * 2.6; }
  else { height = 10 + u(2) * 9; radius = 2 + u(3) * 1.5; }
  const shade = 0.82 + u(4) * 0.32, hue = (u(5) - 0.5) * 0.16;
  out.push({
    kind: broad ? 'tree-broad' : 'tree-conifer',
    x: tx * c.s, y: -ty * c.s, z: c.ground(tx, ty), yaw: u(6) * Math.PI * 2,
    scale: [radius * c.hs, radius * c.hs * (0.9 + u(7) * 0.2), height * c.hs],
    tint: [shade * (1 + hue), shade, shade * (1 - hue)],
  });
}

function planterAt(out: DecorInstance[], c: Ctx, tx: number, ty: number) {
  const h = hash(Math.round(tx), Math.round(ty), 3);
  const sc = (0.9 + unit(h) * 0.3) * c.hs;
  const shade = 0.85 + unit(hash(h, 1, 3)) * 0.3;
  out.push({ kind: 'planter', x: tx * c.s, y: -ty * c.s, z: c.ground(tx, ty), yaw: unit(hash(h, 2, 3)) * Math.PI * 2, scale: [sc, sc, sc], tint: [shade, shade, shade] });
}

/** London plane-style broadleaf trees on the pavement either side of streets. */
function streetTrees(out: DecorInstance[], c: Ctx) {
  const { tile } = c;
  const every = c.m(13), endGap = c.m(10), margin = c.m(1.5);
  let n = 0;
  for (let ri = 0; ri < tile.roads.length && n < STREET_TREE_CAP; ri++) {
    const road = tile.roads[ri];
    if (road.cls < STREET_MIN || road.cls > STREET_MAX) continue;
    const offset = road.width / 2 / c.s + c.m(2.4);
    walk(road.line, every, endGap, (x, y, dx, dy) => {
      for (const side of [-1, 1]) {
        if (n >= STREET_TREE_CAP) return;
        if (unit(hash(Math.round(x), Math.round(y), ri * 2 + (side > 0 ? 1 : 0))) < 0.3) continue;
        const px = x - dy * offset * side, py = y + dx * offset * side;
        if (px < 0 || py < 0 || px > tile.extent || py > tile.extent) continue;
        if (c.roads.near(px, py, margin)) continue;
        if (c.buildings.some(b => inside(px, py, b)) || c.blockers.some(b => inside(px, py, b))) continue;
        treeAt(out, c, px, py, 1, 'street');
        n++;
      }
    });
  }
}

/** Round clipped bushes in a row just inside park edges that face a street. */
function hedgesAlong(out: DecorInstance[], c: Ctx, ring: Ring) {
  let n = out.reduce((k, i) => k + (i.kind === 'hedge' ? 1 : 0), 0);
  const width = 1.2, step = c.m(width * 0.85), inset = c.m(0.9), reach = c.m(14);
  const orient = ringArea(ring) > 0 ? 1 : -1;
  for (let i = 0; i < ring.length && n < HEDGE_CAP; i += 2) {
    const j = (i + 2) % ring.length;
    const x0 = ring[i], y0 = ring[i + 1], x1 = ring[j], y1 = ring[j + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < c.m(6)) continue;
    if (!c.roads.near((x0 + x1) / 2, (y0 + y1) / 2, reach)) continue;
    const dx = (x1 - x0) / len, dy = (y1 - y0) / len;
    // Inward normal in tile coordinates (y south), from the ring's winding.
    const nx = -dy * orient, ny = dx * orient;
    for (let d = step * 0.5; d < len && n < HEDGE_CAP; d += step) {
      const tx = x0 + dx * d + nx * inset, ty = y0 + dy * d + ny * inset;
      const h = hash(Math.round(tx), Math.round(ty), 23);
      const w = (width + unit(h) * 0.25) * c.hs, ht = (1.1 + unit(hash(h, 1, 23)) * 0.3) * c.hs;
      const shade = 0.9 + unit(hash(h, 2, 23)) * 0.18;
      out.push({ kind: 'hedge', x: tx * c.s, y: -ty * c.s, z: c.ground(tx, ty), yaw: Math.atan2(-dy, dx), scale: [w, w * 0.95, ht], tint: [shade, shade, shade] });
      n++;
    }
  }
}

/**
 * One works site, in real metres: a lane closure on the nearside of a street, with a cone
 * taper, two Chapter 8 barriers along the excavation, a portable signal at each end and an
 * advance sign on the pavement.
 */
function worksAt(out: DecorInstance[], c: Ctx, opts: PlaceOptions) {
  const { tile, hs } = c;
  let best: { score: number; line: Ring; width: number } | null = null;
  for (let i = 0; i < tile.roads.length; i++) {
    const road = tile.roads[i];
    if (road.cls < STREET_MIN || road.cls > STREET_MAX || road.line.length < 4) continue;
    if (polylineLength(road.line) < c.m(60)) continue;
    const score = hash(tile.id.x, tile.id.y, i + 1);
    if (!best || score < best.score) best = { score, line: road.line, width: road.width };
  }
  if (!best) return;
  const mid = pointAlong(best.line, 0.42);
  if (!mid) return;
  const s = c.s;
  // `along` is real metres; `across` is a fraction of the drawn half-width, measured from
  // the centre line towards the nearside (left) kerb. Road strips are drawn with their
  // width unscaled, so the closure follows the drawn carriageway rather than real metres.
  const half = best.width / 2;
  const at = (along: number, across: number) => {
    const fx = mid.dx, fy = -mid.dy, lx = -fy, ly = fx;
    return { x: mid.x * s + fx * along * hs + lx * across * half, y: -mid.y * s + fy * along * hs + ly * across * half };
  };
  const yaw = Math.atan2(-mid.dy, mid.dx);
  const z = c.ground(mid.x, mid.y) + 0.6;
  const put = (kind: WorkSlot, p: { x: number; y: number }, rot: number) => out.push({ kind, x: p.x, y: p.y, z, yaw: rot, scale: [hs, hs, hs] });
  for (let n = 0; n < 6; n++) put('cone', at(-12 + n * 2.5, 0.9 - n * 0.16), 0);
  for (let n = 0; n < 4; n++) put('cone', at(3 + n * 3, 0.1), 0);
  put('barrier', at(6, 0.5), yaw);
  put('barrier', at(8.2, 0.5), yaw);
  put('light', at(-16, 0.5), yaw + Math.PI);
  put('light', at(18, -0.5), yaw);
  const signSlot: WorkSlot = opts.sign === 'closure' || opts.sign === 'diversion' ? opts.sign : (best.score % 2 === 0 ? 'closure' : 'diversion');
  put(signSlot, at(-30, 1 + 1.2 * hs / half), yaw);
}

/** Calls `fn` every `every` tile units along a polyline, skipping `endGap` at both ends. */
function walk(line: Ring, every: number, endGap: number, fn: (x: number, y: number, dx: number, dy: number) => void) {
  const total = polylineLength(line);
  if (total < endGap * 2 + every * 0.5) return;
  let d = endGap, acc = 0;
  for (let k = 0; k + 3 < line.length; k += 2) {
    const x0 = line[k], y0 = line[k + 1], x1 = line[k + 2], y1 = line[k + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    while (d <= acc + len && d <= total - endGap) {
      const t = (d - acc) / len;
      fn(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (x1 - x0) / len, (y1 - y0) / len);
      d += every;
    }
    acc += len;
  }
}

function scatter(ring: Ring, holes: Ring[], buildings: Ring[], spacing: number, cap: number, clearings: number, fn: (x: number, y: number) => void) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
    minY = Math.min(minY, ring[i + 1]); maxY = Math.max(maxY, ring[i + 1]);
  }
  const step = Math.max(4, spacing);
  const ok = (x: number, y: number) => inside(x, y, ring) && !holes.some(h => inside(x, y, h)) && !buildings.some(b => inside(x, y, b));
  let n = 0;
  for (let y = Math.ceil(minY / step) * step; y <= maxY && n < cap; y += step) {
    for (let x = Math.ceil(minX / step) * step; x <= maxX && n < cap; x += step) {
      const hx = hash(Math.round(x), Math.round(y), 9), hy = hash(Math.round(y), Math.round(x), 11);
      if (clearings > 0 && unit(hash(hx, hy, 13)) < clearings) continue;
      const jx = x + (unit(hx) - 0.5) * step * 0.9;
      const jy = y + (unit(hy) - 0.5) * step * 0.9;
      if (!ok(jx, jy)) continue;
      fn(jx, jy); n++;
    }
  }
  if (n === 0) {
    let cx = 0, cy = 0;
    for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cy += ring[i + 1]; }
    cx /= ring.length / 2; cy /= ring.length / 2;
    if (ok(cx, cy)) fn(cx, cy);
  }
}

/** Uniform grid of road segments in tile units, for "is this point on or near a road" checks. */
class SegGrid {
  private cells = new Map<number, number[]>();
  private segs: number[] = [];
  constructor(private cell: number) {}
  addLine(line: Ring, halfWidth: number) {
    for (let k = 0; k + 3 < line.length; k += 2) {
      const id = this.segs.length;
      const x0 = line[k], y0 = line[k + 1], x1 = line[k + 2], y1 = line[k + 3];
      this.segs.push(x0, y0, x1, y1, halfWidth);
      const r = halfWidth;
      for (let gy = this.g(Math.min(y0, y1) - r); gy <= this.g(Math.max(y0, y1) + r); gy++)
        for (let gx = this.g(Math.min(x0, x1) - r); gx <= this.g(Math.max(x0, x1) + r); gx++) {
          const key = gx * 65536 + gy;
          const list = this.cells.get(key);
          if (list) list.push(id); else this.cells.set(key, [id]);
        }
    }
  }
  /** True when (x, y) is within `margin` of any road's edge. */
  near(x: number, y: number, margin: number): boolean {
    const span = Math.ceil(margin / this.cell);
    const cx = this.g(x), cy = this.g(y);
    for (let gy = cy - span; gy <= cy + span; gy++) for (let gx = cx - span; gx <= cx + span; gx++) {
      const list = this.cells.get(gx * 65536 + gy);
      if (!list) continue;
      for (const id of list) {
        const s = this.segs;
        if (segDist(x, y, s[id], s[id + 1], s[id + 2], s[id + 3]) < s[id + 4] + margin) return true;
      }
    }
    return false;
  }
  private g(v: number) { return Math.floor(v / this.cell); }
}

function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

/** Point a fraction `t` along a polyline, in tile units, with its unit direction. */
function pointAlong(line: Ring, t: number) {
  const total = polylineLength(line);
  if (total < 1e-3) return null;
  let left = total * t;
  for (let k = 0; k + 3 < line.length; k += 2) {
    const x0 = line[k], y0 = line[k + 1], x1 = line[k + 2], y1 = line[k + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    if (left > len) { left -= len; continue; }
    const u = left / len;
    return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, dx: (x1 - x0) / len, dy: (y1 - y0) / len };
  }
  return null;
}

function polylineLength(line: Ring) {
  let n = 0;
  for (let k = 0; k + 3 < line.length; k += 2) n += Math.hypot(line[k + 2] - line[k], line[k + 3] - line[k + 1]);
  return n;
}

function ringArea(ring: Ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    a += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  return a / 2;
}

function inside(x: number, y: number, ring: Ring) {
  let inn = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inn = !inn;
  }
  return inn;
}

function unit(h: number) { return (h % 10007) / 10007; }

function hash(a: number, b: number, c: number) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function assertNever(x: never): never { throw new Error(`unknown works mode ${String(x)}`); }
