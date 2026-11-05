// GPU budget for instanced vegetation and road works.
// 10k trees are trunk+canopy (two mat4s each). 1k works are one mat4 each.
// Fixed cost is the shared prototypes plus the sign atlas, allocated once.
import { signAtlas } from './atlas.js';
import { prototypeMeshes } from './prototypes.js';
import { INSTANCE_STRIDE_BYTES, WORK_SLOTS } from './slots.js';

export { DECOR_SLOTS, WORK_SLOTS, VEGETATION_SLOTS, INSTANCE_STRIDE_BYTES, writeInstance, instanceBufferBytes } from './slots.js';
export type { DecorSlot } from './slots.js';

export function fixedDecorBytes(): number {
  let n = signAtlas().rgba.byteLength;
  for (const m of prototypeMeshes()) n += m.vertices.byteLength + m.indices.byteLength;
  return n;
}

/** Bytes and draws for `trees` (two parts each) plus `works` spread across every work mesh. */
export function decorBudget(trees: number, works: number) {
  const fixedBytes = fixedDecorBytes();
  const instanceBytes = (trees * 2 + works) * INSTANCE_STRIDE_BYTES;
  const draws = (trees > 0 ? 2 : 0) + (works > 0 ? WORK_SLOTS.length : 0);
  return { bytes: fixedBytes + instanceBytes, draws, instanceBytes, fixedBytes };
}
