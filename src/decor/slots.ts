// Instanced decor slots. One GPU draw per slot, shared by every tile.
// Trees use two slots (trunk and canopy) so a tree is two instances, not a unique mesh.
export const VEGETATION_SLOTS = ['trunk', 'canopy', 'hedge', 'planter'] as const;
export const WORK_SLOTS = ['cone', 'barrier', 'light', 'closure', 'diversion'] as const;
export const DECOR_SLOTS = [...VEGETATION_SLOTS, ...WORK_SLOTS] as const;
export type DecorSlot = (typeof DECOR_SLOTS)[number];

/** Column-major mat4. One instance is 64 bytes. */
export const INSTANCE_STRIDE_FLOATS = 16;
export const INSTANCE_STRIDE_BYTES = INSTANCE_STRIDE_FLOATS * 4;

export function writeInstance(out: Float32Array, index: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) {
  const o = index * INSTANCE_STRIDE_FLOATS;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[o] = c * sx; out[o + 1] = s * sx; out[o + 2] = 0; out[o + 3] = 0;
  out[o + 4] = -s * sy; out[o + 5] = c * sy; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = 0; out[o + 9] = 0; out[o + 10] = sz; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}

export function instanceBufferBytes(count: number) { return count * INSTANCE_STRIDE_BYTES; }
