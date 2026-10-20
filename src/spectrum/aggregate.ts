// Aggregator: bins stored contributions into a grid inside each tile; publishes only cells with >= minContributors.
// "Contributor" = one contribution (we hold no user ids, so the count is conservative only if each trip is one submission;
// rate-limit submissions per device on the client/edge to keep this meaningful — see README known gaps).
import { lngLatToMerc, key, type TileId } from '../tile/address.js';
import { SURFACES } from './types.js';
import type { Spectrum, SpectrumCell } from '../tile/format.js';
import { DEFAULT_POLICY, type PrivacyPolicy, type StoredContribution } from './types.js';
interface Acc { contributors: Set<number>; points: number; surf: number[]; cond: number[]; sig: number[]; park: number }
export function aggregate(items: StoredContribution[], z: number, grid = 16, p: PrivacyPolicy = DEFAULT_POLICY): Map<string, Spectrum> {
  const n = 2 ** z; const acc = new Map<string, Map<number, Acc>>(); let periodStart = Infinity, periodEnd = -Infinity;
  items.forEach((c, ci) => { periodStart = Math.min(periodStart, c.receivedDay); periodEnd = Math.max(periodEnd, c.receivedDay);
    for (const pt of c.trace) { const [mx, my] = lngLatToMerc(pt.lng, pt.lat); const tx = Math.floor(mx * n), ty = Math.floor(my * n);
      const cx = Math.min(grid - 1, Math.floor((mx * n - tx) * grid)), cy = Math.min(grid - 1, Math.floor((my * n - ty) * grid));
      const tk = `${z}/${tx}/${ty}`; let cells = acc.get(tk); if (!cells) acc.set(tk, cells = new Map());
      const cid = cy * grid + cx; let a = cells.get(cid); if (!a) cells.set(cid, a = { contributors: new Set(), points: 0, surf: [], cond: [], sig: [], park: 0 });
      if (!a.contributors.has(ci)) { a.contributors.add(ci); a.surf.push(SURFACES.indexOf(c.surface)); if (c.condition !== undefined) a.cond.push(c.condition); if (c.kind === 'park') a.park++; }
      a.points++; if (pt.signalDbm !== undefined) a.sig.push(pt.signalDbm); } });
  const out = new Map<string, Spectrum>(); const med = (v: number[]) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
  const mode = (v: number[]) => { const m = new Map<number, number>(); v.filter(x => x > 0).forEach(x => m.set(x, (m.get(x) ?? 0) + 1)); let b = 0, bc = 0; for (const [k, c] of m) if (c > bc) { b = k; bc = c; } return b; };
  for (const [tk, cells] of acc) { const pub: SpectrumCell[] = [];
    for (const [cid, a] of cells) { if (a.contributors.size < p.minContributors) continue; // k-anonymity threshold
      pub.push({ cx: cid % grid, cy: Math.floor(cid / grid), contributors: a.contributors.size, traces: a.contributors.size, surface: mode(a.surf), condition: med(a.cond), signalDbm: med(a.sig), parkPath: a.park * 2 > a.contributors.size }); }
    if (pub.length) out.set(tk, { grid, periodStart, periodEnd, cells: pub }); }
  return out;
}
export const tileKey = (id: TileId) => key(id);
