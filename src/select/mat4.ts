// Minimal column-major mat4 helpers (no deps).
export type Mat4 = Float64Array;
export const identity = (): Mat4 => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
export function multiply(a: Mat4, b: Mat4): Mat4 { const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 { const f = 1 / Math.tan(fovy / 2), m = new Float64Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far); return m; }
export function lookAt(eye: number[], c: number[], up: number[]): Mat4 {
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]); const norm = (v: number[]) => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = norm(sub(c, eye)), s = norm(cross(f, up)), u = cross(s, f); const m = identity();
  m[0] = s[0]; m[4] = s[1]; m[8] = s[2]; m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -dot(s, eye); m[13] = -dot(u, eye); m[14] = dot(f, eye); return m; }
