// Vegetation, sign atlas and road-works decor. Drawn only when ?c3d is set.
// See NOTICE.md for the licence and the OpenStreetMap ODbL attribution.
export { c3dEnabled } from './gate.js';
export { signAtlas, ATLAS_W, ATLAS_H } from './atlas.js';
export { prototypeMeshes, PROTO_STRIDE } from './prototypes.js';
export { prototype as vegPrototype, VEG_MESHES } from './veg-proto.js';
export type { VegMesh, Prototype as VegPrototype, ProtoPart as VegProtoPart } from './veg-proto.js';
export { decorBudget, fixedDecorBytes, DECOR_SLOTS, WORK_SLOTS, VEGETATION_SLOTS, TREE_SLOTS, writeInstance, instanceBufferBytes } from './budget.js';
export { VEGETATION_KINDS, VEGETATION_LODS, slotFor, isWorkSlot } from './slots.js';
export type { DecorSlot, DecorKind, VegetationKind, VegetationSlot, WorkSlot, Lod, Tint } from './slots.js';
export { placeDecorations, groupBySlot, decorMeshOptions, worksSelected, WORKS_ONE_IN } from './place.js';
export type { DecorInstance, PlaceOptions } from './place.js';
export { DecorRenderer, tileLod, LOD_DISTANCES } from './renderer.js';
export const DECOR_ATTRIBUTION = '© OpenStreetMap contributors (ODbL). Trees, hedges, planters and road works are placed from OSM parks, woods, pedestrian areas and roads already in the tile; vegetation meshes are ported from the CoitsMoves Studio prototypes. Road-works sites are a deterministic sample, not live works data. Closure and diversion faces are original schematic drawings, not official traffic-sign artwork.';
