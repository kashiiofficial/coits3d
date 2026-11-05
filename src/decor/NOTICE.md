# Decor modules (sign atlas, vegetation, road works)

These modules draw trees, hedges, planters, cones, Chapter 8 barriers, temporary traffic lights, and closure and diversion signs. They run only when the viewer is opened with `?c3d` and the existing `renderer3d` flag is on. With the flag off, or without `?c3d`, the viewer does not construct this renderer.

## Licence

MIT © 2026 HeyCoits, the same licence as the rest of this repository. See the root `LICENSE`.

## Vegetation prototypes (CoitsMoves Studio)

`veg-proto.ts` is `src/map/veg-proto.ts` from `kashiiofficial/coits-studio` at commit `20711ba`, copied unchanged. The Studio repository is private, so the repository owner supplied the file directly for this port. It provides the faceted broadleaf crown (icosahedron lobes), the separate layered conifer, the sphere bushes used for hedges and the planter, each at LOD 0/1/2. `prototypes.ts` composes those parts into one mesh per slot. A tree's trunk and crown share one instance.

## OpenStreetMap

Placement is derived from OpenStreetMap geometries already stored in `.c3dt` tiles. That data is © OpenStreetMap contributors, available under the Open Database Licence (ODbL):

https://www.openstreetmap.org/copyright

- Park and wood trees: scattered inside `park`/`wood` areas. Parks are about 80% broadleaf and woods about 45%.
- Street trees: broadleaf, on both pavements of primary to residential roads. They are kept off carriageways, buildings, water, parks and woods.
- Hedges: rows of round bushes just inside park edges that face a street.
- Planters: in pedestrian areas.

No names, addresses or other personal data are read. The builder still drops `addr:*` and names.

## Road works

The tiles carry no road-works features. The builder keeps only buildings, roads and areas. The London sample does contain one `highway=construction` way, but it is dropped like other unmapped highways. Gating on real works would need a new tile layer. Until then, `placeDecorations` with `works: 'hash'` (the renderer default) places a site on about one tile in eight (`WORKS_ONE_IN`), chosen deterministically from the tile id. Every other tile gets none. `'always'` and `'never'` exist for tests and for the demo's `?works=` parameter. The sites are a sample for the viewer, not live works data.

A site is laid out in real metres along the street: a six-cone taper, a cone line, two 2 m Chapter 8 barriers, a portable signal at each end, and an advance sign 30 m ahead. Across the street, positions are fractions of the drawn carriageway, because road strips are drawn without the `heightScale` stretch.

## Signs

The closure and diversion faces in `atlas.ts` are original schematic drawings made for this viewer, two 128×64 faces in a 128×128 atlas. They are not Department for Transport or TSRGD artworks, and they are not for use as legal traffic signs. The Studio TSRGD atlas (DfT artwork under the Open Government Licence v3) was not available for this port: `kashiiofficial/coits-studio` returns HTTP 404 to this repository's tooling, and only `veg-proto.ts` was supplied. Swapping the atlas pixels is enough to adopt it later, as long as it stays at 128×128 or smaller and is credited here and in `DECOR_ATTRIBUTION`. Chapter 8 barriers are a simple red-and-white rail, not a copy of a manufacturer's drawing.
