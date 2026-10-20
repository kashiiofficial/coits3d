// Tile selection: quadtree traversal with frustum culling and screen-space-error (SSE) LOD, plus parent fallback.
import { children, key, parent, tileMercBounds, type TileId } from '../tile/address.js';
import type { Camera } from './camera.js';
import { EARTH_CIRC } from '../tile/address.js';
export interface SelectOptions { minZoom?: number; maxZoom?: number; maxSSE?: number; tileGeometricErrorPx?: number; heightRange?: (id: TileId) => [number, number]; maxTiles?: number }
export interface Selected { id: TileId; distance: number; sse: number }

export function frustumPlanes(m: Float64Array): number[][] { // Gribb/Hartmann, column-major
  const row = (i: number) => [m[i], m[4 + i], m[8 + i], m[12 + i]]; const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const pl = [r3.map((v, i) => v + r0[i]), r3.map((v, i) => v - r0[i]), r3.map((v, i) => v + r1[i]), r3.map((v, i) => v - r1[i]), r3.map((v, i) => v + r2[i]), r3.map((v, i) => v - r2[i])];
  return pl.map(p => { const l = Math.hypot(p[0], p[1], p[2]); return p.map(v => v / l); });
}
/** AABB vs frustum (conservative: false means definitely outside) */
export function aabbInFrustum(planes: number[][], min: number[], max: number[]) {
  for (const p of planes) { const x = p[0] >= 0 ? max[0] : min[0], y = p[1] >= 0 ? max[1] : min[1], z = p[2] >= 0 ? max[2] : min[2];
    if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false; }
  return true;
}
export function tileAabb(cam: Camera, id: TileId, h: [number, number]) {
  const b = tileMercBounds(id); const [x0, y1] = cam.toWorld(b.minX, b.minY), [x1, y0] = cam.toWorld(b.maxX, b.maxY);
  return { min: [x0, y0, h[0]], max: [x1, y1, h[1]] };
}
function distToAabb(p: number[], min: number[], max: number[]) { let d = 0; for (let i = 0; i < 3; i++) { const v = Math.max(min[i] - p[i], 0, p[i] - max[i]); d += v * v; } return Math.sqrt(d); }

/**
 * Select visible tiles at appropriate LOD. A tile is refined into its 4 children while its projected
 * geometric error (tile size / tileGeometricErrorPx, in metres) exceeds maxSSE pixels.
 */
export function selectTiles(cam: Camera, o: SelectOptions = {}): Selected[] {
  const minZ = o.minZoom ?? 0, maxZ = o.maxZoom ?? 16, maxSSE = o.maxSSE ?? 2, gpx = o.tileGeometricErrorPx ?? 256, maxTiles = o.maxTiles ?? 400;
  const hr = o.heightRange ?? (() => [0, 400] as [number, number]); const planes = frustumPlanes(cam.viewProj);
  const s = cam.s; const k = s.height / (2 * Math.tan(s.fovDeg * Math.PI / 360)); const out: Selected[] = [];
  const visit = (id: TileId) => {
    const { min, max } = tileAabb(cam, id, hr(id)); if (!aabbInFrustum(planes, min, max)) return;
    const d = Math.max(1, distToAabb(cam.eye, min, max)); const geomErr = EARTH_CIRC / 2 ** id.z / gpx; const sse = geomErr * k / d;
    if ((id.z < minZ || sse > maxSSE) && id.z < maxZ && out.length < maxTiles) { for (const c of children(id)) visit(c); }
    else if (id.z >= minZ || id.z === maxZ) out.push({ id, distance: d, sse });
  };
  visit({ z: 0, x: 0, y: 0 });
  return out.sort((a, b) => a.distance - b.distance);
}

/**
 * Resolve what to draw: each wanted tile if loaded; otherwise its nearest loaded ancestor (parent fallback),
 * else any loaded children. Deduplicates ancestors covering several wanted tiles.
 */
export function resolveRenderable(wanted: TileId[], isLoaded: (id: TileId) => boolean, maxUp = 6): TileId[] {
  const out = new Map<string, TileId>();
  for (const w of wanted) {
    if (isLoaded(w)) { out.set(key(w), w); continue; }
    let p = parent(w), found: TileId | null = null; for (let i = 0; p && i < maxUp; i++, p = parent(p)) if (isLoaded(p)) { found = p; break; }
    if (found) { out.set(key(found), found); continue; }
    for (const c of children(w)) if (isLoaded(c)) out.set(key(c), c);
  }
  // drop tiles covered by an ancestor that is also drawn (avoid z-fighting)
  const keys = new Set(out.keys());
  for (const [k, id] of out) { let p = parent(id); while (p) { if (keys.has(key(p))) { out.delete(k); break; } p = parent(p); } }
  return [...out.values()];
}
