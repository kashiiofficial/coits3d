# Contributing to coits3d

Thanks for helping build the CoitsMoves 3D map.

## Setup
```bash
npm ci
npm run typecheck
npm test          # node:test via tsx, no browser needed
npm run demo      # needs the `osmium` CLI (osmium-tool) to build sample tiles; open http://127.0.0.1:8765/demo/
```

## Workflow
1. Open or pick an issue; say which roadmap step it belongs to.
2. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
3. Keep PRs small and focused; add or update tests.
4. CI (typecheck + tests on Node 20/22) must pass. One maintainer review is required.

## Rules
- **Feature flags:** new behaviour goes behind `src/flags.ts`, off by default.
- **Tile format:** any change bumps `FORMAT_VERSION`; decoders must still read older versions and skip unknown layers.
- **Dependencies:** keep the core dependency-light (currently only `earcut`). Discuss before adding a runtime dependency.
- **Privacy (UK GDPR):** no personal data in tiles, fixtures or tests. No home addresses, no user/device ids, no raw traces in fixtures. People-sourced data must go through `src/spectrum` (consent, trimming, k-threshold, retention).
- **Data licences:** OSM data is ODbL (attribute it). Imagery must be public domain or openly licensed. Never Google, Apple, Bing or other proprietary imagery.
- **Secrets:** never commit keys, tokens, server IPs, internal hostnames or local paths. Use environment variables.

## Code style
TypeScript strict, ES modules, small pure functions where possible (mesh building and selection must stay testable without a GPU).

## Licence
By contributing you agree your contributions are licensed under the MIT licence (see `LICENSE`).
