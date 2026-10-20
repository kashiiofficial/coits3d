# Bot query API (read-only, flagged off)

Other HeyCoits mini-program bots can query map tiles through `TileQueryApi` (`src/api/query.ts`). It is **read-only** and gated by `flags().botApi` (off by default). The request/response shapes are in [`bot-api.schema.json`](./bot-api.schema.json).

| Call | Returns | Status |
|---|---|---|
| `getTile("z/x/y")` | `TileSummary` or `null` | working (backed by `TileLoader`) |
| `queryBusinesses({west,south,east,north})` | `Business[]` | stub: returns `[]` until `businessLayer` (roadmap step 4) |
| `robotRoute(from, to)` | route | stub: throws `not implemented` (roadmap step 3) |
| `on(listener)` | unsubscribe fn | events: `tileLoaded`, `spectrumPublished` |

```ts
import { TileQueryApi, TileLoader, HttpSource, setFlags } from 'coits3d';
setFlags({ botApi: true }); // local/dev only
const api = new TileQueryApi(new TileLoader(new HttpSource('https://tiles.example.org/c3d/{z}/{x}/{y}.c3dt')));
const off = api.on(e => console.log(e));
console.log(await api.getTile('16/32744/21794'));
```

Planned: an HTTP wrapper (`GET /v1/tiles/{z}/{x}/{y}/summary`, `GET /v1/businesses?bbox=`, `POST /v1/robot/route`) with per-bot API keys, rate limits and audit logs. There are no write operations. Bots never receive raw people-sourced data, only published aggregates.
