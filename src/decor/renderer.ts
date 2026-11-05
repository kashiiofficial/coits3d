// Instanced WebGL2 pass for vegetation and road works. Separate program and buffers
// from TileRenderer, so a frame that never constructs this class issues the same GL
// calls as before. One draw per occupied slot (9 slots at most).
import type { Tile } from '../tile/format.js';
import { key, tileMercBounds } from '../tile/address.js';
import type { Camera } from '../select/camera.js';
import { fixedDecorBytes } from './budget.js';
import { groupBySlot, placeDecorations, decorMeshOptions, type DecorInstance } from './place.js';
import { prototypeMeshes, type ProtoMesh } from './prototypes.js';
import { signAtlas } from './atlas.js';
import { DECOR_SLOTS, INSTANCE_STRIDE_BYTES, writeInstance, type DecorSlot } from './slots.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNorm; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aUv;
layout(location=4) in vec4 iM0; layout(location=5) in vec4 iM1; layout(location=6) in vec4 iM2; layout(location=7) in vec4 iM3;
uniform mat4 uViewProj; out vec3 vNorm; out vec3 vCol; out vec2 vUv;
void main(){ mat4 M=mat4(iM0,iM1,iM2,iM3); vNorm=mat3(M)*aNorm; vCol=aCol; vUv=aUv; gl_Position=uViewProj*M*vec4(aPos,1.0); }`;
const FS = `#version 300 es
precision highp float; in vec3 vNorm; in vec3 vCol; in vec2 vUv; uniform sampler2D uTex; uniform bool uUseTex; out vec4 o;
void main(){ vec3 L=normalize(vec3(-0.4,0.6,0.8)); float d=0.55+0.45*max(dot(normalize(vNorm),L),0.0);
 vec3 albedo=(uUseTex && vUv.x>=0.0) ? texture(uTex,vUv).rgb : vCol; o=vec4(albedo*d,1.0); }`;

interface Batch { vao: WebGLVertexArrayObject; instance: WebGLBuffer; indexCount: number; count: number; textured: boolean }

export class DecorRenderer {
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private batches: Record<DecorSlot, Batch>;
  private tex: WebGLTexture;
  private sig = '';
  private instanceBytes = 0;
  readonly fixedBytes: number;
  lastDraws = 0;
  constructor(public gl: WebGL2RenderingContext) {
    const sh = (t: number, src: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? 'shader'); return x; };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    this.prog = p;
    for (const n of ['uViewProj', 'uTex', 'uUseTex']) this.u[n] = gl.getUniformLocation(p, n);
    const atlas = signAtlas();
    const tex = gl.createTexture()!;
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlas.width, atlas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const bySlot = new Map<DecorSlot, ProtoMesh>(prototypeMeshes().map(m => [m.slot, m]));
    const batches = {} as Record<DecorSlot, Batch>;
    for (const slot of DECOR_SLOTS) batches[slot] = this.upload(bySlot.get(slot)!, tex);
    this.batches = batches;
    this.fixedBytes = fixedDecorBytes();
  }

  /** Rebuild instance buffers when the drawn tile set changes. */
  sync(tiles: Tile[], cam: Camera) {
    const sig = tiles.map(t => key(t.id)).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    const all: DecorInstance[] = [];
    for (const t of tiles) {
      const b = tileMercBounds(t.id);
      const [ox, oy] = cam.toWorld(b.minX, b.minY);
      for (const inst of placeDecorations(t, decorMeshOptions(t.id), { enabled: true, works: 'hash', sign: 'hash' })) {
        all.push({ ...inst, x: inst.x + ox, y: inst.y + oy });
      }
    }
    const groups = groupBySlot(all);
    const gl = this.gl;
    this.instanceBytes = 0;
    for (const slot of DECOR_SLOTS) {
      const list = groups[slot];
      const buf = new Float32Array(list.length * 16);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        writeInstance(buf, i, p.x, p.y, p.z, p.yaw, p.scale[0], p.scale[1], p.scale[2]);
      }
      const batch = this.batches[slot];
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.instance);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
      batch.count = list.length;
      this.instanceBytes += buf.byteLength;
    }
  }

  render(cam: Camera) {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uViewProj, false, new Float32Array(cam.viewProj));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.uTex, 0);
    let draws = 0;
    for (const slot of DECOR_SLOTS) {
      const batch = this.batches[slot];
      if (!batch.count) continue;
      gl.uniform1i(this.u.uUseTex, batch.textured ? 1 : 0);
      gl.bindVertexArray(batch.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, batch.indexCount, gl.UNSIGNED_INT, 0, batch.count);
      draws++;
    }
    gl.bindVertexArray(null);
    this.lastDraws = draws;
  }

  get gpuBytes() { return this.fixedBytes + this.instanceBytes; }

  private upload(m: ProtoMesh, tex: WebGLTexture): Batch {
    const gl = this.gl;
    const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW);
    const sz = [3, 3, 3, 2]; let off = 0;
    sz.forEach((n, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 11 * 4, off * 4); gl.vertexAttribDivisor(i, 0); off += n; });
    const instance = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, instance); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(4 + i);
      gl.vertexAttribPointer(4 + i, 4, gl.FLOAT, false, INSTANCE_STRIDE_BYTES, i * 16);
      gl.vertexAttribDivisor(4 + i, 1);
    }
    const ibo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    if (m.textured) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); }
    return { vao, instance, indexCount: m.indices.length, count: 0, textured: m.textured };
  }
}
