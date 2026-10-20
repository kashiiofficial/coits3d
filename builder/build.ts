// Tile builder: OSM .pbf (via the `osmium` CLI) or GeoJSON -> .c3dt tiles in <out>/{z}/{x}/{y}.c3dt
// Usage: tsx builder/build.ts --in builder/sample.geojson --out demo/tiles --minz 14 --maxz 16
// Privacy: only geometry + height/class are kept. Names, addresses (addr:*), phone, opening hours etc. are dropped.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { lngLatToMerc, type TileId } from '../src/tile/address.js';
import { encodeTile, emptyTile, AreaClass, RoadClass, DEFAULT_EXTENT, type Tile, type Ring } from '../src/tile/format.js';
import { syntheticTerrain } from './terrain.js';

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const input = args.in ?? 'builder/sample.geojson', out = args.out ?? 'demo/tiles', minz = +(args.minz ?? 14), maxz = +(args.maxz ?? 16), terrainSize = +(args.terrain ?? 33);

function loadGeoJSON(p: string): any { if (p.endsWith('.pbf')) { const tmp = p.replace(/\.pbf$/, '.geojson'); if (!existsSync(tmp)) execFileSync('osmium', ['export', p, '-o', tmp, '-f', 'geojson', '--overwrite']); p = tmp; } return JSON.parse(readFileSync(p, 'utf8')); }
const ROADS: Record<string, [number, number]> = { motorway: [RoadClass.motorway, 14], trunk: [RoadClass.primary, 12], primary: [RoadClass.primary, 11], secondary: [RoadClass.secondary, 10], tertiary: [RoadClass.tertiary, 9], residential: [RoadClass.residential, 7], unclassified: [RoadClass.residential, 7], living_street: [RoadClass.residential, 6], service: [RoadClass.service, 4], pedestrian: [RoadClass.footway, 6], footway: [RoadClass.footway, 2.5], cycleway: [RoadClass.cycleway, 2.5], path: [RoadClass.path, 2], steps: [RoadClass.path, 2] };
function areaClass(p: any): number | null { if (p.leisure === 'park' || p.leisure === 'garden') return AreaClass.park; if (p.natural === 'water' || p.waterway === 'riverbank' || p.water) return AreaClass.water;
  if (p.landuse === 'grass' || p.leisure === 'pitch') return AreaClass.grass; if (p.natural === 'wood' || p.landuse === 'forest') return AreaClass.wood; if (p.highway === 'pedestrian' || p.place === 'square') return AreaClass.pedestrian; return null; }
function bHeight(p: any) { const h = parseFloat(p.height); if (h > 0) return h; const l = parseFloat(p['building:levels']); if (l > 0) return l * 3.2 + 1; return 10; }
function bMin(p: any) { const h = parseFloat(p.min_height); if (h > 0) return h; const l = parseFloat(p['building:min_level']); return l > 0 ? l * 3.2 : 0; }

const tiles = new Map<string, Tile>();
const getTile = (id: TileId) => { const k = `${id.z}/${id.x}/${id.y}`; let t = tiles.get(k); if (!t) tiles.set(k, t = emptyTile(id)); return t; };
const local = (id: TileId, mx: number, my: number) => { const n = 2 ** id.z; return [(mx * n - id.x) * DEFAULT_EXTENT, (my * n - id.y) * DEFAULT_EXTENT]; };
const polysOf = (g: any): number[][][][] => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const linesOf = (g: any): number[][][] => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];

/** Liang–Barsky segment clip against [lo,hi]^2, returning polylines inside */
function clipLine(pts: number[][], lo: number, hi: number): number[][][] {
  const res: number[][][] = []; let cur: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) { let [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0; let ok = true;
    for (const [p, q] of [[-dx, x0 - lo], [dx, hi - x0], [-dy, y0 - lo], [dy, hi - y0]]) { if (p === 0) { if (q < 0) { ok = false; break; } continue; } const r = q / p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
    if (!ok) { if (cur.length > 1) res.push(cur); cur = []; continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
    if (!cur.length) cur.push(a); cur.push(b); if (t1 < 1) { res.push(cur); cur = []; } }
  if (cur.length > 1) res.push(cur); return res;
}

const gj = loadGeoJSON(input); let nB = 0, nR = 0, nA = 0;
for (const f of gj.features) { const p = f.properties ?? {}, g = f.geometry; if (!g) continue;
  for (let z = minz; z <= maxz; z++) { const n = 2 ** z; const minArea = z < maxz ? 30 : 0;
    if (p.building || p['building:part']) { if (p.building && p['building:part']) continue;
      for (const poly of polysOf(g)) { const merc = poly.map(r => r.map(([x, y]) => lngLatToMerc(x, y)));
        let cx = 0, cy = 0; merc[0].forEach(([x, y]) => { cx += x; cy += y; }); cx /= merc[0].length; cy /= merc[0].length;
        const id = { z, x: Math.floor(cx * n), y: Math.floor(cy * n) }; const rings: Ring[] = merc.map(r => r.slice(0, -1).flatMap(([x, y]) => local(id, x, y)));
        if (rings[0].some(v => Math.abs(v) > 30000)) continue;
        const h = bHeight(p); let area = 0; const r0 = rings[0]; for (let i = 0; i < r0.length; i += 2) { const j = (i + 2) % r0.length; area += r0[i] * r0[j + 1] - r0[j] * r0[i + 1]; }
        const m2 = Math.abs(area / 2) * (40075016 * Math.cos(51.5 * Math.PI / 180) / n / DEFAULT_EXTENT) ** 2; if (m2 < minArea * (2 ** (maxz - z)) ** 2 / 4) continue;
        getTile(id).buildings.push({ height: h, minHeight: bMin(p), rings: z < maxz ? [rings[0]] : rings }); if (z === maxz) nB++; } continue; }
    const ac = areaClass(p);
    if (ac !== null) { for (const poly of polysOf(g)) { const merc = poly.map(r => r.map(([x, y]) => lngLatToMerc(x, y)));
      let cx = 0, cy = 0; merc[0].forEach(([x, y]) => { cx += x; cy += y; }); cx /= merc[0].length; cy /= merc[0].length;
      const id = { z, x: Math.floor(cx * n), y: Math.floor(cy * n) }; const rings = merc.map(r => r.slice(0, -1).flatMap(([x, y]) => local(id, x, y)));
      if (rings.some(r => r.some(v => Math.abs(v) > 30000))) continue; getTile(id).areas.push({ cls: ac, rings }); if (z === maxz) nA++; } continue; }
    const rc = ROADS[p.highway]; if (rc && (z === maxz || rc[0] <= RoadClass.residential)) {
      for (const line of linesOf(g)) { const merc = line.map(([x, y]) => lngLatToMerc(x, y)); const xs = merc.map(m => m[0] * n), ys = merc.map(m => m[1] * n);
        for (let tx = Math.floor(Math.min(...xs)); tx <= Math.floor(Math.max(...xs)); tx++) for (let ty = Math.floor(Math.min(...ys)); ty <= Math.floor(Math.max(...ys)); ty++) {
          const id = { z, x: tx, y: ty }; const pts = merc.map(([x, y]) => local(id, x, y));
          for (const seg of clipLine(pts, 0, DEFAULT_EXTENT)) { getTile(id).roads.push({ cls: rc[0], width: rc[1], line: seg.flat() }); if (z === maxz) nR++; } } } }
  } }
let bytes = 0; const keys: string[] = [];
for (const [k, t] of tiles) { t.terrain = syntheticTerrain(t.id, terrainSize); const enc = encodeTile(t); const [z, x] = k.split('/'); mkdirSync(join(out, z, x), { recursive: true }); writeFileSync(join(out, `${k}.c3dt`), enc); bytes += enc.length; keys.push(k); }
writeFileSync(join(out, 'tiles.json'), JSON.stringify({ format: 'c3dt', version: 1, minzoom: minz, maxzoom: maxz, tiles: keys.sort(), attribution: '© OpenStreetMap contributors (ODbL)', terrain: 'synthetic placeholder' }, null, 1));
console.log(`built ${tiles.size} tiles (${(bytes / 1024).toFixed(0)} KiB) z${minz}-${maxz}: ${nB} buildings, ${nR} road pieces, ${nA} areas at z${maxz}`);
