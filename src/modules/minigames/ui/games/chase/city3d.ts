// Die Stadt der Verfolgungsjagd in 3D (Auftrag 48): Straße mit Bordsteinen, Häuser mit Läden im Erdgeschoss,
// Fassaden in vier Stilen (Anteile je Stadt), Gesimse, Balkone, Markisen, Leuchtreklame, Glastürme, Laternen mit
// Lichtkegeln am Boden, Straßenbäume, Ampeln, parkende Autos, Fluss mit Kaimauer und Brücken, Wahrzeichen am Rand.
// Alles aus dem Modell (setup.city) und wenigen Draw Calls: je Material eine zusammengeführte Geometrie, Wiederholtes
// (Bäume, Balkone, parkende Autos …) als InstancedMesh. Nur Optik, Math.random nur für Optik.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type DayPhase, glow, matte } from '../../kit/scene3d';
import { createStreaks, type Streaks } from './effects';
import { blockRect, type ChaseSetup, GRID, PITCH, type Post, ROAD_W, SIDEWALK, WORLD } from './model';
import {
  BAY,
  FACADE_STYLES,
  type FacadeStyle,
  FLOOR,
  facadeTexture,
  GROUND_FLOOR,
  glassTexture,
  roadTiles,
  roofTexture,
  SHOP_SPAN,
  shopTexture,
} from './textures';

export interface CityOptions {
  cityId: string;
  phase: DayPhase;
  rain: boolean;
  /** Volle Auflösung der Texturen und mehr Details (Desktop). */
  hi: boolean;
  fog: { near: number; far: number };
}

export interface City3d {
  group: Group;
  /** Spiegelungen der festen Lichter (Laternen, Ampeln, Leuchtreklame) auf der Straße. */
  streaks: Streaks | null;
  dispose(): void;
}

/** Anteile der Fassadenstile je Stadt (altbau, brick, plaster, ribbon). */
const STYLE_MIX: Record<string, [number, number, number, number]> = {
  koeln: [0.25, 0.15, 0.45, 0.15],
  hamburg: [0.2, 0.55, 0.15, 0.1],
  berlin: [0.55, 0.1, 0.2, 0.15],
  muenchen: [0.45, 0.05, 0.4, 0.1],
  frankfurt: [0.2, 0.1, 0.3, 0.4],
};

const PASTELS: Record<FacadeStyle, number[]> = {
  altbau: [0xf0e3c8, 0xe8cfa8, 0xd9c2b8, 0xcfd6d0, 0xe9dccb, 0xd8c08f, 0xc9d1d8, 0xe6c9b3],
  brick: [0xffffff, 0xf2e8e0, 0xe0d4cc, 0xd8c8c0],
  plaster: [0xe6e2d8, 0xd8d4c8, 0xc8cfd2, 0xe2d6bc, 0xd0c8b8, 0xbfc6c0, 0xe8e0d0],
  ribbon: [0xd0d0cc, 0xb8bcc0, 0xc8c4bc, 0xa8adb2],
};
const CAR_COLORS = [0xc8ccd2, 0x2a2f36, 0x8d1f1f, 0x1f3f7a, 0xd9c48a, 0x3a5a3a, 0x6b6f75, 0xe8e6e0];
const AWNINGS = [0x8d1f1f, 0x1f4f3a, 0x2a3a6a, 0xb8862a, 0x5a2a4a, 0x2a2c30];
const NEON = [0xff3a8a, 0x44e0ff, 0xffd21a, 0x7aff6a, 0xff6a3a, 0xc46aff];

// ---------------------------------------------------------------------------------------------- Geometrie-Sammler

/** Kantenlänge einer Kachel (Meter): Je Kachel eine Geometrie, damit three.js Unsichtbares weglässt. */
const CHUNK = 6 * PITCH;
const chunkKey = (x: number, z: number) => Math.floor(x / CHUNK) * 64 + Math.floor(z / CHUNK);

/** Sammelt Vierecke und fertige Geometrien für ein Material (eine Kachel). */
class Part {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Viereck: a links unten, b rechts unten (von außen gesehen), y0 bis y1; u, v je Ecke. */
  wall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y0: number,
    y1: number,
    n: [number, number, number],
    uv: [number, number, number, number],
    c: Color,
  ) {
    const base = this.pos.length / 3;
    this.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    for (let k = 0; k < 4; k++) {
      this.nor.push(...n);
      this.col.push(c.r, c.g, c.b);
    }
    const [u0, v0, u1, v1] = uv;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Waagerechtes Viereck (Dach, Boden) bei Höhe y. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, c: Color, uvScale: number) {
    const base = this.pos.length / 3;
    this.pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0);
    for (let k = 0; k < 4; k++) {
      this.nor.push(0, 1, 0);
      this.col.push(c.r, c.g, c.b);
    }
    this.uv.push(
      x0 * uvScale,
      z1 * uvScale,
      x1 * uvScale,
      z1 * uvScale,
      x1 * uvScale,
      z0 * uvScale,
      x0 * uvScale,
      z0 * uvScale,
    );
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Eine fertige Geometrie (verschoben), mit einer Farbe. */
  add(geo: BufferGeometry, c: Color) {
    const base = this.pos.length / 3;
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const u = geo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      this.col.push(c.r, c.g, c.b);
    }
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    geo.dispose();
  }

  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, c: Color) {
    const g = new BoxGeometry(w, h, d);
    g.translate(cx, cy, cz);
    this.add(g, c);
  }

  build(): BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx.length > 65535 ? new BufferAttribute(new Uint32Array(this.idx), 1) : this.idx);
    return g;
  }
}

/** Wie Part, verteilt aber auf Kacheln nach der Lage (Mitte des Vierecks bzw. der Geometrie). */
class Batch {
  parts = new Map<number, Part>();

  private at(x: number, z: number): Part {
    const key = chunkKey(x, z);
    let part = this.parts.get(key);
    if (!part) {
      part = new Part();
      this.parts.set(key, part);
    }
    return part;
  }

  wall(...a: Parameters<Part['wall']>) {
    this.at((a[0] + a[2]) / 2, (a[1] + a[3]) / 2).wall(...a);
  }

  flat(...a: Parameters<Part['flat']>) {
    this.at((a[0] + a[2]) / 2, (a[1] + a[3]) / 2).flat(...a);
  }

  add(geo: BufferGeometry, c: Color) {
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    this.at(b ? (b.min.x + b.max.x) / 2 : 0, b ? (b.min.z + b.max.z) / 2 : 0).add(geo, c);
  }

  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, c: Color) {
    this.at(cx, cz).box(cx, cy, cz, w, h, d, c);
  }

  build(): BufferGeometry[] {
    const out: BufferGeometry[] = [];
    for (const part of this.parts.values()) {
      const g = part.build();
      if (g) out.push(g);
    }
    return out;
  }
}

/** Die vier Seiten eines Rechtecks: Anfang a, Ende b (von außen gesehen links nach rechts), Normale. */
function sides(x0: number, z0: number, x1: number, z1: number) {
  return [
    { ax: x1, az: z0, bx: x0, bz: z0, n: [0, 0, -1] as [number, number, number], len: x1 - x0, dir: 'n' as const },
    { ax: x0, az: z1, bx: x1, bz: z1, n: [0, 0, 1] as [number, number, number], len: x1 - x0, dir: 's' as const },
    { ax: x1, az: z1, bx: x1, bz: z0, n: [1, 0, 0] as [number, number, number], len: z1 - z0, dir: 'e' as const },
    { ax: x0, az: z0, bx: x0, bz: z1, n: [-1, 0, 0] as [number, number, number], len: z1 - z0, dir: 'w' as const },
  ];
}

function pickStyle(mix: [number, number, number, number], r: number): FacadeStyle {
  let acc = 0;
  for (let k = 0; k < 4; k++) {
    acc += mix[k];
    if (r < acc) return FACADE_STYLES[k];
  }
  return 'plaster';
}

/** Weicher Lichtkreis (Lichtkegel einer Laterne am Boden). */
function poolTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
}

/** InstancedMesh je Kachel aus einer Liste von Matrizen (und Farben). */
function instanced(geo: BufferGeometry, mat: Material, items: { m: Matrix4; c?: Color }[]): InstancedMesh[] {
  const byChunk = new Map<number, { m: Matrix4; c?: Color }[]>();
  for (const it of items) {
    const key = chunkKey(it.m.elements[12], it.m.elements[14]);
    const list = byChunk.get(key) ?? [];
    list.push(it);
    byChunk.set(key, list);
  }
  const meshes: InstancedMesh[] = [];
  for (const list of byChunk.values()) {
    const mesh = new InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.c) mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  }
  if (meshes.length === 0) geo.dispose();
  return meshes;
}

const tmpObj = new Object3D();
function place(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0): Matrix4 {
  tmpObj.position.set(x, y, z);
  tmpObj.rotation.set(rotX, rotY, 0, 'YXZ'); // erst neigen (Markise), dann zur Wand drehen
  tmpObj.scale.set(sx, sy, sz);
  tmpObj.updateMatrix();
  return tmpObj.matrix.clone();
}

// ---------------------------------------------------------------------------------------------- Parkende Autos

/** Ein parkendes Auto als eine Geometrie mit Eckpunktfarben (Lack weiß = Farbe der Instanz, Rest dunkel). */
function parkedCarGeometry(van: boolean): BufferGeometry {
  const L = van ? 5.1 : 4.3;
  const W = van ? 1.95 : 1.8;
  const parts: BufferGeometry[] = [];
  const paint = (g: BufferGeometry, c: number) => {
    const color = new Color(c);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new BufferAttribute(arr, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const body = new BoxGeometry(W, van ? 1.0 : 0.62, L);
  body.translate(0, van ? 0.82 : 0.64, 0);
  paint(body, 0xffffff);
  const cabH = van ? 0.9 : 0.55;
  const cab = new BoxGeometry(W * 0.86, cabH, van ? L * 0.78 : L * 0.5);
  const p = cab.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 0.86);
  cab.translate(0, (van ? 1.32 : 0.95) + cabH / 2, van ? 0.25 : 0.15);
  paint(cab, 0x0c1016);
  const roof = new BoxGeometry(W * 0.72, 0.05, van ? L * 0.7 : L * 0.38);
  roof.translate(0, (van ? 1.32 : 0.95) + cabH + 0.02, van ? 0.3 : 0.2);
  paint(roof, 0xffffff);
  for (const z of [-L / 2 + 0.85, L / 2 - 0.85]) {
    for (const s of [-1, 1]) {
      const w = new CylinderGeometry(0.33, 0.33, 0.24, 12);
      w.rotateZ(Math.PI / 2);
      w.translate(s * (W / 2 - 0.08), 0.33, z);
      paint(w, 0x0a0a0b);
    }
  }
  for (const s of [-1, 1]) {
    const tail = new BoxGeometry(0.3, 0.12, 0.04);
    tail.translate(s * (W / 2 - 0.25), van ? 1.0 : 0.78, L / 2 + 0.01);
    paint(tail, 0x7a0a06);
    const head = new BoxGeometry(0.32, 0.12, 0.04);
    head.translate(s * (W / 2 - 0.28), van ? 0.95 : 0.74, -L / 2 - 0.01);
    paint(head, 0x9a9a92);
  }
  const bumper = new BoxGeometry(W + 0.04, 0.16, L + 0.06);
  bumper.translate(0, 0.42, 0);
  paint(bumper, 0x1a1b1e);
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged ?? new BufferGeometry();
}

// ---------------------------------------------------------------------------------------------- Stadt

export function buildCity3d(setup: ChaseSetup, options: CityOptions): City3d {
  const { phase, rain, hi } = options;
  const night = phase === 'night';
  const dark = phase !== 'day';
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const city = setup.city;
  const mix = STYLE_MIX[options.cityId] ?? STYLE_MIX.koeln;
  const px = hi ? 72 : 36;

  // ------------------------------------------------------------------ Boden
  const road = roadTiles(night, hi ? 1024 : 512);
  own(road.map);
  own(road.rough);
  road.map.repeat.set(GRID + 2, GRID + 2);
  road.rough.repeat.set(GRID + 2, GRID + 2);
  const groundMat = own(
    new MeshStandardMaterial({
      map: road.map,
      roughness: rain ? 1 : 0.92,
      roughnessMap: rain ? road.rough : null,
      metalness: 0,
      envMapIntensity: rain ? 1.2 : 0.35,
    }),
  );
  const ground = new Mesh(own(new PlaneGeometry(WORLD + 2 * PITCH, WORLD + 2 * PITCH)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD / 2, 0, WORLD / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // ------------------------------------------------------------------ Häuser
  const styleTex = new Map<FacadeStyle, ReturnType<typeof facadeTexture>>();
  const facadeBatches = new Map<FacadeStyle, Batch>();
  for (const s of FACADE_STYLES) {
    const t = facadeTexture(s, px);
    own(t.map);
    own(t.emissive);
    styleTex.set(s, t);
    facadeBatches.set(s, new Batch());
  }
  const glassT = glassTexture(px);
  own(glassT.map);
  own(glassT.emissive);
  const shopT = shopTexture(hi ? 44 : 24);
  own(shopT.map);
  own(shopT.emissive);
  const shops = new Batch();
  const glass = new Batch();
  const trim = new Batch();
  const roofs = new Batch();
  const beacons = new Batch();
  const balconies: { m: Matrix4 }[] = [];
  const awnings: { m: Matrix4; c: Color }[] = [];
  const neon: { m: Matrix4; c: Color }[] = [];
  const neonLights: { x: number; z: number; c: Color }[] = [];
  const white = new Color(1, 1, 1);
  const tint = new Color();
  const trimTint = new Color();
  const facadeTile = 4 * BAY;

  for (const block of city.blocks) {
    const br = blockRect(block.i, block.j);
    for (const b of block.buildings) {
      const tower = block.kind === 'tower';
      const style = tower ? null : pickStyle(mix, Math.random());
      const floors = Math.max(tower ? 10 : 2, Math.round((b.height - GROUND_FLOOR) / FLOOR));
      const H = GROUND_FLOOR + floors * FLOOR;
      if (style) {
        const pal = PASTELS[style];
        tint.setHex(pal[Math.floor(Math.random() * pal.length)]);
      } else tint.setHex(0xffffff);
      trimTint.copy(tint).multiplyScalar(style === 'brick' ? 0.9 : 1.04);
      const facade = style ? facadeBatches.get(style) : glass;
      const uOff = Math.floor(Math.random() * 8) * BAY;
      for (const side of sides(b.x0, b.z0, b.x1, b.z1)) {
        const street =
          (side.dir === 'n' && b.z0 - br.z0 < 3) ||
          (side.dir === 's' && br.z1 - b.z1 < 3) ||
          (side.dir === 'w' && b.x0 - br.x0 < 3) ||
          (side.dir === 'e' && br.x1 - b.x1 < 3);
        const sOff = Math.floor(Math.random() * 8) * 6;
        // Erdgeschoss: Läden (an Türmen auch, als Lobby-Zeile).
        shops.wall(
          side.ax,
          side.az,
          side.bx,
          side.bz,
          0,
          GROUND_FLOOR,
          side.n,
          [sOff / SHOP_SPAN, 0, (sOff + side.len) / SHOP_SPAN, 1],
          white,
        );
        facade?.wall(
          side.ax,
          side.az,
          side.bx,
          side.bz,
          GROUND_FLOOR,
          H,
          side.n,
          [uOff / facadeTile, 0, (uOff + side.len) / facadeTile, floors / 4],
          tint,
        );
        if (!street) continue;
        const nx = side.n[0];
        const nz = side.n[2];
        const rx = (side.bx - side.ax) / side.len;
        const rz = (side.bz - side.az) / side.len;
        const rotY = Math.atan2(nx, nz);
        // Markisen über manchen Schaufenstern (Läden sind 6 m breit, Fenster in der Mitte bei 2,35 m).
        for (let t = 2.35; t < side.len - 2.2; t += 6) {
          if (t < 2.2 || Math.random() > 0.3) continue;
          const x = side.ax + rx * t + nx * 0.6;
          const z = side.az + rz * t + nz * 0.6;
          awnings.push({
            m: place(x, GROUND_FLOOR - 1.25, z, rotY, 1, 1, 1, 0.38),
            c: new Color(AWNINGS[Math.floor(Math.random() * AWNINGS.length)]),
          });
        }
        // Balkone (Altbau, Putz): jedes zweite Feld, auf einigen Häusern.
        if ((style === 'altbau' || style === 'plaster') && Math.random() < 0.45) {
          const first = (BAY - (uOff % BAY)) % BAY;
          for (let t = first + 1.5; t < side.len - 1.2; t += 2 * BAY) {
            for (let f = 1; f < Math.min(floors, 6); f++) {
              const x = side.ax + rx * t + nx * 0.55;
              const z = side.az + rz * t + nz * 0.55;
              balconies.push({ m: place(x, GROUND_FLOOR + f * FLOOR + 0.08, z, rotY) });
            }
          }
        }
        // Leuchtreklame quer zur Wand (selten).
        if (Math.random() < 0.12 && side.len > 6) {
          const t = 1 + Math.random() * (side.len - 2);
          const c = new Color(NEON[Math.floor(Math.random() * NEON.length)]);
          const x = side.ax + rx * t + nx * 0.5;
          const z = side.az + rz * t + nz * 0.5;
          neon.push({ m: place(x, GROUND_FLOOR + 1.5, z, rotY), c });
          neonLights.push({ x: x + nx * 0.6, z: z + nz * 0.6, c });
        }
      }
      // Gesims über dem Laden, Kranz oben, Dach.
      const o = tower ? 0.15 : 0.32;
      trim.box(
        (b.x0 + b.x1) / 2,
        GROUND_FLOOR + 0.12,
        (b.z0 + b.z1) / 2,
        b.x1 - b.x0 + 0.24,
        0.24,
        b.z1 - b.z0 + 0.24,
        trimTint,
      );
      trim.box((b.x0 + b.x1) / 2, H + 0.3, (b.z0 + b.z1) / 2, b.x1 - b.x0 + 2 * o, 0.6, b.z1 - b.z0 + 2 * o, trimTint);
      roofs.flat(b.x0 + 0.2, b.z0 + 0.2, b.x1 - 0.2, b.z1 - 0.2, H + 0.61, white, 0.12);
      if (tower) {
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        const w = (b.x1 - b.x0) * 0.5;
        const d = (b.z1 - b.z0) * 0.5;
        trim.box(cx, H + 2.2, cz, w, 3.2, d, new Color(0x6a7078));
        beacons.box(cx + w / 2 - 0.3, H + 4, cz + d / 2 - 0.3, 0.4, 0.4, 0.4, white);
        beacons.box(cx - w / 2 + 0.3, H + 4, cz - d / 2 + 0.3, 0.4, 0.4, 0.4, white);
      } else if (Math.random() < 0.4) {
        // Aufbauten auf dem Dach (Lüftung, Treppenhaus).
        const cx = b.x0 + 2 + Math.random() * Math.max(0.1, b.x1 - b.x0 - 4);
        const cz = b.z0 + 2 + Math.random() * Math.max(0.1, b.z1 - b.z0 - 4);
        trim.box(cx, H + 1.2, cz, 2.4, 1.4, 1.8, new Color(0x8a8d90));
      }
    }
    // Bordstein rund um den Block.
    const kerb = new Color(night ? 0x5a5b5e : 0xb4b2ab);
    const e = ROAD_W / 2;
    const x0 = block.i * PITCH + e;
    const x1 = (block.i + 1) * PITCH - e;
    const z0 = block.j * PITCH + e;
    const z1 = (block.j + 1) * PITCH - e;
    if (block.kind === 'water') continue;
    trim.box((x0 + x1) / 2, 0.07, z0, x1 - x0, 0.14, 0.22, kerb);
    trim.box((x0 + x1) / 2, 0.07, z1, x1 - x0, 0.14, 0.22, kerb);
    trim.box(x0, 0.07, (z0 + z1) / 2, 0.22, 0.14, z1 - z0, kerb);
    trim.box(x1, 0.07, (z0 + z1) / 2, 0.22, 0.14, z1 - z0, kerb);
  }

  const emissiveNight = night ? 1.0 : phase === 'dusk' ? 0.55 : 0;
  const addBatch = (batch: Batch, mat: Material, shadow = true) => {
    own(mat);
    for (const geo of batch.build()) {
      own(geo);
      const mesh = new Mesh(geo, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };
  for (const s of FACADE_STYLES) {
    const t = styleTex.get(s);
    const batch = facadeBatches.get(s);
    if (!t || !batch) continue;
    addBatch(
      batch,
      new MeshStandardMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: new Color(0xffe2b0),
        emissiveIntensity: emissiveNight,
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.02,
        envMapIntensity: 0.6,
      }),
    );
  }
  addBatch(
    glass,
    new MeshStandardMaterial({
      map: glassT.map,
      emissiveMap: glassT.emissive,
      emissive: new Color(0xe8f0ff),
      emissiveIntensity: emissiveNight * 0.9,
      vertexColors: true,
      roughness: 0.12,
      metalness: 0.85,
      envMapIntensity: 1.3,
    }),
  );
  addBatch(
    shops,
    new MeshStandardMaterial({
      map: shopT.map,
      emissiveMap: shopT.emissive,
      emissive: new Color(0xffffff),
      emissiveIntensity: night ? 1.5 : phase === 'dusk' ? 1.0 : 0.15,
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.05,
    }),
  );
  addBatch(trim, new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 }));
  const roofTex = own(roofTexture());
  addBatch(roofs, new MeshStandardMaterial({ map: roofTex, vertexColors: true, roughness: 0.95 }), false);
  addBatch(beacons, glow(0xff2a1a, 3, 0x400000), false);

  const addInstanced = (meshes: InstancedMesh[], shadow = false) => {
    for (const mesh of meshes) {
      own(mesh.geometry);
      own(mesh.material as Material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };
  // Balkone: Platte und Geländer.
  const slab = new BoxGeometry(1.9, 0.16, 1.1);
  const rail = mergeGeometries([
    new BoxGeometry(1.9, 0.9, 0.04).translate(0, 0.5, 0.53),
    new BoxGeometry(0.04, 0.9, 1.1).translate(-0.93, 0.5, 0),
    new BoxGeometry(0.04, 0.9, 1.1).translate(0.93, 0.5, 0),
  ]);
  addInstanced(instanced(slab, matte(0xcfcac0, 0.85), balconies), true);
  if (rail)
    addInstanced(
      instanced(rail, new MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.6 }), balconies),
    );
  // Markisen: schräge Bahnen mit Farbe.
  addInstanced(
    instanced(
      new BoxGeometry(4.1, 0.06, 1.4),
      new MeshStandardMaterial({ roughness: 0.85, side: DoubleSide }),
      awnings,
    ),
    true,
  );
  // Leuchtreklame: hell, mit Bloom.
  addInstanced(
    instanced(
      new BoxGeometry(0.22, 2.2, 0.9),
      new MeshBasicMaterial({ color: new Color(1, 1, 1).multiplyScalar(dark ? 2.6 : 1.1) }),
      neon,
    ),
  );

  // ------------------------------------------------------------------ Laternen, Bäume, Ampeln
  const poles = new Batch();
  const heads = new Batch();
  const lampSpots: { x: number; z: number }[] = [];
  const trees: { m: Matrix4; c: Color }[] = [];
  const trunks: { m: Matrix4 }[] = [];
  const signals: { m: Matrix4; c: Color }[] = [];
  const signalLights: { x: number; z: number; c: Color }[] = [];
  const metal = new Color(0x3a3d42);
  const SIGNAL_COLORS = [0xff2a1a, 0x2aff6a, 0xffaa1a];
  const addTree = (x: number, z: number, size: number) => {
    trunks.push({ m: place(x, 1.4 * size, z, 0, size, size, size) });
    const g = 0.75 + Math.random() * 0.4;
    trees.push({
      m: place(x, 4.3 * size, z, Math.random() * 6, 2.3 * size, 2.0 * size, 2.3 * size),
      c: new Color(0x3f6a32).multiplyScalar(g * (night ? 0.5 : 1)),
    });
  };
  const toCenter = (p: Post) => (p.axis === 'x' ? { x: 0, z: -p.side } : { x: -p.side, z: 0 });
  for (const p of city.posts) {
    if (p.kind === 'tree') {
      addTree(p.x, p.z, 0.85 + Math.random() * 0.35);
    } else if (p.kind === 'lamp') {
      const c = toCenter(p);
      poles.add(new CylinderGeometry(0.07, 0.11, 7.2, 6).translate(p.x, 3.6, p.z), metal);
      poles.add(
        new BoxGeometry(c.x ? 1.7 : 0.08, 0.08, c.z ? 1.7 : 0.08).translate(p.x + c.x * 0.85, 7.15, p.z + c.z * 0.85),
        metal,
      );
      const hx = p.x + c.x * 1.6;
      const hz = p.z + c.z * 1.6;
      heads.add(new BoxGeometry(0.55, 0.14, 0.55).translate(hx, 7.05, hz), white);
      lampSpots.push({ x: hx, z: hz });
    } else {
      poles.add(new CylinderGeometry(0.07, 0.08, 3.4, 6).translate(p.x, 1.7, p.z), metal);
      poles.add(new BoxGeometry(0.34, 0.95, 0.34).translate(p.x, 3.4, p.z), new Color(0x1a1b1e));
      const c = new Color(SIGNAL_COLORS[Math.floor(Math.random() * 3)]);
      signals.push({ m: place(p.x, 3.4, p.z), c });
      signalLights.push({ x: p.x, z: p.z, c });
    }
  }
  for (const block of city.blocks) for (const t of block.trees) addTree(t.x, t.z, t.size * 1.15);
  addBatch(poles, matte(0x3a3d42, 0.55), true);
  addBatch(heads, dark ? glow(0xffd9a0, night ? 3.2 : 2, 0xffe6b8) : matte(0xd0d2d6, 0.5), false);
  addInstanced(instanced(new CylinderGeometry(0.16, 0.24, 2.8, 6), matte(0x4a3522, 0.9), trunks), true);
  addInstanced(
    instanced(new IcosahedronGeometry(1, 1), new MeshStandardMaterial({ roughness: 0.9, flatShading: true }), trees),
    true,
  );
  addInstanced(
    instanced(
      new BoxGeometry(0.36, 0.26, 0.36),
      new MeshBasicMaterial({ color: new Color(1, 1, 1).multiplyScalar(dark ? 2.2 : 1) }),
      signals,
    ),
  );
  // Lichtkegel der Laternen am Boden (nachts und in der Dämmerung).
  if (dark) {
    const pools = new Batch();
    for (const s of lampSpots) {
      const g = new PlaneGeometry(10, 10).rotateX(-Math.PI / 2).translate(s.x, 0.04, s.z);
      pools.add(g, white);
    }
    const tex = own(poolTexture());
    addBatch(
      pools,
      new MeshBasicMaterial({
        map: tex,
        color: new Color(0xffc98a).multiplyScalar(night ? 0.42 : 0.22),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      false,
    );
  }

  // ------------------------------------------------------------------ Parkende Autos
  const cars: { m: Matrix4; c: Color }[] = [];
  const vans: { m: Matrix4; c: Color }[] = [];
  for (const car of city.parked) {
    const rot = car.axis === 'x' ? (car.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : car.dir > 0 ? Math.PI : 0;
    const item = { m: place(car.x, 0, car.z, rot), c: new Color(CAR_COLORS[car.color % CAR_COLORS.length]) };
    (car.kind === 'van' ? vans : cars).push(item);
  }
  const carMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45, envMapIntensity: 1 });
  addInstanced(instanced(parkedCarGeometry(false), carMat, cars), true);
  addInstanced(instanced(parkedCarGeometry(true), carMat.clone(), vans), true);

  // ------------------------------------------------------------------ Fluss, Kaimauer, Brücken
  const rc = city.riverCol;
  if (rc >= 0) {
    const r = blockRect(rc, 0);
    const water = new MeshStandardMaterial({
      color: night ? 0x08121c : 0x1c3346,
      roughness: 0.06,
      metalness: 0.9,
      envMapIntensity: 1.2,
    });
    own(water);
    const quay = new Batch();
    const rails = new Batch();
    const stone = new Color(night ? 0x4a4a4e : 0x9a968c);
    for (let j = 0; j < GRID; j++) {
      const z0 = j * PITCH + ROAD_W / 2;
      const z1 = (j + 1) * PITCH - ROAD_W / 2;
      const seg = new Mesh(own(new PlaneGeometry(r.x1 - r.x0 + 2 * SIDEWALK, z1 - z0)), water);
      seg.rotation.x = -Math.PI / 2;
      seg.position.set((r.x0 + r.x1) / 2, 0.05, (z0 + z1) / 2);
      group.add(seg);
      for (const x of [r.x0 - SIDEWALK, r.x1 + SIDEWALK]) quay.box(x, 0.45, (z0 + z1) / 2, 0.5, 0.9, z1 - z0, stone);
    }
    for (let j = 0; j <= GRID; j++) {
      for (const side of [-1, 1]) {
        const z = j * PITCH + side * (ROAD_W / 2 + 0.2);
        rails.box((r.x0 + r.x1) / 2, 0.55, z, r.x1 - r.x0 + SIDEWALK * 2, 1.1, 0.35, stone);
        rails.box((r.x0 + r.x1) / 2, 1.15, z, r.x1 - r.x0 + SIDEWALK * 2, 0.08, 0.45, stone);
      }
    }
    addBatch(quay, new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), true);
    addBatch(rails, new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true);
  }

  // ------------------------------------------------------------------ Parks: Rasen
  const lawn = new Batch();
  for (const block of city.blocks) {
    if (block.kind !== 'park') continue;
    const r = blockRect(block.i, block.j);
    lawn.flat(r.x0, r.z0, r.x1, r.z1, 0.03, white, 1);
  }
  addBatch(lawn, matte(night ? 0x1a2618 : 0x4f7a3a, 0.95), false);

  landmark(group, options.cityId, phase, own);

  // ------------------------------------------------------------------ Spiegelungen der festen Lichter
  let streaks: Streaks | null = null;
  if (dark || rain) {
    const all = lampSpots.length + signalLights.length + neonLights.length;
    streaks = createStreaks(all, options.fog, false);
    const lamp = new Color(0xffc98a).multiplyScalar(night ? 0.9 : 0.5);
    let k = 0;
    for (const s of lampSpots) streaks.set(k++, s.x, 7, s.z, lamp, 0.55, 9);
    for (const s of signalLights) streaks.set(k++, s.x, 3.4, s.z, s.c.clone().multiplyScalar(0.7), 0.3, 4);
    for (const s of neonLights) streaks.set(k++, s.x, 5.5, s.z, s.c.clone().multiplyScalar(0.6), 0.45, 6);
    streaks.material.uniforms.intensity.value = rain ? 1 : night ? 0.35 : 0.2;
    streaks.commit();
    group.add(streaks.mesh);
    own(streaks.mesh.geometry);
    own(streaks.material);
  }

  return {
    group,
    streaks,
    dispose: () => {
      for (const o of owned) o.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------- Wahrzeichen

/** Wahrzeichen der Stadt am Horizont (im Norden, hinter dem Raster). */
function landmark(root: Group, cityId: string, phase: DayPhase, own: <T extends { dispose(): void }>(x: T) => T): void {
  const dark = phase === 'night';
  const stone = own(matte(dark ? 0x2c2f3a : 0x8d8a82, 0.9));
  const glassMat = own(
    new MeshStandardMaterial({ color: dark ? 0x1c2436 : 0x6b8aa8, roughness: 0.15, metalness: 0.8 }),
  );
  const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number) => {
    own(geo);
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    root.add(m);
  };
  const zFar = -320;
  const cx = WORLD / 2;
  switch (cityId) {
    case 'hamburg': {
      const brick = own(matte(dark ? 0x3a2622 : 0x8a4a3a, 0.9));
      add(new BoxGeometry(90, 40, 40), brick, cx, 20, zFar);
      add(new BoxGeometry(92, 45, 42), glassMat, cx, 62, zFar);
      for (let k = 0; k < 5; k++) add(new SphereGeometry(12, 12, 8), glassMat, cx - 36 + k * 18, 85, zFar);
      add(new CylinderGeometry(6, 8, 100, 10), stone, cx - 200, 50, zFar - 60);
      add(new ConeGeometry(7, 30, 8), own(matte(0x3f6a5a, 0.6)), cx - 200, 115, zFar - 60);
      break;
    }
    case 'berlin': {
      add(new CylinderGeometry(5, 9, 200, 12), stone, cx, 100, zFar);
      add(new SphereGeometry(18, 16, 12), glassMat, cx, 210, zFar);
      add(new CylinderGeometry(1.5, 2.5, 90, 8), stone, cx, 270, zFar);
      for (let k = 0; k < 6; k++) add(new BoxGeometry(5, 24, 8), stone, cx + 150 + k * 10, 12, zFar - 40);
      add(new BoxGeometry(60, 6, 10), stone, cx + 175, 27, zFar - 40);
      break;
    }
    case 'muenchen': {
      const brick = own(matte(dark ? 0x3a2a24 : 0x9a5a40, 0.9));
      const copper = own(matte(dark ? 0x1d3a2e : 0x3f8a6a, 0.6));
      add(new BoxGeometry(70, 45, 30), brick, cx, 22, zFar);
      for (const side of [-1, 1]) {
        add(new CylinderGeometry(9, 9, 90, 10), brick, cx + side * 28, 45, zFar);
        add(new SphereGeometry(10, 12, 8), copper, cx + side * 28, 92, zFar);
      }
      add(new CylinderGeometry(4, 7, 180, 10), stone, cx - 220, 90, zFar - 40);
      add(new CylinderGeometry(14, 10, 14, 12), glassMat, cx - 220, 165, zFar - 40);
      break;
    }
    case 'frankfurt': {
      const towers: [number, number, number][] = [
        [-120, 230, 40],
        [-50, 180, 34],
        [20, 260, 44],
        [95, 200, 36],
        [170, 150, 30],
      ];
      for (const [dx, h, w] of towers) add(new BoxGeometry(w, h, w), glassMat, cx + dx, h / 2, zFar - 20);
      break;
    }
    default: {
      // Köln: Dom mit zwei Türmen und Fialen, Colonius, Kranhäuser.
      add(new BoxGeometry(100, 50, 40), stone, cx, 25, zFar);
      add(new ConeGeometry(30, 22, 4), stone, cx, 61, zFar);
      for (const side of [-1, 1]) {
        add(new BoxGeometry(18, 110, 18), stone, cx + side * 36, 55, zFar);
        add(new ConeGeometry(11, 55, 4), stone, cx + side * 36, 137, zFar);
        for (const q of [-1, 1]) add(new ConeGeometry(2, 14, 4), stone, cx + side * 36 + q * 8, 117, zFar + 8);
      }
      add(new CylinderGeometry(4, 6, 220, 10), stone, cx - 260, 110, zFar - 60);
      add(new CylinderGeometry(16, 12, 14, 14), glassMat, cx - 260, 170, zFar - 60);
      for (let k = 0; k < 3; k++) {
        add(new BoxGeometry(20, 60, 18), glassMat, cx + 200 + k * 40, 30, zFar);
        add(new BoxGeometry(50, 15, 18), glassMat, cx + 215 + k * 40, 52, zFar);
      }
    }
  }
}
