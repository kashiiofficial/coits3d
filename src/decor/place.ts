// Place trees, hedges, planters and a single road-works site from geometry already
// in the tile. Positions are metres in the same frame as buildTileMeshes: x east,
// y north, z up. Nothing here is drawn unless the caller asked for ?c3d.
import { EARTH_CIRC, mercToLngLat, metresPerMercUnit, tileMercBounds, type TileId } from '../tile/address.js';
import { AreaClass, RoadClass, sampleHeight, type Ring, type Tile } from '../tile/format.js';
import type { MeshOptions } from '../render/meshes.js';
import { DECOR_SLOTS, type DecorSlot } from './slots.js';

export interface DecorInstance { slot: DecorSlot; x: number; y: number; z: number; yaw: number; scale: [number, number, number] }
export interface PlaceOptions { enabled: boolean; works?: 'hash' | 'always' | 'never'; sign?: 'hash' | 'closure' | 'diversion' }

export function decorMeshOptions(id: TileId): MeshOptions {
  const b = tileMercBounds(id);
  const lat = mercToLngLat(0, (b.minY + b.maxY) / 2)[1];
  return { tileSizeM: b.size * EARTH_CIRC, heightScale: EARTH_CIRC / metresPerMercUnit(lat) };
}

export function groupBySlot(instances: DecorInstance[]): Record<DecorSlot, DecorInstance[]> {
  const groups = Object.fromEntries(DECOR_SLOTS.map(slot => [slot, [] as DecorInstance[]])) as Record<DecorSlot, DecorInstance[]>;
  for (const inst of instances) groups[inst.slot].push(inst);
  return groups;
}

export function placeDecorations(tile: Tile, o: MeshOptions, opts: PlaceOptions): DecorInstance[] {
  if (!opts.enabled) return [];
  const out: DecorInstance[] = [];
  const s = o.tileSizeM / tile.extent;
  const hs = o.heightScale;
  const buildings = tile.buildings.map(b => b.rings[0]).filter((r): r is Ring => !!r && r.length >= 6);
  for (const area of tile.areas) {
    const ring = area.rings[0]; if (!ring || ring.length < 6) continue;
    const holes = area.rings.slice(1);
    if (area.cls === AreaClass.park || area.cls === AreaClass.wood) {
      scatter(ring, holes, buildings, 26 * hs, s, 600, (x, y) => treeAt(out, tile, o, x, y));
      hedgesAlong(out, tile, o, ring, s, hs);
    }
    if (area.cls === AreaClass.pedestrian) scatter(ring, holes, buildings, 22 * hs, s, 40, (x, y) => planterAt(out, tile, o, x, y));
  }
  if (opts.works !== 'never') worksAt(out, tile, o, s, hs, opts);
  return out;
}

function treeAt(out: DecorInstance[], tile: Tile, o: MeshOptions, tx: number, ty: number) {
  const s = o.tileSizeM / tile.extent, hs = o.heightScale;
  const hsh = hash(Math.round(tx), Math.round(ty), tile.id.x ^ tile.id.y);
  const height = (7.5 + (hsh % 40) / 40 * 4.5) * hs;
  const radius = (2.6 + (hsh % 30) / 30 * 1.4) * hs;
  const x = tx * s, y = -ty * s, z = sampleHeight(tile, tx, ty) * hs;
  const yaw = (hsh % 628) / 100;
  out.push({ slot: 'trunk', x, y, z, yaw, scale: [0.34 * hs, 0.34 * hs, height] });
  out.push({ slot: 'canopy', x, y, z: z + height * 0.55, yaw, scale: [radius * 2, radius * 2, height * 0.72] });
}

function planterAt(out: DecorInstance[], tile: Tile, o: MeshOptions, tx: number, ty: number) {
  const s = o.tileSizeM / tile.extent, hs = o.heightScale;
  const hsh = hash(Math.round(tx), Math.round(ty), 3);
  const sc = (0.9 + (hsh % 20) / 20 * 0.3) * hs;
  out.push({ slot: 'planter', x: tx * s, y: -ty * s, z: sampleHeight(tile, tx, ty) * hs, yaw: (hsh % 628) / 100, scale: [sc, sc, sc] });
}

function hedgesAlong(out: DecorInstance[], tile: Tile, o: MeshOptions, ring: Ring, s: number, hs: number) {
  const every = 18 * hs;
  let left = every * 0.5, n = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const x0 = ring[i] * s, y0 = -ring[i + 1] * s, x1 = ring[j] * s, y1 = -ring[j + 1] * s;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1) continue;
    let d = left;
    while (d < len && n < 80) {
      const t = d / len;
      const x = x0 + dx * t, y = y0 + dy * t;
      const tx = x / s, ty = -y / s;
      out.push({ slot: 'hedge', x, y, z: sampleHeight(tile, tx, ty) * hs, yaw: Math.atan2(dy, dx), scale: [Math.min(every, len) * 0.92, 1.15 * hs, 1.25 * hs] });
      n++; d += every;
    }
    left = d - len;
    if (n >= 80) return;
  }
}

function worksAt(out: DecorInstance[], tile: Tile, o: MeshOptions, s: number, hs: number, opts: PlaceOptions) {
  let best: { i: number; score: number; line: Ring; width: number } | null = null;
  for (let i = 0; i < tile.roads.length; i++) {
    const road = tile.roads[i];
    if (road.cls > RoadClass.residential || road.cls < RoadClass.motorway || road.line.length < 4) continue;
    if (polylineLength(road.line, s) < 16 * hs) continue;
    const score = hash(tile.id.x, tile.id.y, i + 1);
    if (!best || score < best.score) best = { i, score, line: road.line, width: road.width };
  }
  if (!best) return;
  const mid = pointAlong(best.line, s, 0.42);
  if (!mid) return;
  const yaw = Math.atan2(mid.dy, mid.dx);
  // Works furniture is scaled up in the mercator frame so a pitch-60 street view can
  // read a cone run, a Chapter 8 barrier and a sign. At the wide camera they stay a few pixels.
  const k = 2.6;
  const side = (best.width / 2) + 1.6 * hs * k;
  const ox = -mid.dy * side, oy = mid.dx * side;
  const z = sampleHeight(tile, mid.tx, mid.ty) * hs + 0.7 * hs;
  const signSlot: DecorSlot = opts.sign === 'closure' || opts.sign === 'diversion' ? opts.sign : (best.score % 2 === 0 ? 'closure' : 'diversion');
  for (let n = 0; n < 5; n++) {
    const along = (n - 2) * 3.4 * hs * k;
    out.push({ slot: 'cone', x: mid.x + ox + mid.dx * along, y: mid.y + oy + mid.dy * along, z, yaw: 0, scale: [0.9 * hs * k, 0.9 * hs * k, 0.85 * hs * k] });
  }
  out.push({ slot: 'barrier', x: mid.x + ox, y: mid.y + oy, z, yaw: yaw + Math.PI / 2, scale: [hs * k, hs * k, hs * k] });
  out.push({ slot: 'light', x: mid.x + ox - mid.dx * 8 * hs * k, y: mid.y + oy - mid.dy * 8 * hs * k, z, yaw, scale: [hs * k, hs * k, hs * k] });
  out.push({ slot: 'light', x: mid.x + ox + mid.dx * 8 * hs * k, y: mid.y + oy + mid.dy * 8 * hs * k, z, yaw: yaw + Math.PI, scale: [hs * k, hs * k, hs * k] });
  out.push({ slot: signSlot, x: mid.x + ox - mid.dx * 5.5 * hs * k, y: mid.y + oy - mid.dy * 5.5 * hs * k, z, yaw, scale: [hs * k, hs * k, hs * k] });
}

function scatter(ring: Ring, holes: Ring[], buildings: Ring[], spacing: number, s: number, cap: number, fn: (x: number, y: number) => void) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
    minY = Math.min(minY, ring[i + 1]); maxY = Math.max(maxY, ring[i + 1]);
  }
  const step = Math.max(4, spacing / s);
  let n = 0;
  for (let y = Math.ceil(minY / step) * step; y <= maxY && n < cap; y += step) {
    for (let x = Math.ceil(minX / step) * step; x <= maxX && n < cap; x += step) {
      const jx = x + ((hash(Math.round(x), Math.round(y), 9) % 100) / 100 - 0.5) * step * 0.45;
      const jy = y + ((hash(Math.round(y), Math.round(x), 11) % 100) / 100 - 0.5) * step * 0.45;
      if (!inside(jx, jy, ring) || holes.some(h => inside(jx, jy, h)) || buildings.some(b => inside(jx, jy, b))) continue;
      fn(jx, jy); n++;
    }
  }
  if (n === 0) {
    let cx = 0, cy = 0;
    for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cy += ring[i + 1]; }
    cx /= ring.length / 2; cy /= ring.length / 2;
    if (inside(cx, cy, ring) && !holes.some(h => inside(cx, cy, h)) && !buildings.some(b => inside(cx, cy, b))) fn(cx, cy);
  }
}

function pointAlong(line: Ring, s: number, t: number) {
  const n = line.length / 2;
  let total = 0;
  const seg: { len: number; x0: number; y0: number; x1: number; y1: number; tx: number; ty: number }[] = [];
  for (let k = 0; k < n - 1; k++) {
    const x0 = line[2 * k] * s, y0 = -line[2 * k + 1] * s, x1 = line[2 * k + 2] * s, y1 = -line[2 * k + 3] * s;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-4) continue;
    seg.push({ len, x0, y0, x1, y1, tx: line[2 * k], ty: line[2 * k + 1] });
    total += len;
  }
  if (!seg.length || total < 1e-3) return null;
  let left = total * t;
  for (const g of seg) {
    if (left > g.len) { left -= g.len; continue; }
    const u = left / g.len, dx = (g.x1 - g.x0) / g.len, dy = (g.y1 - g.y0) / g.len;
    return { x: g.x0 + (g.x1 - g.x0) * u, y: g.y0 + (g.y1 - g.y0) * u, dx, dy, tx: g.tx, ty: g.ty };
  }
  const g = seg[seg.length - 1], dx = (g.x1 - g.x0) / g.len, dy = (g.y1 - g.y0) / g.len;
  return { x: g.x1, y: g.y1, dx, dy, tx: g.tx, ty: g.ty };
}

function polylineLength(line: Ring, s: number) {
  let n = 0;
  for (let k = 0; k < line.length - 2; k += 2) n += Math.hypot((line[k + 2] - line[k]) * s, (line[k + 3] - line[k + 1]) * s);
  return n;
}

function inside(x: number, y: number, ring: Ring) {
  let inn = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inn = !inn;
  }
  return inn;
}

function hash(a: number, b: number, c: number) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return x >>> 0;
}
