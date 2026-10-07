// Darstellung der Verfolgungsjagd als eigene WebGL-Ebene in MapLibre (nach dem Vorbild von src/map/fleet.ts):
// Wagen als 3D-Kästen (eine Instanz pro Kasten, ein Aufruf), dazu Flächen auf der Straße in zwei Durchgängen:
// abgedunkelt (Schatten, Reifenspuren, Ringe) und additiv (Blaulicht-Schein, Scheinwerfer, Rücklichter, Funken,
// Lichtkegel des Hubschraubers). Kein GeoJSON, keine Quelle: Die Spielschleife schreibt pro Bild die Instanzen neu
// (wenige hundert Floats) und zeichnet die Karte über map.jumpTo ohnehin neu.
//
// Koordinaten: Das Modell rechnet in Metern des Straßengraphen. Pro Bild liegt der Ursprung beim eigenen Wagen
// (Mercator, in Float64 in die Matrix), so bleiben die Zahlen im Shader klein und genau.

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { M_LAT } from './net';

const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8;
const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

export type Rgb = [number, number, number];

/** Kasten: Mitte (Meter des Graphen), Kurs (Grad), vorne/hinten/halbe Breite und Höhen in Metern, Farbe, leuchtet? */
const BOX_FLOATS = 12;
/** Fläche: Mitte, Kurs, halbe Länge und Breite, Farbe (vormultipliziert, rgba), Form, Höhe. */
const QUAD_FLOATS = 11;

/** Formen der Flächen (im Shader). */
export const SHAPE = { disc: 0, rect: 1, ring: 2, beam: 3, arrow: 4, line: 5 } as const;

const BOX_VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
uniform float u_dim;
uniform float u_xray;
layout(location = 0) in vec3 a_corner;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_pose;
layout(location = 3) in vec3 a_extent;
layout(location = 4) in vec2 a_height;
layout(location = 5) in vec4 a_color;
out vec4 v_color;
void main() {
  float h = a_pose.z;
  vec2 fwd = vec2(sin(h), -cos(h));
  vec2 right = vec2(cos(h), sin(h));
  float f = mix(a_extent.y, a_extent.x, a_corner.x);
  float l = a_corner.y * 2.0 * a_extent.z;
  float z = mix(a_height.x, a_height.y, a_corner.z);
  vec2 p = a_pose.xy + fwd * f + right * l;
  gl_Position = u_matrix * vec4(p, z, 1.0);
  vec2 n = fwd * a_normal.x + right * a_normal.y;
  float shade = a_normal.z > 0.5 ? 1.0 : (a_normal.z < -0.5 ? 0.4 : 0.62 + 0.3 * max(0.0, dot(n, vec2(-0.6, -0.8))));
  vec3 lit = a_color.rgb * shade * (1.0 - 0.55 * u_dim);
  v_color = vec4(mix(lit, a_color.rgb, a_color.a), 1.0);
  // Durch Häuser hindurch (verdeckt): flache, halb durchsichtige Silhouette.
  if (u_xray > 0.5) v_color = vec4(mix(a_color.rgb, vec3(1.0), 0.25), 1.0) * 0.42;
}`;

const COLOR_FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o_color;
void main() { o_color = v_color; }`;

const QUAD_VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
layout(location = 0) in vec2 a_corner;
layout(location = 2) in vec3 a_pose;
layout(location = 3) in vec2 a_size;
layout(location = 4) in vec4 a_color;
layout(location = 5) in vec2 a_shape;
out vec2 v_uv;
out vec4 v_color;
out float v_shape;
void main() {
  float h = a_pose.z;
  vec2 fwd = vec2(sin(h), -cos(h));
  vec2 right = vec2(cos(h), sin(h));
  vec2 p = a_pose.xy + fwd * a_corner.y * a_size.x + right * a_corner.x * a_size.y;
  gl_Position = u_matrix * vec4(p, a_shape.y, 1.0);
  v_uv = a_corner;
  v_color = a_color;
  v_shape = a_shape.x;
}`;

const QUAD_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
in float v_shape;
out vec4 o_color;
void main() {
  float a;
  if (v_shape < 0.5) {
    float r = length(v_uv);
    a = pow(max(0.0, 1.0 - r), 1.6);
  } else if (v_shape < 1.5) {
    a = (1.0 - smoothstep(0.75, 1.0, abs(v_uv.x))) * (1.0 - smoothstep(0.8, 1.0, abs(v_uv.y)));
  } else if (v_shape < 2.5) {
    float r = length(v_uv);
    a = smoothstep(0.72, 0.86, r) * (1.0 - smoothstep(0.9, 1.0, r)) + 0.18 * max(0.0, 1.0 - r);
  } else if (v_shape > 4.5) {
    // Linie: nur seitlich weich, an den Enden nahtlos (Stücke hintereinander ohne Streifen).
    a = 1.0 - smoothstep(0.45, 1.0, abs(v_uv.x));
  } else if (v_shape > 3.5) {
    // Pfeil nach vorne: Dreieck mit weicher Kante und Kerbe hinten.
    float v = (v_uv.y + 1.0) * 0.5;
    float edge = abs(v_uv.x) - (1.0 - v);
    a = (1.0 - smoothstep(-0.1, 0.02, edge)) * smoothstep(0.0, 0.1, v - 0.45 * (1.0 - abs(v_uv.x)));
  } else {
    float v = (v_uv.y + 1.0) * 0.5;
    float w = 0.22 + 0.78 * v;
    a = (1.0 - smoothstep(0.55, 1.0, abs(v_uv.x) / w)) * pow(1.0 - v, 1.3) * smoothstep(0.0, 0.12, v);
  }
  o_color = v_color * a;
}`;

/** Einheitswürfel: x vorne 0–1, y quer -0,5–0,5, z 0–1, je Fläche die Normale (ohne Boden). */
function cubeVertices(): Float32Array {
  const faces: [number[][], number[]][] = [
    [
      [
        [0, -0.5, 1],
        [1, -0.5, 1],
        [1, 0.5, 1],
        [0, -0.5, 1],
        [1, 0.5, 1],
        [0, 0.5, 1],
      ],
      [0, 0, 1],
    ],
    [
      [
        [1, -0.5, 0],
        [1, 0.5, 0],
        [1, 0.5, 1],
        [1, -0.5, 0],
        [1, 0.5, 1],
        [1, -0.5, 1],
      ],
      [1, 0, 0],
    ],
    [
      [
        [0, -0.5, 0],
        [0, 0.5, 1],
        [0, 0.5, 0],
        [0, -0.5, 0],
        [0, -0.5, 1],
        [0, 0.5, 1],
      ],
      [-1, 0, 0],
    ],
    [
      [
        [0, 0.5, 0],
        [1, 0.5, 1],
        [1, 0.5, 0],
        [0, 0.5, 0],
        [0, 0.5, 1],
        [1, 0.5, 1],
      ],
      [0, 1, 0],
    ],
    [
      [
        [0, -0.5, 0],
        [1, -0.5, 0],
        [1, -0.5, 1],
        [0, -0.5, 0],
        [1, -0.5, 1],
        [0, -0.5, 1],
      ],
      [0, -1, 0],
    ],
  ];
  const out: number[] = [];
  for (const [verts, normal] of faces) for (const v of verts) out.push(...v, ...normal);
  return Float32Array.from(out);
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram() as WebGLProgram;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const shader = gl.createShader(type) as WebGLShader;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Verfolgungsjagd: Shader ${gl.getShaderInfoLog(shader) ?? ''}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Verfolgungsjagd: Programm ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  return program;
}

function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Wachsende Float-Liste für die Instanzen eines Bilds. */
class Floats {
  data = new Float32Array(1024);
  length = 0;
  reset(): void {
    this.length = 0;
  }
  reserve(n: number): void {
    if (this.length + n <= this.data.length) return;
    const next = new Float32Array(Math.max(this.data.length * 2, this.length + n));
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
}

/**
 * Was die Spielschleife pro Bild zeichnet. Positionen in Metern des Graphen; der Aufrufer setzt zuerst den Ursprung
 * (begin), dann fügt er Kästen und Flächen hinzu.
 */
export class ChaseScene implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private gl: WebGL2RenderingContext | null = null;
  private map: MapLibreMap | null = null;
  private boxProgram: WebGLProgram | null = null;
  private quadProgram: WebGLProgram | null = null;
  private boxVao: WebGLVertexArrayObject | null = null;
  private shadeVao: WebGLVertexArrayObject | null = null;
  private glowVao: WebGLVertexArrayObject | null = null;
  private cube: WebGLBuffer | null = null;
  private quadBuf: WebGLBuffer | null = null;
  private boxBuffer: WebGLBuffer | null = null;
  private shadeBuffer: WebGLBuffer | null = null;
  private glowBuffer: WebGLBuffer | null = null;
  private readonly boxes = new Floats();
  /** Kästen, die hinter Häusern als Silhouette durchscheinen (eigener Wagen, Streifen). */
  private readonly xrays = new Floats();
  private readonly shades = new Floats();
  private readonly glows = new Floats();
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  /** Ursprung dieses Bilds (Mercator) und Umrechnung Meter des Graphen → Mercator-Meter. */
  private ox = 0;
  private oy = 0;
  private scale = 1;
  private gx0 = 0;
  private gy0 = 0;
  private kx = 1;
  private ky = 1;
  private dim = 0;
  visible = true;

  constructor(
    readonly id: string,
    private readonly mLng: number,
  ) {}

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.uniforms.clear();
    this.boxProgram = compile(gl, BOX_VS, COLOR_FS);
    this.quadProgram = compile(gl, QUAD_VS, QUAD_FS);
    this.cube = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube);
    gl.bufferData(gl.ARRAY_BUFFER, cubeVertices(), gl.STATIC_DRAW);
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.boxBuffer = gl.createBuffer();
    this.shadeBuffer = gl.createBuffer();
    this.glowBuffer = gl.createBuffer();

    this.boxVao = gl.createVertexArray();
    gl.bindVertexArray(this.boxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuffer);
    for (const [loc, size, offset] of [
      [2, 3, 0],
      [3, 3, 3],
      [4, 2, 6],
      [5, 4, 8],
    ] as const) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, BOX_FLOATS * 4, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    this.shadeVao = this.quadVao(gl, this.shadeBuffer);
    this.glowVao = this.quadVao(gl, this.glowBuffer);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private quadVao(gl: WebGL2RenderingContext, buffer: WebGLBuffer | null): WebGLVertexArrayObject | null {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [loc, size, offset] of [
      [2, 3, 0],
      [3, 2, 3],
      [4, 4, 5],
      [5, 2, 9],
    ] as const) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, QUAD_FLOATS * 4, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    return vao;
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    for (const b of [this.cube, this.quadBuf, this.boxBuffer, this.shadeBuffer, this.glowBuffer]) gl.deleteBuffer(b);
    for (const v of [this.boxVao, this.shadeVao, this.glowVao]) gl.deleteVertexArray(v);
    gl.deleteProgram(this.boxProgram);
    gl.deleteProgram(this.quadProgram);
    this.gl = null;
  }

  /** Neues Bild: Ursprung bei (x, y) in Metern des Graphen, Dunkelheit 0–1. Leert alle Instanzen. */
  begin(x: number, y: number, night: number): void {
    const lng = x / this.mLng;
    const lat = y / M_LAT;
    this.ox = mercX(lng);
    this.oy = mercY(lat);
    this.scale = EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180);
    this.gx0 = x;
    this.gy0 = y;
    // Lokal linear: Meter des Graphen → Mercator-Meter (Fehler unter einem Zentimeter im Umkreis von 2 km).
    const d = 0.5;
    this.kx = ((mercX((x + d) / this.mLng) - mercX((x - d) / this.mLng)) * this.scale) / (2 * d);
    this.ky = ((mercY((y + d) / M_LAT) - mercY((y - d) / M_LAT)) * this.scale) / (2 * d);
    this.dim = night;
    this.boxes.reset();
    this.xrays.reset();
    this.shades.reset();
    this.glows.reset();
  }

  private lx(x: number): number {
    return (x - this.gx0) * this.kx;
  }

  private ly(y: number): number {
    return (y - this.gy0) * this.ky;
  }

  /**
   * Ein Kasten: Mitte (x, y), Kurs in Grad, front/back in Metern ab der Mitte (back negativ), halbe Breite, Höhen,
   * Farbe; glow 0–1 mischt zur unbeleuchteten Eigenfarbe (Blaulicht, Lampen).
   */
  box(
    x: number,
    y: number,
    heading: number,
    front: number,
    back: number,
    half: number,
    base: number,
    top: number,
    color: Rgb,
    glow = 0,
    xray = false,
  ): void {
    const f = xray ? this.xrays : this.boxes;
    f.reserve(BOX_FLOATS);
    const d = f.data;
    let i = f.length;
    d[i++] = this.lx(x);
    d[i++] = this.ly(y);
    d[i++] = (heading * Math.PI) / 180;
    d[i++] = front;
    d[i++] = back;
    d[i++] = half;
    d[i++] = base;
    d[i++] = top;
    d[i++] = color[0];
    d[i++] = color[1];
    d[i++] = color[2];
    d[i++] = glow;
    f.length = i;
  }

  /** Fläche auf der Straße: abgedunkelt (additive = false, Farbe mit Deckkraft) oder Licht (additive = true). */
  quad(
    additive: boolean,
    x: number,
    y: number,
    heading: number,
    halfLength: number,
    halfWidth: number,
    color: Rgb,
    alpha: number,
    shape: number,
    z = 0.05,
  ): void {
    if (alpha <= 0.002) return;
    const f = additive ? this.glows : this.shades;
    f.reserve(QUAD_FLOATS);
    const d = f.data;
    let i = f.length;
    d[i++] = this.lx(x);
    d[i++] = this.ly(y);
    d[i++] = (heading * Math.PI) / 180;
    d[i++] = halfLength;
    d[i++] = halfWidth;
    // Vormultipliziert: Licht addiert seine Farbe, Schatten deckt mit alpha ab.
    d[i++] = color[0] * alpha;
    d[i++] = color[1] * alpha;
    d[i++] = color[2] * alpha;
    d[i++] = additive ? 0 : alpha;
    d[i++] = shape;
    d[i++] = z;
    f.length = i;
  }

  /** Nach dem Füllen: neu zeichnen lassen. */
  commit(): void {
    this.map?.triggerRepaint();
  }

  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const key = `${program === this.boxProgram ? 'b' : 'q'}:${name}`;
    if (!this.uniforms.has(key)) this.uniforms.set(key, this.gl?.getUniformLocation(program, name) ?? null);
    return this.uniforms.get(key) ?? null;
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    if (!this.visible || !this.boxProgram || !this.quadProgram) return;
    const k = 1 / this.scale;
    const local = new Float64Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, this.ox, this.oy, 0, 1]);
    const matrix = Float32Array.from(multiply(args.defaultProjectionData.mainMatrix, local));

    gl.enable(gl.BLEND);
    // Schatten, Reifenspuren, Ringe (vormultipliziert), ohne in die Tiefe zu schreiben.
    gl.useProgram(this.quadProgram);
    gl.uniformMatrix4fv(this.uniform(this.quadProgram, 'u_matrix'), false, matrix);
    gl.depthMask(false);
    if (this.shades.length > 0) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.shadeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shadeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.shades.data.subarray(0, this.shades.length), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.shades.length / QUAD_FLOATS);
    }
    // Kästen, danach die Silhouetten: erst normal, dann noch einmal dort, wo ein Haus davor steht (Tiefe größer).
    if (this.boxes.length > 0 || this.xrays.length > 0) {
      gl.depthMask(true);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.boxProgram);
      gl.uniformMatrix4fv(this.uniform(this.boxProgram, 'u_matrix'), false, matrix);
      gl.uniform1f(this.uniform(this.boxProgram, 'u_dim'), this.dim);
      gl.uniform1f(this.uniform(this.boxProgram, 'u_xray'), 0);
      gl.bindVertexArray(this.boxVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuffer);
      for (const list of [this.boxes, this.xrays]) {
        if (list.length === 0) continue;
        gl.bufferData(gl.ARRAY_BUFFER, list.data.subarray(0, list.length), gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, list.length / BOX_FLOATS);
      }
      if (this.xrays.length > 0) {
        gl.depthMask(false);
        gl.depthFunc(gl.GREATER);
        gl.uniform1f(this.uniform(this.boxProgram, 'u_xray'), 1);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, this.xrays.length / BOX_FLOATS);
        gl.depthFunc(gl.LEQUAL);
      }
    }
    // Licht: additiv.
    if (this.glows.length > 0) {
      gl.depthMask(false);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.quadProgram);
      gl.uniformMatrix4fv(this.uniform(this.quadProgram, 'u_matrix'), false, matrix);
      gl.bindVertexArray(this.glowVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.glows.data.subarray(0, this.glows.length), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.glows.length / QUAD_FLOATS);
    }
    gl.depthMask(true);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}

/** Ebene an die Karte hängen (ganz oben); gibt eine Funktion zum Entfernen zurück. */
export function mountScene(map: MapLibreMap, scene: ChaseScene): () => void {
  let removed = false;
  const add = () => {
    if (removed) return;
    try {
      if (!map.getLayer(scene.id)) map.addLayer(scene);
    } catch {
      // Stil noch nicht geladen: der nächste style.load versucht es wieder.
    }
  };
  add();
  map.on('style.load', add);
  map.on('webglcontextrestored', add);
  return () => {
    removed = true;
    map.off('style.load', add);
    map.off('webglcontextrestored', add);
    if (map.getLayer(scene.id)) map.removeLayer(scene.id);
  };
}

/** Farbe aus einem CSS-Wert (#rgb, #rrggbb oder rgb(…)) als 0–1. */
export function rgbOf(css: string, fallback: Rgb): Rgb {
  const s = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [
      Number.parseInt(h.slice(0, 2), 16) / 255,
      Number.parseInt(h.slice(2, 4), 16) / 255,
      Number.parseInt(h.slice(4, 6), 16) / 255,
    ];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  return fallback;
}
