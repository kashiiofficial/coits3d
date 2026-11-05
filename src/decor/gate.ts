/** True only when 3D rendering is already on and the page was opened with ?c3d (not 0/false/off/no). */
export function c3dEnabled(search: string, renderer3d: boolean): boolean {
  if (!renderer3d) return false;
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (!q.has('c3d')) return false;
  const v = (q.get('c3d') ?? '').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}
