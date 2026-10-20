// Gemeinsame 3D-Bausteine der Minispiele (Auftrag 47, three.js): Autos aus Grundformen mit Lack (Clearcoat), Räder,
// Scheinwerfer und Rücklichter, Streifenwagen mit Lichtbalken, Himmel und Licht nach Tageszeit, Blaulicht im Wechsel,
// Aufräumen. Alles stilisiert (Low-Poly mit PBR-Material), nichts wird geladen. Nur Optik: kein Einfluss auf die
// Simulation, Math.random ist hier erlaubt, wird aber nicht gebraucht (Formen sind fest).

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type DayPhase = 'day' | 'dusk' | 'night';

export type CarKind = 'car' | 'van' | 'truck' | 'police' | 'player';

/** Himmel, Nebel und Lichtstimmung je Tageszeit (als Hex, nur für three.js). */
export const SKY: Record<DayPhase, { sky: number; horizon: number; fog: number; sun: number; sunIntensity: number }> = {
  day: { sky: 0x7fb2e6, horizon: 0xcfe3f5, fog: 0xbfd3e6, sun: 0xfff2d6, sunIntensity: 2.4 },
  dusk: { sky: 0x2a2f6b, horizon: 0xe8884a, fog: 0x6a4a5a, sun: 0xffb070, sunIntensity: 0.9 },
  night: { sky: 0x05070f, horizon: 0x161b33, fog: 0x0b0e1c, sun: 0x8fa6ff, sunIntensity: 0.35 },
};

/** Tageszeit aus den params eines Minispiels (phase aus clock.dayPhase: 'day' | 'dusk' | 'night' | 'dawn' …). */
export function phaseOf(value: unknown): DayPhase {
  if (value === 'night') return 'night';
  if (value === 'dusk' || value === 'dawn' || value === 'evening') return 'dusk';
  return 'day';
}

/** Himmel, Nebel, Hemisphärenlicht und Sonne bzw. Mond in die Szene. Gibt die Sonne zurück (für Schatten). */
export function lightScene(
  scene: Scene,
  phase: DayPhase,
  options: { fogNear: number; fogFar: number },
): DirectionalLight {
  const s = SKY[phase];
  scene.background = new Color(s.sky);
  scene.fog = new Fog(s.fog, options.fogNear, options.fogFar);
  const hemi = new HemisphereLight(s.horizon, 0x202020, phase === 'night' ? 0.35 : 0.9);
  scene.add(hemi);
  const sun = new DirectionalLight(s.sun, s.sunIntensity);
  sun.position.set(phase === 'dusk' ? -60 : 40, phase === 'dusk' ? 25 : 80, phase === 'dusk' ? 20 : -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}

// ---------------------------------------------------------------------------------------------- Texturen

/** Fassade: 4 × 4 Fenster je Kachel (eine Kachel = 12 × 12 Meter). Zwei Texturen: Farbe und Leuchten (nachts). */
export function facadeTiles(): { map: CanvasTexture; emissive: CanvasTexture } {
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

// ---------------------------------------------------------------------------------------------- Materialien

/** Lack mit Klarlack-Schicht (Spiegelungen kommen aus dem Umgebungslicht und den Lichtern). */
export function paint(color: number, options: { metal?: number; rough?: number } = {}): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color,
    metalness: options.metal ?? 0.55,
    roughness: options.rough ?? 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
}

export function matte(color: number, rough = 0.85): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
}

/** Leuchtendes Teil (Scheinwerfer, Rücklicht, Lichtbalken, Fenster). */
export function glow(color: number, intensity = 1.5, base = 0x111111): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

const GLASS = new MeshPhysicalMaterial({
  color: 0x101822,
  metalness: 0.1,
  roughness: 0.08,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  transparent: true,
  opacity: 0.86,
});
const TIRE = matte(0x111214, 0.9);
const RIM = new MeshStandardMaterial({ color: 0xaab0b8, metalness: 0.9, roughness: 0.3 });
const CHROME = new MeshStandardMaterial({ color: 0xcfd4da, metalness: 1, roughness: 0.2 });

// ---------------------------------------------------------------------------------------------- Autos

/** Abmessungen je Art (Länge, Breite, Höhe der Karosserie in Metern). */
export const CAR_SIZE: Record<CarKind, { length: number; width: number; height: number }> = {
  car: { length: 4.4, width: 1.85, height: 0.75 },
  van: { length: 5.2, width: 2.0, height: 1.0 },
  truck: { length: 8.5, width: 2.5, height: 1.2 },
  police: { length: 4.7, width: 1.9, height: 0.75 },
  player: { length: 4.6, width: 1.95, height: 0.68 },
};

export interface CarParts {
  group: Group;
  /** Rücklichter (heller beim Bremsen). */
  rear: MeshStandardMaterial;
  /** Scheinwerfer. */
  front: MeshStandardMaterial;
  /** Lichtbalken (Streife), sonst null. */
  bar: { blue: MeshStandardMaterial; red: MeshStandardMaterial; light: PointLight } | null;
  wheels: Mesh[];
  /** Karosserie (für Beulen: Skalierung). */
  body: Mesh;
}

function wheel(radius: number, width: number): Mesh {
  const tire = new Mesh(new CylinderGeometry(radius, radius, width, 18), TIRE);
  tire.rotation.z = Math.PI / 2;
  const rim = new Mesh(new CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 12), RIM);
  rim.rotation.z = Math.PI / 2;
  tire.add(rim);
  tire.castShadow = true;
  return tire;
}

/**
 * Ein Auto aus Grundformen, Nase in −z (fährt „nach vorn“ entlang −z, wie die Kamera von three.js schaut). Ursprung
 * am Boden in der Mitte des Wagens.
 */
export function buildCar(kind: CarKind, color: number, options: { merged?: boolean } = {}): CarParts {
  const g = new Group();
  const size = CAR_SIZE[kind];
  const { length: L, width: W, height: H } = size;
  const wheelR = kind === 'truck' ? 0.5 : 0.34;
  const base = wheelR; // Unterkante der Karosserie
  const bodyMat = kind === 'police' ? paint(0xe8ecef, { metal: 0.2, rough: 0.3 }) : paint(color);
  const body = new Mesh(new BoxGeometry(W, H, L), bodyMat);
  body.position.y = base + H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Kabine bzw. Aufbau.
  if (kind === 'truck') {
    const cab = new Mesh(new BoxGeometry(W, 1.3, 2.2), bodyMat);
    cab.position.set(0, base + H + 0.65, -L / 2 + 1.1);
    cab.castShadow = true;
    g.add(cab);
    const win = new Mesh(new BoxGeometry(W * 0.92, 0.7, 0.06), GLASS);
    win.position.set(0, base + H + 0.8, -L / 2 + 0.02);
    g.add(win);
    const box = new Mesh(new BoxGeometry(W, 2.4, L - 2.6), matte(0xd8d6cf, 0.7));
    box.position.set(0, base + H + 1.2, 1.3);
    box.castShadow = true;
    g.add(box);
  } else if (kind === 'van') {
    const cab = new Mesh(new BoxGeometry(W * 0.96, 1.1, L * 0.8), bodyMat);
    cab.position.set(0, base + H + 0.55, L * 0.08);
    cab.castShadow = true;
    g.add(cab);
    const win = new Mesh(new BoxGeometry(W * 0.9, 0.55, L * 0.5), GLASS);
    win.position.set(0, base + H + 0.75, -L * 0.1);
    g.add(win);
  } else {
    const cabL = kind === 'player' ? L * 0.5 : L * 0.55;
    const cabH = kind === 'player' ? 0.5 : 0.6;
    const cab = new Mesh(new BoxGeometry(W * 0.88, cabH, cabL), GLASS);
    cab.position.set(0, base + H + cabH / 2, kind === 'player' ? 0.25 : 0.1);
    g.add(cab);
    const roof = new Mesh(new BoxGeometry(W * 0.84, 0.06, cabL * 0.75), bodyMat);
    roof.position.set(0, base + H + cabH + 0.03, cab.position.z + 0.05);
    g.add(roof);
    if (kind === 'player') {
      // Goldstreifen über die Mitte und ein Spoiler.
      const stripe = new Mesh(new BoxGeometry(0.22, 0.012, L), glow(0xe0b24a, 0.25, 0xc9a23c));
      stripe.position.set(0, base + H + 0.01, 0);
      g.add(stripe);
      const stripe2 = new Mesh(new BoxGeometry(0.22, 0.012, cabL * 0.75), glow(0xe0b24a, 0.25, 0xc9a23c));
      stripe2.position.set(0, roof.position.y + 0.04, roof.position.z);
      g.add(stripe2);
      const spoiler = new Mesh(new BoxGeometry(W * 0.9, 0.05, 0.3), bodyMat);
      spoiler.position.set(0, base + H + 0.3, L / 2 - 0.2);
      g.add(spoiler);
      for (const side of [-1, 1]) {
        const foot = new Mesh(new BoxGeometry(0.05, 0.3, 0.2), bodyMat);
        foot.position.set(side * W * 0.4, base + H + 0.15, L / 2 - 0.2);
        g.add(foot);
      }
    }
  }

  // Räder.
  const wheels: Mesh[] = [];
  const axleZ = kind === 'truck' ? [-L / 2 + 1.3, L / 2 - 1.4, L / 2 - 2.6] : [-L / 2 + 0.85, L / 2 - 0.85];
  for (const z of axleZ) {
    for (const side of [-1, 1]) {
      const w = wheel(wheelR, 0.24);
      w.position.set(side * (W / 2 - 0.02), wheelR, z);
      g.add(w);
      wheels.push(w);
    }
  }

  // Scheinwerfer vorn (−z), Rücklichter hinten (+z).
  const front = glow(0xfff4d0, kind === 'player' ? 2.5 : 1.6, 0xfff4d0);
  const rear = glow(0xff2a1a, 1.2, 0x5a0a06);
  for (const side of [-1, 1]) {
    const h = new Mesh(new BoxGeometry(0.34, 0.16, 0.06), front);
    h.position.set(side * (W / 2 - 0.3), base + H * 0.7, -L / 2 - 0.02);
    g.add(h);
    const r = new Mesh(new BoxGeometry(kind === 'player' ? 0.6 : 0.3, 0.12, 0.06), rear);
    r.position.set(side * (W / 2 - (kind === 'player' ? 0.45 : 0.28)), base + H * 0.72, L / 2 + 0.02);
    g.add(r);
  }
  if (kind === 'player') {
    // Leuchtband quer über das Heck und Doppelauspuff.
    const band = new Mesh(new BoxGeometry(W * 0.5, 0.06, 0.05), rear);
    band.position.set(0, base + H * 0.72, L / 2 + 0.02);
    g.add(band);
    for (const side of [-1, 1]) {
      const pipe = new Mesh(new CylinderGeometry(0.06, 0.06, 0.25, 10), CHROME);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * 0.4, base * 0.6, L / 2 + 0.05);
      g.add(pipe);
    }
  }

  // Stoßstangen und Spiegel.
  const bumperMat = matte(0x1a1c20, 0.6);
  for (const z of [-L / 2 + 0.05, L / 2 - 0.05]) {
    const b = new Mesh(new BoxGeometry(W + 0.04, 0.18, 0.2), bumperMat);
    b.position.set(0, base + 0.12, z);
    g.add(b);
  }
  if (kind !== 'truck') {
    for (const side of [-1, 1]) {
      const m = new Mesh(new BoxGeometry(0.18, 0.1, 0.12), bodyMat);
      m.position.set(side * (W / 2 + 0.08), base + H + 0.2, -L * 0.12);
      g.add(m);
    }
  }

  let bar: CarParts['bar'] = null;
  if (kind === 'police') {
    const blue = glow(0x3a7bff, 3, 0x0a1b4a);
    const red = glow(0xff3a2a, 0.2, 0x4a0a0a);
    const barBase = new Mesh(new BoxGeometry(1.2, 0.1, 0.3), matte(0x202326, 0.5));
    barBase.position.set(0, base + H + 0.6 + 0.05, 0.05);
    g.add(barBase);
    const left = new Mesh(new BoxGeometry(0.5, 0.14, 0.26), blue);
    left.position.set(-0.32, base + H + 0.6 + 0.17, 0.05);
    g.add(left);
    const right = new Mesh(new BoxGeometry(0.5, 0.14, 0.26), red);
    right.position.set(0.32, base + H + 0.6 + 0.17, 0.05);
    g.add(right);
    const light = new PointLight(0x3a7bff, 0, 26, 1.6);
    light.position.set(0, base + H + 1.2, 0);
    g.add(light);
    // Streifen an der Seite (grün-blau wie in NRW, Schrift fällt weg).
    const stripeMat = matte(0x1f3f8f, 0.5);
    for (const side of [-1, 1]) {
      const s = new Mesh(new BoxGeometry(0.02, 0.22, L * 0.8), stripeMat);
      s.position.set(side * (W / 2 + 0.005), base + H * 0.45, 0);
      g.add(s);
    }
    bar = { blue, red, light };
  }

  const parts: CarParts = { group: g, rear, front, bar, wheels, body };
  return options.merged ? mergeCar(parts) : parts;
}

/**
 * Blaulicht im Wechsel: links und rechts abwechselnd hell (Periode etwa 0,5 s), die Punktlampe folgt. on = Stärke
 * (0 aus, 1 voll).
 */
export function setBlueLight(car: CarParts, t: number, on: number): void {
  const bar = car.bar;
  if (!bar) return;
  const phase = (t * 2.2) % 1;
  const a = phase < 0.5 ? 1 : 0.15;
  const b = phase < 0.5 ? 0.15 : 1;
  bar.blue.emissiveIntensity = 0.3 + 3.5 * a * on;
  bar.red.emissiveIntensity = 0.2 + 3 * b * on;
  bar.light.intensity = (a > b ? 40 : 30) * on;
  bar.light.color.setHex(a > b ? 0x3a7bff : 0xff4a3a);
}

/** Räder drehen (v in m/s, Radius 0,34 m) und Vorderräder einschlagen. */
export function spinWheels(car: CarParts, dt: number, v: number, steerAngle = 0): void {
  const dAngle = (v * dt) / 0.34;
  for (const [i, w] of car.wheels.entries()) {
    w.rotation.x += dAngle;
    // Vorderräder (die ersten beiden) schlagen ein.
    if (i < 2) w.rotation.y = steerAngle;
  }
}

/** Alles unterhalb freigeben (Geometrie und Material), damit nichts im Grafikspeicher bleibt. */
export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(m)) for (const x of m) x.dispose();
    else m?.dispose();
  });
}

/** Kleine Kugel für Punktlichter, Tropfen o. ä. (geteilte Geometrie). */
export const SPHERE_8 = new SphereGeometry(1, 8, 6);

// ---------------------------------------------------------------------------------------------- Auftrag 48

/**
 * Umgebungslicht einer Stadt für Spiegelungen (Lack, Glas, nasser Asphalt): eine kleine Szene aus Grundformen
 * (Himmel mit Verlauf, Boden, Häuserkante am Horizont, nachts Fensterreihen und Laternen, tags die Sonne), mit dem
 * PMREMGenerator gefiltert. Als scene.environment gesetzt bekommen alle MeshStandard-/Physical-Materialien
 * Spiegelungen und weiches Umgebungslicht. Der Aufrufer gibt die Textur mit dispose() frei.
 */
export function cityEnvironment(renderer: WebGLRenderer, phase: DayPhase): Texture {
  const s = SKY[phase];
  const env = new Scene();
  // Himmel: Kugel innen mit Farbverlauf (Zenit → Horizont → Boden) über Eckpunktfarben.
  const sky = new SphereGeometry(50, 32, 16);
  const pos = sky.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const zenith = new Color(s.sky);
  const horizon = new Color(s.horizon);
  const ground = new Color(phase === 'night' ? 0x050608 : phase === 'dusk' ? 0x1a1418 : 0x3a3b3d);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    if (y >= 0) c.copy(horizon).lerp(zenith, Math.min(1, y * 1.6));
    else c.copy(horizon).lerp(ground, Math.min(1, -y * 6));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  sky.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const skyMat = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
  env.add(new Mesh(sky, skyMat));
  const disposables: { dispose(): void }[] = [sky, skyMat];
  const box = (w: number, h: number, d: number, color: number, intensity: number, x: number, y: number, z: number) => {
    const g = new BoxGeometry(w, h, d);
    const m = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity) });
    const mesh = new Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, y, 0);
    env.add(mesh);
    disposables.push(g, m);
  };
  // Häuserkante rundum (dunkle Blöcke), nachts mit Fensterreihen, dazu Laternen über der Straße.
  const night = phase !== 'day';
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + 0.2;
    const h = 6 + ((k * 37) % 11);
    const x = Math.cos(a) * 30;
    const z = Math.sin(a) * 30;
    box(9, h, 1, phase === 'day' ? 0x6f7276 : 0x0e1014, 1, x, h / 2 - 2, z);
    if (night) {
      for (let r = 0; r < 4; r++) {
        for (let q = 0; q < 3; q++) {
          if ((k * 7 + r * 3 + q) % 5 < 2) continue;
          const warm = (k + r + q) % 4 !== 0;
          const ox = Math.cos(a + Math.PI / 2) * (q - 1) * 2.4;
          const oz = Math.sin(a + Math.PI / 2) * (q - 1) * 2.4;
          box(
            1.2,
            0.9,
            0.2,
            warm ? 0xffc27a : 0xbcd4ff,
            phase === 'night' ? 3 : 1.4,
            x * 0.97 + ox,
            r * 2 + 0.5,
            z * 0.97 + oz,
          );
        }
      }
    }
  }
  if (night) {
    for (let k = -3; k <= 3; k++) box(0.6, 0.2, 2.2, 0xffd9a0, 6, k * 7, 9, 0);
  } else {
    // Sonne: helle Scheibe, dazu helle Wolkenbänder.
    box(6, 6, 1, 0xffffff, 8, 25, 30, -20);
    box(30, 2, 1, 0xffffff, 1.2, -10, 22, -38);
  }
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.04);
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return target.texture;
}

/** Autos aus wenigen Teilen: alle festen Teile mit gleichem Material zu einer Geometrie (weniger Draw Calls). */
export function mergeCar(parts: CarParts): CarParts {
  const g = parts.group;
  const byMat = new Map<Material, Mesh[]>();
  for (const child of [...g.children]) {
    const mesh = child as Mesh;
    if (!mesh.isMesh || parts.wheels.includes(mesh) || mesh.children.length > 0) continue;
    const mat = mesh.material as Material;
    const list = byMat.get(mat) ?? [];
    list.push(mesh);
    byMat.set(mat, list);
  }
  let body = parts.body;
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrix);
      for (const name of Object.keys(geo.attributes))
        if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      return geo;
    });
    const merged = mergeGeometries(geos);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, mat);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    for (const m of meshes) {
      g.remove(m);
      m.geometry.dispose();
    }
    g.add(mesh);
    if (meshes.includes(parts.body)) body = mesh;
  }
  // Räder: je Achse beide Räder (Reifen dunkel, Felge hell als Eckpunktfarben) in einem Teil, das sich um die Achse
  // dreht. Gelenkt wird hier nicht (Verkehr, Streifen); spinWheels dreht die Achsen wie Räder.
  const axles = new Map<number, Mesh[]>();
  for (const w of parts.wheels) {
    const list = axles.get(w.position.z) ?? [];
    list.push(w);
    axles.set(w.position.z, list);
  }
  const wheels: Mesh[] = [];
  for (const [z, list] of axles) {
    const geos: BufferGeometry[] = [];
    for (const w of list) {
      for (const [part, color] of [[w, 0x111214], ...w.children.map((c) => [c as Mesh, 0x9aa0a8] as const)] as const) {
        part.updateMatrix();
        const geo = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        // Die Felge (Kind des Reifens) liegt wie der Reifen auf der Achse: nur die Lage des Reifens zählt.
        const local = w.matrix.clone();
        local.elements[13] = 0; // Höhe der Achse
        local.elements[14] = 0;
        geo.applyMatrix4(local);
        for (const name of Object.keys(geo.attributes))
          if (!['position', 'normal'].includes(name)) geo.deleteAttribute(name);
        const c = new Color(color);
        const col = new Float32Array(geo.getAttribute('position').count * 3);
        for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
        geo.setAttribute('color', new Float32BufferAttribute(col, 3));
        geos.push(geo);
      }
      g.remove(w);
      w.geometry.dispose();
      for (const c of w.children) (c as Mesh).geometry?.dispose();
    }
    const merged = mergeGeometries(geos);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    const axle = new Mesh(merged, WHEEL_PAINT);
    axle.position.set(0, list[0].position.y, z);
    axle.castShadow = true;
    g.add(axle);
    wheels.push(axle);
  }
  return { ...parts, body, wheels };
}

/** Räder zusammengeführter Autos: Farbe aus den Eckpunkten (Reifen dunkel, Felge hell). */
const WHEEL_PAINT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });

/** Kennzeichen als Textur (Euro-Feld, schwarze Schrift auf Weiß). */
function plateTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 56;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#f4f4ee';
    g.fillRect(0, 0, 256, 56);
    g.fillStyle = '#1d3f9a';
    g.fillRect(0, 0, 30, 56);
    g.fillStyle = '#e8c33a';
    g.beginPath();
    g.arc(15, 18, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 38px "DIN Alternate", "Barlow Condensed", Arial, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(text, 40, 30);
    g.strokeStyle = '#111';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 253, 53);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Felge mit fünf Doppelspeichen als Textur (für die Scheibe auf der Radseite). */
function rimTexture(): CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (g) {
    const m = S / 2;
    g.fillStyle = '#0b0c0e';
    g.fillRect(0, 0, S, S);
    const grad = g.createRadialGradient(m, m, 4, m, m, m * 0.8);
    grad.addColorStop(0, '#d8dde3');
    grad.addColorStop(1, '#6a7078');
    g.fillStyle = '#16181b';
    g.beginPath();
    g.arc(m, m, m * 0.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = grad;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + (k % 2 ? 0.1 : -0.1);
      g.save();
      g.translate(m, m);
      g.rotate(a);
      g.fillRect(-3, 0, 6, m * 0.78);
      g.restore();
    }
    g.beginPath();
    g.arc(m, m, m * 0.8, 0, Math.PI * 2);
    g.lineWidth = 5;
    g.strokeStyle = '#a9b0b8';
    g.stroke();
    g.fillStyle = '#c9ced4';
    g.beginPath();
    g.arc(m, m, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c4271c';
    g.fillRect(m - m * 0.62, m - 8, 12, 16); // Bremssattel
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface HeroCar extends CarParts {
  /** Flammen aus dem Auspuff (Turbo), unsichtbar bis zum Zünden. */
  flames: Mesh[];
  /** Rückfahrlicht. */
  reverse: MeshStandardMaterial;
}

/** Profil an der Oberkante verjüngen (Schultern, schmalere Kabine). */
function taper(geo: BufferGeometry, from: number, to: number, factor: number): void {
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.min(1, Math.max(0, (y - from) / (to - from)));
    p.setX(i, p.getX(i) * (1 - (1 - factor) * t * t));
  }
  geo.computeVertexNormals();
}

/** Seitenprofil (u nach vorn, v nach oben) quer zur Fahrtrichtung extrudiert, Nase in −z, abgerundete Kanten. */
function profileBody(points: [number, number][], width: number, bevel: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [u, v] of points.slice(1)) shape.lineTo(u, v);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geo.rotateY(Math.PI / 2); // u → −z, Extrusion → +x
  geo.translate(-(width - 2 * bevel) / 2, 0, 0);
  return geo;
}

/**
 * Deine Karre (Auftrag 48): ein flaches, breites Coupé aus einem extrudierten Seitenprofil mit runden Kanten,
 * Kabine aus getöntem Glas mit Dach, breite Hüften hinten, Heck mit durchgehendem Leuchtband, Diffusor, vier
 * Endrohren, Kennzeichen und Spoilerlippe; Felgen mit Speichen und roten Bremssätteln. Lack mit Klarlack, glänzt mit
 * cityEnvironment. Gleiche Schnittstelle wie buildCar (CarParts), dazu Turbo-Flammen und Rückfahrlicht.
 */
export function buildHeroCar(options: { color: number; accent: number; plate: string }): HeroCar {
  const g = new Group();
  const W = 2.04;
  const wheelR = 0.37;
  const lacquer = new MeshPhysicalMaterial({
    color: options.color,
    metalness: 0.65,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
  });
  const accent = new MeshPhysicalMaterial({
    color: options.accent,
    metalness: 0.9,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const black = new MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.55, metalness: 0.2 });
  const glass = new MeshPhysicalMaterial({
    color: 0x0a0e14,
    metalness: 0.3,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
  });
  // Karosserie unten (u nach vorn): Nase, Haube, Gürtellinie, Entenbürzel, Heck.
  const lower: [number, number][] = [
    [2.24, 0.26],
    [2.32, 0.42],
    [2.22, 0.62],
    [1.6, 0.74],
    [0.95, 0.82],
    [0.42, 0.88],
    [-1.3, 0.92],
    [-1.9, 0.96],
    [-2.22, 1.0],
    [-2.3, 0.9],
    [-2.32, 0.5],
    [-2.22, 0.26],
  ];
  const bodyGeo = profileBody(lower, W, 0.07);
  taper(bodyGeo, 0.55, 1.02, 0.9);
  const body = new Mesh(bodyGeo, lacquer);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // Kabine: Glas, Fließheck, nach oben schmaler; Dach in Lack darüber.
  const cabin: [number, number][] = [
    [0.5, 0.86],
    [-0.3, 1.21],
    [-0.98, 1.23],
    [-1.75, 0.94],
  ];
  const cabinGeo = profileBody(cabin, W * 0.84, 0.05);
  taper(cabinGeo, 0.86, 1.24, 0.78);
  g.add(new Mesh(cabinGeo, glass));
  const roofGeo = profileBody(
    [
      [-0.26, 1.195],
      [-0.32, 1.24],
      [-0.98, 1.26],
      [-1.2, 1.21],
    ],
    W * 0.7,
    0.03,
  );
  g.add(new Mesh(roofGeo, lacquer));
  // Hüften über den Hinterrädern, flacher vorn.
  for (const side of [-1, 1]) {
    const hip = new Mesh(new SphereGeometry(1, 20, 12), lacquer);
    hip.scale.set(0.27, 0.32, 0.9);
    hip.position.set(side * (W / 2 - 0.06), 0.64, 1.35);
    hip.castShadow = true;
    g.add(hip);
    const front = new Mesh(new SphereGeometry(1, 16, 10), lacquer);
    front.scale.set(0.18, 0.24, 0.72);
    front.position.set(side * (W / 2 - 0.08), 0.6, -1.4);
    g.add(front);
    // Seitenschweller und Spiegel.
    const skirt = new Mesh(new BoxGeometry(0.08, 0.14, 2.3), black);
    skirt.position.set(side * (W / 2 - 0.02), 0.3, 0);
    g.add(skirt);
    const mirror = new Mesh(new BoxGeometry(0.2, 0.1, 0.14), lacquer);
    mirror.position.set(side * (W * 0.47), 0.98, 0.28);
    g.add(mirror);
  }
  // Streifen in Akzentfarbe über Haube, Dach und Heck (zwei Bänder).
  for (const side of [-1, 1]) {
    const x = side * 0.2;
    const stripe = (u0: number, v0: number, u1: number, v1: number) => {
      const len = Math.hypot(u1 - u0, v1 - v0);
      const m = new Mesh(new BoxGeometry(0.16, 0.01, len), accent);
      m.position.set(x, (v0 + v1) / 2 + 0.06, -(u0 + u1) / 2);
      m.rotation.x = -Math.atan2(v1 - v0, u0 - u1);
      g.add(m);
    };
    stripe(2.2, 0.62, 1.6, 0.74);
    stripe(1.6, 0.74, 0.95, 0.82);
    stripe(0.95, 0.82, 0.45, 0.88);
    stripe(-0.34, 1.24, -0.98, 1.26);
    stripe(-1.9, 0.96, -2.2, 1.0);
  }
  // Heck: Leuchtband, Rückleuchten, Kennzeichen, Diffusor, Endrohre.
  const rear = glow(0xff1e10, 1.4, 0x4a0604);
  const reverse = glow(0xf4f6ff, 0, 0x30333a);
  const zTail = 2.32;
  const band = new Mesh(new BoxGeometry(W * 0.86, 0.045, 0.04), rear);
  band.position.set(0, 0.86, zTail + 0.02);
  g.add(band);
  for (const side of [-1, 1]) {
    const lamp = new Mesh(new BoxGeometry(0.46, 0.13, 0.05), rear);
    lamp.position.set(side * 0.66, 0.77, zTail + 0.03);
    g.add(lamp);
    const rev = new Mesh(new BoxGeometry(0.12, 0.06, 0.05), reverse);
    rev.position.set(side * 0.3, 0.74, zTail + 0.04);
    g.add(rev);
  }
  const panel = new Mesh(new BoxGeometry(W * 0.62, 0.2, 0.04), black);
  panel.position.set(0, 0.62, zTail + 0.03);
  g.add(panel);
  const plate = new Mesh(
    new BoxGeometry(0.52, 0.115, 0.012),
    new MeshStandardMaterial({ map: plateTexture(options.plate), color: 0xb8b8b8, roughness: 0.6 }),
  );
  plate.position.set(0, 0.6, zTail + 0.06);
  g.add(plate);
  const diffuser = new Mesh(new BoxGeometry(W * 0.84, 0.16, 0.24), black);
  diffuser.position.set(0, 0.3, zTail - 0.06);
  g.add(diffuser);
  for (let k = -2; k <= 2; k++) {
    const fin = new Mesh(new BoxGeometry(0.02, 0.14, 0.26), black);
    fin.position.set(k * 0.18, 0.28, zTail - 0.02);
    g.add(fin);
  }
  const flames: Mesh[] = [];
  const pipeInner = new MeshBasicMaterial({ color: 0x050505 });
  for (const x of [-0.62, -0.48, 0.48, 0.62]) {
    const pipe = new Mesh(new CylinderGeometry(0.055, 0.055, 0.2, 14, 1, true), CHROME);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.3, zTail + 0.06);
    g.add(pipe);
    const inner = new Mesh(new CylinderGeometry(0.045, 0.045, 0.01, 12), pipeInner);
    inner.rotation.x = Math.PI / 2;
    inner.position.set(x, 0.3, zTail + 0.1);
    g.add(inner);
    const flame = new Mesh(
      new ConeGeometry(0.07, 0.6, 10, 1, true),
      new MeshBasicMaterial({
        color: 0x6aa8ff,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0.3, zTail + 0.42);
    flame.visible = false;
    g.add(flame);
    flames.push(flame);
  }
  // Front: schmale Scheinwerfer, Grill, Splitter.
  const front = glow(0xf6f8ff, 3, 0xe8eef8);
  for (const side of [-1, 1]) {
    const lamp = new Mesh(new BoxGeometry(0.46, 0.06, 0.08), front);
    lamp.position.set(side * 0.62, 0.6, -2.24);
    lamp.rotation.x = -0.35;
    g.add(lamp);
  }
  const grille = new Mesh(new BoxGeometry(W * 0.5, 0.14, 0.05), black);
  grille.position.set(0, 0.38, -2.31);
  g.add(grille);
  const splitter = new Mesh(new BoxGeometry(W * 0.9, 0.04, 0.2), black);
  splitter.position.set(0, 0.22, -2.2);
  g.add(splitter);
  // Räder: Reifen mit Felgenscheiben (Speichen, Bremssattel); Vorderräder zuerst (spinWheels lenkt die ersten zwei).
  const rimMat = new MeshStandardMaterial({ map: rimTexture(), metalness: 0.8, roughness: 0.35 });
  const tireMat = new MeshStandardMaterial({ color: 0x101113, roughness: 0.92 });
  const wheels: Mesh[] = [];
  for (const z of [-1.45, 1.38]) {
    for (const side of [-1, 1]) {
      const tire = new Mesh(new CylinderGeometry(wheelR, wheelR, 0.32, 24), tireMat);
      tire.rotation.order = 'YXZ';
      tire.rotation.z = Math.PI / 2;
      for (const face of [-1, 1]) {
        const disc = new Mesh(new CircleGeometry(wheelR * 0.86, 24), rimMat);
        disc.rotation.x = face > 0 ? -Math.PI / 2 : Math.PI / 2;
        disc.position.y = face * 0.162;
        tire.add(disc);
      }
      tire.position.set(side * (W / 2 - (z > 0 ? 0.02 : 0.1)), wheelR, z);
      tire.castShadow = true;
      g.add(tire);
      wheels.push(tire);
    }
  }
  return { group: g, rear, front, bar: null, wheels, body, flames, reverse };
}
