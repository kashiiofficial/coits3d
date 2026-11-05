// GPU budget for instanced vegetation and road works.
// A tree is one mat4 (its mesh carries trunk and crown) and so is a works object.
// Fixed cost is every slot's shared mesh, all LODs, plus the sign atlas, allocated once.
import { signAtlas } from './atlas.js';
import { prototypeMeshes } from './prototypes.js';
import { INSTANCE_STRIDE_BYTES, TREE_SLOTS, WORK_SLOTS } from './slots.js';

export { DECOR_SLOTS, WORK_SLOTS, VEGETATION_SLOTS, TREE_SLOTS, INSTANCE_STRIDE_BYTES, writeInstance, instanceBufferBytes } from './slots.js';
export type { DecorSlot } from './slots.js';

export function fixedDecorBytes(): number {
  let n = signAtlas().rgba.byteLength;
  for (const m of prototypeMeshes()) n += m.vertices.byteLength + m.indices.byteLength;
  return n;
}

/**
 * Bytes and worst-case draws for `trees` spread over both species and every LOD, plus
 * `works` spread across every work mesh.
 */
export function decorBudget(trees: number, works: number) {
  const fixedBytes = fixedDecorBytes();
  const instanceBytes = (trees + works) * INSTANCE_STRIDE_BYTES;
  const draws = (trees > 0 ? TREE_SLOTS.length : 0) + (works > 0 ? WORK_SLOTS.length : 0);
  return { bytes: fixedBytes + instanceBytes, draws, instanceBytes, fixedBytes };
}
