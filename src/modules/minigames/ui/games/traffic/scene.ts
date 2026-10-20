// Szene der Verkehrskontrolle (Auftrag 47, three.js): Blick vom Fahrersitz nach links aus dem Fenster. Innen:
// Armaturenbrett, Lenkrad, A- und B-Säule, Türverkleidung mit Fensterrahmen, Außenspiegel, Scheibe mit Regen.
// Draußen: Fahrbahn (nass glänzend bei Regen), Gehweg gegenüber, Fassaden mit Fenstern, Laterne, Streifenwagen mit
// Blaulicht hinter dir, der Beamte (Uniform, Mütze, Taschenlampe) am Fenster, hinten am Wagen oder am Funkgerät. Das
// Gesicht kommt aus dem Look-System als HTML über der projizierten Kopfposition (headScreen). Nur Optik.

import {
  AdditiveBlending,
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
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
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createRng } from '../../../../../core';
import {
  buildCar,
  type CarParts,
  type DayPhase,
  disposeObject,
  facadeTiles,
  glow,
  lightScene,
  matte,
  paint,
  setBlueLight,
} from '../../kit/scene3d';
import type { Stage3d } from '../../kit/stage3d';
import type { TrafficState } from './model';
import type { Vehicle, Visible } from './questions';

export interface TrafficSceneOptions {
  phase: DayPhase;
  rain: boolean;
  reduced: boolean;
  vehicle: Vehicle;
  visible: Visible;
  /** Hautton des Beamten (aus LOOK_COLORS) für Hände und Nacken, Farbe der Jacke wie im Porträt. */
  skin: string;
  jacket: string;
  /** Fester Zufall für Tropfen auf der Scheibe. */
  seed: number;
}

export interface HeadScreen {
  x: number;
  y: number;
  /** Höhe des Kopfes in Pixeln. */
  size: number;
  visible: boolean;
}

/** Licht, das die Oberfläche über das Bild legt (nach update): Blaulicht im Innenraum, Blendung der Taschenlampe. */
export interface SceneLight {
  /** Blau bzw. Rot des Blaulichts gerade (0 bis 1). */
  blue: number;
  red: number;
  /** Taschenlampe ins Gesicht (0 bis 1). */
  glare: number;
}

export interface TrafficScene {
  update(state: TrafficState, dt: number): void;
  render(stage: Stage3d): void;
  resize(width: number, height: number): void;
  /** Wo der Kopf des Beamten auf dem Bildschirm liegt (nach update). */
  head: HeadScreen;
  light: SceneLight;
  /** Kurzer Ruck der Kamera (Treffer, Klopfen), klingt von selbst ab. */
  shake(amount: number): void;
  dispose(): void;
}

/**
 * Wo der Beamte steht (Welt: x nach links negativ, z nach hinten positiv), je Lage. face dreht die Figur (−π/2 = zum
 * Auto), lean beugt den Oberkörper vor (Radiant).
 */
const SPOTS = {
  window: { x: -1.95, z: 0.05, face: -Math.PI / 2, lean: 0.32 },
  rear: { x: -1.75, z: 2.9, face: -Math.PI / 2 - 0.7, lean: 0.12 },
  radio: { x: -2.9, z: 1.3, face: -Math.PI / 2 + 0.5, lean: 0.02 },
};

interface OfficerParts {
  group: Group;
  /** Oberkörper ab der Hüfte (beugt sich vor), Kopf, Arm mit der Lampe, Arm zum Dach. */
  upper: Group;
  head: Group;
  arm: Group;
  armRoof: Group;
  lamp: SpotLight;
  beam: Mesh;
}

/** Der Beamte aus weichen Grundformen: Jacke mit Reflexstreifen, Gürtel, Schultern, Mütze; das Gesicht kommt als HTML. */
function officerFigure(skin: string, jacket: string): OfficerParts {
  const g = new Group();
  const coat = new MeshStandardMaterial({ color: new Color(jacket), roughness: 0.78 });
  const trousers = matte(0x1a2133, 0.85);
  const dark = matte(0x0e1014, 0.6);
  const skinMat = matte(new Color(skin).getHex(), 0.65);
  const reflect = new MeshStandardMaterial({
    color: 0xc8d2dc,
    emissive: 0x9aa6b4,
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.4,
  });
  // Beine und Stiefel.
  for (const side of [-1, 1]) {
    const leg = new Mesh(new CapsuleGeometry(0.085, 0.72, 4, 10), trousers);
    leg.position.set(side * 0.11, 0.46, 0);
    leg.castShadow = true;
    g.add(leg);
    const boot = new Mesh(new CapsuleGeometry(0.06, 0.14, 4, 8), dark);
    boot.rotation.x = Math.PI / 2;
    boot.position.set(side * 0.11, 0.06, -0.05);
    g.add(boot);
  }
  // Oberkörper ab der Hüfte: beugt sich vor.
  const upper = new Group();
  upper.position.y = 0.92;
  g.add(upper);
  const torso = new Mesh(new CapsuleGeometry(0.19, 0.36, 6, 16), coat);
  torso.scale.set(1.18, 1, 0.68);
  torso.position.y = 0.32;
  torso.castShadow = true;
  upper.add(torso);
  const belt = new Mesh(new CylinderGeometry(0.205, 0.205, 0.07, 18), dark);
  belt.scale.set(1.12, 1, 0.68);
  belt.position.y = 0.04;
  upper.add(belt);
  for (const y of [0.2, 0.36]) {
    const stripe = new Mesh(new CylinderGeometry(0.228, 0.228, 0.035, 20, 1, true), reflect);
    stripe.scale.set(1.0, 1, 0.66);
    stripe.position.y = y;
    upper.add(stripe);
  }
  // Schultern und Kragen.
  for (const side of [-1, 1]) {
    const sh = new Mesh(new SphereGeometry(0.082, 12, 10), coat);
    sh.position.set(side * 0.2, 0.56, 0);
    sh.scale.set(1, 0.8, 0.85);
    upper.add(sh);
  }
  const collar = new Mesh(new CylinderGeometry(0.09, 0.12, 0.07, 14), coat);
  collar.position.y = 0.65;
  upper.add(collar);
  // Funkgerät an der Schulter.
  const radio = new Mesh(new BoxGeometry(0.06, 0.1, 0.04), dark);
  radio.position.set(0.14, 0.5, -0.14);
  upper.add(radio);
  // Arm mit der Lampe (rechts) und Arm, der sich aufs Dach stützt (links).
  const arm = new Group();
  arm.position.set(0.25, 0.55, 0);
  const armR = new Mesh(new CapsuleGeometry(0.055, 0.46, 4, 10), coat);
  armR.position.y = -0.28;
  arm.add(armR);
  const handR = new Mesh(new SphereGeometry(0.05, 10, 8), skinMat);
  handR.position.y = -0.56;
  arm.add(handR);
  const torch = new Mesh(new CylinderGeometry(0.024, 0.03, 0.2, 10), dark);
  torch.position.set(0, -0.58, -0.09);
  torch.rotation.x = Math.PI / 2;
  arm.add(torch);
  const lens = new Mesh(new CylinderGeometry(0.032, 0.032, 0.015, 12), glow(0xfff2c0, 2, 0xfff2c0));
  lens.position.set(0, -0.58, -0.2);
  lens.rotation.x = Math.PI / 2;
  arm.add(lens);
  const lamp = new SpotLight(0xfff0c8, 0, 9, 0.42, 0.55, 1.2);
  lamp.position.set(0, -0.58, -0.21);
  lamp.target.position.set(0, -0.62, -3);
  arm.add(lamp);
  arm.add(lamp.target);
  const beam = new Mesh(
    new ConeGeometry(0.55, 3, 18, 1, true),
    new MeshBasicMaterial({
      color: 0xfff0c8,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: 2,
    }),
  );
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, -0.58, -1.7);
  arm.add(beam);
  upper.add(arm);
  const armRoof = new Group();
  armRoof.position.set(-0.25, 0.55, 0);
  const armL = new Mesh(new CapsuleGeometry(0.055, 0.46, 4, 10), coat);
  armL.position.y = -0.28;
  armRoof.add(armL);
  const handL = new Mesh(new SphereGeometry(0.05, 10, 8), skinMat);
  handL.position.y = -0.56;
  armRoof.add(handL);
  upper.add(armRoof);
  // Hals, Kopf (unter dem HTML-Gesicht) und Mütze mit Schirm.
  const neck = new Mesh(new CylinderGeometry(0.055, 0.065, 0.1, 12), skinMat);
  neck.position.y = 0.7;
  upper.add(neck);
  const head = new Group();
  head.position.y = 0.84;
  const skull = new Mesh(new SphereGeometry(0.095, 16, 14), skinMat);
  skull.scale.set(1, 1.15, 1.05);
  head.add(skull);
  const cap = new Mesh(new CylinderGeometry(0.11, 0.1, 0.075, 18), coat);
  cap.position.y = 0.095;
  head.add(cap);
  const brim = new Mesh(new CylinderGeometry(0.075, 0.075, 0.012, 16, 1, false, 0, Math.PI), dark);
  brim.rotation.y = Math.PI / 2;
  brim.position.set(0, 0.065, -0.07);
  head.add(brim);
  upper.add(head);
  return { group: g, upper, head, arm, armRoof, lamp, beam };
}

/**
 * Regen auf der Scheibe als gemalte Textur: Tropfen mit Lichtkante, ein paar Rinnsale. Fest aus dem Seed, damit jedes
 * Bild gleich aussieht (Optik, kein Spielzustand).
 */
function rainGlassTexture(seed: number): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = createRng(seed ^ 0x51a3);
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    // Rinnsale: senkrechte, leicht schlängelnde Spuren.
    for (let i = 0; i < 14; i++) {
      let x = rng() * size;
      let y = rng() * size * 0.4;
      const w = 1.2 + rng() * 2.2;
      ctx.strokeStyle = 'rgba(210,225,245,0.16)';
      ctx.lineWidth = w * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < size) {
        y += 6 + rng() * 10;
        x += (rng() - 0.5) * 3;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Tropfen: dunkler Kern, helle Kante oben links.
    for (let i = 0; i < 520; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 0.8 + rng() ** 3 * 4;
      const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.75)');
      grad.addColorStop(0.35, 'rgba(190,210,235,0.25)');
      grad.addColorStop(1, 'rgba(20,30,45,0.35)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createTrafficScene(options: TrafficSceneOptions): TrafficScene {
  const { phase, rain, reduced } = options;
  const night = phase === 'night';
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 16 / 9, 0.05, 300);
  lightScene(scene, phase, { fogNear: 25, fogFar: night ? 120 : 220 });

  // ---------------------------------------------------------------- Draußen
  const asphalt = new MeshStandardMaterial({
    color: night ? 0x1a1c21 : 0x2c2f35,
    roughness: rain ? 0.22 : 0.9,
    metalness: rain ? 0.3 : 0,
  });
  const ground = new Mesh(new PlaneGeometry(200, 200), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Gehweg gegenüber mit Bordstein, Fahrbahnmarkierung.
  const walk = new Mesh(new PlaneGeometry(6, 200), matte(night ? 0x3d3e42 : 0x8a8984, 0.95));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(-13, 0.12, 0);
  walk.receiveShadow = true;
  scene.add(walk);
  const curb = new Mesh(new BoxGeometry(0.25, 0.14, 200), matte(night ? 0x5a5b5e : 0xb3b1aa, 0.7));
  curb.position.set(-10, 0.07, 0);
  scene.add(curb);
  const lineMat = matte(0xe8e6da, 0.8);
  for (let z = -60; z < 60; z += 6) {
    const dash = new Mesh(new PlaneGeometry(0.15, 3), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(-5.2, 0.01, z);
    scene.add(dash);
  }
  // Fassaden gegenüber.
  const { map, emissive } = facadeTiles();
  const facade = new MeshStandardMaterial({
    map,
    emissiveMap: emissive,
    emissive: new Color(0xffe2b0),
    emissiveIntensity: night ? 0.75 : phase === 'dusk' ? 0.35 : 0,
    roughness: 0.8,
  });
  const tints = [0xd8cfc0, 0xb8a58c, 0xa86a52, 0x9ca3ab];
  let z = -40;
  let k = 0;
  while (z < 50) {
    const w = 10 + (k % 3) * 4;
    const h = 10 + ((k * 7) % 5) * 3;
    const geo = new BoxGeometry(12, h, w);
    const uv = geo.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (i >= 8 && i < 16) uv.setXY(i, 0.01, 0.99);
      else if (i < 8) uv.setXY(i, (u * w) / 12, (v * h) / 12);
      else uv.setXY(i, 1, (v * h) / 12);
    }
    const m = facade.clone();
    m.color = new Color(tints[k % tints.length]);
    const house = new Mesh(geo, m);
    house.position.set(-22, h / 2, z + w / 2);
    house.castShadow = true;
    house.receiveShadow = true;
    scene.add(house);
    z += w + 0.6;
    k += 1;
  }
  // Laterne gegenüber.
  const pole = new Mesh(new CylinderGeometry(0.07, 0.1, 7, 8), matte(0x3a3d42, 0.6));
  pole.position.set(-11, 3.5, -4);
  scene.add(pole);
  const lampHead = new Mesh(
    new BoxGeometry(0.5, 0.18, 0.9),
    night ? glow(0xffe0a0, 2, 0xffe0a0) : matte(0xd0d2d6, 0.5),
  );
  lampHead.position.set(-10.4, 7, -4);
  scene.add(lampHead);
  if (night) {
    const street = new PointLight(0xffd9a0, 38, 30, 1.5);
    street.position.set(-10.4, 6.6, -4);
    scene.add(street);
  }
  // Streifenwagen schräg hinter dir am Straßenrand.
  const police: CarParts = buildCar('police', 0xffffff);
  police.group.position.set(-2.6, 0, 7.6);
  police.group.rotation.y = 0.35;
  police.front.emissiveIntensity = night ? 2.2 : 0.6;
  scene.add(police.group);
  if (night) {
    for (const side of [-1, 1]) {
      const h = new SpotLight(0xfff1d0, 220, 40, 0.5, 0.6, 1.3);
      h.position.set(side * 0.7, 0.9, -2.2);
      h.target.position.set(side * 0.5, 0, -30);
      police.group.add(h);
      police.group.add(h.target);
    }
  }
  // Ein parkendes Auto gegenüber.
  const parked = buildCar('car', 0x6b6f75);
  parked.group.position.set(-9, 0, -9);
  parked.group.rotation.y = Math.PI;
  parked.front.emissiveIntensity = 0;
  parked.rear.emissiveIntensity = 0;
  scene.add(parked.group);

  // ---------------------------------------------------------------- Innen
  const interior = new Group();
  scene.add(interior);
  const trim = matte(0x16181c, 0.85);
  const trim2 = matte(0x24272d, 0.7);
  const isVan = options.vehicle === 'transporter';
  const sill = isVan ? 1.15 : 0.98; // Unterkante Fenster
  const roofY = isVan ? 1.95 : 1.52;
  const doorX = -0.92;
  // Tür unten, Fensterrahmen oben, A-Säule vorn, B-Säule hinten, Dach.
  const door = new Mesh(new BoxGeometry(0.08, sill, 1.9), trim2);
  door.position.set(doorX, sill / 2, 0.25);
  interior.add(door);
  const armrest = new Mesh(new BoxGeometry(0.16, 0.08, 0.5), trim);
  armrest.position.set(doorX + 0.08, sill - 0.12, 0.1);
  interior.add(armrest);
  const sillRail = new Mesh(new BoxGeometry(0.1, 0.05, 1.9), trim);
  sillRail.position.set(doorX, sill, 0.25);
  interior.add(sillRail);
  const aPillar = new Mesh(new BoxGeometry(0.1, roofY - sill + 0.2, 0.14), trim);
  aPillar.position.set(doorX, (roofY + sill) / 2, -0.72);
  aPillar.rotation.x = 0.35;
  interior.add(aPillar);
  const bPillar = new Mesh(new BoxGeometry(0.1, roofY - sill + 0.1, 0.16), trim);
  bPillar.position.set(doorX, (roofY + sill) / 2, 1.0);
  interior.add(bPillar);
  // Dachhimmel hell (Stoff), sonst wäre oben im Bild nur Schwarz.
  const roof = new Mesh(new BoxGeometry(2.0, 0.06, 2.6), matte(night ? 0x2a2b2e : 0x6b6a66, 0.95));
  roof.position.set(0, roofY, 0.2);
  interior.add(roof);
  const roofRail = new Mesh(new BoxGeometry(0.12, 0.08, 1.9), trim);
  roofRail.position.set(doorX, roofY - 0.04, 0.25);
  interior.add(roofRail);
  // Scheibe in der Tür (leicht getönt, bei Regen mit gemalten Tropfen und Rinnsalen, die langsam laufen).
  const glassMat = new MeshPhysicalMaterial({
    color: 0x8fa0b8,
    transparent: true,
    opacity: rain ? 0.7 : 0.08,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1,
    depthWrite: false,
  });
  let rainTex: CanvasTexture | null = null;
  if (rain) {
    rainTex = rainGlassTexture(options.seed);
    glassMat.map = rainTex;
    glassMat.color = new Color(0xffffff);
    glassMat.alphaMap = null;
  }
  const glass = new Mesh(new PlaneGeometry(1.6, roofY - sill - 0.1), glassMat);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(doorX + 0.02, (roofY + sill) / 2 - 0.05, 0.2);
  interior.add(glass);
  // Armaturenbrett, Lenkrad, Tacho-Glühen, Windschutzscheibe (Rahmen).
  const dash = new Mesh(new BoxGeometry(1.9, 0.3, 0.6), trim2);
  dash.position.set(0, 0.95, -0.85);
  interior.add(dash);
  const dashTop = new Mesh(new BoxGeometry(1.9, 0.05, 0.7), trim);
  dashTop.position.set(0, 1.11, -0.9);
  interior.add(dashTop);
  const wheel = new Mesh(new TorusGeometry(0.19, 0.022, 10, 32), trim);
  wheel.position.set(-0.4, 1.0, -0.45);
  wheel.rotation.x = Math.PI / 2 - 0.5;
  interior.add(wheel);
  const hub = new Mesh(new CylinderGeometry(0.06, 0.06, 0.04, 12), trim2);
  hub.position.copy(wheel.position);
  hub.rotation.x = -0.5;
  interior.add(hub);
  const cluster = new Mesh(new PlaneGeometry(0.4, 0.14), glow(night ? 0x4a9cff : 0x2a5a9f, night ? 1.4 : 0.3));
  cluster.position.set(-0.4, 1.06, -0.62);
  cluster.rotation.x = -0.4;
  interior.add(cluster);
  const dashLight = new PointLight(0x4a9cff, night ? 3 : 0.6, 2.5, 1.5);
  dashLight.position.set(-0.4, 1.1, -0.6);
  interior.add(dashLight);
  // Tagsüber etwas Licht von draußen im Innenraum (sonst sind Dach und Tür schwarz); nachts reicht das Blaulicht.
  if (!night) {
    const fill = new PointLight(0xfff4e0, 4, 3.5, 1.2);
    fill.position.set(-0.6, 1.3, 0.3);
    interior.add(fill);
  }
  const windshieldFrame = new Mesh(new BoxGeometry(1.9, 0.08, 0.1), trim);
  windshieldFrame.position.set(0, roofY - 0.05, -0.95);
  interior.add(windshieldFrame);
  // Außenspiegel.
  const mirror = new Mesh(new BoxGeometry(0.12, 0.12, 0.2), paint(0x2b2f36));
  mirror.position.set(doorX - 0.14, sill + 0.14, -0.62);
  interior.add(mirror);
  const mirrorGlass = new Mesh(
    new PlaneGeometry(0.09, 0.09),
    new MeshStandardMaterial({ color: 0x9fb2c8, metalness: 1, roughness: 0.1 }),
  );
  mirrorGlass.position.set(doorX - 0.14, sill + 0.14, -0.51);
  interior.add(mirrorGlass);
  // Sitz hinter dir (Kopfstütze), Beifahrersitz rechts.
  const seat = new Mesh(new BoxGeometry(0.5, 0.6, 0.2), matte(0x2c2a2a, 0.9));
  seat.position.set(-0.4, 1.0, 0.45);
  interior.add(seat);
  const seat2 = new Mesh(new BoxGeometry(0.5, 0.7, 0.25), matte(0x2c2a2a, 0.9));
  seat2.position.set(0.4, 0.95, 0.1);
  interior.add(seat2);

  // ---------------------------------------------------------------- Der Beamte
  // Am Fenster: Beim niedrigen Wagen beugt er sich tiefer herunter und steht etwas weiter weg.
  const windowSpot = isVan ? SPOTS.window : { ...SPOTS.window, x: -2.2, lean: 0.85 };
  const officer = officerFigure(options.skin, options.jacket);
  officer.group.position.set(SPOTS.window.x, 0, SPOTS.window.z);
  officer.group.rotation.y = SPOTS.window.face;
  scene.add(officer.group);
  const pos = {
    x: SPOTS.window.x,
    z: SPOTS.window.z,
    face: SPOTS.window.face,
    lean: 0,
    torch: 0,
    glare: 0,
    roof: 0,
  };
  // Blaulicht im Innenraum: Licht von hinten links, Farbe und Stärke im Takt des Streifenwagens.
  const cabin = new PointLight(0x3a7bff, 0, 6, 1.6);
  cabin.position.set(-1.4, 1.6, 2.2);
  scene.add(cabin);
  const light: SceneLight = { blue: 0, red: 0, glare: 0 };
  let kick = 0;

  // Regen draußen.
  let rainLines: LineSegments | null = null;
  let rainPos: Float32Array | null = null;
  if (rain) {
    const n = reduced ? 100 : 300;
    const rng = createRng(options.seed ^ 0x2f17);
    rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      rainPos[i * 6] = -1.2 - rng() * 16;
      rainPos[i * 6 + 1] = rng() * 10;
      rainPos[i * 6 + 2] = (rng() - 0.5) * 30;
      rainPos[i * 6 + 3] = rainPos[i * 6];
      rainPos[i * 6 + 4] = rainPos[i * 6 + 1] - 0.5;
      rainPos[i * 6 + 5] = rainPos[i * 6 + 2];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(rainPos, 3));
    rainLines = new LineSegments(g, new LineBasicMaterial({ color: 0xbfd0e8, transparent: true, opacity: 0.3 }));
    scene.add(rainLines);
  }

  // Nachbearbeitung.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let lastRenderer: Stage3d['renderer'] | null = null;
  const ensureComposer = (stage: Stage3d) => {
    if (composer && lastRenderer === stage.renderer) return composer;
    composer?.dispose();
    lastRenderer = stage.renderer;
    composer = new EffectComposer(stage.renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(stage.width, stage.height), night ? 0.38 : 0.22, 0.45, night ? 0.82 : 0.95);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(stage.dpr);
    composer.setSize(stage.width, stage.height);
    return composer;
  };

  const camPos = new Vector3(-0.3, isVan ? 1.38 : 1.18, 0.05);
  const lookAt = new Vector3(-4, 1.4, 0.2);
  const lookNow = lookAt.clone();
  const headWorld = new Vector3();
  const headTop = new Vector3();
  const head: HeadScreen = { x: 0, y: 0, size: 0, visible: false };
  let t = 0;
  let size = { w: 1120, h: 760 };

  const update = (state: TrafficState, dt: number) => {
    t += dt;
    // Wo er hin soll.
    const spot = state.phase === 'walk' ? SPOTS.rear : state.phase === 'radio' ? SPOTS.radio : windowSpot;
    const k = Math.min(1, 2.2 * dt);
    pos.x += (spot.x - pos.x) * k;
    pos.z += (spot.z - pos.z) * k;
    pos.face += (spot.face - pos.face) * k;
    // Beugt sich zum Fenster, wenn er fragt; bei einem Widerspruch noch näher heran.
    const atWindow = spot === windowSpot;
    const hit = state.phase === 'react' && state.caught.length > 0;
    const wantLean = !atWindow
      ? spot.lean
      : spot.lean + (hit || state.outcome === 'fail' ? 0.14 : state.phase === 'ask' ? 0.06 : -0.06);
    pos.lean += (wantLean - pos.lean) * Math.min(1, 3 * dt);
    // Hand am Gürtel, solange er am Fenster steht.
    pos.roof += ((atWindow ? 1 : 0) - pos.roof) * Math.min(1, 3 * dt);
    // Taschenlampe: hinten durch die Scheibe, bei Misstrauen und Widerspruch dir ins Gesicht.
    const wantTorch = state.phase === 'walk' || hit || (night && state.suspicion > 0.55) ? 1 : 0;
    pos.torch += (wantTorch - pos.torch) * Math.min(1, 4 * dt);
    const wantGlare = atWindow && (hit || state.outcome === 'fail') ? 1 : 0;
    pos.glare += (wantGlare - pos.glare) * Math.min(1, (wantGlare ? 6 : 2) * dt);
    officer.group.position.set(pos.x, Math.sin(t * 1.7) * 0.004, pos.z);
    officer.group.rotation.y = pos.face;
    officer.upper.rotation.x = -pos.lean + Math.sin(t * 1.1) * 0.01;
    // Arm mit der Lampe: hängt, hebt sich zum Leuchten (am Fenster zu dir hin).
    officer.arm.rotation.x = -pos.torch * (atWindow ? 1.55 : 1.25) - 0.08 + Math.sin(t * 1.3) * 0.02;
    officer.arm.rotation.z = -0.08;
    officer.armRoof.rotation.x = pos.lean * 0.9 - 0.15;
    officer.armRoof.rotation.z = -0.12 - pos.roof * 0.42;
    officer.lamp.intensity = pos.torch * (night ? 60 : 25);
    (officer.beam.material as MeshBasicMaterial).opacity = pos.torch * (night ? 0.14 : 0.05) * (1 - pos.glare * 0.7);
    // Kopf leicht geneigt beim Fragen, Blick weg beim Funken.
    officer.head.rotation.z = state.phase === 'ask' ? Math.sin(t * 0.7) * 0.05 + 0.06 : 0;
    officer.head.rotation.x = pos.lean * 0.6;
    // Blaulicht, auch im Innenraum.
    setBlueLight(police, t, 1);
    const phaseT = (t * 2.2) % 1;
    light.blue = phaseT < 0.5 ? 1 : 0.15;
    light.red = phaseT < 0.5 ? 0.15 : 1;
    cabin.color.setHex(light.blue > light.red ? 0x3a7bff : 0xff4a3a);
    cabin.intensity = (night ? 7 : 2) * Math.max(light.blue, light.red);
    light.glare = pos.glare * (night ? 1 : 0.6);
    // Kamera: leichtes Atmen, folgt dem Beamten mit dem Blick; Ruck bei Treffern.
    kick = Math.max(0, kick - dt * 3);
    // Blick auf Kopf und Brust (Kopf im oberen Drittel); er wandert mit, wenn der Beamte geht.
    officer.head.getWorldPosition(headWorld);
    const wantLook = new Vector3(headWorld.x, headWorld.y - 0.16, headWorld.z - 0.1);
    lookNow.lerp(wantLook, Math.min(1, 2.5 * dt));
    const jx = kick > 0 && !reduced ? (Math.sin(t * 71) * kick) / 40 : 0;
    const jy = kick > 0 && !reduced ? (Math.sin(t * 53) * kick) / 50 : 0;
    camera.position.set(camPos.x, camPos.y + Math.sin(t * 0.9) * 0.004 + jy, camPos.z + Math.sin(t * 0.6) * 0.003 + jx);
    camera.lookAt(lookNow);
    // Kopf auf dem Bildschirm.
    officer.head.getWorldPosition(headWorld);
    headTop.copy(headWorld).setY(headWorld.y + 0.14);
    const a = headWorld.clone().project(camera);
    const b = headTop.clone().project(camera);
    head.x = ((a.x + 1) / 2) * size.w;
    head.y = ((1 - a.y) / 2) * size.h;
    // Das Porträt zeigt Kopf und Schultern (etwa 0,48 m, der Kopf gut die Hälfte): so groß wie der Kopf in der Szene.
    head.size = Math.abs(((b.y - a.y) / 2) * size.h) * 3.4;
    head.visible = a.z < 1 && a.z > -1 && Math.abs(a.x) < 1.1 && state.phase !== 'walk';
    // Regen.
    if (rainLines && rainPos) {
      const geo = rainLines.geometry.getAttribute('position') as BufferAttribute;
      const fall = 9 * dt;
      for (let i = 0; i < rainPos.length; i += 6) {
        rainPos[i + 1] -= fall;
        rainPos[i + 4] -= fall;
        if (rainPos[i + 4] < 0) {
          rainPos[i + 1] += 10;
          rainPos[i + 4] += 10;
        }
      }
      geo.needsUpdate = true;
    }
    // Rinnsale laufen langsam die Scheibe runter.
    if (rainTex && !reduced) rainTex.offset.y = (rainTex.offset.y + dt * 0.012) % 1;
  };

  const render = (stage: Stage3d) => {
    if (reduced) {
      stage.renderer.render(scene, camera);
      return;
    }
    ensureComposer(stage).render();
  };
  const resize = (width: number, height: number) => {
    size = { w: width, h: height };
    camera.aspect = width / height;
    camera.fov = width < height ? 82 : 60;
    camera.updateProjectionMatrix();
    composer?.setSize(width, height);
    bloom?.setSize(width, height);
  };
  const dispose = () => {
    composer?.dispose();
    disposeObject(scene);
    rainTex?.dispose();
  };
  const shake = (amount: number) => {
    kick = Math.max(kick, amount);
  };
  return { update, render, resize, head, light, shake, dispose };
}
