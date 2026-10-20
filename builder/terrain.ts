// PLACEHOLDER terrain: smooth synthetic heights from a continuous function of mercator position, so tile edges match.
// Replace with a real open DEM (e.g. Environment Agency LIDAR DTM, OGL; or Copernicus GLO-30) — see README roadmap.
import { tileMercBounds, type TileId } from '../src/tile/address.js';
import type { Terrain } from '../src/tile/format.js';
export function heightAt(mx: number, my: number) { const a = mx * 2 ** 17, b = my * 2 ** 17; return 12 + 8 * Math.sin(a * 0.9) * Math.cos(b * 0.7) + 4 * Math.sin(a * 2.3 + b * 1.7); }
export function syntheticTerrain(id: TileId, size = 33): Terrain { const bb = tileMercBounds(id); const h = new Float32Array(size * size); let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const v = heightAt(bb.minX + bb.size * i / (size - 1), bb.minY + bb.size * j / (size - 1)); h[j * size + i] = v; minH = Math.min(minH, v); maxH = Math.max(maxH, v); }
  return { size, minH, maxH, heights: h }; }
