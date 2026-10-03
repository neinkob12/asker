// Flotte: viele kleine 3D-Fahrzeuge als Kulisse (Verkehr) in einer eigenen WebGL-Ebene. Alle Fahrzeuge liegen in
// einem Puffer und werden mit einem Aufruf gezeichnet; neue Stellungen kommen gebündelt höchstens 20-mal pro Sekunde
// (update), dazwischen schiebt der Grafikchip sie weich weiter (Interpolation im Shader, nur eine Uniform pro Bild).
// Keine GeoJSON-Quelle, kein Worker, keine Marker, keine Klick-Ziele. Unter minZoom unsichtbar. Nachts Scheinwerfer
// nur für die nächsten Fahrzeuge (lights). Reine Optik: Die Stellungen kommen von außen (z.B. roads/ui/traffic.ts).
//
//   const fleet = createFleet(map, { id: 'roads.traffic' });
//   fleet.update([{ id: 1, lng, lat, heading: 90, kind: 'car', color: '#8d939c' }], performance.now() + 50);
//   fleet.setNight(0.8); fleet.remove();

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import { metersPerPixel } from './geometry';
import { parseHex } from './look';
import { mapPerf } from './perf';
import { KINDS, type KindSpec } from './vehicles';

export type FleetKind = 'car' | 'van' | 'truck' | 'police';

export interface FleetPose {
  /** Bleibt für dasselbe Fahrzeug gleich (für die Interpolation). */
  id: number;
  lng: number;
  lat: number;
  /** Fahrtrichtung in Grad (0 = Norden, 90 = Osten). */
  heading: number;
  kind: FleetKind;
  /** Karosseriefarbe (Hex). */
  color: string;
}

export interface FleetOptions {
  /** Ebenen-ID mit Modul-Präfix, z.B. 'roads.traffic'. */
  id: string;
  /** Darunter unsichtbar (Standard 12,5). */
  minZoom?: number;
  /** So viele Fahrzeuge (die nächsten zur Kartenmitte) bekommen nachts Scheinwerfer (Standard 12). */
  lights?: number;
  /** Länge auf dem Bildschirm als Anteil der Spiel-Fahrzeuge (Kulisse etwas kleiner, Standard 0,8). */
  scale?: number;
  /** Farben der Kabine und des Blaulicht-Dachs (Hex). */
  cabin?: string;
  police?: string;
  /** Unter diese Ebene legen (Standard: ganz oben). */
  beforeId?: string;
}

export interface FleetHandle {
  /**
   * Neue Stellung aller Fahrzeuge für den Zeitpunkt at (performance.now(), meist jetzt + 50 ms). Bis dahin gleiten
   * sie von ihrer jetzigen Stellung dorthin. Neue Fahrzeuge wachsen kurz auf, fehlende schrumpfen weg.
   */
  update(poses: readonly FleetPose[], at: number): void;
  /** Dunkelheit 0 (Tag) bis 1 (Nacht): Fahrzeuge dunkler, Scheinwerfer an. */
  setNight(night: number): void;
  /** Wie viele Fahrzeuge gerade gezeigt werden (auch die wegschrumpfenden). */
  readonly size: number;
  remove(): void;
}

/** Erdumfang wie in MapLibre (mittlerer Erdradius). */
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8;
/** Auf- und Wegschrumpfen in Sekunden. */
const GROW_SECONDS = 0.35;
/** Floats pro Kasten-Instanz: pose(4) heading(2) box(3) height(2) size(2) color(3) life(2). */
const BOX_FLOATS = 18;
/** Floats pro Licht-Instanz: pose(4) heading(2) size(2) life(2). */
const LIGHT_FLOATS = 10;

const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

const hexToRgb = (hex: string): [number, number, number] => {
  const [r, g, b] = parseHex(hex);
  return [r / 255, g / 255, b / 255];
};

const BOX_VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
uniform float u_mpp;
uniform float u_t;
uniform float u_now;
uniform float u_shadow;
uniform float u_dim;
layout(location = 0) in vec3 a_corner;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_pose;
layout(location = 3) in vec2 a_heading;
layout(location = 4) in vec3 a_box;
layout(location = 5) in vec2 a_height;
layout(location = 6) in vec2 a_size;
layout(location = 7) in vec3 a_color;
layout(location = 8) in vec2 a_life;
out vec4 v_color;
void main() {
  vec2 pos = mix(a_pose.xy, a_pose.zw, u_t);
  float h = mix(a_heading.x, a_heading.y, u_t);
  float grow = clamp((u_now - a_life.x) / ${GROW_SECONDS.toFixed(2)}, 0.0, 1.0)
    * clamp((a_life.y - u_now) / ${GROW_SECONDS.toFixed(2)}, 0.0, 1.0);
  float len = max(a_size.x, a_size.y * u_mpp) * grow;
  // Kompass: vorne = (Osten, Süden) in Mercator-Richtung, rechts = 90 Grad im Uhrzeigersinn.
  vec2 fwd = vec2(sin(h), -cos(h));
  vec2 right = vec2(cos(h), sin(h));
  float f = mix(a_box.x, a_box.y, a_corner.x) * len;
  float l = a_corner.y * a_box.z * len;
  float z = mix(a_height.x, a_height.y, a_corner.z) * len;
  vec2 p = pos + fwd * f + right * l;
  if (u_shadow > 0.5) {
    // Schatten: Grundriss 3 Pixel nach rechts unten (wie fill-translate der Spiel-Fahrzeuge).
    p += vec2(3.0, 3.0) * u_mpp;
    z = 0.05;
  }
  gl_Position = u_matrix * vec4(p, z, 1.0);
  vec2 n = fwd * a_normal.x + right * a_normal.y;
  // Licht von links oben: Dach hell, Seiten je nach Richtung dunkler.
  float shade = a_normal.z > 0.5 ? 1.0 : 0.66 + 0.26 * max(0.0, dot(n, vec2(-0.6, -0.8)));
  vec3 c = a_color * shade * (1.0 - 0.5 * u_dim);
  float alpha = 0.22 * grow;
  v_color = u_shadow > 0.5 ? vec4(vec3(0.165, 0.114, 0.29) * alpha, alpha) : vec4(c, 1.0);
}`;

const LIGHT_VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
uniform float u_mpp;
uniform float u_t;
uniform float u_now;
layout(location = 0) in vec2 a_corner;
layout(location = 2) in vec4 a_pose;
layout(location = 3) in vec2 a_heading;
layout(location = 6) in vec2 a_size;
layout(location = 8) in vec2 a_life;
out vec2 v_uv;
out float v_grow;
void main() {
  vec2 pos = mix(a_pose.xy, a_pose.zw, u_t);
  float h = mix(a_heading.x, a_heading.y, u_t);
  float len = max(a_size.x, a_size.y * u_mpp);
  vec2 fwd = vec2(sin(h), -cos(h));
  vec2 right = vec2(cos(h), sin(h));
  float r = min(40.0 * u_mpp, len * 0.9);
  vec2 center = pos + fwd * len * 0.95;
  vec2 p = center + fwd * a_corner.y * r + right * a_corner.x * r;
  gl_Position = u_matrix * vec4(p, 0.03, 1.0);
  v_uv = a_corner;
  v_grow = clamp((u_now - a_life.x) / ${GROW_SECONDS.toFixed(2)}, 0.0, 1.0)
    * clamp((a_life.y - u_now) / ${GROW_SECONDS.toFixed(2)}, 0.0, 1.0);
}`;

const COLOR_FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o_color;
void main() { o_color = v_color; }`;

const LIGHT_FS = `#version 300 es
precision mediump float;
uniform float u_strength;
in vec2 v_uv;
in float v_grow;
out vec4 o_color;
void main() {
  float a = (1.0 - smoothstep(0.0, 1.0, length(v_uv))) * u_strength * v_grow;
  o_color = vec4(vec3(1.0, 0.945, 0.75) * a, a);
}`;

/** Einheitswürfel: x vorne 0–1, y quer -0,5–0,5, z 0–1. Boden zuerst (für den Schatten), je Fläche die Normale. */
function cubeVertices(): Float32Array {
  const faces: [number[][], number[]][] = [
    [
      [
        [0, -0.5, 0],
        [1, 0.5, 0],
        [1, -0.5, 0],
        [0, -0.5, 0],
        [0, 0.5, 0],
        [1, 0.5, 0],
      ],
      [0, 0, -1],
    ],
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

interface Slot {
  id: number;
  kind: FleetKind;
  color: [number, number, number];
  /** Stellung zu Beginn und am Ende des laufenden Zeitfensters (Mercator relativ zum Ursprung, skaliert auf Meter). */
  x0: number;
  y0: number;
  h0: number;
  x1: number;
  y1: number;
  h1: number;
  /** Aufwachsen und Wegschrumpfen in Sekunden seit dem Start der Flotte. */
  birth: number;
  death: number;
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
      throw new Error(`Flotte: Shader ${gl.getShaderInfoLog(shader) ?? ''}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Flotte: Programm ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  return program;
}

/** 4×4-Matrizen (Spalten zuerst, wie WebGL) in Float64 multiplizieren: a × b. */
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

const wrapPi = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

class FleetLayer implements CustomLayerInterface {
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  readonly id: string;
  private gl: WebGL2RenderingContext | null = null;
  private map: MapLibreMap | null = null;
  private boxProgram: WebGLProgram | null = null;
  private lightProgram: WebGLProgram | null = null;
  private boxVao: WebGLVertexArrayObject | null = null;
  private lightVao: WebGLVertexArrayObject | null = null;
  private cube: WebGLBuffer | null = null;
  private quad: WebGLBuffer | null = null;
  private boxBuffer: WebGLBuffer | null = null;
  private lightBuffer: WebGLBuffer | null = null;
  private boxCount = 0;
  private lightCount = 0;
  private boxData = new Float32Array(0);
  private lightData = new Float32Array(0);
  private dirty = false;
  private readonly slots = new Map<number, Slot>();
  private readonly start = performance.now();
  private origin: { x: number; y: number; scale: number; lat: number } | null = null;
  private t0 = 0;
  private t1 = 0;
  private night = 0;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly cabin: [number, number, number];
  private readonly police: [number, number, number];

  constructor(private readonly options: FleetOptions) {
    this.id = options.id;
    this.cabin = hexToRgb(options.cabin ?? '#d8dce2');
    this.police = hexToRgb(options.police ?? '#a7a5ff');
  }

  get size(): number {
    return this.slots.size;
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.boxProgram = compile(gl, BOX_VS, COLOR_FS);
    this.lightProgram = compile(gl, LIGHT_VS, LIGHT_FS);
    this.cube = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube);
    gl.bufferData(gl.ARRAY_BUFFER, cubeVertices(), gl.STATIC_DRAW);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.boxBuffer = gl.createBuffer();
    this.lightBuffer = gl.createBuffer();

    // Kästen: Würfel pro Ecke, Instanzen pro Kasten.
    this.boxVao = gl.createVertexArray();
    gl.bindVertexArray(this.boxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuffer);
    const stride = BOX_FLOATS * 4;
    const attrs: [number, number, number][] = [
      [2, 4, 0],
      [3, 2, 4],
      [4, 3, 6],
      [5, 2, 9],
      [6, 2, 11],
      [7, 3, 13],
      [8, 2, 16],
    ];
    for (const [loc, size, offset] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    }

    // Scheinwerfer: Viereck pro Ecke, Instanzen pro Fahrzeug.
    this.lightVao = gl.createVertexArray();
    gl.bindVertexArray(this.lightVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
    const lightStride = LIGHT_FLOATS * 4;
    for (const [loc, size, offset] of [
      [2, 4, 0],
      [3, 2, 4],
      [6, 2, 6],
      [8, 2, 8],
    ] as const) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, lightStride, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.dirty = true;
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    for (const buffer of [this.cube, this.quad, this.boxBuffer, this.lightBuffer]) gl.deleteBuffer(buffer);
    gl.deleteVertexArray(this.boxVao);
    gl.deleteVertexArray(this.lightVao);
    gl.deleteProgram(this.boxProgram);
    gl.deleteProgram(this.lightProgram);
    this.gl = null;
  }

  private seconds(now: number): number {
    return (now - this.start) / 1000;
  }

  /** Stellung des Fahrzeugs gerade jetzt (für den Anfang des nächsten Zeitfensters). */
  private current(slot: Slot, u: number): [number, number, number] {
    return [slot.x0 + (slot.x1 - slot.x0) * u, slot.y0 + (slot.y1 - slot.y0) * u, slot.h0 + (slot.h1 - slot.h0) * u];
  }

  private toLocal(lng: number, lat: number): [number, number] {
    if (!this.origin) {
      this.origin = { x: mercX(lng), y: mercY(lat), scale: EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180), lat };
    }
    const o = this.origin;
    return [(mercX(lng) - o.x) * o.scale, (mercY(lat) - o.y) * o.scale];
  }

  update(poses: readonly FleetPose[], at: number): void {
    const now = performance.now();
    const u = this.progress(now);
    const sec = this.seconds(now);
    const seen = new Set<number>();
    for (const pose of poses) {
      seen.add(pose.id);
      const [x, y] = this.toLocal(pose.lng, pose.lat);
      const h = (pose.heading * Math.PI) / 180;
      const slot = this.slots.get(pose.id);
      if (!slot) {
        this.slots.set(pose.id, {
          id: pose.id,
          kind: pose.kind,
          color: hexToRgb(pose.color),
          x0: x,
          y0: y,
          h0: h,
          x1: x,
          y1: y,
          h1: h,
          birth: sec,
          death: 1e9,
        });
        continue;
      }
      const [cx, cy, ch] = this.current(slot, u);
      slot.x0 = cx;
      slot.y0 = cy;
      slot.h0 = ch;
      slot.x1 = x;
      slot.y1 = y;
      // Kürzester Weg um den Kreis, damit es beim Abbiegen nicht einmal herumdreht.
      slot.h1 = ch + wrapPi(h - ch);
      if (slot.death < 1e9) slot.death = 1e9;
    }
    for (const slot of this.slots.values()) {
      if (seen.has(slot.id)) continue;
      const [cx, cy, ch] = this.current(slot, u);
      slot.x0 = slot.x1 = cx;
      slot.y0 = slot.y1 = cy;
      slot.h0 = slot.h1 = ch;
      if (slot.death >= 1e9) slot.death = sec + GROW_SECONDS;
      else if (slot.death < sec) this.slots.delete(slot.id);
    }
    this.t0 = now;
    this.t1 = Math.max(now + 1, at);
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  setNight(night: number): void {
    if (Math.abs(night - this.night) < 0.02) return;
    this.night = night;
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  clear(): void {
    this.slots.clear();
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  private progress(now: number): number {
    return this.t1 > this.t0 ? Math.min(1, Math.max(0, (now - this.t0) / (this.t1 - this.t0))) : 1;
  }

  /** Instanz-Daten neu schreiben (nur nach update oder setNight, also höchstens 20-mal pro Sekunde). */
  private rebuild(): void {
    const gl = this.gl;
    const map = this.map;
    if (!gl || !map) return;
    const scale = this.options.scale ?? 0.8;
    let boxes = 0;
    for (const slot of this.slots.values()) boxes += KINDS[slot.kind].boxes.length;
    if (this.boxData.length < boxes * BOX_FLOATS) this.boxData = new Float32Array(Math.ceil(boxes * 1.5) * BOX_FLOATS);
    const data = this.boxData;
    let i = 0;
    for (const slot of this.slots.values()) {
      const spec: KindSpec = KINDS[slot.kind];
      for (const box of spec.boxes) {
        const color = box.color === 'body' ? slot.color : box.color === 'police' ? this.police : this.cabin;
        data.set(
          [
            slot.x0,
            slot.y0,
            slot.x1,
            slot.y1,
            slot.h0,
            slot.h1,
            box.f0 + 0.5,
            box.f1 + 0.5,
            box.w,
            box.base,
            box.top,
            spec.meters,
            spec.pixels * scale,
            color[0],
            color[1],
            color[2],
            slot.birth,
            slot.death,
          ],
          i,
        );
        i += BOX_FLOATS;
      }
    }
    this.boxCount = boxes;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, i), gl.DYNAMIC_DRAW);

    // Scheinwerfer nur nachts und nur für die nächsten Fahrzeuge zur Kartenmitte.
    const max = this.options.lights ?? 12;
    let lights: Slot[] = [];
    if (this.night > 0.05 && max > 0) {
      const c = map.getCenter();
      const [cx, cy] = this.toLocal(c.lng, c.lat);
      lights = [...this.slots.values()]
        .map((s) => ({ s, d: (s.x1 - cx) ** 2 + (s.y1 - cy) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, max)
        .map((e) => e.s);
    }
    if (this.lightData.length < lights.length * LIGHT_FLOATS) this.lightData = new Float32Array(max * LIGHT_FLOATS);
    let j = 0;
    for (const slot of lights) {
      const spec = KINDS[slot.kind];
      this.lightData.set(
        [
          slot.x0,
          slot.y0,
          slot.x1,
          slot.y1,
          slot.h0,
          slot.h1,
          spec.meters,
          spec.pixels * scale,
          slot.birth,
          slot.death,
        ],
        j,
      );
      j += LIGHT_FLOATS;
    }
    this.lightCount = lights.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.lightData.subarray(0, j), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.dirty = false;
  }

  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const key = `${program === this.boxProgram ? 'b' : 'l'}:${name}`;
    if (!this.uniforms.has(key)) this.uniforms.set(key, this.gl?.getUniformLocation(program, name) ?? null);
    return this.uniforms.get(key) ?? null;
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const map = this.map;
    if (!map || !this.boxProgram || !this.lightProgram || !this.origin) return;
    if (map.getZoom() < (this.options.minZoom ?? 12.5) || this.slots.size === 0) return;
    const t0 = mapPerf.begin();
    if (this.dirty) this.rebuild();
    const now = performance.now();
    const u = this.progress(now);
    const sec = this.seconds(now);
    const o = this.origin;
    // Ursprung und Maßstab in Float64 in die Matrix, damit die kleinen Zahlen im Shader genau bleiben.
    const k = 1 / o.scale;
    const local = new Float64Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, o.x, o.y, 0, 1]);
    const matrix = Float32Array.from(multiply(args.defaultProjectionData.mainMatrix, local));
    const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());

    gl.useProgram(this.boxProgram);
    gl.uniformMatrix4fv(this.uniform(this.boxProgram, 'u_matrix'), false, matrix);
    gl.uniform1f(this.uniform(this.boxProgram, 'u_mpp'), mpp);
    gl.uniform1f(this.uniform(this.boxProgram, 'u_t'), u);
    gl.uniform1f(this.uniform(this.boxProgram, 'u_now'), sec);
    gl.uniform1f(this.uniform(this.boxProgram, 'u_dim'), this.night);
    gl.bindVertexArray(this.boxVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Schatten (nur der Boden, ohne in die Tiefe zu schreiben), dann die Kästen.
    gl.depthMask(false);
    gl.uniform1f(this.uniform(this.boxProgram, 'u_shadow'), 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.boxCount);
    gl.depthMask(true);
    gl.uniform1f(this.uniform(this.boxProgram, 'u_shadow'), 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.boxCount);

    if (this.lightCount > 0) {
      gl.useProgram(this.lightProgram);
      gl.uniformMatrix4fv(this.uniform(this.lightProgram, 'u_matrix'), false, matrix);
      gl.uniform1f(this.uniform(this.lightProgram, 'u_mpp'), mpp);
      gl.uniform1f(this.uniform(this.lightProgram, 'u_t'), u);
      gl.uniform1f(this.uniform(this.lightProgram, 'u_now'), sec);
      gl.uniform1f(this.uniform(this.lightProgram, 'u_strength'), this.night * 0.85);
      gl.bindVertexArray(this.lightVao);
      gl.depthMask(false);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.lightCount);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);
    mapPerf.end('frame', `fleet:${this.id}`, t0);
    // Weiterzeichnen, solange etwas gleitet, wächst oder schrumpft; danach steht die Karte still.
    const growing = [...this.slots.values()].some(
      (s) => sec - s.birth < GROW_SECONDS || (s.death < 1e9 && s.death > sec - 0.05),
    );
    if (u < 1 || growing) map.triggerRepaint();
  }
}

const fleets = new Set<FleetLayer>();
let fleetNight = 0;

/** Dunkelheit für alle Flotten (setzt GameMap über die Effekte, wie bei den Spiel-Fahrzeugen). */
export function setFleetNight(night: number): void {
  fleetNight = night;
  for (const fleet of fleets) fleet.setNight(night);
}

/** Viele Kulissen-Fahrzeuge in einer Ebene (siehe Kopf der Datei). */
export function createFleet(map: MapLibreMap, options: FleetOptions): FleetHandle {
  const layer = new FleetLayer(options);
  fleets.add(layer);
  layer.setNight(fleetNight);
  const add = () => {
    if (map.getLayer(options.id)) return;
    map.addLayer(layer, options.beforeId && map.getLayer(options.beforeId) ? options.beforeId : undefined);
  };
  try {
    add();
  } catch {
    map.once('style.load', add);
  }
  return {
    update: (poses, at) => layer.update(poses, at),
    setNight: (night) => layer.setNight(night),
    get size() {
      return layer.size;
    },
    remove() {
      fleets.delete(layer);
      layer.clear();
      if (map.getLayer(options.id)) map.removeLayer(options.id);
    },
  };
}
