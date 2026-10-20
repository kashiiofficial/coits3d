// Local demo: renders the London sample tiles in 3D. Not deployed. Enable via flag (demo sets it locally only).
import { Camera, HttpSource, TileLoader, TileRenderer, selectTiles, resolveRenderable, lngLatToMerc, setFlags, flags, key } from '../src/index.js';
setFlags({ renderer3d: new URLSearchParams(location.search).get('flag') !== 'off' });
const status = document.getElementById('status')!;
if (!flags().renderer3d) { status.textContent = 'renderer3d flag is off'; throw new Error('off'); }
const canvas = document.getElementById('c') as HTMLCanvasElement; const dpr = Math.min(2, devicePixelRatio);
canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
const gl = canvas.getContext('webgl2', { antialias: true })!; const renderer = new TileRenderer(gl);
const loader = new TileLoader(new HttpSource('./tiles/{z}/{x}/{y}.c3dt', 14, 16), { cacheBytes: 64 * 2 ** 20, onEvict: k => renderer.disposeTile(k), onLoad: () => (dirty = true) });
const q = new URLSearchParams(location.search);
const cam = new Camera({ centerMerc: lngLatToMerc(+(q.get('lng') ?? -0.1270), +(q.get('lat') ?? 51.5040)), distance: +(q.get('d') ?? 1400), pitchDeg: +(q.get('pitch') ?? 58), bearingDeg: +(q.get('bearing') ?? 20), fovDeg: 45, width: canvas.width, height: canvas.height });
let dirty = true, drag: { x: number; y: number; b: boolean } | null = null;
canvas.onpointerdown = e => (drag = { x: e.clientX, y: e.clientY, b: e.button === 2 || e.shiftKey });
onpointerup = () => (drag = null); canvas.oncontextmenu = e => e.preventDefault();
onpointermove = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b) { cam.s.bearingDeg -= dx * 0.3; cam.s.pitchDeg = Math.max(0, Math.min(80, cam.s.pitchDeg - dy * 0.3)); }
  else { const m = cam.s.distance / canvas.height / 40075016 * 1.6 * dpr, b = cam.s.bearingDeg * Math.PI / 180;
    cam.s.centerMerc[0] -= (dx * Math.cos(b) + dy * Math.sin(b)) * m; cam.s.centerMerc[1] -= (-dx * Math.sin(b) + dy * Math.cos(b)) * m; } dirty = true; };
canvas.onwheel = e => { cam.s.distance = Math.max(100, Math.min(20000, cam.s.distance * Math.exp(e.deltaY * 0.001))); dirty = true; };
function frame() {
  if (dirty) { dirty = false; cam.update();
    const sel = selectTiles(cam, { minZoom: 14, maxZoom: 16, maxSSE: 1.5, heightRange: () => [-50, 300] });
    loader.request(sel.map(s => ({ id: s.id, priority: s.distance })));
    const pinned = new Set<string>(); const draw = resolveRenderable(sel.map(s => s.id), id => !!loader.cache.peek(key(id)));
    for (const id of draw) { const t = loader.cache.get(key(id)); if (t) { renderer.addTile(t); pinned.add(key(id)); } }
    loader.cache.trim(pinned); renderer.render(cam, draw);
    status.textContent = `selected ${sel.length} · drawing ${draw.length} · cached ${loader.cache.size} · GPU ${(renderer.gpuBytes / 2 ** 20).toFixed(1)} MiB · queue ${loader.queuedCount}/${loader.inflightCount}`;
    if (loader.queuedCount || loader.inflightCount) dirty = true; else (window as any).__ready = true; }
  requestAnimationFrame(frame); }
frame();
