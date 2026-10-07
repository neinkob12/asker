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
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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
  /** Hautton und Haarfarbe des Beamten (Index aus LOOK_COLORS) für Hände und Nacken. */
  skin: string;
}

export interface HeadScreen {
  x: number;
  y: number;
  /** Höhe des Kopfes in Pixeln. */
  size: number;
  visible: boolean;
}

export interface TrafficScene {
  update(state: TrafficState, dt: number): void;
  render(stage: Stage3d): void;
  resize(width: number, height: number): void;
  /** Wo der Kopf des Beamten auf dem Bildschirm liegt (nach update). */
  head: HeadScreen;
  dispose(): void;
}

/** Wo der Beamte steht (Welt: x nach links negativ, z nach hinten positiv), je Lage. */
const SPOTS = {
  window: { x: -2.05, z: 0.1, face: Math.PI / 2 },
  rear: { x: -1.6, z: 2.9, face: Math.PI / 2 + 0.6 },
  radio: { x: -2.8, z: 1.1, face: Math.PI / 2 - 0.5 },
};

function officerFigure(skin: string): { group: Group; head: Group; lamp: SpotLight; beam: Mesh; arm: Group } {
  const g = new Group();
  const uniform = matte(0x1b2541, 0.8);
  const dark = matte(0x111318, 0.7);
  const skinMat = matte(new Color(skin).getHex(), 0.7);
  // Beine und Stiefel.
  for (const side of [-1, 1]) {
    const leg = new Mesh(new CylinderGeometry(0.09, 0.1, 0.86, 10), uniform);
    leg.position.set(side * 0.12, 0.43, 0);
    leg.castShadow = true;
    g.add(leg);
    const boot = new Mesh(new BoxGeometry(0.14, 0.1, 0.28), dark);
    boot.position.set(side * 0.12, 0.05, 0.04);
    g.add(boot);
  }
  // Rumpf mit Gürtel, Weste.
  const torso = new Mesh(new BoxGeometry(0.46, 0.62, 0.26), uniform);
  torso.position.y = 1.17;
  torso.castShadow = true;
  g.add(torso);
  const vest = new Mesh(new BoxGeometry(0.4, 0.4, 0.3), matte(0x0f1526, 0.9));
  vest.position.y = 1.2;
  g.add(vest);
  const belt = new Mesh(new BoxGeometry(0.48, 0.07, 0.28), dark);
  belt.position.y = 0.88;
  g.add(belt);
  // Reflexstreifen (leuchten im Scheinwerferlicht).
  const stripe = new Mesh(new BoxGeometry(0.42, 0.04, 0.31), glow(0xe8f0ff, 0.6, 0xc0c8d8));
  stripe.position.y = 1.0;
  g.add(stripe);
  // Arme: links hängt, rechts hält die Lampe (Gruppe, damit sie sich heben kann).
  const armL = new Mesh(new CylinderGeometry(0.05, 0.055, 0.6, 8), uniform);
  armL.position.set(-0.29, 1.15, 0);
  armL.rotation.z = 0.1;
  g.add(armL);
  const handL = new Mesh(new SphereGeometry(0.055, 8, 6), skinMat);
  handL.position.set(-0.32, 0.84, 0);
  g.add(handL);
  const arm = new Group();
  arm.position.set(0.29, 1.42, 0);
  const armR = new Mesh(new CylinderGeometry(0.05, 0.055, 0.6, 8), uniform);
  armR.position.set(0, -0.3, 0);
  arm.add(armR);
  const handR = new Mesh(new SphereGeometry(0.055, 8, 6), skinMat);
  handR.position.set(0, -0.6, 0);
  arm.add(handR);
  const torch = new Mesh(new CylinderGeometry(0.025, 0.03, 0.2, 8), dark);
  torch.position.set(0, -0.62, -0.1);
  torch.rotation.x = Math.PI / 2;
  arm.add(torch);
  const lens = new Mesh(new CylinderGeometry(0.032, 0.032, 0.02, 10), glow(0xfff2c0, 2, 0xfff2c0));
  lens.position.set(0, -0.62, -0.21);
  lens.rotation.x = Math.PI / 2;
  arm.add(lens);
  const lamp = new SpotLight(0xfff0c8, 0, 8, 0.45, 0.5, 1.2);
  lamp.position.set(0, -0.62, -0.22);
  lamp.target.position.set(0, -0.7, -3);
  arm.add(lamp);
  arm.add(lamp.target);
  const beam = new Mesh(
    new ConeGeometry(0.6, 3, 16, 1, true),
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
  beam.position.set(0, -0.62, -1.7);
  arm.add(beam);
  g.add(arm);
  // Funkgerät an der Schulter.
  const radio = new Mesh(new BoxGeometry(0.07, 0.11, 0.05), dark);
  radio.position.set(0.16, 1.45, -0.14);
  g.add(radio);
  // Hals, Kopf (unter dem HTML-Gesicht) und Mütze.
  const neck = new Mesh(new CylinderGeometry(0.06, 0.07, 0.1, 10), skinMat);
  neck.position.y = 1.52;
  g.add(neck);
  const head = new Group();
  head.position.y = 1.7;
  const skull = new Mesh(new SphereGeometry(0.095, 14, 12), skinMat);
  skull.scale.set(1, 1.15, 1);
  head.add(skull);
  const cap = new Mesh(new CylinderGeometry(0.105, 0.1, 0.07, 16), uniform);
  cap.position.y = 0.09;
  head.add(cap);
  g.add(head);
  return { group: g, head, lamp, beam, arm };
}

export function createTrafficScene(options: TrafficSceneOptions): TrafficScene {
  const { phase, rain, reduced } = options;
  const night = phase === 'night';
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 16 / 9, 0.05, 300);
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
    emissiveIntensity: night ? 1.2 : phase === 'dusk' ? 0.4 : 0,
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
    const street = new PointLight(0xffd9a0, 60, 30, 1.5);
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
  const roof = new Mesh(new BoxGeometry(2.0, 0.06, 2.6), trim);
  roof.position.set(0, roofY, 0.2);
  interior.add(roof);
  const roofRail = new Mesh(new BoxGeometry(0.12, 0.08, 1.9), trim);
  roofRail.position.set(doorX, roofY - 0.04, 0.25);
  interior.add(roofRail);
  // Scheibe in der Tür (leicht getönt, bei Regen mit Tropfen).
  const glass = new Mesh(
    new PlaneGeometry(1.6, roofY - sill - 0.1),
    new MeshPhysicalMaterial({
      color: 0x8fa0b8,
      transparent: true,
      opacity: rain ? 0.16 : 0.08,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      depthWrite: false,
    }),
  );
  glass.rotation.y = Math.PI / 2;
  glass.position.set(doorX + 0.02, (roofY + sill) / 2 - 0.05, 0.2);
  interior.add(glass);
  let drops: Mesh[] = [];
  if (rain && !reduced) {
    const dropMat = new MeshPhysicalMaterial({ color: 0xcfdcee, transparent: true, opacity: 0.35, roughness: 0.02 });
    for (let i = 0; i < 90; i++) {
      const d = new Mesh(new SphereGeometry(0.0025 + Math.random() * 0.004, 6, 5), dropMat);
      d.scale.set(1, 1.6, 0.4);
      d.position.set(doorX + 0.035, sill + 0.05 + Math.random() * (roofY - sill - 0.2), -0.55 + Math.random() * 1.5);
      interior.add(d);
      drops.push(d);
    }
  }
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
  const officer = officerFigure(options.skin);
  officer.group.position.set(SPOTS.window.x, 0, SPOTS.window.z);
  officer.group.rotation.y = SPOTS.window.face;
  scene.add(officer.group);
  const pos = { x: SPOTS.window.x, z: SPOTS.window.z, face: SPOTS.window.face, lean: 0, torch: 0 };

  // Regen draußen.
  let rainLines: LineSegments | null = null;
  let rainPos: Float32Array | null = null;
  if (rain) {
    const n = reduced ? 100 : 300;
    rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      rainPos[i * 6] = -1.2 - Math.random() * 16;
      rainPos[i * 6 + 1] = Math.random() * 10;
      rainPos[i * 6 + 2] = (Math.random() - 0.5) * 30;
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
    bloom = new UnrealBloomPass(new Vector2(stage.width, stage.height), night ? 0.5 : 0.25, 0.5, night ? 0.7 : 0.92);
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
    const spot = state.phase === 'walk' ? SPOTS.rear : state.phase === 'radio' ? SPOTS.radio : SPOTS.window;
    const k = Math.min(1, 2.2 * dt);
    pos.x += (spot.x - pos.x) * k;
    pos.z += (spot.z - pos.z) * k;
    pos.face += (spot.face - pos.face) * k;
    // Beugt sich zum Fenster, wenn er fragt; bei einem Treffer näher.
    const wantLean = state.phase === 'ask' ? 0.28 : state.phase === 'react' && state.hits > 0 ? 0.36 : 0.08;
    pos.lean += (wantLean - pos.lean) * Math.min(1, 3 * dt);
    const wantTorch = state.phase === 'walk' || (state.phase === 'react' && state.suspicion > 0.6) ? 1 : 0;
    pos.torch += (wantTorch - pos.torch) * Math.min(1, 4 * dt);
    officer.group.position.set(pos.x, 0, pos.z);
    officer.group.rotation.y = pos.face;
    officer.group.rotation.z = -pos.lean * 0.5;
    officer.group.rotation.x = pos.lean * 0.2;
    // Atmen, Gewicht verlagern.
    officer.group.position.y = Math.sin(t * 1.7) * 0.006;
    officer.arm.rotation.x = -pos.torch * 1.3 - 0.1 + Math.sin(t * 1.3) * 0.02;
    officer.lamp.intensity = pos.torch * (night ? 60 : 25);
    (officer.beam.material as MeshBasicMaterial).opacity = pos.torch * (night ? 0.16 : 0.05);
    // Kopf leicht geneigt beim Fragen.
    officer.head.rotation.z = pos.lean * 0.4;
    officer.head.rotation.y = state.phase === 'walk' ? 0.4 : 0;
    // Blaulicht.
    setBlueLight(police, t, 1);
    // Kamera: leichtes Atmen, folgt dem Beamten mit dem Blick.
    const wantLook = new Vector3(pos.x - 0.6, 1.38 + pos.lean * 0.1, pos.z - 0.15);
    lookNow.lerp(wantLook, Math.min(1, 2.5 * dt));
    camera.position.set(camPos.x, camPos.y + Math.sin(t * 0.9) * 0.004, camPos.z + Math.sin(t * 0.6) * 0.003);
    camera.lookAt(lookNow);
    // Kopf auf dem Bildschirm.
    officer.head.getWorldPosition(headWorld);
    headTop.copy(headWorld).setY(headWorld.y + 0.14);
    const a = headWorld.clone().project(camera);
    const b = headTop.clone().project(camera);
    head.x = ((a.x + 1) / 2) * size.w;
    head.y = ((1 - a.y) / 2) * size.h;
    head.size = Math.abs(((b.y - a.y) / 2) * size.h) * 2.7;
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
    // Tropfen laufen langsam die Scheibe runter.
    for (const d of drops) {
      d.position.y -= dt * 0.01 * (0.5 + (d.scale.y - 1) * 2);
      if (d.position.y < sill + 0.05) d.position.y = roofY - 0.18;
    }
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
    camera.fov = width < height ? 86 : 70;
    camera.updateProjectionMatrix();
    composer?.setSize(width, height);
    bloom?.setSize(width, height);
  };
  const dispose = () => {
    composer?.dispose();
    disposeObject(scene);
    drops = [];
  };
  return { update, render, resize, head, dispose };
}
