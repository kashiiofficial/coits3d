// Plain WebGL2 renderer. One shader program, per-tile GPU buffers (VAO + VBO + IBO per mesh), explicit dispose.
// Can run standalone (own canvas) or inside a MapLibre custom layer via render(gl, viewProj) — see README.
import { tileMercBounds, mercToLngLat, metresPerMercUnit, type TileId, key } from '../tile/address.js';
import type { Tile } from '../tile/format.js';
import { buildTileMeshes, STRIDE, type MeshData } from './meshes.js';
import type { Camera } from '../select/camera.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNorm; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aUv;
uniform mat4 uViewProj; uniform vec3 uOffset; out vec3 vNorm; out vec3 vCol; out vec2 vUv;
void main(){ vNorm=aNorm; vCol=aCol; vUv=aUv; gl_Position=uViewProj*vec4(aPos+uOffset,1.0); }`;
const FS = `#version 300 es
precision highp float; in vec3 vNorm; in vec3 vCol; in vec2 vUv; uniform sampler2D uTex; uniform bool uUseTex; out vec4 o;
void main(){ vec3 L=normalize(vec3(-0.4,0.6,0.8)); float d=0.55+0.45*max(dot(normalize(vNorm),L),0.0);
 vec3 c = uUseTex ? texture(uTex,vUv).rgb : vCol; o=vec4(c*d,1.0); }`;

interface GpuMesh { vao: WebGLVertexArrayObject; vbo: WebGLBuffer; ibo: WebGLBuffer; count: number }
export interface GpuTile { id: TileId; terrain: GpuMesh; buildings: GpuMesh; flat: GpuMesh; texture: WebGLTexture | null; bytes: number }

export class TileRenderer {
  private prog: WebGLProgram; private u: Record<string, WebGLUniformLocation | null> = {}; readonly tiles = new Map<string, GpuTile>();
  constructor(public gl: WebGL2RenderingContext) {
    const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? 'shader'); return x; };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link'); this.prog = p;
    for (const n of ['uViewProj', 'uOffset', 'uTex', 'uUseTex']) this.u[n] = gl.getUniformLocation(p, n);
  }
  private upload(m: MeshData): GpuMesh { const gl = this.gl; const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
    const sz = [3, 3, 3, 2]; let off = 0; sz.forEach((n, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, STRIDE * 4, off * 4); off += n; });
    gl.bindVertexArray(null); return { vao, vbo, ibo, count: m.indices.length }; }
  /** Build meshes and GPU buffers for a decoded tile (idempotent). */
  addTile(t: Tile): GpuTile {
    const k = key(t.id); const ex = this.tiles.get(k); if (ex) return ex;
    const b = tileMercBounds(t.id); const lat = mercToLngLat(0, (b.minY + b.maxY) / 2)[1];
    const m = buildTileMeshes(t, { tileSizeM: b.size * 40075016.68557849, heightScale: 40075016.68557849 / metresPerMercUnit(lat) });
    let texture: WebGLTexture | null = null;
    if (t.imagery && typeof createImageBitmap !== 'undefined') { const gl = this.gl; texture = gl.createTexture();
      createImageBitmap(new Blob([t.imagery.bytes as BlobPart], { type: t.imagery.mime })).then(img => { if (!this.tiles.has(k)) return; gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D); }); }
    const bytes = [m.terrain, m.buildings, m.flat].reduce((s, x) => s + x.vertices.byteLength + x.indices.byteLength, 0);
    const g: GpuTile = { id: t.id, terrain: this.upload(m.terrain), buildings: this.upload(m.buildings), flat: this.upload(m.flat), texture, bytes };
    this.tiles.set(k, g); return g;
  }
  disposeTile(k: string) { const g = this.tiles.get(k); if (!g) return; const gl = this.gl;
    for (const m of [g.terrain, g.buildings, g.flat]) { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo); }
    if (g.texture) gl.deleteTexture(g.texture); this.tiles.delete(k); }
  dispose() { for (const k of [...this.tiles.keys()]) this.disposeTile(k); this.gl.deleteProgram(this.prog); }
  get gpuBytes() { let s = 0; for (const t of this.tiles.values()) s += t.bytes; return s; }

  /** Draw the given tiles. `useImagery` drapes per-tile imagery on terrain when present. */
  render(cam: Camera, ids: TileId[], opts: { useImagery?: boolean; clear?: boolean } = {}) {
    const gl = this.gl; if (opts.clear !== false) { gl.clearColor(0.78, 0.86, 0.95, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(this.prog); gl.uniformMatrix4fv(this.u.uViewProj, false, new Float32Array(cam.viewProj));
    for (const id of ids) { const g = this.tiles.get(key(id)); if (!g) continue; const b = tileMercBounds(id); const [ox, oy] = cam.toWorld(b.minX, b.minY);
      gl.uniform3f(this.u.uOffset, ox, oy, 0);
      const tex = !!(opts.useImagery && g.texture); gl.uniform1i(this.u.uUseTex, tex ? 1 : 0); if (tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.texture); gl.uniform1i(this.u.uTex, 0); }
      this.draw(g.terrain); gl.uniform1i(this.u.uUseTex, 0);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -1); this.draw(g.flat); gl.disable(gl.POLYGON_OFFSET_FILL);
      this.draw(g.buildings); }
  }
  private draw(m: GpuMesh) { if (!m.count) return; this.gl.bindVertexArray(m.vao); this.gl.drawElements(this.gl.TRIANGLES, m.count, this.gl.UNSIGNED_INT, 0); }
}
