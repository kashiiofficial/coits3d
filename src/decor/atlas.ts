// Original schematic sign faces for the decor atlas. These are not Department for
// Transport / TSRGD artworks and must not be used as legal traffic signs.
// Layout: left half closure (red), right half diversion (yellow). Row 0 is the
// bottom row, matching WebGL texImage2D.
export interface SignUv { u0: number; v0: number; u1: number; v1: number }
export interface SignAtlas { width: number; height: number; rgba: Uint8Array; uv: { closure: SignUv; diversion: SignUv } }

export const ATLAS_W = 256;
export const ATLAS_H = 256;

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

let cached: SignAtlas | null = null;

export function signAtlas(): SignAtlas {
  if (cached) return cached;
  const w = ATLAS_W, h = ATLAS_H, rgba = new Uint8Array(w * h * 4);
  fillRect(rgba, w, h, 0, 0, w / 2, h, 196, 28, 36);
  fillRect(rgba, w, h, w / 2, 0, w / 2, h, 245, 196, 24);
  strokeRect(rgba, w, h, 14, 14, w / 2 - 28, h - 28, 5, 255, 255, 255);
  strokeRect(rgba, w, h, w / 2 + 14, 14, w / 2 - 28, h - 28, 5, 20, 20, 20);
  drawText(rgba, w, h, 'ROAD', 22, 168, 3, 255, 255, 255);
  drawText(rgba, w, h, 'CLOSED', 14, 128, 3, 255, 255, 255);
  fillRect(rgba, w, h, 28, 78, w / 2 - 56, 16, 255, 255, 255);
  drawText(rgba, w, h, 'DIVERSION', w / 2 + 12, 176, 2, 20, 20, 20);
  arrowRight(rgba, w, h, w / 2 + 28, 36, w / 2 - 56, 100, 20, 20, 20);
  cached = {
    width: w, height: h, rgba,
    uv: { closure: { u0: 0, v0: 0, u1: 0.5, v1: 1 }, diversion: { u0: 0.5, v0: 0, u1: 1, v1: 1 } },
  };
  return cached;
}

function set(px: Uint8Array, w: number, h: number, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
}
function fillRect(px: Uint8Array, w: number, h: number, x: number, y: number, rw: number, rh: number, r: number, g: number, b: number) {
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(px, w, h, x + i, y + j, r, g, b);
}
function strokeRect(px: Uint8Array, w: number, h: number, x: number, y: number, rw: number, rh: number, t: number, r: number, g: number, b: number) {
  fillRect(px, w, h, x, y, rw, t, r, g, b);
  fillRect(px, w, h, x, y + rh - t, rw, t, r, g, b);
  fillRect(px, w, h, x, y, t, rh, r, g, b);
  fillRect(px, w, h, x + rw - t, y, t, rh, r, g, b);
}
function drawText(px: Uint8Array, w: number, h: number, text: string, x: number, y: number, scale: number, r: number, g: number, b: number) {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[' '];
    for (let row = 0; row < glyph.length; row++) {
      const bits = glyph[glyph.length - 1 - row];
      for (let col = 0; col < bits.length; col++) if (bits[col] === '1') fillRect(px, w, h, cx + col * scale, y + row * scale, scale, scale, r, g, b);
    }
    cx += 6 * scale;
  }
}
function arrowRight(px: Uint8Array, w: number, h: number, x: number, y: number, rw: number, rh: number, r: number, g: number, b: number) {
  const shaftH = Math.floor(rh * 0.34);
  const shaftW = Math.floor(rw * 0.55);
  fillRect(px, w, h, x, y + Math.floor((rh - shaftH) / 2), shaftW, shaftH, r, g, b);
  const headX = x + shaftW;
  for (let i = 0; i < rw - shaftW; i++) {
    const t = i / (rw - shaftW);
    const span = Math.max(1, Math.floor(rh * (1 - t)));
    fillRect(px, w, h, headX + i, y + Math.floor((rh - span) / 2), 1, span, r, g, b);
  }
}
