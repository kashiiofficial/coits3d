// Typed READ-ONLY tile query API for other HeyCoits mini-program bots. Gated by flags().botApi.
// JSON schema: docs/bot-api.schema.json. Docs: docs/bot-api.md.
import { flags } from '../flags.js';
import { parseKey, isValid, type TileId, type LngLatBounds } from '../tile/address.js';
import type { Tile } from '../tile/format.js';
import { TileLoader } from '../loader/loader.js';
import { EmptyBusinessStore, type Business, type BusinessStore } from '../business/index.js';
import { NotImplementedError } from '../robot/index.js';
export type TileEvent = { type: 'tileLoaded'; tile: string } | { type: 'spectrumPublished'; tile: string };
export interface TileSummary { id: string; version: number; buildings: number; roads: number; areas: number; hasTerrain: boolean; hasImagery: boolean; spectrumCells: number }
export class ApiDisabledError extends Error { constructor() { super('bot API disabled (flags().botApi = false)'); } }
export class TileQueryApi {
  private listeners = new Set<(e: TileEvent) => void>();
  constructor(private loader: TileLoader, private businesses: BusinessStore = new EmptyBusinessStore()) {}
  private gate() { if (!flags().botApi) throw new ApiDisabledError(); }
  async getTile(id: string | TileId): Promise<TileSummary | null> {
    this.gate(); const t = typeof id === 'string' ? parseKey(id) : id; if (!isValid(t)) throw new Error('invalid tile id');
    let tile: Tile | null | undefined = this.loader.get(t);
    if (!tile) { this.loader.request([{ id: t, priority: 0 }]); await this.loader.idle(); tile = this.loader.get(t); }
    if (!tile) return null; this.emit({ type: 'tileLoaded', tile: `${t.z}/${t.x}/${t.y}` });
    return { id: `${t.z}/${t.x}/${t.y}`, version: tile.version, buildings: tile.buildings.length, roads: tile.roads.length, areas: tile.areas.length, hasTerrain: !!tile.terrain, hasImagery: !!tile.imagery, spectrumCells: tile.spectrum?.cells.length ?? 0 };
  }
  async queryBusinesses(b: LngLatBounds): Promise<Business[]> { this.gate(); if (!flags().businessLayer) return []; return this.businesses.inBBox(b.west, b.south, b.east, b.north); }
  async robotRoute(_a: { lng: number; lat: number }, _b: { lng: number; lat: number }): Promise<never> { this.gate(); throw new NotImplementedError('robotRoute'); }
  on(fn: (e: TileEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e: TileEvent) { for (const l of this.listeners) l(e); }
}
