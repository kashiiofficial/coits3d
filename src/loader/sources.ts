// Pluggable tile sources. A source returns raw .c3dt bytes, or null if the tile doesn't exist.
import type { TileId } from '../tile/address.js';
export interface TileSource { readonly name: string; minZoom: number; maxZoom: number; fetchTile(id: TileId, signal: AbortSignal): Promise<Uint8Array | null> }
export class HttpError extends Error { constructor(public status: number, url: string) { super(`HTTP ${status} ${url}`); } }

/** HTTP(S) source with a {z}/{x}/{y} template, e.g. https://tiles.example.org/c3d/{z}/{x}/{y}.c3dt */
export class HttpSource implements TileSource {
  name = 'http'; constructor(public template: string, public minZoom = 0, public maxZoom = 16, private fetchFn: typeof fetch = (...a) => fetch(...a)) {}
  async fetchTile(id: TileId, signal: AbortSignal) {
    const url = this.template.replace('{z}', String(id.z)).replace('{x}', String(id.x)).replace('{y}', String(id.y));
    const res = await this.fetchFn(url, { signal }); if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new HttpError(res.status, url); return new Uint8Array(await res.arrayBuffer());
  }
}
/** Local folder source (Node only): <root>/{z}/{x}/{y}.c3dt */
export class DirectorySource implements TileSource {
  name = 'dir'; constructor(public root: string, public minZoom = 0, public maxZoom = 16) {}
  async fetchTile(id: TileId, signal: AbortSignal) {
    const fs = await import('node:fs/promises'); const path = await import('node:path');
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    try { return new Uint8Array(await fs.readFile(path.join(this.root, `${id.z}/${id.x}/${id.y}.c3dt`), { signal })); }
    catch (e: any) { if (e?.code === 'ENOENT') return null; throw e; }
  }
}
/** In-memory source, for tests and generated data. */
export class MemorySource implements TileSource {
  name = 'memory'; tiles = new Map<string, Uint8Array>(); constructor(public minZoom = 0, public maxZoom = 22, public delayMs = 0) {}
  async fetchTile(id: TileId, signal: AbortSignal) {
    if (this.delayMs) await new Promise((res, rej) => { const t = setTimeout(res, this.delayMs); signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true }); });
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    return this.tiles.get(`${id.z}/${id.x}/${id.y}`) ?? null;
  }
}
/**
 * PMTiles v3 archive source (single file, HTTP range requests or any byte reader).
 * Interface stub: plug in the `pmtiles` npm package's PMTiles.getZxy() here. Kept out of core deps on purpose.
 */
export interface PMTilesLike { getZxy(z: number, x: number, y: number, signal?: AbortSignal): Promise<{ data: ArrayBuffer } | undefined> }
export class PMTilesSource implements TileSource {
  name = 'pmtiles'; constructor(private archive: PMTilesLike, public minZoom = 0, public maxZoom = 16) {}
  async fetchTile(id: TileId, signal: AbortSignal) { const r = await this.archive.getZxy(id.z, id.x, id.y, signal); return r ? new Uint8Array(r.data) : null; }
}
