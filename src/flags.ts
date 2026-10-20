// Feature flags. Everything is OFF by default; nothing in this repo is deployed.
// Override at runtime with COITS3D_FLAGS="spectrumIngest,botApi" (Node) or setFlags() (browser).
export interface Flags { renderer3d: boolean; imagery: boolean; spectrumIngest: boolean; spectrumPublish: boolean; robotLayer: boolean; businessLayer: boolean; botApi: boolean }
const defaults: Flags = { renderer3d: false, imagery: false, spectrumIngest: false, spectrumPublish: false, robotLayer: false, businessLayer: false, botApi: false };
let current: Flags = { ...defaults };
try { const env = (globalThis as any).process?.env?.COITS3D_FLAGS as string | undefined; if (env) for (const f of env.split(',')) if (f.trim() in current) (current as any)[f.trim()] = true; } catch { /* browser */ }
export const flags = () => current;
export function setFlags(p: Partial<Flags>) { current = { ...current, ...p }; }
export function resetFlags() { current = { ...defaults }; }
