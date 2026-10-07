// Gemeinsame 3D-Bausteine der Minispiele (Auftrag 47, three.js): Autos aus Grundformen mit Lack (Clearcoat), Räder,
// Scheinwerfer und Rücklichter, Streifenwagen mit Lichtbalken, Himmel und Licht nach Tageszeit, Blaulicht im Wechsel,
// Aufräumen. Alles stilisiert (Low-Poly mit PBR-Material), nichts wird geladen. Nur Optik: kein Einfluss auf die
// Simulation, Math.random ist hier erlaubt, wird aber nicht gebraucht (Formen sind fest).

import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  type Scene,
  SphereGeometry,
} from 'three';

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
export function buildCar(kind: CarKind, color: number): CarParts {
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

  return { group: g, rear, front, bar, wheels, body };
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
