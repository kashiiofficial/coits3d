// Ingest endpoint STUB (Node http handler). Not started anywhere; gated by flags().spectrumIngest.
// Mount behind TLS + rate limiting at the edge. Never log request bodies or IP addresses.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { flags } from '../flags.js';
import { IngestError, sanitise, type ContributionStore } from './ingest.js';
import { DEFAULT_POLICY, type PrivacyPolicy } from './types.js';
export function createIngestHandler(store: ContributionStore, policy: PrivacyPolicy = DEFAULT_POLICY, now = () => Date.now()) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (!flags().spectrumIngest) return send(503, { error: 'disabled' });
    if (req.method !== 'POST' || req.url !== '/v1/spectrum/contributions') return send(404, { error: 'not_found' });
    let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > 2_000_000) return send(413, { error: 'too_large' }); }
    try { store.add(sanitise(JSON.parse(raw), now(), policy)); return send(202, { accepted: true }); }
    catch (e) { if (e instanceof IngestError) return send(e.code === 'no_consent' ? 403 : 400, { error: e.code }); return send(400, { error: 'bad_json' }); }
  };
}
