// Shared low-poly prototypes, one mesh per slot. Vegetation is built from the Studio
// prototypes in veg-proto.ts; works furniture is authored here in real metres.
// Instances scale both by heightScale so they match the mercator frame used by buildings.
//
// Vertex layout (12 floats): position xyz | normal xyz | colour rgb | uv | tint mask.
// uv.x < 0 means "vertex colour", so only sign faces sample the atlas. A tint mask of 1
// multiplies the colour by the instance tint (crowns, planter plants); 0 keeps it fixed.
import { DECOR_SLOTS, type DecorSlot, type Lod, type VegetationKind } from './slots.js';
import { signAtlas, type SignUv } from './atlas.js';
import { prototype, type ProtoPart, type VegMesh } from './veg-proto.js';

export interface ProtoMesh { slot: DecorSlot; vertices: Float32Array; indices: Uint32Array; textured: boolean }

export const PROTO_STRIDE = 12;
class B {
  v: number[] = []; i: number[] = [];
  get n() { return this.v.length / PROTO_STRIDE; }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: readonly number[], u = 0, w = 0, mask = 0) {
    this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], u, w, mask);
  }
  quad(a: number, b: number, c: number, d: number) { this.i.push(a, b, c, a, c, d); }
  done() { return { vertices: new Float32Array(this.v), indices: new Uint32Array(this.i) }; }
}

const ORANGE = [0.93, 0.42, 0.08];
const WHITE = [0.96, 0.96, 0.94];
const RED = [0.82, 0.08, 0.08];
const GREY = [0.25, 0.25, 0.27];
const BLACK = [0.08, 0.08, 0.09];
const AMBER = [0.95, 0.72, 0.12];
const GREEN = [0.15, 0.65, 0.22];

/** Base colours for parts the Studio prototypes leave to the instance tint. */
const ROLE_COLOUR: Record<VegetationKind, Record<string, readonly number[]>> = {
  'tree-broad': { crown: [0.42, 0.62, 0.30] },
  'tree-conifer': { crown: [0.22, 0.44, 0.27] },
  hedge: { crown: [0.30, 0.52, 0.26] },
  planter: { tub: [0.60, 0.57, 0.52], plant: [0.36, 0.58, 0.30] },
};
const TINTED_ROLES = new Set(['crown', 'plant']);

/** Where each Studio part sits in the slot's canonical space: scale, then translate. */
interface Placement { s: [number, number, number]; t: [number, number, number] }
const IDENTITY: Placement = { s: [1, 1, 1], t: [0, 0, 0] };

/**
 * Tree space: x and y are in crown radii, z is in tree heights (ground at 0, top near 1).
 * The instance scale is therefore (crown radius, crown radius, height).
 */
function treeLayout(mesh: 'tree-broad' | 'tree-conifer', part: ProtoPart): Placement {
  if (part.role === 'trunk') return mesh === 'tree-broad' ? { s: [0.25, 0.25, 0.5], t: [0, 0, 0] } : { s: [0.5, 0.5, 0.3], t: [0, 0, 0] };
  // Each LOD's crown has a different raw extent, so fit it to the same box to keep the silhouette.
  return mesh === 'tree-broad' ? fit(part, 0.34, 0.98) : fit(part, 0.22, 1);
}

/** Scales a part so it spans z0..z1 and its widest point sits at radius 1 around the z axis. */
function fit(part: ProtoPart, z0: number, z1: number): Placement {
  let lo = Infinity, hi = -Infinity, r = 0;
  const p = part.positions;
  for (let k = 0; k < p.length; k += 3) { lo = Math.min(lo, p[k + 2]); hi = Math.max(hi, p[k + 2]); r = Math.max(r, Math.hypot(p[k], p[k + 1])); }
  const sz = (z1 - z0) / (hi - lo);
  return { s: [1 / r, 1 / r, sz], t: [0, 0, z0 - lo * sz] };
}

/** Unit-diameter bush resting on the ground; instance scale is (width, depth, height). */
const BUSH: Placement = { s: [0.5, 0.5, 0.5], t: [0, 0, 0.5] };

const VEG_SOURCE: Record<VegetationKind, VegMesh> = { 'tree-broad': 'tree-broad', 'tree-conifer': 'tree-conifer', hedge: 'hedge', planter: 'planter' };

let cached: ProtoMesh[] | null = null;

export function prototypeMeshes(): ProtoMesh[] {
  if (cached) return cached;
  const uv = signAtlas().uv;
  const works: Record<string, ProtoMesh> = {
    cone: mesh('cone', false, cone),
    barrier: mesh('barrier', false, barrier),
    light: mesh('light', false, light),
    closure: mesh('closure', true, b => sign(b, uv.closure)),
    diversion: mesh('diversion', true, b => sign(b, uv.diversion)),
  };
  cached = DECOR_SLOTS.map(slot => works[slot] ?? vegetation(slot));
  return cached;
}

function vegetation(slot: DecorSlot): ProtoMesh {
  const [kind, lodText] = slot.split('@') as [VegetationKind, string];
  const lod = Number(lodText) as Lod;
  const b = new B();
  for (const part of prototype(VEG_SOURCE[kind], lod).parts) {
    const at = kind === 'tree-broad' || kind === 'tree-conifer' ? treeLayout(kind, part) : kind === 'hedge' ? BUSH : IDENTITY;
    const colour = part.fixedColour ? hex(part.fixedColour) : ROLE_COLOUR[kind][part.role] ?? WHITE;
    appendPart(b, part, at, colour, !part.fixedColour && TINTED_ROLES.has(part.role) ? 1 : 0);
  }
  const m = b.done();
  return { slot, textured: false, ...m };
}

function appendPart(b: B, part: ProtoPart, at: Placement, colour: readonly number[], mask: number) {
  const base = b.n;
  const [sx, sy, sz] = at.s, [tx, ty, tz] = at.t;
  for (let k = 0; k < part.positions.length; k += 3) {
    const p = part.positions, q = part.normals;
    let nx = q[k] / sx, ny = q[k + 1] / sy, nz = q[k + 2] / sz;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    b.vert(p[k] * sx + tx, p[k + 1] * sy + ty, p[k + 2] * sz + tz, nx, ny, nz, colour, -1, -1, mask);
  }
  for (const i of part.indices) b.i.push(base + i);
}

function hex(c: string): number[] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}

function mesh(slot: DecorSlot, textured: boolean, build: (b: B) => void): ProtoMesh {
  const b = new B(); build(b); const m = b.done(); return { slot, textured, ...m };
}

/** 0.75 m traffic cone with a white reflective band. */
function cone(b: B) {
  coneBand(b, 0.19, 0.13, 0, 0.32, ORANGE);
  coneBand(b, 0.13, 0.09, 0.32, 0.5, WHITE);
  coneBand(b, 0.09, 0.02, 0.5, 0.75, ORANGE);
  box(b, -0.21, -0.21, 0, 0.21, 0.21, 0.03, BLACK, -1);
}

/** Chapter 8 style red/white pedestrian barrier, 2 m long and 1 m high. */
function barrier(b: B) {
  const bands = [RED, WHITE, RED, WHITE, RED];
  const z0 = 0.35, z1 = 1.0, h = (z1 - z0) / bands.length;
  for (let i = 0; i < bands.length; i++) {
    box(b, -1, -0.03, z0 + i * h, 1, 0.03, z0 + (i + 1) * h, bands[i], -1);
  }
  box(b, -1, -0.04, 0.22, -0.9, 0.04, 0.35, GREY, -1);
  box(b, 0.9, -0.04, 0.22, 1, 0.04, 0.35, GREY, -1);
  box(b, -0.98, -0.2, 0, -0.88, 0.2, 0.22, GREY, -1);
  box(b, 0.88, -0.2, 0, 0.98, 0.2, 0.22, GREY, -1);
}

/** Portable traffic signal: weighted base, 2.6 m stand and a three-aspect head facing +X. */
function light(b: B) {
  box(b, -0.3, -0.3, 0, 0.3, 0.3, 0.12, GREY, -1);
  cylinder(b, 0.05, 2.0, 6, GREY);
  box(b, -0.12, -0.16, 1.7, 0.12, 0.16, 2.6, BLACK, -1);
  lamp(b, 2.42, RED);
  lamp(b, 2.15, AMBER);
  lamp(b, 1.88, GREEN);
}

function lamp(b: B, z: number, col: number[]) {
  box(b, 0.12, -0.1, z - 0.1, 0.14, 0.1, z + 0.1, col, -1);
}

/** 1.2 m × 0.6 m board on a post, the same face on both sides. */
function sign(b: B, uv: SignUv) {
  cylinder(b, 0.045, 1.55, 6, GREY);
  const x0 = -0.045, x1 = 0.045, y0 = -0.6, y1 = 0.6, z0 = 1.5, z1 = 2.1;
  const c = WHITE;
  const a = b.n;
  b.vert(x1, y0, z0, 1, 0, 0, c, uv.u0, uv.v0);
  b.vert(x1, y1, z0, 1, 0, 0, c, uv.u1, uv.v0);
  b.vert(x1, y1, z1, 1, 0, 0, c, uv.u1, uv.v1);
  b.vert(x1, y0, z1, 1, 0, 0, c, uv.u0, uv.v1);
  b.quad(a, a + 1, a + 2, a + 3);
  const d = b.n;
  b.vert(x0, y1, z0, -1, 0, 0, c, uv.u0, uv.v0);
  b.vert(x0, y0, z0, -1, 0, 0, c, uv.u1, uv.v0);
  b.vert(x0, y0, z1, -1, 0, 0, c, uv.u1, uv.v1);
  b.vert(x0, y1, z1, -1, 0, 0, c, uv.u0, uv.v1);
  b.quad(d, d + 1, d + 2, d + 3);
  box(b, x0, y0, z0, x1, y1, z0 + 0.02, GREY, -1);
  box(b, x0, y0, z1 - 0.02, x1, y1, z1, GREY, -1);
}

function cylinder(b: B, r: number, h: number, sides: number, col: number[], ox = 0, oy = 0, oz = 0) {
  const base = b.n;
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a);
    b.vert(ox + nx * r, oy + ny * r, oz, nx, ny, 0, col, -1, -1);
    b.vert(ox + nx * r, oy + ny * r, oz + h, nx, ny, 0, col, -1, -1);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a = base + i * 2, c = base + j * 2;
    b.quad(a, c, c + 1, a + 1);
  }
}

function coneBand(b: B, r0: number, r1: number, z0: number, z1: number, col: number[]) {
  const sides = 8, base = b.n;
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a);
    b.vert(nx * r0, ny * r0, z0, nx, ny, 0.3, col, -1, -1);
    b.vert(nx * r1, ny * r1, z1, nx, ny, 0.3, col, -1, -1);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a = base + i * 2, c = base + j * 2;
    b.quad(a, c, c + 1, a + 1);
  }
}

function box(b: B, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number[], uv = 0) {
  const faces: number[][] = [
    [x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, 1, 0, 0],
    [x0, y1, z0, x0, y0, z0, x0, y0, z1, x0, y1, z1, -1, 0, 0],
    [x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, 0, 1, 0],
    [x1, y0, z0, x0, y0, z0, x0, y0, z1, x1, y0, z1, 0, -1, 0],
    [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1],
    [x0, y1, z0, x1, y1, z0, x1, y0, z0, x0, y0, z0, 0, 0, -1],
  ];
  for (const f of faces) {
    const n = b.n;
    b.vert(f[0], f[1], f[2], f[12], f[13], f[14], col, uv, uv);
    b.vert(f[3], f[4], f[5], f[12], f[13], f[14], col, uv, uv);
    b.vert(f[6], f[7], f[8], f[12], f[13], f[14], col, uv, uv);
    b.vert(f[9], f[10], f[11], f[12], f[13], f[14], col, uv, uv);
    b.quad(n, n + 1, n + 2, n + 3);
  }
}
