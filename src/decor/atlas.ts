// Original schematic sign faces for the decor atlas. These are not Department for
// Transport / TSRGD artworks and must not be used as legal traffic signs.
// Layout: two landscape 128×64 faces, closure (red) in the bottom half and diversion
// (yellow) in the top half. Row 0 is the bottom row, matching WebGL texImage2D.
export interface SignUv { u0: number; v0: number; u1: number; v1: number }
export interface SignAtlas { width: number; height: number; rgba: Uint8Array; uv: { closure: SignUv; diversion: SignUv } }

export const ATLAS_W = 128;
export const ATLAS_H = 128;

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
  const w = ATLAS_W, h = ATLAS_H, half = h / 2, rgba = new Uint8Array(w * h * 4);
  fillRect(rgba, w, h, 0, 0, w, half, 196, 28, 36);
  strokeRect(rgba, w, h, 4, 4, w - 8, half - 8, 2, 255, 255, 255);
  drawText(rgba, w, h, 'ROAD', centred(w, 'ROAD', 2), 36, 2, 255, 255, 255);
  drawText(rgba, w, h, 'CLOSED', centred(w, 'CLOSED', 2), 14, 2, 255, 255, 255);
  fillRect(rgba, w, h, 0, half, w, half, 245, 196, 24);
  strokeRect(rgba, w, h, 4, half + 4, w - 8, half - 8, 2, 20, 20, 20);
  drawText(rgba, w, h, 'DIVERSION', centred(w, 'DIVERSION', 2), half + 38, 2, 20, 20, 20);
  arrowRight(rgba, w, h, 24, half + 9, w - 48, 24, 20, 20, 20);
  cached = {
    width: w, height: h, rgba,
    uv: { closure: { u0: 0, v0: 0, u1: 1, v1: 0.5 }, diversion: { u0: 0, v0: 0.5, u1: 1, v1: 1 } },
  };
  return cached;
}

function centred(w: number, text: string, scale: number) {
  return Math.floor((w - (text.length * 6 - 1) * scale) / 2);
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
