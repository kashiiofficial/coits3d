// CoitsMoves 3D tile format (.c3dt). Little-endian binary, versioned, layer-sectioned.
// Header: magic "C3DT" | u16 version | u8 z | u32 x | u32 y | u16 extent | u16 layerCount
// Layer:  u8 type | u32 byteLength | payload. Unknown layer types are skipped (forward compatible).
// Geometry coords are tile-local integers 0..extent (x east, y south). Heights in metres.
import type { TileId } from './address.js';
export const MAGIC = 0x54443343; // "C3DT"
export const FORMAT_VERSION = 1;
export const DEFAULT_EXTENT = 4096;
export enum LayerType { Terrain = 1, Buildings = 2, Roads = 3, Areas = 4, Imagery = 5, Spectrum = 6, Robot = 7, Businesses = 8 }
export type Ring = number[]; // flat [x0,y0,x1,y1,...]
export interface Terrain { size: number; minH: number; maxH: number; heights: Float32Array } // size*size samples, row-major from north-west, edges shared with neighbours
export interface Building { height: number; minHeight: number; rings: Ring[] } // rings[0] outer, others holes
export interface Road { cls: number; width: number; line: Ring }
export interface Area { cls: number; rings: Ring[] }
export interface Imagery { mime: 'image/jpeg' | 'image/webp' | 'image/png'; source: string; bytes: Uint8Array }
/** Aggregated people-sourced data per grid cell (published only above min contributors) */
export interface SpectrumCell { cx: number; cy: number; contributors: number; traces: number; surface: number; condition: number; signalDbm: number; parkPath: boolean }
export interface Spectrum { grid: number; periodStart: number; periodEnd: number; cells: SpectrumCell[] }
export interface Tile {
  version: number; id: TileId; extent: number;
  terrain?: Terrain; buildings: Building[]; roads: Road[]; areas: Area[];
  imagery?: Imagery; spectrum?: Spectrum;
  robot?: unknown;      // placeholder (roadmap step 3), stored as JSON
  businesses?: unknown; // placeholder (roadmap step 4), stored as JSON
}
export const RoadClass = { motorway: 1, primary: 2, secondary: 3, tertiary: 4, residential: 5, service: 6, footway: 7, cycleway: 8, path: 9, other: 10 } as const;
export const AreaClass = { park: 1, water: 2, grass: 3, wood: 4, landuse: 5, pedestrian: 6, other: 7 } as const;
const MIMES = ['image/jpeg', 'image/webp', 'image/png'] as const;

class W {
  buf = new Uint8Array(1024); dv = new DataView(this.buf.buffer); o = 0;
  ensure(n: number) { if (this.o + n <= this.buf.length) return; let s = this.buf.length * 2; while (s < this.o + n) s *= 2; const b = new Uint8Array(s); b.set(this.buf); this.buf = b; this.dv = new DataView(b.buffer); }
  u8(v: number) { this.ensure(1); this.dv.setUint8(this.o, v); this.o += 1; }
  u16(v: number) { this.ensure(2); this.dv.setUint16(this.o, v, true); this.o += 2; }
  i16(v: number) { this.ensure(2); this.dv.setInt16(this.o, v, true); this.o += 2; }
  u32(v: number) { this.ensure(4); this.dv.setUint32(this.o, v, true); this.o += 4; }
  f32(v: number) { this.ensure(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
  f64(v: number) { this.ensure(8); this.dv.setFloat64(this.o, v, true); this.o += 8; }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.o); this.o += b.length; }
  str(s: string) { const b = new TextEncoder().encode(s); this.u32(b.length); this.bytes(b); }
  ring(r: Ring) { this.u32(r.length / 2); for (const v of r) this.i16(Math.round(v)); } // i16 allows small buffer outside 0..extent
  done() { return this.buf.slice(0, this.o); }
}
class R {
  dv: DataView; o = 0; constructor(public b: Uint8Array) { this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8() { return this.dv.getUint8(this.o++); } u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; } u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; } f64() { const v = this.dv.getFloat64(this.o, true); this.o += 8; return v; }
  bytes(n: number) { const v = this.b.slice(this.o, this.o + n); this.o += n; return v; }
  str() { return new TextDecoder().decode(this.bytes(this.u32())); }
  ring(): Ring { const n = this.u32(); const r = new Array(n * 2); for (let i = 0; i < n * 2; i++) r[i] = this.i16(); return r; }
}
function section(w: W, type: LayerType, body: (w: W) => void) { const s = new W(); body(s); const b = s.done(); w.u8(type); w.u32(b.length); w.bytes(b); }

export function emptyTile(id: TileId, extent = DEFAULT_EXTENT): Tile { return { version: FORMAT_VERSION, id, extent, buildings: [], roads: [], areas: [] }; }

export function encodeTile(t: Tile): Uint8Array {
  const w = new W(); w.u32(MAGIC); w.u16(FORMAT_VERSION); w.u8(t.id.z); w.u32(t.id.x); w.u32(t.id.y); w.u16(t.extent);
  const secs: [LayerType, (w: W) => void][] = [];
  if (t.terrain) { const tr = t.terrain; secs.push([LayerType.Terrain, s => { s.u16(tr.size); s.f32(tr.minH); s.f32(tr.maxH); for (const h of tr.heights) s.f32(h); }]); }
  if (t.buildings.length) secs.push([LayerType.Buildings, s => { s.u32(t.buildings.length); for (const b of t.buildings) { s.f32(b.height); s.f32(b.minHeight); s.u16(b.rings.length); b.rings.forEach(r => s.ring(r)); } }]);
  if (t.roads.length) secs.push([LayerType.Roads, s => { s.u32(t.roads.length); for (const r of t.roads) { s.u8(r.cls); s.f32(r.width); s.ring(r.line); } }]);
  if (t.areas.length) secs.push([LayerType.Areas, s => { s.u32(t.areas.length); for (const a of t.areas) { s.u8(a.cls); s.u16(a.rings.length); a.rings.forEach(r => s.ring(r)); } }]);
  if (t.imagery) { const im = t.imagery; secs.push([LayerType.Imagery, s => { s.u8(MIMES.indexOf(im.mime)); s.str(im.source); s.u32(im.bytes.length); s.bytes(im.bytes); }]); }
  if (t.spectrum) { const sp = t.spectrum; secs.push([LayerType.Spectrum, s => { s.u16(sp.grid); s.f64(sp.periodStart); s.f64(sp.periodEnd); s.u32(sp.cells.length);
    for (const c of sp.cells) { s.u16(c.cx); s.u16(c.cy); s.u32(c.contributors); s.u32(c.traces); s.u8(c.surface); s.f32(c.condition); s.f32(c.signalDbm); s.u8(c.parkPath ? 1 : 0); } }]); }
  if (t.robot !== undefined) secs.push([LayerType.Robot, s => s.str(JSON.stringify(t.robot))]);
  if (t.businesses !== undefined) secs.push([LayerType.Businesses, s => s.str(JSON.stringify(t.businesses))]);
  w.u16(secs.length); for (const [ty, f] of secs) section(w, ty, f);
  return w.done();
}

export function decodeTile(bytes: Uint8Array): Tile {
  const r = new R(bytes);
  if (r.u32() !== MAGIC) throw new Error('not a C3DT tile');
  const version = r.u16(); if (version > FORMAT_VERSION) throw new Error(`unsupported tile version ${version}`);
  const id = { z: r.u8(), x: r.u32(), y: r.u32() }; const t = emptyTile(id, r.u16()); t.version = version;
  const n = r.u16();
  for (let i = 0; i < n; i++) {
    const type = r.u8(), len = r.u32(), end = r.o + len;
    switch (type) {
      case LayerType.Terrain: { const size = r.u16(), minH = r.f32(), maxH = r.f32(); const h = new Float32Array(size * size); for (let k = 0; k < h.length; k++) h[k] = r.f32(); t.terrain = { size, minH, maxH, heights: h }; break; }
      case LayerType.Buildings: { const c = r.u32(); for (let k = 0; k < c; k++) { const height = r.f32(), minHeight = r.f32(), rc = r.u16(); const rings = []; for (let j = 0; j < rc; j++) rings.push(r.ring()); t.buildings.push({ height, minHeight, rings }); } break; }
      case LayerType.Roads: { const c = r.u32(); for (let k = 0; k < c; k++) t.roads.push({ cls: r.u8(), width: r.f32(), line: r.ring() }); break; }
      case LayerType.Areas: { const c = r.u32(); for (let k = 0; k < c; k++) { const cls = r.u8(), rc = r.u16(); const rings = []; for (let j = 0; j < rc; j++) rings.push(r.ring()); t.areas.push({ cls, rings }); } break; }
      case LayerType.Imagery: { const mime = MIMES[r.u8()]; const source = r.str(); t.imagery = { mime, source, bytes: r.bytes(r.u32()) }; break; }
      case LayerType.Spectrum: { const grid = r.u16(), periodStart = r.f64(), periodEnd = r.f64(), c = r.u32(); const cells: SpectrumCell[] = [];
        for (let k = 0; k < c; k++) cells.push({ cx: r.u16(), cy: r.u16(), contributors: r.u32(), traces: r.u32(), surface: r.u8(), condition: r.f32(), signalDbm: r.f32(), parkPath: r.u8() === 1 });
        t.spectrum = { grid, periodStart, periodEnd, cells }; break; }
      case LayerType.Robot: t.robot = JSON.parse(r.str()); break;
      case LayerType.Businesses: t.businesses = JSON.parse(r.str()); break;
      default: break; // unknown layer: skip
    }
    r.o = end;
  }
  return t;
}
/** bilinear terrain height at tile-local coords */
export function sampleHeight(t: Tile, x: number, y: number): number {
  const tr = t.terrain; if (!tr) return 0; const s = tr.size - 1;
  const fx = Math.max(0, Math.min(s, x / t.extent * s)), fy = Math.max(0, Math.min(s, y / t.extent * s));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(s, x0 + 1), y1 = Math.min(s, y0 + 1), ax = fx - x0, ay = fy - y0, H = tr.heights, n = tr.size;
  return (H[y0 * n + x0] * (1 - ax) + H[y0 * n + x1] * ax) * (1 - ay) + (H[y1 * n + x0] * (1 - ax) + H[y1 * n + x1] * ax) * ay;
}
