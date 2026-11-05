# Decor modules (sign atlas, vegetation, road works)

These modules draw trees, hedges, planters, cones, Chapter 8 barriers, temporary traffic lights, and closure and diversion signs. They run only when the viewer is opened with `?c3d` and the existing `renderer3d` flag is on. With the flag off, or without `?c3d`, the viewer does not construct this renderer.

## Licence

MIT © 2026 HeyCoits, the same licence as the rest of this repository. See the root `LICENSE`.

## OpenStreetMap

Placement is derived from OpenStreetMap geometries already stored in `.c3dt` tiles (parks, woods, pedestrian areas and roads). That data is © OpenStreetMap contributors, available under the Open Database Licence (ODbL):

https://www.openstreetmap.org/copyright

No names, addresses or other personal data are read. The builder still drops `addr:*` and names.

## Signs

The closure and diversion faces in `atlas.ts` are original schematic drawings made for this viewer. They are not Department for Transport or TSRGD artworks, and they are not for use as legal traffic signs. Chapter 8 barriers are a simple red-and-white rail, not a copy of a manufacturer's drawing.

## Upstream

The request named `github.com/kashiiofficial/coits-studio` at `main` commit `20711ba` as the source of these modules. That repository returned HTTP 404 when this port was made, so the modules could not be vendored byte-for-byte from that commit. This directory is an original implementation of the requested feature set, kept behind `?c3d`.
