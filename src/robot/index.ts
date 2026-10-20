// ROBOT NAVIGATION LAYER — PLACEHOLDER (roadmap step 3, after the spectrum data layer).
// Types define the intended per-tile payload; nothing populates it yet. Gated by flags().robotLayer.
export interface RobotNode { id: number; x: number; y: number; z: number; edgeOfTile?: 'n' | 's' | 'e' | 'w'; crossing?: boolean; kerbHeightCm?: number }
export interface RobotEdge { a: number; b: number; lengthM: number; slopePct: number; surface: string; mode: 'walkable' | 'drivable' | 'both' }
export interface NoGoZone { ring: number[]; reason: 'private' | 'hazard' | 'restricted' | 'obstacle' }
export interface DropPoint { businessId: string; x: number; y: number; kind: 'loading' | 'drop' } // verified businesses only; never homes
export interface RobotLayer { version: 1; nodes: RobotNode[]; edges: RobotEdge[]; noGo: NoGoZone[]; dropPoints: DropPoint[] }
export const emptyRobotLayer = (): RobotLayer => ({ version: 1, nodes: [], edges: [], noGo: [], dropPoints: [] });
export class NotImplementedError extends Error { constructor(what: string) { super(`${what} is not implemented yet (roadmap)`); } }
/** Cross-tile route planning (A* over stitched tile graphs) — stub. */
export function planRoute(_a: { lng: number; lat: number }, _b: { lng: number; lat: number }): never { throw new NotImplementedError('robot route planning'); }
