// Instanced decor slots. One GPU draw per occupied slot, shared by every tile.
// Vegetation has one slot per (kind, LOD); a tree is one instance whose mesh carries
// both trunk and crown. Works furniture is small and only ever seen close, so it has one LOD.
import type { Lod } from './veg-proto.js';

export type { Lod } from './veg-proto.js';
export const VEGETATION_KINDS = ['tree-broad', 'tree-conifer', 'hedge', 'planter'] as const;
export const WORK_SLOTS = ['cone', 'barrier', 'light', 'closure', 'diversion'] as const;
export type VegetationKind = (typeof VEGETATION_KINDS)[number];
export type WorkSlot = (typeof WORK_SLOTS)[number];
export type DecorKind = VegetationKind | WorkSlot;
export type VegetationSlot = `${VegetationKind}@${Lod}`;
export type DecorSlot = VegetationSlot | WorkSlot;

/** Planters stop at LOD 1: their LOD 2 is a bare tub, not worth a draw of its own. */
export const VEGETATION_LODS: Record<VegetationKind, readonly Lod[]> = {
  'tree-broad': [0, 1, 2],
  'tree-conifer': [0, 1, 2],
  hedge: [0, 1, 2],
  planter: [0, 1],
};
export const TREE_SLOTS: readonly VegetationSlot[] = (['tree-broad', 'tree-conifer'] as const).flatMap(k => VEGETATION_LODS[k].map(l => `${k}@${l}` as const));
export const VEGETATION_SLOTS: readonly VegetationSlot[] = VEGETATION_KINDS.flatMap(k => VEGETATION_LODS[k].map(l => `${k}@${l}` as const));
export const DECOR_SLOTS: readonly DecorSlot[] = [...VEGETATION_SLOTS, ...WORK_SLOTS];

export function isWorkSlot(kind: DecorKind): kind is WorkSlot {
  return (WORK_SLOTS as readonly string[]).includes(kind);
}

export function slotFor(kind: DecorKind, lod: Lod): DecorSlot {
  if (isWorkSlot(kind)) return kind;
  const lods = VEGETATION_LODS[kind];
  return `${kind}@${lods.includes(lod) ? lod : lods[lods.length - 1]}`;
}

/** Column-major mat4. One instance is 64 bytes. */
export const INSTANCE_STRIDE_FLOATS = 16;
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE_FLOATS * 4;
export type Tint = readonly [number, number, number];
export const NO_TINT: Tint = [1, 1, 1];

/**
 * The matrix is affine, so the w row is always (0, 0, 0, 1). Its first three entries carry
 * the instance tint instead; the vertex shader reads them and rebuilds the w row.
 */
export function writeInstance(out: Float32Array, index: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, tint: Tint = NO_TINT) {
  const o = index * INSTANCE_STRIDE_FLOATS;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[o] = c * sx; out[o + 1] = s * sx; out[o + 2] = 0; out[o + 3] = tint[0];
  out[o + 4] = -s * sy; out[o + 5] = c * sy; out[o + 6] = 0; out[o + 7] = tint[1];
  out[o + 8] = 0; out[o + 9] = 0; out[o + 10] = sz; out[o + 11] = tint[2];
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}

export function instanceBufferBytes(count: number) { return count * INSTANCE_STRIDE_BYTES; }
