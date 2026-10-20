// z/x/y quadtree addressing in Web Mercator (EPSG:3857), XYZ scheme (y=0 at north).
export interface TileId { z: number; x: number; y: number }
export interface LngLatBounds { west: number; south: number; east: number; north: number }
export const EARTH_CIRC = 40075016.68557849;
export const MAX_LAT = 85.0511287798066;

export const key = (t: TileId) => `${t.z}/${t.x}/${t.y}`;
export function parseKey(k: string): TileId { const [z, x, y] = k.split('/').map(Number); return { z, x, y }; }
export function isValid(t: TileId) { const n = 2 ** t.z; return Number.isInteger(t.z) && t.z >= 0 && t.x >= 0 && t.y >= 0 && t.x < n && t.y < n; }

/** lng/lat -> normalized mercator [0,1] (x east, y south) */
export function lngLatToMerc(lng: number, lat: number): [number, number] {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180;
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2];
}
export function mercToLngLat(mx: number, my: number): [number, number] {
  return [mx * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI];
}
export function tileForLngLat(lng: number, lat: number, z: number): TileId {
  const [mx, my] = lngLatToMerc(lng, lat); const n = 2 ** z;
  return { z, x: Math.min(n - 1, Math.floor(mx * n)), y: Math.min(n - 1, Math.floor(my * n)) };
}
export function tileBounds(t: TileId): LngLatBounds {
  const n = 2 ** t.z; const [west, north] = mercToLngLat(t.x / n, t.y / n); const [east, south] = mercToLngLat((t.x + 1) / n, (t.y + 1) / n);
  return { west, south, east, north };
}
/** bounds in normalized mercator units */
export function tileMercBounds(t: TileId) { const n = 2 ** t.z; return { minX: t.x / n, minY: t.y / n, maxX: (t.x + 1) / n, maxY: (t.y + 1) / n, size: 1 / n }; }
/** metres per mercator unit at a latitude (scale factor) */
export function metresPerMercUnit(lat: number) { return EARTH_CIRC * Math.cos(lat * Math.PI / 180); }

export function parent(t: TileId): TileId | null { return t.z === 0 ? null : { z: t.z - 1, x: t.x >> 1, y: t.y >> 1 }; }
export function children(t: TileId): TileId[] {
  const z = t.z + 1, x = t.x * 2, y = t.y * 2;
  return [{ z, x, y }, { z, x: x + 1, y }, { z, x, y: y + 1 }, { z, x: x + 1, y: y + 1 }];
}
export function ancestorAt(t: TileId, z: number): TileId { const d = t.z - z; return { z, x: t.x >> d, y: t.y >> d }; }
export function quadkey(t: TileId) { let q = ''; for (let i = t.z; i > 0; i--) { const m = 1 << (i - 1); q += ((t.x & m) ? 1 : 0) + ((t.y & m) ? 2 : 0); } return q; }
export function neighbours(t: TileId): TileId[] {
  const n = 2 ** t.z; const out: TileId[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = (t.x + dx + n) % n, y = t.y + dy; if (y >= 0 && y < n) out.push({ z: t.z, x, y }); }
  return out;
}
export function tilesInBounds(b: LngLatBounds, z: number): TileId[] {
  const a = tileForLngLat(b.west, b.north, z), c = tileForLngLat(b.east, b.south, z); const r: TileId[] = [];
  for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) r.push({ z, x, y });
  return r;
}
