// Ingest: validate, strip identifiers, trim trace ends (home privacy), coarsen time, store, enforce retention.
import { DEFAULT_POLICY, SURFACES, type Contribution, type PrivacyPolicy, type StoredContribution, type TracePoint } from './types.js';
export class IngestError extends Error { constructor(public code: string, msg: string) { super(msg); } }
const DAY = 86400000;
export function haversine(a: { lng: number; lat: number }, b: { lng: number; lat: number }) { const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
/** Drop every point within `m` metres (as the crow flies) of the first and last point, so start/end (often a home) are never stored. */
export function trimTraceEnds(tr: TracePoint[], m: number): TracePoint[] { if (!tr.length) return []; const s = tr[0], e = tr[tr.length - 1];
  return tr.filter(p => haversine(p, s) > m && haversine(p, e) > m); }
const FORBIDDEN = ['userId', 'user_id', 'deviceId', 'device_id', 'email', 'phone', 'name', 'accountId', 'ip', 'advertisingId', 'homeAddress'];

export function sanitise(input: unknown, now: number, p: PrivacyPolicy = DEFAULT_POLICY): StoredContribution {
  const c = input as Partial<Contribution> & Record<string, unknown>;
  if (!c || typeof c !== 'object') throw new IngestError('bad_request', 'body must be an object');
  if (c.consent !== true) throw new IngestError('no_consent', 'consent must be true');
  if (typeof c.consentVersion !== 'string' || !c.consentVersion) throw new IngestError('no_consent', 'consentVersion required');
  if (!['road', 'street', 'park'].includes(c.kind as string)) throw new IngestError('bad_request', 'kind must be road|street|park');
  if (!Array.isArray(c.trace) || c.trace.length < p.minPoints || c.trace.length > p.maxPoints) throw new IngestError('bad_request', 'trace length out of range');
  for (const pt of c.trace) if (typeof pt?.lng !== 'number' || typeof pt?.lat !== 'number' || Math.abs(pt.lat) > 90 || Math.abs(pt.lng) > 180) throw new IngestError('bad_request', 'invalid trace point');
  if (c.condition !== undefined && (typeof c.condition !== 'number' || c.condition < 0 || c.condition > 1)) throw new IngestError('bad_request', 'condition 0..1');
  // identifiers are never stored: we rebuild the record from an allow-list, so FORBIDDEN keys are simply dropped
  const trimmed = trimTraceEnds(c.trace, p.trimMetres);
  if (trimmed.length < 2) throw new IngestError('too_short', 'trace too short after privacy trimming');
  return { kind: c.kind!, consentVersion: c.consentVersion, surface: SURFACES.includes(c.surface as any) ? c.surface! : 'unknown', condition: c.condition,
    receivedDay: Math.floor(now / DAY) * DAY,
    trace: trimmed.map(t => ({ lng: +t.lng.toFixed(6), lat: +t.lat.toFixed(6), ...(typeof t.signalDbm === 'number' ? { signalDbm: t.signalDbm } : {}), ...(typeof t.accel === 'number' ? { accel: t.accel } : {}) })) };
}
export const forbiddenKeys = FORBIDDEN;

/** Storage interface (in-memory here; PostGIS later — see docs/deploy-aws.md). */
export interface ContributionStore { add(c: StoredContribution): void; all(): StoredContribution[]; purgeOlderThan(cutoffMs: number): number }
export class MemoryContributionStore implements ContributionStore { private items: StoredContribution[] = [];
  add(c: StoredContribution) { this.items.push(c); } all() { return [...this.items]; }
  purgeOlderThan(cut: number) { const n = this.items.length; this.items = this.items.filter(i => i.receivedDay >= cut); return n - this.items.length; } }
export function enforceRetention(store: ContributionStore, now: number, p: PrivacyPolicy = DEFAULT_POLICY) { return store.purgeOlderThan(now - p.retentionDays * DAY); }
