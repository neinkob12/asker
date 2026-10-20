// Szene der Verfolgungsjagd (Auftrag 47, neu gebaut in Auftrag 48, three.js): die Stadt aus city3d.ts, Himmel mit
// Verlauf und Umgebungslicht für Spiegelungen (cityEnvironment), deine Karre (buildHeroCar) mit Scheinwerferkegeln,
// Turbo-Flammen, Rauch und Bremsspuren, Verkehr und Streifen als zusammengeführte Wagen, Blaulicht über einen festen
// Satz Lampen (gleich viele Lichter, sonst kompiliert three.js bei jeder neuen Streife alle Shader neu), Spiegelungen
// der Lichter auf nasser Straße, Sperren, Tiefgarage, Kamera hinter dem Wagen (folgt der Fahrtrichtung, so sieht man
// den Drift), Blickwinkel und Tempo-Linien bei Tempo, Wackeln bei Treffern, Bloom und eine Linse (Radial-Unschärfe,
// Vignette, Körnung). Nur Optik: liest den Zustand, ändert ihn nie. Math.random nur für Optik.

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  type DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  buildCar,
  buildHeroCar,
  type CarParts,
  cityEnvironment,
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
import { buildCity3d, type City3d } from './city3d';
import {
  createParticles,
  createSkidMarks,
  createSpeedLines,
  createStreaks,
  DARK_SMOKE,
  DUST,
  LENS_SHADER,
  SMOKE,
  SPARK,
} from './effects';
import { type ChaseSetup, type ChaseState, forward, type Hideout, TOP_SPEED } from './model';

export interface SceneOptions {
  cityId: string;
  phase: DayPhase;
  rain: boolean;
  reduced: boolean;
  /** Volle Optik (Desktop): Schatten, feinere Texturen, mehr Partikel. */
  hi: boolean;
}

/** Farben der Verkehrswagen (Index aus dem Modell). */
const TRAFFIC_COLORS = [0xc8ccd2, 0x2a2f36, 0x8d1f1f, 0x1f3f7a, 0xd9c48a, 0x3a5a3a, 0x6b6f75, 0xe8e6e0];
const PLAYER_COLOR = 0x23272e;
const PLAYER_ACCENT = 0xc9a23c;
/** Kennzeichen je Stadt. */
const PLATES: Record<string, string> = {
  koeln: 'K TY 48',
  hamburg: 'HH TY 48',
  berlin: 'B TY 48',
  muenchen: 'M TY 48',
  frankfurt: 'F TY 48',
};
/** So viele Blaulicht-Lampen gibt es (die nächsten Streifen bzw. Sperren bekommen sie). */
const BLUE_LAMPS = 3;
/** Kamera: Abstand und Höhe hinter dem Wagen (langsam → schnell). */
const CAM_BACK: [number, number] = [5.6, 7.3];
const CAM_HEIGHT: [number, number] = [2.35, 2.0];
const FOV: [number, number] = [62, 76];
const FOV_TURBO = 10;

interface CarEntry {
  parts: CarParts;
  heading: number;
}

export interface ChaseScene {
  /** Pro Bild: Wagen, Kamera, Licht, Effekte nachführen (dt echte Sekunden). */
  update(state: ChaseState, dt: number): void;
  render(stage: Stage3d): void;
  resize(width: number, height: number): void;
  /** Kamera wackeln lassen (Treffer), Stärke 0 bis 1. */
  shake(power: number): void;
  /** Funken (und Staub) an einer Stelle. */
  sparks(x: number, z: number, power: number): void;
  /** Weltpunkt auf dem Bildschirm (0..1, y nach unten), behind = hinter der Kamera. */
  screenOf(x: number, y: number, z: number): { x: number; y: number; behind: boolean };
  /** Blickrichtung der Kamera (Heading wie im Modell). */
  viewHeading(): number;
  /** Zahlen für die Messung (Draw Calls, Dreiecke). */
  info(stage: Stage3d | null): Record<string, number>;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);

/** Himmel als Kugel mit Verlauf (Zenit → Horizont), ohne Nebel. */
function skyDome(phase: DayPhase): Mesh {
  const s = SKY[phase];
  const geo = new SphereGeometry(800, 32, 16);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const zenith = new Color(s.sky);
  const horizon = new Color(s.horizon);
  const fog = new Color(s.fog);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 800;
    if (y < 0.02) c.copy(fog);
    else if (y < 0.18) c.copy(fog).lerp(horizon, (y - 0.02) / 0.16);
    else c.copy(horizon).lerp(zenith, Math.min(1, (y - 0.18) / 0.5));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const mesh = new Mesh(
    geo,
    new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }),
  );
  mesh.renderOrder = -1;
  return mesh;
}

/** Rot-weiße Bake für die Sperren. */
function barrierTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ecece4';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#d42a1a';
    for (let k = -1; k < 5; k++) {
      g.beginPath();
      g.moveTo(k * 32, 32);
      g.lineTo(k * 32 + 16, 32);
      g.lineTo(k * 32 + 32, 0);
      g.lineTo(k * 32 + 16, 0);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  return t;
}

export function createChaseScene(setup: ChaseSetup, options: SceneOptions): ChaseScene {
  const { phase, rain, reduced, hi } = options;
  const night = phase === 'night';
  const dark = phase !== 'day';
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV[0], 16 / 9, 0.3, 1000);
  scene.add(camera);
  const fog = { near: rain ? 35 : 55, far: rain ? (night ? 210 : 330) : night ? 280 : 480 };
  const sun: DirectionalLight = lightScene(scene, phase, { fogNear: fog.near, fogFar: fog.far });
  scene.background = null;
  // Himmel und Sterne wandern mit der Kamera (sonst läge ein Teil hinter der Sichtweite und bliebe schwarz).
  const sky = new Group();
  sky.add(skyDome(phase));
  scene.add(sky);
  // Das Umgebungslicht übernimmt einen Teil des Hemisphärenlichts.
  for (const o of scene.children) if (o instanceof HemisphereLight) o.intensity *= 0.55;
  scene.environmentIntensity = night ? 0.55 : phase === 'dusk' ? 0.6 : 0.9;
  if (phase === 'day') sun.intensity *= 1.25;
  sun.castShadow = hi && !night;
  if (hi) {
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
  }

  const city: City3d = buildCity3d(setup, { cityId: options.cityId, phase, rain, hi, fog });
  scene.add(city.group);

  // Himmel: Sterne und Mond bzw. Abendsonne.
  if (night) {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.5 + 0.1;
      pos.set([Math.cos(a) * Math.cos(e) * 760, Math.sin(e) * 760, Math.sin(a) * Math.cos(e) * 760], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    sky.add(new Points(geo, new PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
    const moon = new Mesh(new SphereGeometry(14, 16, 12), glow(0xfff4dc, 2, 0xfff4dc));
    (moon.material as MeshStandardMaterial).fog = false;
    moon.position.set(300, 260, -560);
    sky.add(moon);
  } else if (phase === 'dusk') {
    const disc = new Mesh(new SphereGeometry(26, 16, 12), glow(0xffb070, 3, 0xffb070));
    (disc.material as MeshStandardMaterial).fog = false;
    disc.position.set(-600, 60, 180);
    sky.add(disc);
  }

  // ------------------------------------------------------------------ Deine Karre
  const player = buildHeroCar({
    color: PLAYER_COLOR,
    accent: PLAYER_ACCENT,
    plate: PLATES[options.cityId] ?? PLATES.koeln,
  });
  const playerGroup = player.group;
  scene.add(playerGroup);
  const headlights: SpotLight[] = [];
  for (const side of [-1, 1]) {
    const light = new SpotLight(0xfff1d8, night ? 520 : phase === 'dusk' ? 180 : 0, 95, 0.5, 0.65, 1.4);
    light.position.set(side * 0.62, 0.65, -2.3);
    light.target.position.set(side * 1.4, 0, -42);
    playerGroup.add(light);
    playerGroup.add(light.target);
    headlights.push(light);
  }
  // Weiches Licht über deiner Karre, damit der Lack auch nachts Kanten zeigt.
  const fill = new PointLight(0xdce6ff, night ? 7 : 3, 12, 1.6);
  fill.position.set(2.2, 2.6, -1.5);
  playerGroup.add(fill);

  // Licht von hinten (wie die Scheinwerfer der Verfolger): zeigt nachts Lack und Kanten deines Hecks.
  const rim = new SpotLight(0xc8d6ff, night ? 38 : phase === 'dusk' ? 18 : 0, 26, 0.32, 0.8, 1.2);
  scene.add(rim, rim.target);

  // ------------------------------------------------------------------ Blaulicht-Lampen (fester Satz)
  const blueLamps: PointLight[] = [];
  for (let k = 0; k < BLUE_LAMPS; k++) {
    const l = new PointLight(0x3a7bff, 0, 48, 1.4);
    l.position.set(-999, 3, -999);
    scene.add(l);
    blueLamps.push(l);
  }

  // ------------------------------------------------------------------ Effekte
  const smoke = createParticles(hi ? 320 : 160, false);
  const sparkFx = createParticles(hi ? 260 : 120, true);
  scene.add(smoke.points, sparkFx.points);
  const skids = createSkidMarks(hi ? 900 : 400);
  scene.add(skids.mesh);
  const speedLines = createSpeedLines(hi ? 70 : 36);
  camera.add(speedLines.lines);
  const carLights = createStreaks(120, fog, true);
  carLights.material.uniforms.intensity.value = rain ? 1.1 : night ? 0.45 : phase === 'dusk' ? 0.3 : 0.12;
  scene.add(carLights.mesh);

  const traffic = new Map<number, CarEntry>();
  const cops = new Map<number, CarEntry>();
  const blocks = new Map<number, Group>();
  let hideoutGroup: Group | null = null;
  let hideoutRef: Hideout | null = null;

  // Regen: Striche um die Kamera.
  let rainLines: LineSegments | null = null;
  let rainPos: Float32Array | null = null;
  let rainGeo: BufferGeometry | null = null;
  if (rain) {
    const n = reduced ? 150 : hi ? 600 : 260;
    rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 36;
      const y = Math.random() * 24;
      const z = (Math.random() - 0.5) * 36;
      rainPos.set([x, y, z, x + 0.05, y - 0.9, z], i * 6);
    }
    rainGeo = new BufferGeometry();
    rainGeo.setAttribute('position', new Float32BufferAttribute(rainPos, 3));
    rainLines = new LineSegments(
      rainGeo,
      new LineBasicMaterial({ color: 0xbfd0e8, transparent: true, opacity: 0.32, fog: false }),
    );
    scene.add(rainLines);
  }

  // ------------------------------------------------------------------ Nachbearbeitung
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let lens: ShaderPass | null = null;
  let lastRenderer: Stage3d['renderer'] | null = null;
  let envTex: Texture | null = null;
  const ensure = (stage: Stage3d) => {
    if (composer && lastRenderer === stage.renderer) return composer;
    composer?.dispose();
    envTex?.dispose();
    lastRenderer = stage.renderer;
    stage.renderer.shadowMap.enabled = hi && !night;
    envTex = cityEnvironment(stage.renderer, phase);
    scene.environment = envTex;
    composer = new EffectComposer(stage.renderer);
    composer.addPass(new RenderPass(scene, camera));
    const scale = hi ? 1 : 0.5;
    bloom = new UnrealBloomPass(
      new Vector2(stage.width * scale, stage.height * scale),
      night ? 0.55 : dark ? 0.4 : 0.22,
      0.5,
      night ? 0.72 : dark ? 0.8 : 0.92,
    );
    composer.addPass(bloom);
    lens = new ShaderPass(LENS_SHADER);
    lens.uniforms.uTaps.value = hi ? 7 : 3;
    lens.uniforms.uGrain.value = hi ? 0.03 : 0.02;
    composer.addPass(lens);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(stage.dpr);
    composer.setSize(stage.width, stage.height);
    particleScaleFor(stage.height);
    return composer;
  };
  const particleScaleFor = (height: number) => {
    smoke.setScale(height, camera.fov);
    sparkFx.setScale(height, camera.fov);
  };

  // ------------------------------------------------------------------ Kamera-Zustand
  const cam = {
    x: setup.start.x,
    y: 3,
    z: setup.start.z + 8,
    yaw: setup.start.heading,
    shake: 0,
    fov: FOV[0],
    t: 0,
    height: 600,
    roll: 0,
  };
  const look = new Vector3();
  const proj = new Vector3();

  const carFor = (map: Map<number, CarEntry>, id: number, make: () => CarParts): CarEntry => {
    let e = map.get(id);
    if (!e) {
      const parts = make();
      // Die Lampe am Lichtbalken übernimmt der feste Satz (blueLamps).
      parts.bar?.light.removeFromParent();
      e = { parts, heading: 0 };
      map.set(id, e);
      scene.add(e.parts.group);
    }
    return e;
  };
  const dropMissing = (map: Map<number, CarEntry>, alive: Set<number>) => {
    for (const [id, e] of map) {
      if (alive.has(id)) continue;
      scene.remove(e.parts.group);
      disposeObject(e.parts.group);
      map.delete(id);
    }
  };

  const barrierTex = barrierTexture();
  const barrierMat = new MeshStandardMaterial({ map: barrierTex, roughness: 0.55 });
  const footMat = matte(0x2a2c30, 0.6);
  const buildBlock = (b: ChaseState['blocks'][number]): Group => {
    const g = new Group();
    for (const w of b.walls) {
      const len = b.axis === 'x' ? w.z1 - w.z0 : w.x1 - w.x0;
      const cx = (w.x0 + w.x1) / 2;
      const cz = (w.z0 + w.z1) / 2;
      const bar = new Mesh(new BoxGeometry(b.axis === 'x' ? 0.25 : len, 0.42, b.axis === 'x' ? len : 0.25), barrierMat);
      bar.position.set(cx, 0.95, cz);
      g.add(bar);
      for (const end of [-1, 1]) {
        const foot = new Mesh(new BoxGeometry(0.4, 1.1, 0.4), footMat);
        foot.position.set(
          cx + (b.axis === 'x' ? 0 : end * (len / 2 - 0.3)),
          0.55,
          cz + (b.axis === 'x' ? end * (len / 2 - 0.3) : 0),
        );
        g.add(foot);
      }
      const car = buildCar('police', 0xffffff, { merged: true });
      car.bar?.light.removeFromParent();
      const back = b.dir * 4;
      car.group.position.set(cx + (b.axis === 'x' ? back : 0), 0, cz + (b.axis === 'x' ? 0 : back));
      car.group.rotation.y = b.axis === 'x' ? 0 : Math.PI / 2;
      car.group.userData.parts = car;
      g.add(car.group);
    }
    return g;
  };

  const beamMat = new MeshBasicMaterial({
    color: 0xe0b24a,
    transparent: true,
    opacity: 0.16,
    blending: AdditiveBlending,
    depthWrite: false,
    side: 2,
    fog: false,
  });
  const buildHideout = (h: Hideout): Group => {
    const g = new Group();
    const frame = new Mesh(new BoxGeometry(7, 4.2, 0.5), glow(0xe0b24a, 2.2, 0xc9a23c));
    frame.position.y = 2.1;
    g.add(frame);
    const hole = new Mesh(new BoxGeometry(6, 3.6, 0.6), new MeshBasicMaterial({ color: 0x030304 }));
    hole.position.set(0, 1.8, 0.05);
    g.add(hole);
    const beam = new Mesh(new CylinderGeometry(2.4, 3.4, 140, 20, 1, true), beamMat);
    beam.position.y = 70;
    g.add(beam);
    const ring = new Mesh(
      new RingGeometry(3.2, 4, 40),
      new MeshBasicMaterial({
        color: 0xffd36a,
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.06, 4.5);
    ring.name = 'ring';
    g.add(ring);
    const sign = new Mesh(new BoxGeometry(1.6, 1.6, 0.2), glow(0x3a7bff, 2.5, 0x1a3bff));
    sign.position.set(0, 5.2, 0);
    g.add(sign);
    g.position.set(h.x, 0, h.z);
    g.rotation.y = -h.heading + Math.PI;
    return g;
  };

  const burst = (x: number, z: number, power: number) => {
    if (reduced) return;
    const n = 14 + Math.round(power * 30);
    for (let i = 0; i < n; i++) {
      sparkFx.emit(SPARK, x, 0.6, z, (Math.random() - 0.5) * 16, Math.random() * 7 + 2, (Math.random() - 0.5) * 16);
    }
    for (let i = 0; i < 3 + power * 5; i++) {
      smoke.emit(
        DUST,
        x + (Math.random() - 0.5) * 2,
        0.5,
        z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 3,
        1,
        (Math.random() - 0.5) * 3,
      );
    }
  };

  // Rad-Positionen hinten (Welt), für Spuren und Rauch.
  const lastWheels = { l: { x: 0, z: 0 }, r: { x: 0, z: 0 }, ok: false };
  const lightColor = {
    head: new Color(0xfff1d8),
    tail: new Color(0xff2a14),
    blue: new Color(0x2a6bff),
    red: new Color(0xff2a2a),
  };
  const brakeLight = new Color();

  const update = (state: ChaseState, dt: number) => {
    cam.t += dt;
    const p = state.player;
    const speed = Math.abs(p.v);
    const speedF = Math.min(1, speed / TOP_SPEED);
    // Deine Karre: Lage, Nase, Rollen in Kurven, Nicken beim Bremsen und Gas, Beulen bei Schaden.
    playerGroup.position.set(p.x, 0, p.z);
    playerGroup.rotation.order = 'YXZ';
    playerGroup.rotation.y = -p.heading;
    const slip = Math.sin(p.heading - p.course);
    playerGroup.rotation.z +=
      (-(p.steer * 0.05 + slip * 0.12) * Math.min(1, speed / 18) - playerGroup.rotation.z) * Math.min(1, 8 * dt);
    const pitch = p.braking && p.v > 2 ? -0.03 : p.turboOn ? 0.03 : 0;
    playerGroup.rotation.x += (pitch - playerGroup.rotation.x) * Math.min(1, 6 * dt);
    player.body.scale.set(1, 1 - p.damage * 0.06, 1);
    spinWheels(player, dt, p.v, -p.steer * 0.5);
    player.rear.emissiveIntensity = p.braking ? 3.2 : 0.8;
    player.reverse.emissiveIntensity = p.v < -0.5 ? 3 : 0;
    for (const f of player.flames) {
      f.visible = p.turboOn && !reduced;
      if (f.visible) f.scale.set(1, 0.7 + Math.random() * 0.6, 1);
    }

    // Rauch und Spuren an den Hinterrädern.
    const fw = forward(p.heading);
    const rx = -fw.z;
    const rz = fw.x;
    const back = 1.4;
    const wl = { x: p.x - fw.x * back - rx * 0.9, z: p.z - fw.z * back - rz * 0.9 };
    const wr = { x: p.x - fw.x * back + rx * 0.9, z: p.z - fw.z * back + rz * 0.9 };
    const hardBrake = p.braking && p.v > 14;
    const marking = (p.drifting && speed > 10) || hardBrake || (p.turboOn && speed < 20);
    if (marking && lastWheels.ok) {
      const a = Math.min(0.75, 0.3 + speed / 70);
      skids.add(lastWheels.l.x, lastWheels.l.z, wl.x, wl.z, 0.3, a);
      skids.add(lastWheels.r.x, lastWheels.r.z, wr.x, wr.z, 0.3, a);
    }
    lastWheels.l = wl;
    lastWheels.r = wr;
    lastWheels.ok = true;
    if (!reduced) {
      const smokeRate = p.drifting && speed > 10 ? (hi ? 34 : 16) : hardBrake ? (hi ? 14 : 6) : 0;
      const n = smokeRate * dt + Math.random();
      for (let i = 1; i < n; i++) {
        const w = i % 2 ? wl : wr;
        smoke.emit(
          SMOKE,
          w.x,
          0.35,
          w.z,
          -fw.x * speed * 0.15 + (Math.random() - 0.5) * 2,
          0.8,
          -fw.z * speed * 0.15 + (Math.random() - 0.5) * 2,
        );
      }
      if (p.damage > 0.45 && Math.random() < (p.damage - 0.35) * dt * 30) {
        smoke.emit(DARK_SMOKE, p.x + fw.x * 1.6, 1.0, p.z + fw.z * 1.6, -fw.x * speed * 0.3, 1.5, -fw.z * speed * 0.3);
      }
    }

    // Lichtpunkte der Wagen für die Spiegelungen.
    let lightN = 0;
    const lamp = (x: number, z: number, c: Color, w: number, len: number) => {
      carLights.set(lightN++, x, 1, z, c, w, len);
    };
    brakeLight.copy(lightColor.tail).multiplyScalar(p.braking ? 1.6 : 0.6);
    lamp(p.x - fw.x * 2.3, p.z - fw.z * 2.3, brakeLight, 1.1, 5);
    if (dark) lamp(p.x + fw.x * 2.4, p.z + fw.z * 2.4, lightColor.head, 1.3, 7);

    // Verkehr.
    const aliveT = new Set<number>();
    for (const v of state.traffic) {
      aliveT.add(v.id);
      const e = carFor(traffic, v.id, () =>
        buildCar(v.kind, TRAFFIC_COLORS[v.color % TRAFFIC_COLORS.length], { merged: true }),
      );
      let diff = v.heading - e.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      e.heading += diff * Math.min(1, 7 * dt);
      e.parts.group.position.set(v.x, 0, v.z);
      e.parts.group.rotation.y = -e.heading;
      const braking = v.braking || v.pushed > 0;
      e.parts.rear.emissiveIntensity = braking ? 4 : 1.1;
      e.parts.front.emissiveIntensity = dark ? 2.4 : 0.4;
      spinWheels(e.parts, dt, v.v);
      if (lightN < 116) {
        const f = forward(e.heading);
        const half = v.kind === 'truck' ? 4.3 : v.kind === 'van' ? 2.6 : 2.2;
        lamp(
          v.x - f.x * half,
          v.z - f.z * half,
          braking ? lightColor.tail : brakeLight.copy(lightColor.tail).multiplyScalar(0.5),
          1,
          4,
        );
        if (dark) lamp(v.x + f.x * half, v.z + f.z * half, lightColor.head, 1.1, 6);
      }
    }
    dropMissing(traffic, aliveT);

    // Streifen und die nächsten Blaulicht-Quellen.
    const sources: { x: number; z: number; t: number; d: number }[] = [];
    const aliveC = new Set<number>();
    for (const c of state.cops) {
      if (!c.active) continue;
      aliveC.add(c.id);
      const e = carFor(cops, c.id, () => buildCar('police', 0xffffff, { merged: true }));
      e.parts.group.position.set(c.x, 0, c.z);
      e.parts.group.rotation.y = -c.heading;
      const flash = cam.t + c.id * 0.37;
      setBlueLight(e.parts, flash, c.state === 'wrecked' ? 0.3 : 1);
      e.parts.body.rotation.z = c.state === 'wrecked' ? 0.08 : 0;
      // Ansetzen zum Rammen: Lichthupe.
      e.parts.front.emissiveIntensity = c.charging && Math.floor(cam.t * 10) % 2 === 0 ? 6 : dark ? 2.4 : 0.4;
      spinWheels(e.parts, dt, c.v);
      if (c.state !== 'wrecked') {
        sources.push({ x: c.x, z: c.z, t: flash, d: Math.hypot(c.x - p.x, c.z - p.z) });
        const blue = (flash * 2.2) % 1 < 0.5;
        if (lightN < 118) lamp(c.x, c.z, blue ? lightColor.blue : lightColor.red, 1.6, 9);
      }
    }
    dropMissing(cops, aliveC);
    carLights.count(lightN);
    carLights.commit();

    // Sperren.
    const aliveB = new Set<number>();
    for (const b of state.blocks) {
      aliveB.add(b.id);
      let g = blocks.get(b.id);
      if (!g) {
        g = buildBlock(b);
        blocks.set(b.id, g);
        scene.add(g);
      }
      g.traverse((o) => {
        const parts = o.userData.parts as CarParts | undefined;
        if (parts) setBlueLight(parts, cam.t + b.id * 0.5, 1);
      });
      const w = b.walls[0];
      if (w) {
        const x = (w.x0 + w.x1) / 2;
        const z = (w.z0 + w.z1) / 2;
        sources.push({ x, z, t: cam.t + b.id * 0.5, d: Math.hypot(x - p.x, z - p.z) });
      }
    }
    for (const [id, g] of blocks) {
      if (aliveB.has(id)) continue;
      scene.remove(g);
      g.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.geometry) m.geometry.dispose();
      });
      blocks.delete(id);
    }
    sources.sort((a, b) => a.d - b.d);
    for (let k = 0; k < BLUE_LAMPS; k++) {
      const l = blueLamps[k];
      const s = sources[k];
      if (!s || s.d > 160) {
        l.intensity = 0;
        continue;
      }
      const blue = (s.t * 2.2) % 1 < 0.5;
      l.position.set(s.x, 2.6, s.z);
      l.color.setHex(blue ? 0x2a6bff : 0xff3a2a);
      l.intensity = (blue ? 90 : 60) * (dark ? 1 : 0.5);
    }

    // Tiefgarage.
    if (state.hideout !== hideoutRef) {
      if (hideoutGroup) {
        scene.remove(hideoutGroup);
        disposeObject(hideoutGroup);
        hideoutGroup = null;
      }
      hideoutRef = state.hideout;
      if (hideoutRef) {
        hideoutGroup = buildHideout(hideoutRef);
        scene.add(hideoutGroup);
      }
    }
    if (hideoutGroup) {
      const pulse = 0.5 + 0.5 * Math.sin(cam.t * 5);
      beamMat.opacity = 0.12 + 0.08 * pulse;
      const ring = hideoutGroup.getObjectByName('ring');
      if (ring) ring.scale.setScalar(0.9 + 0.25 * pulse);
    }

    smoke.update(dt);
    sparkFx.update(dt);
    speedLines.update(dt, speed, reduced ? 0 : Math.max(0, (speedF - 0.72) * 2.2) + (p.turboOn ? 0.7 : 0));

    // Kamera: hinter dem Wagen, folgt der Fahrtrichtung (Drift sichtbar), tiefer und näher als früher; weiter weg,
    // flacher und mit größerem Blickwinkel bei Tempo, Turbo dazu.
    const ended = state.end;
    let yawDiff = p.course - cam.yaw;
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
    cam.yaw += yawDiff * Math.min(1, (ended ? 1.5 : 4.5) * dt);
    const cf = forward(cam.yaw);
    const dist = CAM_BACK[0] + (CAM_BACK[1] - CAM_BACK[0]) * speedF + (p.turboOn ? 1.2 : 0) + (ended ? 5 : 0);
    const height = CAM_HEIGHT[0] + (CAM_HEIGHT[1] - CAM_HEIGHT[0]) * speedF + (ended ? 2.5 : 0);
    const wantX = p.x - cf.x * dist;
    const wantZ = p.z - cf.z * dist;
    const k = Math.min(1, (ended ? 2 : 10) * dt);
    cam.x += (wantX - cam.x) * k;
    cam.z += (wantZ - cam.z) * k;
    cam.y += (height - cam.y) * Math.min(1, 5 * dt);
    cam.shake = Math.max(0, cam.shake - dt * 2.4);
    const rumble = reduced ? 0 : speedF * speedF * 0.025 + (p.turboOn ? 0.03 : 0);
    const sh = reduced ? 0 : cam.shake * 0.45 + rumble;
    const t = cam.t;
    camera.position.set(
      cam.x + Math.sin(t * 37.1) * sh * 0.6,
      cam.y + Math.sin(t * 43.7 + 1.3) * sh * 0.5,
      cam.z + Math.sin(t * 29.3 + 2.1) * sh * 0.6,
    );
    const lookAhead = 6 + speedF * 4;
    look.set(p.x + cf.x * lookAhead, 0.95, p.z + cf.z * lookAhead);
    camera.up.copy(UP);
    camera.lookAt(look);
    cam.roll += (-p.steer * 0.03 * speedF - cam.roll) * Math.min(1, 5 * dt);
    camera.rotateZ(cam.roll);
    const wantFov = reduced ? FOV[0] : FOV[0] + (FOV[1] - FOV[0]) * speedF + (p.turboOn ? FOV_TURBO : 0);
    cam.fov += (wantFov - cam.fov) * Math.min(1, 4 * dt);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
      particleScaleFor(cam.height);
    }
    sky.position.copy(camera.position);
    rim.position.set(cam.x, cam.y + 1.6, cam.z);
    rim.target.position.set(p.x, 0.7, p.z);
    // Sonne und Schattenfenster folgen dir.
    sun.target.position.set(p.x, 0, p.z);
    sun.position.set(
      p.x + (phase === 'dusk' ? -60 : 40),
      phase === 'dusk' ? 25 : 80,
      p.z + (phase === 'dusk' ? 20 : -30),
    );
    // Regen um die Kamera.
    if (rainLines && rainPos && rainGeo) {
      rainLines.position.copy(camera.position);
      const fall = 26 * dt;
      for (let i = 0; i < rainPos.length; i += 6) {
        rainPos[i + 1] -= fall;
        rainPos[i + 4] -= fall;
        if (rainPos[i + 4] < -6) {
          rainPos[i + 1] += 24;
          rainPos[i + 4] += 24;
        }
      }
      rainGeo.getAttribute('position').needsUpdate = true;
    }
    // Linse: Unschärfe und Farbsäume bei Tempo, Blaulicht am Rand, wenn sie dir im Nacken sitzen.
    if (lens) {
      const u = lens.uniforms;
      const turboK = p.turboOn ? 1 : 0;
      u.uBlur.value = reduced ? 0 : Math.max(0, speedF - 0.6) * 1.6 + turboK * 1.4;
      u.uAberration.value = reduced ? 0 : turboK * 0.8 + cam.shake * 0.8;
      u.uTime.value = (t * 60) % 1000;
      const near = state.nearest;
      const close = Number.isFinite(near) ? Math.max(0, 1 - near / 40) : 0;
      const blue = (t * 2.2) % 1 < 0.5;
      (u.uTint.value as Color).setRGB(blue ? 0 : 0.12 * close, 0.02 * close, blue ? 0.16 * close : 0);
      u.uVignette.value = 0.38 + close * 0.15 + (ended === 'caught' ? 0.3 : 0);
    }
    if (ended === 'caught' && bloom) bloom.strength = Math.min(1.3, bloom.strength + dt * 0.4);
  };

  const render = (stage: Stage3d) => {
    // Zählen über alle Durchgänge eines Bildes (Messung mit info()).
    stage.renderer.info.autoReset = false;
    stage.renderer.info.reset();
    if (reduced && !hi) {
      if (!envTex || lastRenderer !== stage.renderer) {
        envTex?.dispose();
        lastRenderer = stage.renderer;
        envTex = cityEnvironment(stage.renderer, phase);
        scene.environment = envTex;
      }
      stage.renderer.render(scene, camera);
      return;
    }
    ensure(stage).render();
  };

  const resize = (width: number, height: number) => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    cam.height = height;
    composer?.setSize(width, height);
    if (bloom) bloom.setSize(width * (hi ? 1 : 0.5), height * (hi ? 1 : 0.5));
    particleScaleFor(height);
  };

  const dispose = () => {
    composer?.dispose();
    envTex?.dispose();
    city.dispose();
    smoke.dispose();
    sparkFx.dispose();
    skids.dispose();
    speedLines.dispose();
    carLights.mesh.geometry.dispose();
    carLights.material.dispose();
    barrierTex.dispose();
    barrierMat.dispose();
    footMat.dispose();
    beamMat.dispose();
    disposeObject(scene);
  };

  return {
    update,
    render,
    resize,
    shake: (power) => {
      cam.shake = Math.min(1, cam.shake + power);
    },
    sparks: burst,
    screenOf: (x, y, z) => {
      proj.set(x, y, z).project(camera);
      // Hinter der Kamera: z > 1 nach project; dann Richtung spiegeln.
      const behind = proj.z > 1;
      return { x: (proj.x + 1) / 2, y: (1 - proj.y) / 2, behind };
    },
    viewHeading: () => cam.yaw,
    info: (stage) => {
      const r = stage?.renderer.info;
      return {
        calls: r?.render.calls ?? 0,
        triangles: r?.render.triangles ?? 0,
        geometries: r?.memory.geometries ?? 0,
        textures: r?.memory.textures ?? 0,
        programs: r?.programs?.length ?? 0,
      };
    },
    dispose,
  };
}

/** Himmelfarbe der Tageszeit als CSS (für Ränder außerhalb des Canvas). */
export function skyCss(phase: DayPhase): string {
  return `#${SKY[phase].sky.toString(16).padStart(6, '0')}`;
}
