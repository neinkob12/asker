// Effekte der Verfolgungsjagd (Auftrag 48), alle als wenige Draw Calls: Lichtspiegelungen auf nasser Straße
// (Streifen, die im Shader zur Kamera zeigen), Partikel (Rauch beim Driften und aus der kaputten Karre, Funken,
// Staub), Bremsspuren als Ringpuffer, Tempo-Linien um die Kamera und die Nachbearbeitung (Radial-Unschärfe bei
// Tempo, Farbsäume, Vignette, Körnung). Nur Optik, Math.random ist erlaubt.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  type PerspectiveCamera,
  Points,
  ShaderMaterial,
} from 'three';

// ---------------------------------------------------------------------------------------------- Spiegelungen

const STREAK_VERT = /* glsl */ `
attribute vec3 center;
attribute vec2 corner;
attribute vec3 tint;
attribute vec2 size;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying vec3 vTint;
varying float vFade;
void main() {
  vec2 toCam = cameraPosition.xz - center.xz;
  float d = max(length(toCam), 0.001);
  vec2 dir = toCam / d;
  vec2 side = vec2(-dir.y, dir.x);
  float len = size.y * (0.7 + 0.5 * clamp(d / 40.0, 0.0, 2.0)) * (0.6 + 0.2 * center.y);
  vec2 p = center.xz + side * corner.x * size.x + dir * (corner.y * len - 0.15 * len);
  vUv = corner;
  vTint = tint;
  vFade = 1.0 - smoothstep(fogNear, fogFar, d);
  gl_Position = projectionMatrix * viewMatrix * vec4(p.x, 0.035, p.y, 1.0);
}`;

const STREAK_FRAG = /* glsl */ `
uniform float intensity;
varying vec2 vUv;
varying vec3 vTint;
varying float vFade;
void main() {
  float across = 1.0 - abs(vUv.x);
  float along = smoothstep(0.0, 0.18, vUv.y) * pow(1.0 - vUv.y, 1.6);
  float a = across * across * along * intensity * vFade;
  gl_FragColor = vec4(vTint * a, 1.0);
}`;

export interface Streaks {
  mesh: Mesh;
  /** Lichtpunkt k setzen: Position (y = Höhe der Lampe, macht den Streifen länger), Farbe, Breite, Länge. */
  set(k: number, x: number, y: number, z: number, color: Color, width: number, length: number): void;
  /** Ab k nichts mehr zeichnen (dynamische Streifen). */
  count(n: number): void;
  commit(): void;
  material: ShaderMaterial;
}

/** Spiegelungen von Lichtern auf der Straße; capacity Lichter, je ein Viereck. */
export function createStreaks(capacity: number, fog: { near: number; far: number }, dynamic: boolean): Streaks {
  const geo = new BufferGeometry();
  const center = new Float32Array(capacity * 4 * 3);
  const corner = new Float32Array(capacity * 4 * 2);
  const tint = new Float32Array(capacity * 4 * 3);
  const size = new Float32Array(capacity * 4 * 2);
  const index = new Uint32Array(capacity * 6);
  for (let k = 0; k < capacity; k++) {
    const c = [-1, 0, 1, 0, 1, 1, -1, 1];
    corner.set(c, k * 8);
    index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  }
  const attr = (a: Float32Array, n: number) => {
    const b = new BufferAttribute(a, n);
    if (dynamic) b.setUsage(DynamicDrawUsage);
    return b;
  };
  geo.setAttribute('center', attr(center, 3));
  geo.setAttribute('corner', new BufferAttribute(corner, 2));
  geo.setAttribute('tint', attr(tint, 3));
  geo.setAttribute('size', attr(size, 2));
  // Platzhalter für three.js (Begrenzungskugel): position ist im Shader unbenutzt.
  geo.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 4 * 3), 3));
  geo.setIndex(new BufferAttribute(index, 1));
  const material = new ShaderMaterial({
    vertexShader: STREAK_VERT,
    fragmentShader: STREAK_FRAG,
    uniforms: { intensity: { value: 1 }, fogNear: { value: fog.near }, fogFar: { value: fog.far } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  geo.setDrawRange(0, 0);
  let used = 0;
  return {
    mesh,
    material,
    set(k, x, y, z, color, width, length) {
      if (k >= capacity) return;
      for (let v = 0; v < 4; v++) {
        center.set([x, y, z], (k * 4 + v) * 3);
        tint.set([color.r, color.g, color.b], (k * 4 + v) * 3);
        size.set([width, length], (k * 4 + v) * 2);
      }
      used = Math.max(used, k + 1);
    },
    count(n) {
      used = Math.min(capacity, n);
    },
    commit() {
      geo.setDrawRange(0, used * 6);
      for (const name of ['center', 'tint', 'size']) (geo.getAttribute(name) as BufferAttribute).needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------------------------- Partikel

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float scale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * scale / max(0.1, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float additive;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = additive > 0.5 ? vec4(vColor * a, 1.0) : vec4(vColor, a);
}`;

export interface ParticleKind {
  life: number;
  size: [number, number];
  alpha: number;
  color: number;
  gravity: number;
  drag: number;
}

export const SMOKE: ParticleKind = {
  life: 1.6,
  size: [1.2, 5.5],
  alpha: 0.42,
  color: 0xb8bcc2,
  gravity: -0.6,
  drag: 1.8,
};
export const DARK_SMOKE: ParticleKind = {
  life: 1.8,
  size: [0.6, 3.2],
  alpha: 0.5,
  color: 0x2a2b2e,
  gravity: -1.4,
  drag: 1.2,
};
export const DUST: ParticleKind = { life: 1.1, size: [1, 4], alpha: 0.35, color: 0x8a8378, gravity: -0.2, drag: 2.5 };
export const SPARK: ParticleKind = {
  life: 0.55,
  size: [0.22, 0.06],
  alpha: 1,
  color: 0xffb860,
  gravity: 18,
  drag: 0.6,
};

export interface Particles {
  points: Points;
  emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number): void;
  update(dt: number): void;
  setScale(heightPx: number, fovDeg: number): void;
  dispose(): void;
}

export function createParticles(capacity: number, additive: boolean): Particles {
  const pos = new Float32Array(capacity * 3);
  const vel = new Float32Array(capacity * 3);
  const size = new Float32Array(capacity);
  const alpha = new Float32Array(capacity);
  const color = new Float32Array(capacity * 3);
  const age = new Float32Array(capacity).fill(1e9);
  const kinds: (ParticleKind | null)[] = new Array(capacity).fill(null);
  const geo = new BufferGeometry();
  const dyn = (a: Float32Array, n: number) => new BufferAttribute(a, n).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', dyn(pos, 3));
  geo.setAttribute('aSize', dyn(size, 1));
  geo.setAttribute('aAlpha', dyn(alpha, 1));
  geo.setAttribute('aColor', dyn(color, 3));
  const material = new ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: { scale: { value: 400 }, additive: { value: additive ? 1 : 0 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  const points = new Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  let next = 0;
  let alive = 0;
  const tmp = new Color();
  return {
    points,
    emit(kind, x, y, z, vx, vy, vz) {
      const i = next;
      next = (next + 1) % capacity;
      pos.set([x, y, z], i * 3);
      vel.set([vx, vy, vz], i * 3);
      age[i] = 0;
      kinds[i] = kind;
      tmp.setHex(kind.color);
      color.set([tmp.r, tmp.g, tmp.b], i * 3);
      alive = capacity;
    },
    update(dt) {
      if (alive === 0) return;
      let any = false;
      for (let i = 0; i < capacity; i++) {
        const k = kinds[i];
        if (!k) continue;
        age[i] += dt;
        const t = age[i] / k.life;
        if (t >= 1) {
          kinds[i] = null;
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        any = true;
        const drag = Math.exp(-k.drag * dt);
        vel[i * 3] *= drag;
        vel[i * 3 + 1] = vel[i * 3 + 1] * drag - k.gravity * dt;
        vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] = k.size[0] + (k.size[1] - k.size[0]) * t;
        alpha[i] = k.alpha * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
      }
      if (!any) alive = 0;
      for (const name of ['position', 'aSize', 'aAlpha', 'aColor'])
        (geo.getAttribute(name) as BufferAttribute).needsUpdate = true;
    },
    setScale(heightPx, fovDeg) {
      material.uniforms.scale.value = heightPx / (2 * Math.tan(((fovDeg / 2) * Math.PI) / 180));
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------- Bremsspuren

export interface SkidMarks {
  mesh: Mesh;
  /** Ein Stück Spur von (x0, z0) nach (x1, z1), Breite w, Deckkraft a. */
  add(x0: number, z0: number, x1: number, z1: number, w: number, a: number): void;
  dispose(): void;
}

export function createSkidMarks(capacity: number): SkidMarks {
  const pos = new Float32Array(capacity * 4 * 3);
  const col = new Float32Array(capacity * 4 * 4);
  const index = new Uint32Array(capacity * 6);
  for (let k = 0; k < capacity; k++) index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
  geo.setAttribute('color', new BufferAttribute(col, 4).setUsage(DynamicDrawUsage));
  geo.setIndex(new BufferAttribute(index, 1));
  const material = new MeshBasicMaterial({
    color: 0x070707,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  let next = 0;
  return {
    mesh,
    add(x0, z0, x1, z1, w, a) {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.05 || len > 4) return;
      const nx = (-dz / len) * (w / 2);
      const nz = (dx / len) * (w / 2);
      const k = next;
      next = (next + 1) % capacity;
      const y = 0.03;
      pos.set([x0 - nx, y, z0 - nz, x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz], k * 12);
      for (let v = 0; v < 4; v++) col.set([1, 1, 1, a], (k * 4 + v) * 4);
      (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (geo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------- Tempo-Linien

export interface SpeedLines {
  lines: LineSegments;
  update(dt: number, speed: number, strength: number): void;
  dispose(): void;
}

/** Feine Striche im Kamera-Raum, die an dir vorbeiziehen (an die Kamera gehängt). */
export function createSpeedLines(count: number): SpeedLines {
  const pos = new Float32Array(count * 6);
  const seed = (i: number, far: boolean) => {
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 5;
    const z = far ? -30 - Math.random() * 30 : -Math.random() * 60;
    pos.set([Math.cos(a) * r, Math.sin(a) * r * 0.7, z, Math.cos(a) * r, Math.sin(a) * r * 0.7, z - 3], i * 6);
  };
  for (let i = 0; i < count; i++) seed(i, false);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
  const material = new LineBasicMaterial({
    color: 0xdfe8ff,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const lines = new LineSegments(geo, material);
  lines.frustumCulled = false;
  lines.renderOrder = 4;
  return {
    lines,
    update(dt, speed, strength) {
      material.opacity = Math.min(0.5, strength * 0.5);
      lines.visible = strength > 0.02;
      if (!lines.visible) return;
      const move = speed * 1.6 * dt;
      for (let i = 0; i < count; i++) {
        pos[i * 6 + 2] += move;
        pos[i * 6 + 5] = pos[i * 6 + 2] - 2 - strength * 6;
        if (pos[i * 6 + 2] > 1) seed(i, true);
      }
      (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------- Nachbearbeitung

/** Radial-Unschärfe bei Tempo, Farbsäume, Vignette, Körnung (für ShaderPass aus three/addons). */
export const LENS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uBlur: { value: 0 },
    uAberration: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
    uTaps: { value: 6 },
    uTint: { value: new Color(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uBlur;
uniform float uAberration;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uTaps;
uniform vec3 uTint;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 dir = vUv - vec2(0.5, 0.55);
  float dist = length(dir);
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  if (uBlur > 0.001) {
    vec3 acc = col;
    float w = 1.0;
    for (int i = 1; i < 8; i++) {
      if (float(i) >= uTaps) break;
      float s = 1.0 - float(i) * 0.014 * uBlur * smoothstep(0.08, 0.6, dist);
      acc += texture2D(tDiffuse, vec2(0.5, 0.55) + dir * s).rgb;
      w += 1.0;
    }
    col = acc / w;
  }
  if (uAberration > 0.001) {
    col.r = texture2D(tDiffuse, vUv + dir * 0.006 * uAberration).r * 0.6 + col.r * 0.4;
    col.b = texture2D(tDiffuse, vUv - dir * 0.006 * uAberration).b * 0.6 + col.b * 0.4;
  }
  col += uTint * smoothstep(0.25, 0.85, dist);
  col *= mix(1.0, smoothstep(0.95, 0.2, dist), uVignette);
  col += (hash(vUv * 937.0 + uTime) - 0.5) * uGrain * (0.4 + col);
  gl_FragColor = vec4(col, 1.0);
}`,
};

/** Schärfe des Kamera-Blickwinkels für Partikelgrößen nachziehen. */
export function particleScale(camera: PerspectiveCamera, heightPx: number, particles: Particles[]): void {
  for (const p of particles) p.setScale(heightPx, camera.fov);
}
