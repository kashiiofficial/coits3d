// Shared low-poly prototypes. Authored in metres, then scaled per instance by heightScale
// so they match the mercator frame used by buildings (see TileRenderer.addTile).
import type { DecorSlot } from './slots.js';
import { signAtlas } from './atlas.js';

export interface ProtoMesh { slot: DecorSlot; vertices: Float32Array; indices: Uint32Array; textured: boolean }

const STRIDE = 11;
class B {
  v: number[] = []; i: number[] = [];
  get n() { return this.v.length / STRIDE; }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: number[], u = 0, w = 0) {
    this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], u, w);
  }
  quad(a: number, b: number, c: number, d: number) { this.i.push(a, b, c, a, c, d); }
  done() { return { vertices: new Float32Array(this.v), indices: new Uint32Array(this.i) }; }
}

const BROWN = [0.40, 0.28, 0.16];
const LEAF = [0.30, 0.55, 0.28];
const HEDGE = [0.24, 0.48, 0.22];
const POT = [0.45, 0.32, 0.22];
const SOIL = [0.28, 0.20, 0.12];
const ORANGE = [0.93, 0.42, 0.08];
const WHITE = [0.96, 0.96, 0.94];
const RED = [0.82, 0.08, 0.08];
const GREY = [0.25, 0.25, 0.27];
const BLACK = [0.08, 0.08, 0.09];
const AMBER = [0.95, 0.72, 0.12];
const GREEN = [0.15, 0.65, 0.22];

let cached: ProtoMesh[] | null = null;

export function prototypeMeshes(): ProtoMesh[] {
  if (cached) return cached;
  const uv = signAtlas().uv;
  cached = [
    mesh('trunk', false, trunk),
    mesh('canopy', false, canopy),
    mesh('hedge', false, hedge),
    mesh('planter', false, planter),
    mesh('cone', false, cone),
    mesh('barrier', false, barrier),
    mesh('light', false, light),
    mesh('closure', true, b => sign(b, uv.closure)),
    mesh('diversion', true, b => sign(b, uv.diversion)),
  ];
  return cached;
}

function mesh(slot: DecorSlot, textured: boolean, build: (b: B) => void): ProtoMesh {
  const b = new B(); build(b); const m = b.done(); return { slot, textured, ...m };
}

function trunk(b: B) { cylinder(b, 0.5, 1, 7, BROWN); }

function canopy(b: B) {
  coneSection(b, 0.95, 0.15, 0.55, 8, LEAF);
  coneSection(b, 0.72, 0.45, 0.85, 8, [0.34, 0.62, 0.30]);
  coneSection(b, 0.42, 0.75, 1.15, 8, [0.40, 0.70, 0.34]);
}

function hedge(b: B) { box(b, -0.5, -0.28, 0, 0.5, 0.28, 1, HEDGE); }

function planter(b: B) {
  box(b, -0.45, -0.45, 0, 0.45, 0.45, 0.42, POT);
  box(b, -0.34, -0.34, 0.42, 0.34, 0.34, 0.52, SOIL);
  coneSection(b, 0.36, 0.5, 1.05, 7, LEAF);
}

function cone(b: B) {
  coneBand(b, 0.5, 0.34, 0, 0.28, ORANGE);
  coneBand(b, 0.34, 0.22, 0.28, 0.48, WHITE);
  coneBand(b, 0.22, 0.02, 0.48, 1, ORANGE);
}

/** Chapter 8 style red/white pedestrian barrier, 2 m long. */
function barrier(b: B) {
  const bands = [RED, WHITE, RED, WHITE, RED];
  const z0 = 0.35, z1 = 1.05, h = (z1 - z0) / bands.length;
  for (let i = 0; i < bands.length; i++) {
    box(b, -1, -0.06, z0 + i * h, 1, 0.06, z0 + (i + 1) * h, bands[i]);
  }
  box(b, -1, -0.08, 0.22, -0.82, 0.08, 0.4, GREY);
  box(b, 0.82, -0.08, 0.22, 1, 0.08, 0.4, GREY);
  box(b, -0.96, -0.05, 0, -0.84, 0.05, 0.28, GREY);
  box(b, 0.84, -0.05, 0, 0.96, 0.05, 0.28, GREY);
}

/** Temporary traffic signal: stand plus a three-aspect head. */
function light(b: B) {
  cylinder(b, 0.06, 1.7, 6, GREY);
  box(b, -0.18, -0.12, 1.55, 0.18, 0.12, 2.55, BLACK);
  lamp(b, 2.32, RED);
  lamp(b, 2.02, AMBER);
  lamp(b, 1.72, GREEN);
  box(b, -0.22, -0.16, 0, 0.22, 0.16, 0.06, GREY);
}

function lamp(b: B, z: number, col: number[]) {
  cylinder(b, 0.09, 0.04, 6, col, 0, 0, z);
}

function sign(b: B, uv: { u0: number; v0: number; u1: number; v1: number }) {
  cylinder(b, 0.045, 1.55, 6, GREY);
  const x0 = -0.045, x1 = 0.045, y0 = -0.6, y1 = 0.6, z0 = 1.5, z1 = 2.1;
  // Broad faces carry the atlas. The pole and the rim stay on vertex colour (uv.x < 0).
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

function coneSection(b: B, r: number, z0: number, z1: number, sides: number, col: number[]) {
  coneBand(b, r, r * 0.15, z0, z1, col);
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
