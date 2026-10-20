// Pluggable imagery source: per-tile raster (JPEG/WebP/PNG) draped on terrain.
// ONLY public-domain or openly licensed imagery (e.g. NASA/USGS Landsat, Copernicus Sentinel-2 with attribution).
// Never Google, Apple, Bing or other licensed/proprietary imagery.
import type { TileId } from '../tile/address.js';
import type { Imagery } from '../tile/format.js';
export interface ImagerySource { readonly id: string; readonly licence: string; readonly attribution: string; getTileImage(id: TileId, signal?: AbortSignal): Promise<Imagery | null> }
/** Generic XYZ raster template source for an openly licensed provider. */
export class XyzImagerySource implements ImagerySource {
  constructor(public id: string, public template: string, public licence: string, public attribution: string, public mime: Imagery['mime'] = 'image/jpeg') {}
  async getTileImage(t: TileId, signal?: AbortSignal) {
    const url = this.template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
    const r = await fetch(url, { signal }); if (!r.ok) return null; return { mime: this.mime, source: this.id, bytes: new Uint8Array(await r.arrayBuffer()) };
  }
}
export const BLOCKED_IMAGERY_HOSTS = ['google', 'gstatic', 'apple', 'virtualearth', 'bing', 'here.com', 'mapbox'];
export function assertAllowedImagery(template: string) { const t = template.toLowerCase(); for (const h of BLOCKED_IMAGERY_HOSTS) if (t.includes(h)) throw new Error(`imagery host not allowed (licensed): ${h}`); }
