/**
 * Shared prototypes for vegetation and road works. One mesh per (shape, LOD), reused by every instance.
 * Canonical spaces are documented on each builder: callers scale them with the instance matrix.
 * Shapes follow the baseline renderer: faceted icosahedron crowns, a short trunk, low-poly cones and boards.
 */
export type Lod = 0 | 1 | 2;
export const VEG_MESHES = ['tree-broad', 'tree-conifer', 'bush', 'hedge', 'flower', 'planter', 'cone', 'temp-lights', 'sign-board', 'works-barrier'] as const;
export type VegMesh = typeof VEG_MESHES[number];

export interface ProtoPart {
  role: string;
  /** z-up metres in the part's canonical space */
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  triangles: number;
  /** set when the part keeps a fixed colour instead of the instance tint */
  fixedColour?: string;
}
export interface Prototype { id: string; mesh: VegMesh; lod: Lod; parts: ProtoPart[]; triangles: number }

const TRUNK = '#6B5A48';
const BAND = '#F4F1EA';
const WHITE = '#F2F2EE';
const POST = '#8C8F94';
const BACK = '#33363A';
const RED = '#D9261F';
const AMBER = '#E6A61F';
const GREEN = '#33BF4D';
const DARK = '#2A2C30';

const cache = new Map<string, Prototype>();
const sphereCache = new Map<number, ProtoPart>();

export function prototypeCacheBytes(): number {
  const seen = new Set<ArrayBufferLike>();
  let n = 0;
  const add = (a: ArrayBufferView) => { if (seen.has(a.buffer)) return; seen.add(a.buffer); n += a.byteLength; };
  for (const p of cache.values()) for (const part of p.parts) { add(part.positions); add(part.normals); add(part.uvs); add(part.indices); }
  return n;
}

export function prototype(mesh: VegMesh, lod: Lod): Prototype {
  const id = `${mesh}@${lod}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const parts = build(mesh, lod);
  const triangles = parts.reduce((s, p) => s + p.triangles, 0);
  const proto: Prototype = { id, mesh, lod, parts, triangles };
  cache.set(id, proto);
  return proto;
}

function build(mesh: VegMesh, lod: Lod): ProtoPart[] {
  switch (mesh) {
    case 'tree-broad': return [broadCrown(lod), cylinder(lod === 0 ? 8 : lod === 1 ? 6 : 4, 0.32, 0.24, 0, 1, 'trunk', TRUNK)];
    case 'tree-conifer': return [conifer(lod), cylinder(lod === 0 ? 8 : lod === 1 ? 5 : 4, 0.24, 0.18, 0, 1, 'trunk', TRUNK)];
    case 'bush': return [sphere(lod, 'crown')];
    case 'hedge': return [sphere(lod, 'crown')];
    case 'flower': return [flower(lod)];
    case 'planter': return planter(lod);
    case 'cone': return coneMesh(lod);
    case 'temp-lights': return lights(lod);
    case 'sign-board': return sign(lod);
    case 'works-barrier': return barrier(lod);
    default: return assertNever(mesh);
  }
}

function assertNever(x: never): never { throw new Error(`unknown veg mesh ${String(x)}`); }

class M {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; idx: number[] = [];
  tri(a: number[], b: number[], c: number[], n: number[], ua: number[], ub: number[], uc: number[]) {
    const o = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c); this.nor.push(...n, ...n, ...n); this.uv.push(...ua, ...ub, ...uc); this.idx.push(o, o + 1, o + 2);
  }
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[]) {
    this.tri(a, b, c, n, uv.slice(0, 2), uv.slice(2, 4), uv.slice(4, 6));
    this.tri(a, c, d, n, uv.slice(0, 2), uv.slice(4, 6), uv.slice(6, 8));
  }
  part(role: string, fixedColour?: string): ProtoPart {
    return { role, positions: Float32Array.from(this.pos), normals: Float32Array.from(this.nor), uvs: Float32Array.from(this.uv), indices: Uint32Array.from(this.idx), triangles: this.idx.length / 3, fixedColour };
  }
}

/** One shared crown: several offset lobes, so a rotation and a scale read as different trees without another draw. */
function broadCrown(lod: Lod): ProtoPart {
  if (lod === 2) return octahedron('crown');
  if (lod === 1) return flatSphere(0, 'crown');
  const lobe = flatSphere(1, 'crown');
  return merge([
    place(lobe, 0, 0.02, 0.02, 0.62, 0.7, 0.58),
    place(lobe, 0.42, 0.08, 0.1, 0.46, 0.4, 0.42),
    place(lobe, -0.34, 0.28, -0.04, 0.4, 0.48, 0.36),
    place(lobe, 0.06, -0.4, 0.16, 0.38, 0.44, 0.34),
  ], 'crown');
}

function sphere(lod: Lod, role: string): ProtoPart {
  const detail = lod === 0 ? 2 : lod === 1 ? 0 : -1;
  const hit = sphereCache.get(detail);
  if (hit) return { ...hit, role };
  const part = detail < 0 ? octahedron(role) : flatSphere(detail, role);
  sphereCache.set(detail, part);
  return part;
}

/** Unit sphere, radius 1, centred on the origin. Detail 0 = 20 triangles, each step ×4. */
function flatSphere(detail: number, role: string): ProtoPart {
  const t = (1 + Math.sqrt(5)) / 2;
  const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, 1, -t], [0, -1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const mid = new Map<string, number>();
  const mp = (a: number, b: number) => { const k = a < b ? `${a}-${b}` : `${b}-${a}`; const g = mid.get(k); if (g !== undefined) return g; const va = verts[a], vb = verts[b]; const i = verts.length; verts.push(norm([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2])); mid.set(k, i); return i; };
  for (let d = 0; d < detail; d++) { mid.clear(); const next: number[] = []; for (let i = 0; i < faces.length; i += 3) { const a = faces[i], b = faces[i + 1], c = faces[i + 2], ab = mp(a, b), bc = mp(b, c), ca = mp(c, a); next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca); } faces = next; }
  const m = new M();
  for (let i = 0; i < faces.length; i += 3) {
    let a = verts[faces[i]], b = verts[faces[i + 1]], c = verts[faces[i + 2]];
    let n = cross(sub(b, a), sub(c, a));
    const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, cen) < 0) { const s = b; b = c; c = s; n = scale(n, -1); }
    const uv = (p: number[]) => [(Math.atan2(p[1], p[0]) / (Math.PI * 2) + 0.5), p[2] * 0.5 + 0.5];
    m.tri(a, b, c, n, uv(a), uv(b), uv(c));
  }
  return m.part(role);
}

function octahedron(role: string): ProtoPart {
  const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const f = [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 0, 5, 2, 2, 5, 1, 1, 5, 3, 3, 5, 0];
  const m = new M();
  for (let i = 0; i < f.length; i += 3) {
    let a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]];
    let n = cross(sub(b, a), sub(c, a));
    const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, cen) < 0) { const s = b; b = c; c = s; n = scale(n, -1); }
    m.tri(a, b, c, n, [0, 0], [1, 0], [0.5, 1]);
  }
  return m.part(role);
}

/** Cylinder along Z. Radii are metres; height runs z0..z1. */
function cylinder(sides: number, r0: number, r1: number, z0: number, z1: number, role: string, fixedColour?: string): ProtoPart {
  const m = new M();
  for (let k = 0; k < sides; k++) {
    const t0 = k / sides * Math.PI * 2, t1 = (k + 1) / sides * Math.PI * 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const a = [c0 * r0, s0 * r0, z0], b = [c1 * r0, s1 * r0, z0], c = [c1 * r1, s1 * r1, z1], d = [c0 * r1, s0 * r1, z1];
    const n = norm([c0 + c1, s0 + s1, 0]);
    m.quad(a, b, c, d, n, [k / sides, 1, (k + 1) / sides, 1, (k + 1) / sides, 0, k / sides, 0]);
  }
  return m.part(role, fixedColour);
}

/** Apex at z=1, base radius 1 on z=0, then scaled by the caller. `layers` stacks narrower cones. */
function conifer(lod: Lod): ProtoPart {
  const layers = lod === 0 ? 3 : lod === 1 ? 2 : 1;
  const sides = lod === 0 ? 10 : lod === 1 ? 6 : 4;
  const m = new M();
  for (let i = 0; i < layers; i++) {
    const z0 = 0.22 + i * (0.7 / layers), z1 = z0 + 0.55 * (1 - i * 0.18);
    const r = 1 - i * (0.28);
    addCone(m, sides, r, z0, Math.min(1, z1));
  }
  return m.part('crown');
}

function addCone(m: M, sides: number, r: number, z0: number, z1: number) {
  const apex = [0, 0, z1];
  for (let k = 0; k < sides; k++) {
    const t0 = k / sides * Math.PI * 2, t1 = (k + 1) / sides * Math.PI * 2;
    const b = [Math.cos(t0) * r, Math.sin(t0) * r, z0], c = [Math.cos(t1) * r, Math.sin(t1) * r, z0];
    const n = norm(cross(sub(b, apex), sub(c, apex)));
    const out = dot(n, b) > 0 ? n : scale(n, -1);
    m.tri(out === n ? apex : apex, out === n ? b : c, out === n ? c : b, out, [0.5, 0], [k / sides, 1], [(k + 1) / sides, 1]);
  }
}

function coneMesh(lod: Lod): ProtoPart[] {
  const sides = lod === 0 ? 12 : lod === 1 ? 6 : 4;
  const m = new M();
  addCone(m, sides, 0.24, 0.05, 1);
  const body = m.part('body');
  if (lod === 2) return [body];
  const cyl = cylinder(sides, 0.16, 0.13, 0.38, 0.52, 'band', BAND);
  return [body, cyl];
}

function boxPart(hx: number, hy: number, z0: number, z1: number, role: string, fixedColour?: string): ProtoPart {
  const m = new M();
  const p = (x: number, y: number, z: number) => [x, y, z];
  const faces: [number[], number[], number[], number[], number[]][] = [
    [p(-hx, -hy, z1), p(hx, -hy, z1), p(hx, hy, z1), p(-hx, hy, z1), [0, 0, 1]],
    [p(-hx, -hy, z0), p(-hx, hy, z0), p(hx, hy, z0), p(hx, -hy, z0), [0, 0, -1]],
    [p(-hx, -hy, z0), p(hx, -hy, z0), p(hx, -hy, z1), p(-hx, -hy, z1), [0, -1, 0]],
    [p(hx, hy, z0), p(-hx, hy, z0), p(-hx, hy, z1), p(hx, hy, z1), [0, 1, 0]],
    [p(hx, -hy, z0), p(hx, hy, z0), p(hx, hy, z1), p(hx, -hy, z1), [1, 0, 0]],
    [p(-hx, hy, z0), p(-hx, -hy, z0), p(-hx, -hy, z1), p(-hx, hy, z1), [-1, 0, 0]],
  ];
  for (const [a, b, c, d, n] of faces) m.quad(a, b, c, d, n, [0, 1, 1, 1, 1, 0, 0, 0]);
  return m.part(role, fixedColour);
}

function planter(lod: Lod): ProtoPart[] {
  const tub = boxPart(0.5, 0.5, 0, 0.62, 'tub');
  if (lod === 2) return [tub];
  const plant = sphere(lod === 0 ? 1 : 2, 'crown');
  // lift and shrink the shared sphere into the tub mouth: done by the instance matrix, so the part stays a unit sphere.
  // A dedicated copy scaled into planter space keeps one matrix for both parts.
  const placed = place(plant, 0, 0, 0.9, 0.42, 0.42, 0.38);
  placed.role = 'plant';
  return [tub, placed];
}

function place(src: ProtoPart, x: number, y: number, z: number, sx: number, sy: number, sz: number): ProtoPart {
  const pos = new Float32Array(src.positions.length), nor = new Float32Array(src.normals.length);
  for (let i = 0; i < src.positions.length; i += 3) {
    pos[i] = src.positions[i] * sx + x; pos[i + 1] = src.positions[i + 1] * sy + y; pos[i + 2] = src.positions[i + 2] * sz + z;
    nor[i] = src.normals[i] / sx; nor[i + 1] = src.normals[i + 1] / sy; nor[i + 2] = src.normals[i + 2] / sz;
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  return { role: src.role, positions: pos, normals: nor, uvs: src.uvs, indices: src.indices, triangles: src.triangles, fixedColour: src.fixedColour };
}

function flower(lod: Lod): ProtoPart {
  if (lod === 2) return tetrahedron('crown');
  return sphere(lod === 0 ? 1 : 2, 'crown');
}

function tetrahedron(role: string): ProtoPart {
  const v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => norm(p));
  const f = [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2];
  const m = new M();
  for (let i = 0; i < f.length; i += 3) {
    let a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]];
    let n = cross(sub(b, a), sub(c, a));
    const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, cen) < 0) { const s = b; b = c; c = s; n = scale(n, -1); }
    m.tri(a, b, c, n, [0, 0], [1, 0], [0.5, 1]);
  }
  return m.part(role);
}

function lights(lod: Lod): ProtoPart[] {
  if (lod === 2) return [boxPart(0.08, 0.08, 0, 1, 'body', DARK)];
  const poleSides = lod === 0 ? 8 : 5;
  const parts: ProtoPart[] = [
    boxPart(0.14, 0.14, 0, 0.08, 'base', DARK),
    cylinder(poleSides, 0.035, 0.03, 0.08, 0.82, 'pole'),
  ];
  if (lod === 0) {
    parts.push(boxPart(0.09, 0.06, 0.62, 0.98, 'head', DARK));
    parts.push(boxPart(0.045, 0.02, 0.88, 0.94, 'lamp-red', RED));
    parts.push(boxPart(0.045, 0.02, 0.78, 0.84, 'lamp-amber', AMBER));
    parts.push(boxPart(0.045, 0.02, 0.68, 0.74, 'lamp-green', GREEN));
    parts.push(...signBoards(0.12, 0.64, 0.96, 0.09));
  } else parts.push(boxPart(0.08, 0.05, 0.7, 0.98, 'head', DARK), ...signBoards(0.1, 0.7, 0.96, 0.08));
  return parts;
}

function sign(lod: Lod): ProtoPart[] {
  if (lod === 2) return signBoards(0.32, 0.42, 0.92, 0.04);
  const post = lod === 0 ? cylinder(8, 0.04, 0.035, 0, 0.7, 'post', POST) : boxPart(0.04, 0.04, 0, 0.7, 'post', POST);
  return [post, ...signBoards(0.46, 0.42, 1.05, 0.05)];
}

/** Board facing +Y. Front is tinted or carries a TSRGD icon; the back stays a fixed dark colour. uv y = 1 on the bottom edge. */
function signBoards(hx: number, z0: number, z1: number, y: number): ProtoPart[] {
  const bl = [-hx, y, z0], br = [hx, y, z0], tr = [hx, y, z1], tl = [-hx, y, z1];
  const front = new M();
  front.quad(bl, tl, tr, br, [0, 1, 0], [1, 1, 1, 0, 0, 0, 0, 1]);
  const back = new M();
  back.quad([hx, y - 0.012, z0], [hx, y - 0.012, z1], [-hx, y - 0.012, z1], [-hx, y - 0.012, z0], [0, -1, 0], [0, 1, 1, 0, 0, 0, 1, 1]);
  return [front.part('board'), back.part('back', BACK)];
}

function barrier(lod: Lod): ProtoPart[] {
  const RED = '#C8102E';
  if (lod === 2) {
    const m = new M();
    m.quad([-0.5, 0, 0.55], [0.5, 0, 0.55], [0.5, 0, 0.95], [-0.5, 0, 0.95], [0, 1, 0], [0, 1, 1, 1, 1, 0, 0, 0]);
    return [m.part('rail', RED)];
  }
  if (lod === 1) return [boxPart(0.5, 0.045, 0.4, 0.95, 'rail', RED)];
  const reds: ProtoPart[] = [], whites: ProtoPart[] = [];
  for (let i = 0; i < 4; i++) {
    const panel = place(boxPart(0.11, 0.04, 0.42, 0.96, 'panel', i % 2 ? '#F7F7F5' : RED), -0.375 + i * 0.25, 0, 0, 1, 1, 1);
    (i % 2 ? whites : reds).push(panel);
  }
  const foot = boxPart(0.04, 0.05, 0, 0.48, 'foot', '#C8C8C4');
  return [merge(reds, 'rail', RED), merge(whites, 'stripe', '#F7F7F5'), merge([place(foot, 0.4, 0, 0, 1, 1, 1), place(foot, -0.4, 0, 0, 1, 1, 1)], 'feet', '#C8C8C4')];
}

function merge(parts: ProtoPart[], role: string, fixedColour?: string): ProtoPart {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const p of parts) { const o = pos.length / 3; pos.push(...p.positions); nor.push(...p.normals); uv.push(...p.uvs); for (const i of p.indices) idx.push(o + i); }
  return { role, positions: Float32Array.from(pos), normals: Float32Array.from(nor), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx), triangles: idx.length / 3, fixedColour };
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: number[], s: number) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
