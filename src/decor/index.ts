// Vegetation, sign atlas and road-works decor. Drawn only when ?c3d is set.
// See NOTICE.md for the licence and the OpenStreetMap ODbL attribution.
export { c3dEnabled } from './gate.js';
export { signAtlas, ATLAS_W, ATLAS_H } from './atlas.js';
export { prototypeMeshes } from './prototypes.js';
export { decorBudget, fixedDecorBytes, DECOR_SLOTS, WORK_SLOTS, VEGETATION_SLOTS, writeInstance, instanceBufferBytes } from './budget.js';
export type { DecorSlot } from './budget.js';
export { placeDecorations, groupBySlot, decorMeshOptions } from './place.js';
export type { DecorInstance, PlaceOptions } from './place.js';
export { DecorRenderer } from './renderer.js';
export const DECOR_ATTRIBUTION = '© OpenStreetMap contributors (ODbL). Trees, hedges, planters and road works are placed from OSM parks, woods, pedestrian areas and roads already in the tile. Closure and diversion faces are original schematic drawings, not official traffic-sign artwork.';
