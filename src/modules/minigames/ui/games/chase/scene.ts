// Szene der Verfolgungsjagd (Auftrag 47, three.js): Stadt aus dem Modell (Boden mit Straßen-Kacheln, Gebäude mit
// Fenstern, Parks, Fluss mit Brücken, Laternen, Wahrzeichen am Rand), Himmel nach Tageszeit, Regen, Wagen (deine
// Karre, Verkehr, Streifen mit Blaulicht), Sperren, Tiefgarage, Kamera hinter dem Wagen mit Nachziehen, Blickwinkel
// nach Tempo, Rollen in Kurven, Wackeln bei Treffern, Funken, Bloom. Nur Optik: liest den Zustand, ändert ihn nie.
// Math.random nur für Optik (Fenster, Funken), kein Einfluss auf die Simulation.

import {
  AdditiveBlending,
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  type DirectionalLight,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  buildCar,
  type CarParts,
  type DayPhase,
  disposeObject,
  glow,
  lightScene,
  matte,
  SKY,
  setBlueLight,
  spinWheels,
} from '../../kit/scene3d';
import type { Stage3d } from '../../kit/stage3d';
import {
  blockRect,
  type ChaseSetup,
  type ChaseState,
  forward,
  GRID,
  type Hideout,
  PITCH,
  ROAD_W,
  SIDEWALK,
  TOP_SPEED,
  WORLD,
} from './model';

export interface SceneOptions {
  cityId: string;
  phase: DayPhase;
  rain: boolean;
  reduced: boolean;
}

/** Farben der Verkehrswagen (Index aus dem Modell). */
const TRAFFIC_COLORS = [0xc8ccd2, 0x2a2f36, 0x8d1f1f, 0x1f3f7a, 0xd9c48a, 0x3a5a3a, 0x6b6f75, 0xe8e6e0];
const PLAYER_COLOR = 0x2b2f36;

// ---------------------------------------------------------------------------------------------- Texturen

/** Eine Straßen-Kachel (PITCH × PITCH Meter): Straßenmitte am Rand, Block in der Mitte, Markierungen, Zebrastreifen. */
function roadTile(night: boolean): CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (!g) return new CanvasTexture(c);
  const m = S / PITCH; // Pixel pro Meter
  g.fillStyle = night ? '#1b1d22' : '#2b2e34';
  g.fillRect(0, 0, S, S);
  // Asphalt-Körnung.
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)';
    g.fillRect(x, y, 1.5, 1.5);
  }
  const inset = (ROAD_W / 2 + SIDEWALK) * m;
  const road = (ROAD_W / 2) * m;
  // Gehweg (Platten) rund um den Block.
  g.fillStyle = night ? '#4a4b4e' : '#8d8c87';
  g.fillRect(road, road, S - 2 * road, S - 2 * road);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  for (let x = road; x <= S - road; x += 2 * m) {
    g.beginPath();
    g.moveTo(x, road);
    g.lineTo(x, S - road);
    g.stroke();
  }
  for (let y = road; y <= S - road; y += 2 * m) {
    g.beginPath();
    g.moveTo(road, y);
    g.lineTo(S - road, y);
    g.stroke();
  }
  // Blockinneres (unter Gebäuden, Hof).
  g.fillStyle = night ? '#2e2f33' : '#6b6a66';
  g.fillRect(inset, inset, S - 2 * inset, S - 2 * inset);
  // Bordstein.
  g.strokeStyle = night ? '#6a6b6e' : '#b9b7b0';
  g.lineWidth = 2;
  g.strokeRect(road, road, S - 2 * road, S - 2 * road);
  // Fahrbahnrand (weiß) und Mittellinie (gestrichelt) für die vier Straßenhälften am Rand.
  g.strokeStyle = 'rgba(235,235,225,0.75)';
  g.lineWidth = 2;
  for (const edge of [road - 2]) {
    g.beginPath();
    g.moveTo(edge, 0);
    g.lineTo(edge, S);
    g.moveTo(S - edge, 0);
    g.lineTo(S - edge, S);
    g.moveTo(0, edge);
    g.lineTo(S, edge);
    g.moveTo(0, S - edge);
    g.lineTo(S, S - edge);
    g.stroke();
  }
  g.setLineDash([4 * m, 4 * m]);
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(245,245,235,0.8)';
  g.beginPath();
  g.moveTo(1, road);
  g.lineTo(1, S - road);
  g.moveTo(S - 1, road);
  g.lineTo(S - 1, S - road);
  g.moveTo(road, 1);
  g.lineTo(S - road, 1);
  g.moveTo(road, S - 1);
  g.lineTo(S - road, S - 1);
  g.stroke();
  g.setLineDash([]);
  // Zebrastreifen an den Einfahrten der Kreuzung (an den vier Ecken der Kachel).
  g.fillStyle = 'rgba(240,240,230,0.7)';
  const zebra = (x: number, y: number, horizontal: boolean) => {
    for (let k = 0; k < 6; k++) {
      if (horizontal) g.fillRect(x + k * 1.2 * m, y, 0.6 * m, 2 * road);
      else g.fillRect(x, y + k * 1.2 * m, 2 * road, 0.6 * m);
    }
  };
  zebra(road + 1 * m, -road, true);
  zebra(road + 1 * m, S - road, true);
  zebra(-road, road + 1 * m, false);
  zebra(S - road, road + 1 * m, false);
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Fassade: 4 × 4 Fenster je Kachel (eine Kachel = 12 × 12 Meter). Zwei Texturen: Farbe und Leuchten (nachts). */
function facadeTiles(): { map: CanvasTexture; emissive: CanvasTexture } {
  const S = 256;
  const make = (lit: boolean) => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    if (!g) return new CanvasTexture(c);
    g.fillStyle = lit ? '#000' : '#d9d4c8';
    g.fillRect(0, 0, S, S);
    if (!lit) {
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
        g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
      }
    }
    const cell = S / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = i * cell + cell * 0.22;
        const y = j * cell + cell * 0.2;
        const w = cell * 0.56;
        const h = cell * 0.6;
        if (lit) {
          const on = Math.random() < 0.55;
          g.fillStyle = on ? (Math.random() < 0.7 ? '#ffd9a0' : '#cfe3ff') : '#000';
          g.fillRect(x, y, w, h);
        } else {
          g.fillStyle = '#2a3340';
          g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(x + 2, y + 2, w - 4, h * 0.35);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x - 2, y + h, w + 4, 3);
        }
      }
    }
    const tex = new CanvasTexture(c);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  return { map: make(false), emissive: make(true) };
}

// ---------------------------------------------------------------------------------------------- Stadt

/** Box mit Fenster-UVs nach Größe (eine Kachel = 12 m) und Farbe je Eckpunkt. */
function buildingBox(x0: number, z0: number, x1: number, z1: number, height: number, color: Color): BufferGeometry {
  const w = x1 - x0;
  const d = z1 - z0;
  const geo = new BoxGeometry(w, height, d);
  geo.translate((x0 + x1) / 2, height / 2, (z0 + z1) / 2);
  const uv = geo.getAttribute('uv') as BufferAttribute;
  // Seitenflächen: px, nx (0..7), py (8..11), ny (12..15), pz, nz (16..23).
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (i >= 8 && i < 16)
      uv.setXY(i, 0.01, 0.99); // Dach und Boden: Ecke ohne Fenster
    else if (i < 8) uv.setXY(i, (u * d) / 12, (v * height) / 12);
    else uv.setXY(i, (u * w) / 12, (v * height) / 12);
  }
  const colors = new Float32Array(geo.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geo;
}

const FACADES = [0xd8cfc0, 0xb8a58c, 0xa86a52, 0x9ca3ab, 0x7d8a99, 0xcdb79e, 0x6c7a8a, 0xe2ddd2];
const TOWER_FACADES = [0x5f7384, 0x4a5a6a, 0x8b9aa8, 0x3e4b58];

function buildCity(setup: ChaseSetup, phase: DayPhase, root: Group): void {
  const { map, emissive } = facadeTiles();
  const night = phase === 'night';
  const boxes: BufferGeometry[] = [];
  const roofs: BufferGeometry[] = [];
  const trunks: BufferGeometry[] = [];
  const crowns: BufferGeometry[] = [];
  const color = new Color();
  for (const block of setup.city.blocks) {
    for (const b of block.buildings) {
      const palette = block.kind === 'tower' ? TOWER_FACADES : FACADES;
      color.setHex(palette[Math.floor(b.tint * palette.length) % palette.length]);
      if (!b.lit) color.multiplyScalar(0.85);
      boxes.push(buildingBox(b.x0, b.z0, b.x1, b.z1, b.height, color));
      const roof = new PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0);
      roof.rotateX(-Math.PI / 2);
      roof.translate((b.x0 + b.x1) / 2, b.height + 0.02, (b.z0 + b.z1) / 2);
      roofs.push(roof);
    }
    for (const t of block.trees) {
      const trunk = new CylinderGeometry(0.18 * t.size, 0.25 * t.size, 2.2 * t.size, 6);
      trunk.translate(t.x, 1.1 * t.size, t.z);
      trunks.push(trunk);
      const crown = new SphereGeometry(2.2 * t.size, 8, 6);
      crown.scale(1, 1.2, 1);
      crown.translate(t.x, 2.2 * t.size + 2.4 * t.size, t.z);
      crowns.push(crown);
    }
    if (block.kind === 'park') {
      // Rasen.
      const r = blockRect(block.i, block.j);
      const lawn = new Mesh(new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), matte(night ? 0x1d2a1a : 0x4f7a3a, 0.95));
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set((r.x0 + r.x1) / 2, 0.03, (r.z0 + r.z1) / 2);
      lawn.receiveShadow = true;
      root.add(lawn);
    }
  }
  if (boxes.length) {
    const mat = new MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: new Color(0xffe2b0),
      emissiveIntensity: night ? 1.4 : phase === 'dusk' ? 0.5 : 0,
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
    });
    const mesh = new Mesh(mergeGeometries(boxes), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    const roofMesh = new Mesh(mergeGeometries(roofs), matte(night ? 0x202228 : 0x55585e, 0.9));
    root.add(roofMesh);
  }
  if (trunks.length) {
    root.add(new Mesh(mergeGeometries(trunks), matte(0x4a3522, 0.9)));
    const crown = new Mesh(mergeGeometries(crowns), matte(night ? 0x16261a : 0x3f7a35, 0.9));
    crown.castShadow = true;
    root.add(crown);
  }
  // Fluss: dunkle, glatte Fläche, dazu Geländer der Brücken.
  const rc = setup.city.riverCol;
  if (rc >= 0) {
    const r = blockRect(rc, 0);
    const water = new Mesh(
      new PlaneGeometry(r.x1 - r.x0 + SIDEWALK * 2, WORLD + 2 * PITCH),
      new MeshPhysicalMaterial({
        color: night ? 0x0a1420 : 0x1e3a55,
        roughness: 0.06,
        metalness: 0.55,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set((r.x0 + r.x1) / 2, 0.05, WORLD / 2);
    root.add(water);
    const rail = matte(0x9aa0a8, 0.4);
    const rails: BufferGeometry[] = [];
    for (let j = 0; j <= GRID; j++) {
      for (const side of [-1, 1]) {
        const g = new BoxGeometry(r.x1 - r.x0 + SIDEWALK * 2, 1.1, 0.12);
        g.translate((r.x0 + r.x1) / 2, 0.55, j * PITCH + side * (ROAD_W / 2 + SIDEWALK));
        rails.push(g);
      }
    }
    root.add(new Mesh(mergeGeometries(rails), rail));
  }
  // Laternen: alle 36 m an jeder Straße, beide Seiten, auf dem Gehweg.
  const poles: BufferGeometry[] = [];
  const heads: BufferGeometry[] = [];
  const cones: BufferGeometry[] = [];
  const off = ROAD_W / 2 + 0.6;
  for (let line = 0; line <= GRID; line++) {
    for (let k = 18; k < WORLD; k += 36) {
      for (const side of [-1, 1]) {
        for (const axis of ['x', 'z'] as const) {
          const x = axis === 'x' ? k : line * PITCH + side * off;
          const z = axis === 'x' ? line * PITCH + side * off : k;
          if (axis === 'z' && (line === rc || line === rc + 1)) continue;
          const pole = new CylinderGeometry(0.08, 0.12, 7, 6);
          pole.translate(x, 3.5, z);
          poles.push(pole);
          const head = new BoxGeometry(0.5, 0.18, 0.9);
          head.translate(x - side * (axis === 'z' ? 0.7 : 0), 7, z - side * (axis === 'x' ? 0.7 : 0));
          heads.push(head);
          if (night) {
            const cone = new ConeGeometry(4, 7, 10, 1, true);
            cone.translate(x - side * (axis === 'z' ? 0.7 : 0), 3.5, z - side * (axis === 'x' ? 0.7 : 0));
            cones.push(cone);
          }
        }
      }
    }
  }
  if (poles.length) {
    root.add(new Mesh(mergeGeometries(poles), matte(0x3a3d42, 0.6)));
    root.add(new Mesh(mergeGeometries(heads), night ? glow(0xffe0a0, 2.2, 0xffe0a0) : matte(0xd0d2d6, 0.5)));
    if (cones.length) {
      const coneMat = new MeshBasicMaterial({
        color: 0xffd79a,
        transparent: true,
        opacity: 0.045,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2,
      });
      root.add(new Mesh(mergeGeometries(cones), coneMat));
    }
  }
}

// ---------------------------------------------------------------------------------------------- Wahrzeichen

function landmark(root: Group, cityId: string, phase: DayPhase): void {
  const dark = phase === 'night';
  const stone = matte(dark ? 0x2c2f3a : 0x8d8a82, 0.9);
  const glass = new MeshStandardMaterial({ color: dark ? 0x1c2436 : 0x6b8aa8, roughness: 0.2, metalness: 0.6 });
  const add = (m: Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    root.add(m);
  };
  const zFar = -320;
  const cx = WORLD / 2;
  switch (cityId) {
    case 'hamburg': {
      // Elbphilharmonie: Backstein-Sockel, Glas-Aufbau mit Wellen.
      add(new Mesh(new BoxGeometry(90, 40, 40), matte(dark ? 0x3a2622 : 0x8a4a3a, 0.9)), cx, 20, zFar);
      add(new Mesh(new BoxGeometry(92, 45, 42), glass), cx, 62, zFar);
      for (let k = 0; k < 5; k++) add(new Mesh(new SphereGeometry(12, 12, 8), glass), cx - 36 + k * 18, 85, zFar);
      // Michel.
      add(new Mesh(new CylinderGeometry(6, 8, 100, 10), stone), cx - 200, 50, zFar - 60);
      add(new Mesh(new SphereGeometry(8, 10, 8), glass), cx - 200, 104, zFar - 60);
      break;
    }
    case 'berlin': {
      // Fernsehturm: Schaft, Kugel, Antenne.
      add(new Mesh(new CylinderGeometry(5, 9, 200, 12), stone), cx, 100, zFar);
      add(new Mesh(new SphereGeometry(18, 16, 12), glass), cx, 210, zFar);
      add(new Mesh(new CylinderGeometry(1.5, 2.5, 90, 8), stone), cx, 270, zFar);
      // Brandenburger Tor (klein, weit).
      for (let k = 0; k < 6; k++) add(new Mesh(new BoxGeometry(5, 24, 8), stone), cx + 150 + k * 10, 12, zFar - 40);
      add(new Mesh(new BoxGeometry(60, 6, 10), stone), cx + 175, 27, zFar - 40);
      break;
    }
    case 'muenchen': {
      // Frauenkirche: zwei Türme mit Hauben, Langhaus.
      add(new Mesh(new BoxGeometry(70, 45, 30), matte(dark ? 0x3a2a24 : 0x9a5a40, 0.9)), cx, 22, zFar);
      for (const side of [-1, 1]) {
        add(
          new Mesh(new CylinderGeometry(9, 9, 90, 10), matte(dark ? 0x3a2a24 : 0x9a5a40, 0.9)),
          cx + side * 28,
          45,
          zFar,
        );
        add(new Mesh(new SphereGeometry(10, 12, 8), matte(dark ? 0x1d3a2e : 0x3f8a6a, 0.6)), cx + side * 28, 92, zFar);
      }
      // Olympiaturm.
      add(new Mesh(new CylinderGeometry(4, 7, 180, 10), stone), cx - 220, 90, zFar - 40);
      add(new Mesh(new CylinderGeometry(14, 10, 14, 12), glass), cx - 220, 165, zFar - 40);
      break;
    }
    case 'frankfurt': {
      // Bankentürme.
      const towers: [number, number, number][] = [
        [-120, 230, 40],
        [-50, 180, 34],
        [20, 260, 44],
        [95, 200, 36],
        [170, 150, 30],
      ];
      for (const [dx, h, w] of towers) add(new Mesh(new BoxGeometry(w, h, w), glass), cx + dx, h / 2, zFar - 20);
      break;
    }
    default: {
      // Köln: Dom (zwei Türme mit Spitzen, Langhaus), Colonius, Kranhäuser.
      add(new Mesh(new BoxGeometry(100, 50, 40), stone), cx, 25, zFar);
      for (const side of [-1, 1]) {
        add(new Mesh(new BoxGeometry(18, 110, 18), stone), cx + side * 36, 55, zFar);
        add(new Mesh(new ConeGeometry(11, 55, 4), stone), cx + side * 36, 137, zFar);
      }
      add(new Mesh(new CylinderGeometry(4, 6, 220, 10), stone), cx - 260, 110, zFar - 60);
      add(new Mesh(new CylinderGeometry(16, 12, 14, 14), glass), cx - 260, 170, zFar - 60);
      for (let k = 0; k < 3; k++) {
        add(new Mesh(new BoxGeometry(20, 60, 18), glass), cx + 200 + k * 40, 30, zFar);
        add(new Mesh(new BoxGeometry(50, 15, 18), glass), cx + 215 + k * 40, 52, zFar);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------- Szene

interface CarEntry {
  parts: CarParts;
  heading: number;
}

interface Spark {
  points: Points;
  vel: Float32Array;
  life: number;
}

export interface ChaseScene {
  /** Pro Bild: Wagen, Kamera, Licht, Effekte nachführen (dt echte Sekunden). */
  update(state: ChaseState, dt: number, input: { steer: number }): void;
  render(stage: Stage3d): void;
  resize(width: number, height: number): void;
  /** Kamera wackeln lassen (Treffer), Stärke 0 bis 1. */
  shake(power: number): void;
  /** Funken an einer Stelle. */
  sparks(x: number, z: number, power: number): void;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);

export function createChaseScene(setup: ChaseSetup, options: SceneOptions): ChaseScene {
  const { phase, rain, reduced } = options;
  const night = phase === 'night';
  const scene = new Scene();
  const camera = new PerspectiveCamera(64, 16 / 9, 0.3, 900);
  const sun: DirectionalLight = lightScene(scene, phase, {
    fogNear: rain ? 40 : 60,
    fogFar: rain ? (night ? 220 : 380) : night ? 300 : 520,
  });
  const world = new Group();
  scene.add(world);

  // Boden.
  const tile = roadTile(night);
  tile.repeat.set(GRID + 2, GRID + 2);
  const ground = new Mesh(
    new PlaneGeometry(WORLD + 2 * PITCH, WORLD + 2 * PITCH),
    new MeshStandardMaterial({
      map: tile,
      roughness: rain ? 0.3 : 0.92,
      metalness: rain ? 0.25 : 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD / 2, 0, WORLD / 2);
  ground.receiveShadow = true;
  world.add(ground);

  buildCity(setup, phase, world);
  landmark(world, options.cityId, phase);

  // Himmel: Sterne und Mond bzw. Sonne.
  if (night) {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.5 + 0.08;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 800;
      pos[i * 3 + 1] = Math.sin(e) * 800;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 800;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const stars = new Points(g, new PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false }));
    scene.add(stars);
    const moon = new Mesh(new SphereGeometry(14, 16, 12), glow(0xfff4dc, 2, 0xfff4dc));
    moon.position.set(WORLD / 2 + 300, 260, -600);
    scene.add(moon);
  } else if (phase === 'dusk') {
    const sunDisc = new Mesh(new SphereGeometry(26, 16, 12), glow(0xffb070, 3, 0xffb070));
    sunDisc.position.set(-400, 90, WORLD / 2 - 200);
    scene.add(sunDisc);
  }

  // Deine Karre mit Scheinwerfern.
  const player = buildCar('player', PLAYER_COLOR);
  const playerGroup = player.group;
  world.add(playerGroup);
  const headlights: SpotLight[] = [];
  for (const side of [-1, 1]) {
    const light = new SpotLight(0xfff1d0, night ? 420 : phase === 'dusk' ? 140 : 0, 90, 0.52, 0.7, 1.4);
    light.position.set(side * 0.7, 0.9, -2.2);
    light.target.position.set(side * 1.2, 0.2, -40);
    playerGroup.add(light);
    playerGroup.add(light.target);
    headlights.push(light);
  }
  // Weiches Licht über deiner Karre, damit der Lack auch nachts Kanten zeigt.
  const fill = new PointLight(0xdce6ff, night ? 26 : 10, 16, 1.5);
  fill.position.set(0, 3.2, 1.5);
  playerGroup.add(fill);
  // Rückfahr- und Bremslicht: Punktlicht hinter dem Wagen (rot), nur nachts.
  const tail = new SpotLight(0xff3020, 0, 14, 1.1, 0.8, 1.2);
  tail.position.set(0, 0.8, 2.3);
  tail.target.position.set(0, 0, 10);
  playerGroup.add(tail);
  playerGroup.add(tail.target);

  const traffic = new Map<number, CarEntry>();
  const cops = new Map<number, CarEntry>();
  const blocks = new Map<number, Group>();
  let hideoutGroup: Group | null = null;
  let hideoutRef: Hideout | null = null;
  const sparks: Spark[] = [];

  // Regen: Striche um die Kamera.
  let rainLines: LineSegments | null = null;
  let rainPos: Float32Array | null = null;
  if (rain) {
    const n = reduced ? 150 : 420;
    rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      rainPos[i * 6] = (Math.random() - 0.5) * 36;
      rainPos[i * 6 + 1] = Math.random() * 24;
      rainPos[i * 6 + 2] = (Math.random() - 0.5) * 36;
      rainPos[i * 6 + 3] = rainPos[i * 6];
      rainPos[i * 6 + 4] = rainPos[i * 6 + 1] - 0.9;
      rainPos[i * 6 + 5] = rainPos[i * 6 + 2];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(rainPos, 3));
    rainLines = new LineSegments(
      g,
      new LineBasicMaterial({ color: 0xbfd0e8, transparent: true, opacity: 0.35, fog: false }),
    );
    scene.add(rainLines);
  }

  // Nachbearbeitung: Bloom für Lichter und Fenster.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let lastRenderer: Stage3d['renderer'] | null = null;
  const ensureComposer = (stage: Stage3d) => {
    if (composer && lastRenderer === stage.renderer) return composer;
    composer?.dispose();
    lastRenderer = stage.renderer;
    composer = new EffectComposer(stage.renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(stage.width, stage.height), night ? 0.55 : 0.3, 0.5, night ? 0.6 : 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(stage.dpr);
    composer.setSize(stage.width, stage.height);
    return composer;
  };

  // Kamera-Zustand.
  const cam = { x: setup.start.x, y: 4, z: setup.start.z + 10, shake: 0, fov: 64, t: 0 };
  const look = new Vector3();
  const tmp = new Vector3();

  const carFor = (map: Map<number, CarEntry>, id: number, make: () => CarParts): CarEntry => {
    let e = map.get(id);
    if (!e) {
      e = { parts: make(), heading: 0 };
      map.set(id, e);
      world.add(e.parts.group);
    }
    return e;
  };
  const dropMissing = (map: Map<number, CarEntry>, alive: Set<number>) => {
    for (const [id, e] of map) {
      if (alive.has(id)) continue;
      world.remove(e.parts.group);
      disposeObject(e.parts.group);
      map.delete(id);
    }
  };

  const barrierMat = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 32;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#e8e8e0';
      g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#d42a1a';
      for (let k = 0; k < 4; k++) g.fillRect(k * 32, 0, 16, 32);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    return new MeshStandardMaterial({ map: t, roughness: 0.6 });
  })();

  const buildBlock = (b: ChaseState['blocks'][number]): Group => {
    const g = new Group();
    for (const w of b.walls) {
      const len = b.axis === 'x' ? w.z1 - w.z0 : w.x1 - w.x0;
      const bar = new Mesh(new BoxGeometry(b.axis === 'x' ? 0.3 : len, 0.5, b.axis === 'x' ? len : 0.3), barrierMat);
      bar.position.set((w.x0 + w.x1) / 2, 0.9, (w.z0 + w.z1) / 2);
      g.add(bar);
      for (const end of [-1, 1]) {
        const foot = new Mesh(new BoxGeometry(0.5, 1.1, 0.5), matte(0x2a2c30, 0.6));
        foot.position.set(
          (w.x0 + w.x1) / 2 + (b.axis === 'x' ? 0 : end * (len / 2 - 0.4)),
          0.55,
          (w.z0 + w.z1) / 2 + (b.axis === 'x' ? end * (len / 2 - 0.4) : 0),
        );
        g.add(foot);
      }
      // Streifenwagen hinter der Sperre, quer.
      const car = buildCar('police', 0xffffff);
      const back = b.dir * 4;
      car.group.position.set(
        (w.x0 + w.x1) / 2 + (b.axis === 'x' ? back : 0),
        0,
        (w.z0 + w.z1) / 2 + (b.axis === 'x' ? 0 : back),
      );
      car.group.rotation.y = b.axis === 'x' ? 0 : Math.PI / 2;
      car.group.userData.parts = car;
      g.add(car.group);
    }
    return g;
  };

  const buildHideout = (h: Hideout): Group => {
    const g = new Group();
    // Einfahrt: dunkle Öffnung mit Goldrahmen und Lichtsäule.
    const frame = new Mesh(new BoxGeometry(7, 4.2, 0.4), glow(0xe0b24a, 1.8, 0xc9a23c));
    frame.position.y = 2.1;
    g.add(frame);
    const hole = new Mesh(new BoxGeometry(6, 3.6, 0.5), matte(0x050608, 1));
    hole.position.set(0, 1.8, 0.05);
    g.add(hole);
    const beam = new Mesh(
      new CylinderGeometry(2.2, 3.2, 60, 16, 1, true),
      new MeshBasicMaterial({
        color: 0xe0b24a,
        transparent: true,
        opacity: 0.12,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2,
      }),
    );
    beam.position.y = 30;
    g.add(beam);
    const sign = new Mesh(new BoxGeometry(1.6, 1.6, 0.2), glow(0x3a7bff, 2.5, 0x1a3bff));
    sign.position.set(0, 5.2, 0);
    g.add(sign);
    g.position.set(h.x, 0, h.z);
    // Öffnung zeigt zur Straße: heading ist die Richtung von der Einfahrt zur Straße.
    g.rotation.y = -h.heading + Math.PI;
    return g;
  };

  const spawnSparks = (x: number, z: number, power: number) => {
    if (reduced) return;
    const n = 20 + Math.round(power * 30);
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = 0.5;
      pos[i * 3 + 2] = z;
      vel[i * 3] = (Math.random() - 0.5) * 14;
      vel[i * 3 + 1] = Math.random() * 8 + 2;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const points = new Points(
      g,
      new PointsMaterial({ color: 0xffc070, size: 0.18, transparent: true, opacity: 1, blending: AdditiveBlending }),
    );
    world.add(points);
    sparks.push({ points, vel, life: 0.7 });
  };

  const update = (state: ChaseState, dt: number, input: { steer: number }) => {
    cam.t += dt;
    const p = state.player;
    // Deine Karre: Lage, Nase, Rollen in Kurven, Nicken beim Bremsen und Gas, Beulen bei Schaden.
    playerGroup.position.set(p.x, 0, p.z);
    playerGroup.rotation.y = -p.heading;
    playerGroup.rotation.z = -p.steer * 0.07 * Math.min(1, Math.abs(p.v) / 20);
    playerGroup.rotation.x = p.braking ? -0.02 : p.turboOn ? 0.025 : 0;
    const dent = 1 - p.damage * 0.08;
    player.body.scale.set(1, dent, 1);
    spinWheels(player, dt, p.v, -p.steer * 0.45);
    player.rear.emissiveIntensity = p.braking ? 4 : 1.2;
    tail.intensity = night && p.braking ? 60 : 0;
    const speedF = Math.min(1, Math.abs(p.v) / TOP_SPEED);

    // Verkehr.
    const aliveT = new Set<number>();
    for (const v of state.traffic) {
      aliveT.add(v.id);
      const e = carFor(traffic, v.id, () => buildCar(v.kind, TRAFFIC_COLORS[v.color % TRAFFIC_COLORS.length]));
      // Nase folgt weich (an Kreuzungen springt die Richtung im Modell).
      let diff = v.heading - e.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      e.heading += diff * Math.min(1, 7 * dt);
      e.parts.group.position.set(v.x, 0, v.z);
      e.parts.group.rotation.y = -e.heading;
      e.parts.rear.emissiveIntensity = v.braking || v.pushed > 0 ? 3.5 : 1;
      e.parts.front.emissiveIntensity = night ? 2 : 0.4;
      spinWheels(e.parts, dt, v.v);
    }
    dropMissing(traffic, aliveT);

    // Streifen.
    const aliveC = new Set<number>();
    for (const c of state.cops) {
      if (!c.active) continue;
      aliveC.add(c.id);
      const e = carFor(cops, c.id, () => buildCar('police', 0xffffff));
      e.parts.group.position.set(c.x, 0, c.z);
      e.parts.group.rotation.y = -c.heading;
      setBlueLight(e.parts, cam.t + c.id * 0.37, c.state === 'wrecked' ? 0.3 : 1);
      e.parts.body.rotation.z = c.state === 'wrecked' ? 0.12 : 0;
      e.parts.front.emissiveIntensity = night ? 2 : 0.4;
      spinWheels(e.parts, dt, c.v);
    }
    dropMissing(cops, aliveC);

    // Sperren.
    const aliveB = new Set<number>();
    for (const b of state.blocks) {
      aliveB.add(b.id);
      let g = blocks.get(b.id);
      if (!g) {
        g = buildBlock(b);
        blocks.set(b.id, g);
        world.add(g);
      }
      g.traverse((o) => {
        const parts = o.userData.parts as CarParts | undefined;
        if (parts) setBlueLight(parts, cam.t + b.id * 0.5, 1);
      });
    }
    for (const [id, g] of blocks) {
      if (aliveB.has(id)) continue;
      world.remove(g);
      disposeObject(g);
      blocks.delete(id);
    }

    // Tiefgarage.
    if (state.hideout !== hideoutRef) {
      if (hideoutGroup) {
        world.remove(hideoutGroup);
        disposeObject(hideoutGroup);
        hideoutGroup = null;
      }
      hideoutRef = state.hideout;
      if (hideoutRef) {
        hideoutGroup = buildHideout(hideoutRef);
        world.add(hideoutGroup);
      }
    }
    if (hideoutGroup) {
      const pulse = 0.85 + 0.15 * Math.sin(cam.t * 6);
      hideoutGroup.scale.set(pulse, 1, pulse);
    }

    // Funken.
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k];
      s.life -= dt;
      if (s.life <= 0) {
        world.remove(s.points);
        s.points.geometry.dispose();
        (s.points.material as PointsMaterial).dispose();
        sparks.splice(k, 1);
        continue;
      }
      const pos = s.points.geometry.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        s.vel[i * 3 + 1] -= 20 * dt;
        pos.setXYZ(
          i,
          pos.getX(i) + s.vel[i * 3] * dt,
          Math.max(0.05, pos.getY(i) + s.vel[i * 3 + 1] * dt),
          pos.getZ(i) + s.vel[i * 3 + 2] * dt,
        );
      }
      pos.needsUpdate = true;
      (s.points.material as PointsMaterial).opacity = s.life / 0.7;
    }

    // Kamera: hinter dem Wagen, zieht nach; weiter weg und flacher mit Tempo; Blickwinkel weitet sich beim Turbo.
    const f = forward(p.heading);
    const back = 8.5 + 3.5 * speedF;
    const height = 3.6 + 1.2 * speedF;
    const ended = state.end;
    const wantX = p.x - f.x * back + (ended === 'escaped' ? -f.x * 4 : 0);
    const wantZ = p.z - f.z * back + (ended === 'escaped' ? -f.z * 4 : 0);
    const wantY = ended ? height + 3 : height;
    const k = Math.min(1, (ended ? 2 : 6) * dt);
    cam.x += (wantX - cam.x) * k;
    cam.z += (wantZ - cam.z) * k;
    cam.y += (wantY - cam.y) * k;
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const sh = reduced ? 0 : cam.shake * 0.35;
    camera.position.set(
      cam.x + (Math.random() - 0.5) * sh,
      cam.y + (Math.random() - 0.5) * sh,
      cam.z + (Math.random() - 0.5) * sh,
    );
    look.set(p.x + f.x * 7, 1 + (ended ? 0 : 0.2), p.z + f.z * 7);
    camera.up.copy(UP);
    camera.lookAt(look);
    // Rollen in Kurven (Kamera neigt sich leicht mit).
    camera.rotateZ(-input.steer * 0.025 * speedF);
    const wantFov = reduced ? 64 : 62 + 12 * speedF + (p.turboOn ? 9 : 0);
    cam.fov += (wantFov - cam.fov) * Math.min(1, 4 * dt);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    // Sonne und Schattenfenster folgen dir.
    tmp.set(p.x, 0, p.z);
    sun.target.position.copy(tmp);
    sun.position.set(
      tmp.x + (phase === 'dusk' ? -60 : 40),
      phase === 'dusk' ? 25 : 80,
      tmp.z + (phase === 'dusk' ? 20 : -30),
    );
    // Regen um die Kamera.
    if (rainLines && rainPos) {
      rainLines.position.copy(camera.position);
      const geo = rainLines.geometry.getAttribute('position') as BufferAttribute;
      const fall = 26 * dt;
      for (let i = 0; i < rainPos.length; i += 6) {
        rainPos[i + 1] -= fall;
        rainPos[i + 4] -= fall;
        if (rainPos[i + 4] < -6) {
          rainPos[i + 1] += 24;
          rainPos[i + 4] += 24;
        }
      }
      geo.needsUpdate = true;
    }
    // Ende: Blaulicht-Wash bzw. Dunkel.
    if (ended === 'caught' && bloom) bloom.strength = Math.min(1.2, bloom.strength + dt * 0.4);
  };

  const render = (stage: Stage3d) => {
    if (reduced) {
      stage.renderer.render(scene, camera);
      return;
    }
    ensureComposer(stage).render();
  };

  const resize = (width: number, height: number) => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    composer?.setSize(width, height);
    bloom?.setSize(width, height);
  };

  const dispose = () => {
    composer?.dispose();
    disposeObject(scene);
    tile.dispose();
  };

  return {
    update,
    render,
    resize,
    shake: (power) => {
      cam.shake = Math.min(1, cam.shake + power);
    },
    sparks: spawnSparks,
    dispose,
  };
}

/** Himmelfarbe der Tageszeit als CSS (für Ränder außerhalb des Canvas). */
export function skyCss(phase: DayPhase): string {
  return `#${SKY[phase].sky.toString(16).padStart(6, '0')}`;
}
