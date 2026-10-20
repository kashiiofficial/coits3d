// Tilted orbit camera over a local metric frame. World frame: x east, y north, z up, metres (mercator metres),
// origin at `origin` (normalized mercator) to keep float32 precision on the GPU.
import { EARTH_CIRC } from '../tile/address.js';
import { lookAt, multiply, perspective, type Mat4 } from './mat4.js';
export interface CameraState { centerMerc: [number, number]; distance: number; pitchDeg: number; bearingDeg: number; fovDeg: number; width: number; height: number }
export class Camera {
  origin: [number, number]; view!: Mat4; proj!: Mat4; viewProj!: Mat4; eye!: number[];
  constructor(public s: CameraState) { this.origin = [...s.centerMerc]; this.update(); }
  /** normalized mercator -> local world metres */
  toWorld(mx: number, my: number): [number, number] { return [(mx - this.origin[0]) * EARTH_CIRC, -(my - this.origin[1]) * EARTH_CIRC]; }
  update() { const s = this.s; const [cx, cy] = this.toWorld(...s.centerMerc);
    const p = s.pitchDeg * Math.PI / 180, b = s.bearingDeg * Math.PI / 180;
    const horiz = s.distance * Math.sin(p), up = s.distance * Math.cos(p);
    this.eye = [cx - horiz * Math.sin(b), cy - horiz * Math.cos(b), up];
    this.view = lookAt(this.eye, [cx, cy, 0], [Math.sin(b), Math.cos(b), 0]);
    this.proj = perspective(s.fovDeg * Math.PI / 180, s.width / s.height, Math.max(1, s.distance / 100), s.distance * 50);
    this.viewProj = multiply(this.proj, this.view); return this; }
}
