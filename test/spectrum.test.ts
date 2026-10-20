import { test } from 'node:test'; import assert from 'node:assert/strict';
import { sanitise, trimTraceEnds, haversine, MemoryContributionStore, enforceRetention, IngestError, forbiddenKeys } from '../src/spectrum/ingest.js';
import { aggregate } from '../src/spectrum/aggregate.js'; import { DEFAULT_POLICY } from '../src/spectrum/types.js';
import { createIngestHandler } from '../src/spectrum/endpoint.js'; import { setFlags, resetFlags } from '../src/flags.js';
import { encodeTile, decodeTile, emptyTile } from '../src/tile/format.js'; import { parseKey } from '../src/tile/address.js';
const line = (n = 60, lat0 = 51.5, lng0 = -0.13) => Array.from({ length: n }, (_, i) => ({ lng: lng0 + i * 0.0002, lat: lat0, t: i * 1000, signalDbm: -80 - (i % 5) }));
const contrib = (o: any = {}) => ({ consent: true, consentVersion: 'v1', kind: 'street', surface: 'asphalt', condition: 0.8, trace: line(), ...o });
const NOW = Date.UTC(2026, 9, 20, 18);
test('consent required on every contribution', () => { assert.throws(() => sanitise(contrib({ consent: false }), NOW), (e: any) => e instanceof IngestError && e.code === 'no_consent'); assert.throws(() => sanitise(contrib({ consent: undefined }), NOW)); assert.throws(() => sanitise(contrib({ consentVersion: '' }), NOW)); });
test('no user ids or identifiers stored', () => { const s = sanitise(contrib({ userId: 'u1', deviceId: 'd', email: 'a@b.c', trace: line().map(p => ({ ...p, userId: 'x' })) }), NOW);
  const json = JSON.stringify(s); for (const k of forbiddenKeys) assert.ok(!json.includes(`"${k}"`), k); assert.ok(!('t' in s.trace[0])); assert.equal(s.receivedDay % 86400000, 0); });
test('trace start and end trimmed by policy radius', () => { const tr = line(); const out = trimTraceEnds(tr, 200);
  assert.ok(out.length < tr.length); for (const p of out) { assert.ok(haversine(p, tr[0]) > 200); assert.ok(haversine(p, tr[tr.length - 1]) > 200); }
  assert.throws(() => sanitise(contrib({ trace: line(8) }), NOW), /too short/); });
test('aggregation publishes only cells with >= minContributors', () => { const few = Array.from({ length: DEFAULT_POLICY.minContributors - 1 }, () => sanitise(contrib(), NOW));
  assert.equal(aggregate(few, 16).size, 0); const enough = [...few, sanitise(contrib(), NOW)]; const agg = aggregate(enough, 16); assert.ok(agg.size > 0);
  for (const [k, sp] of agg) { for (const c of sp.cells) { assert.ok(c.contributors >= DEFAULT_POLICY.minContributors); assert.equal(c.surface, 1); assert.ok(c.signalDbm <= -80); }
    const t = emptyTile(parseKey(k)); t.spectrum = sp; assert.deepEqual(decodeTile(encodeTile(t)).spectrum!.cells.length, sp.cells.length); } });
test('retention limit purges old contributions', () => { const st = new MemoryContributionStore(); st.add(sanitise(contrib(), NOW - 100 * 86400000)); st.add(sanitise(contrib(), NOW));
  assert.equal(enforceRetention(st, NOW), 1); assert.equal(st.all().length, 1); });
test('ingest endpoint stub is off by default and validates when on', async () => { const st = new MemoryContributionStore(); const h = createIngestHandler(st, DEFAULT_POLICY, () => NOW);
  const call = async (body: unknown) => { let code = 0; const req: any = { method: 'POST', url: '/v1/spectrum/contributions', async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } };
    const res: any = { writeHead: (c: number) => (code = c), end: () => {} }; await h(req, res); return code; };
  resetFlags(); assert.equal(await call(contrib()), 503); setFlags({ spectrumIngest: true }); assert.equal(await call(contrib()), 202); assert.equal(await call(contrib({ consent: false })), 403); assert.equal(st.all().length, 1); resetFlags(); });
