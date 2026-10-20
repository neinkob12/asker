// Razzia-Lauf (Auftrag 48): das Lager im Schnitt von der Seite in 3D (three.js), wie ein Puppenhaus. Links Tresor,
// Regale und der Schacht mit Leiter, in der Mitte die Bodenklappe und Paletten, rechts das Rolltor, dahinter die
// Straße mit deinem Wagen und dem Gully. Am Spot ist es der Gehweg vor dem Büdchen. Licht fällt schräg durch die hohen
// Fenster (Staub im Strahl), Hallenlampen, nachts Laterne; kommt die Streife, flackert Blaulicht durch Fenster und
// Ritzen, es klopft am Tor, am Ende fliegt es auf. Die Kamera folgt dir seitlich. Nur Optik: liest den Zustand aus
// model.ts, ändert ihn nie (Math.random ist erlaubt, wird nur für Partikel genutzt).

import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  type CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  SpotLight,
  Vector2,
  Vector3,
} from 'three';
import { drawGoodsGlyph, type GoodsPalette, packageLook } from '../../kit/goods';
import {
  type CrackLight,
  createCrackLight,
  ParticlePool,
  POLICE_BLUE,
  POLICE_RED,
  policeBlink,
  softDotTexture,
} from '../../kit/indoor3d';
import { buildCar, type CarParts, type DayPhase, disposeObject, setBlueLight } from '../../kit/scene3d';
import type { Stage3d } from '../../kit/stage3d';
import { buildFigure, type Figure, poseFigure } from './figure';
import {
  getHide,
  type HideId,
  hideCenter,
  type PackageSize,
  type StashGoal,
  type StashHide,
  type StashSetup,
  type StashState,
} from './model';
import {
  beamTexture,
  concreteTexture,
  groundTexture,
  hazardTexture,
  labelTexture,
  shutterTexture,
  skyTexture,
  streetTexture,
  wallTexture,
  woodTexture,
  wrapTexture,
} from './textures';

/** Effekte, die die Komponente mitzählt (Sekunden seit …, −1 = noch nicht). */
export interface StashFx {
  t: number;
  /** Seit das Tor zu ist. */
  closedT: number;
  /** Seit sie reinstürmen. */
  breachT: number;
  /** Seit alles versteckt ist. */
  clearT: number;
  /** Klopfen am Tor (Stoß, klingt ab). */
  knock: number;
  /** Rammbock am Tor (Stoß, klingt ab): Das Tor beult sich nach innen. */
  ram: number;
  /** Wackeln der Kamera (0 bis 1, klingt ab). */
  shake: number;
  /** Wie nah die Sirenen sind (0 bis 1). */
  alarm: number;
  /** Hervorgehoben (das, was die Leertaste träfe, bzw. unter der Maus). */
  focus: StashGoal | null;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Im Bild (sonst am Rand anzeigen). */
  visible: boolean;
}

export interface StashScene {
  update(state: StashState, fx: StashFx, dt: number): void;
  render(stage: Stage3d): void;
  /**
   * Shader vorab bauen, auch für den Schluss (Beamte mit Taschenlampen, Licht unter dem Tor): Sonst baut three.js
   * alle Materialien neu, sobald die Lampen der Beamten dazukommen, und das Bild steht genau beim Reinstürmen. Dazu
   * Geometrie und Texturen hochladen (sonst hakt es, wenn die Kamera zum ersten Mal Richtung Tor schwenkt).
   */
  warm(stage: Stage3d): void;
  resize(width: number, height: number): void;
  /** Wohin ein Tipp zeigt: Paket, Versteck oder ein Punkt auf der Strecke. */
  pick(px: number, py: number, state: StashState): StashGoal | null;
  /** Bildschirmlage über jedem Versteck bzw. über deinem Kopf (nach update). */
  hideScreen: Partial<Record<HideId, ScreenPoint>>;
  head: ScreenPoint;
  /** Stelle auf der Strecke → Bildschirm (für Texte über Verstecken). */
  project(x: number, y: number, z: number): ScreenPoint;
  /** Kurzer Effekt: verstaut, nass, abgelehnt, aufgehoben, Staub. */
  burst(kind: 'stow' | 'splash' | 'refuse' | 'pick' | 'dust', x: number, y?: number, z?: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------- Maße

/** Tiefe (z) der Dinge: Rückwand hinten, du läufst bei z = 0, vorn ist der Schnitt. */
const BACK = -2.6;
const FRONT = 1.6;
const CEIL = 5;
const RACK_Z = -1.85;
const PALLET_Z = -1;
const DROP_Z = 0.3;
/** Boden im Schnitt unter der Halle, Hohlraum unter der Klappe, Dachhöhe über der Decke. */
const GROUND_DEPTH = 3.2;
const CAVITY_H = 0.75;
const ROOF_RISE = 2;
const SKY_TOP: Record<DayPhase, string> = { day: '#5f8fc4', dusk: '#2a2f6b', night: '#05070f' };
const SKY_HORIZON: Record<DayPhase, string> = { day: '#c9dcef', dusk: '#e8884a', night: '#1b2140' };

/** Abmessungen eines Pakets je Größe (Breite, Höhe, Tiefe in Metern). */
const PKG_DIM: Record<PackageSize, [number, number, number]> = {
  1: [0.4, 0.25, 0.32],
  2: [0.56, 0.36, 0.44],
  3: [0.74, 0.5, 0.56],
};

/** Tiefe eines Verstecks (Mitte) je Art. */
const HIDE_Z: Record<HideId, number> = {
  vault: -1.95,
  vent: -2.5,
  floor: -0.25,
  trunk: -1.25,
  drain: 0.75,
  planter: -1.65,
  mailbox: -2.45,
  bin: -1.75,
};

/** Licht je Tageszeit: Licht durch die Fenster, Himmel, Außenlicht. */
const LIGHT: Record<DayPhase, { sun: number; sunI: number; sky: number; ground: number; hemiI: number; bg: number }> = {
  day: { sun: 0xfff0d6, sunI: 2.6, sky: 0xc9d8e8, ground: 0x3a342c, hemiI: 0.32, bg: 0x1a1d22 },
  dusk: { sun: 0xffa060, sunI: 1.8, sky: 0x8a6a8a, ground: 0x2a2228, hemiI: 0.26, bg: 0x15121a },
  night: { sun: 0x8aa4ff, sunI: 0.7, sky: 0x2c3a66, ground: 0x15161c, hemiI: 0.2, bg: 0x07080c },
};

/** Stärke des Aufhelllichts von vorn je Tageszeit. */
const FILL: Record<DayPhase, number> = { day: 0.35, dusk: 0.5, night: 0.6 };

function std(color: number, rough = 0.85, metal = 0.05): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function box(
  parent: Object3D,
  w: number,
  h: number,
  d: number,
  material: MeshStandardMaterial | MeshBasicMaterial,
  x: number,
  y: number,
  z: number,
  shadow: 'cast' | 'receive' | 'both' | 'none' = 'both',
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow === 'cast' || shadow === 'both';
  mesh.receiveShadow = shadow === 'receive' || shadow === 'both';
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------------------------- Verstecke

interface HideView {
  hide: StashHide;
  group: Group;
  /** Klappe, Tür, Deckel (dreht beim Verstauen auf), sonst null. */
  lid: Group | null;
  /** Wie die Klappe aufgeht: Achse und Winkel. */
  open: { axis: 'x' | 'y' | 'z'; angle: number };
  /** Leuchtfleck bei Fokus. */
  glow: MeshBasicMaterial;
  proxy: Mesh;
  z: number;
}

/** Tresor: Stahlschrank mit Rad und Griff, die Tür schwingt nach vorn auf. */
function buildVault(h: StashHide, metal: MeshStandardMaterial): { group: Group; lid: Group } {
  const g = new Group();
  const cx = hideCenter(h);
  g.position.set(cx, 0, HIDE_Z.vault);
  box(g, h.w, h.h, 0.9, metal, 0, h.h / 2, 0);
  box(g, h.w * 0.9, 0.08, 0.95, std(0x22262b, 0.4, 0.8), 0, h.h - 0.04, 0);
  const lid = new Group();
  lid.position.set(-h.w / 2 + 0.02, 0, 0.47);
  g.add(lid);
  const door = box(lid, h.w - 0.1, h.h - 0.16, 0.08, std(0x3c4148, 0.35, 0.85), (h.w - 0.1) / 2 + 0.03, h.h / 2, 0.02);
  const dial = new Mesh(new CylinderGeometry(0.14, 0.14, 0.05, 24), std(0xc9a64a, 0.3, 0.9));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.05, 0.25, 0.06);
  door.add(dial);
  const handle = box(door, 0.04, 0.3, 0.05, std(0xb0b6bc, 0.25, 1), 0.36, -0.1, 0.07, 'cast');
  handle.rotation.z = 0.5;
  return { group: g, lid };
}

/** Lüftungsschacht oben an der Wand mit Gitter; die Leiter steht darunter. */
function buildVent(h: StashHide, metal: MeshStandardMaterial): { group: Group; lid: Group } {
  const g = new Group();
  g.position.set(hideCenter(h), h.y, BACK + 0.05);
  box(g, h.w + 0.12, h.h + 0.12, 0.1, std(0x2c3034, 0.6, 0.6), 0, h.h / 2, 0.02);
  box(g, h.w, h.h, 0.02, new MeshBasicMaterial({ color: 0x050607 }), 0, h.h / 2, 0.06, 'none');
  const lid = new Group();
  lid.position.set(0, h.h, 0.09);
  g.add(lid);
  for (let i = 0; i < 6; i++) box(lid, h.w, 0.04, 0.05, metal, 0, -0.06 - i * 0.1, 0, 'cast');
  // Leiter.
  const ladder = new Group();
  ladder.position.set(0, -h.y, 0.42);
  ladder.rotation.x = -0.12;
  const rail = std(0xb8bdc2, 0.35, 0.9);
  box(ladder, 0.05, h.y + 0.2, 0.05, rail, -0.24, (h.y + 0.2) / 2, 0, 'cast');
  box(ladder, 0.05, h.y + 0.2, 0.05, rail, 0.24, (h.y + 0.2) / 2, 0, 'cast');
  for (let y = 0.3; y < h.y; y += 0.32) box(ladder, 0.5, 0.035, 0.035, rail, 0, y, 0, 'cast');
  g.add(ladder);
  return { group: g, lid };
}

/** Bodenklappe: Bretter im Boden, darunter ein dunkles Loch; der Deckel klappt nach hinten auf. */
function buildHatch(h: StashHide, wood: MeshStandardMaterial): { group: Group; lid: Group } {
  const g = new Group();
  g.position.set(hideCenter(h), 0, HIDE_Z.floor);
  box(g, h.w, 0.02, 1.1, new MeshBasicMaterial({ color: 0x050403 }), 0, 0.006, 0, 'none');
  const lid = new Group();
  lid.position.set(0, 0.02, -0.55);
  g.add(lid);
  for (let i = 0; i < 5; i++) box(lid, h.w - 0.02, 0.04, 0.2, wood, 0, 0.02, 0.11 + i * 0.22, 'both');
  const ring = new Mesh(new CylinderGeometry(0.06, 0.06, 0.015, 16, 1, true), std(0x8a8f94, 0.3, 1));
  ring.position.set(0, 0.05, 0.95);
  lid.add(ring);
  return { group: g, lid };
}

/** Gully: Gitter im Rinnstein. */
function buildDrain(h: StashHide, z: number): { group: Group; lid: Group } {
  const g = new Group();
  g.position.set(hideCenter(h), 0, z);
  box(g, h.w + 0.1, 0.02, 0.6, std(0x1a1b1c, 0.6, 0.4), 0, 0.012, 0, 'receive');
  const lid = new Group();
  lid.position.set(0, 0.03, -0.25);
  g.add(lid);
  const iron = std(0x2b2d30, 0.5, 0.75);
  for (let i = 0; i < 6; i++)
    box(lid, 0.05, 0.03, 0.5, iron, -h.w / 2 + 0.08 + i * ((h.w - 0.16) / 5), 0, 0.25, 'both');
  box(lid, h.w, 0.03, 0.05, iron, 0, 0, 0.02);
  box(lid, h.w, 0.03, 0.05, iron, 0, 0, 0.48);
  return { group: g, lid };
}

/** Blumenkübel aus Beton mit Grün. */
function buildPlanter(h: StashHide): { group: Group; lid: Group } {
  const g = new Group();
  g.position.set(hideCenter(h), 0, HIDE_Z.planter);
  box(g, h.w, h.h * 0.75, 0.9, std(0x8d8a84, 0.95), 0, (h.h * 0.75) / 2, 0);
  const lid = new Group();
  lid.position.set(0, h.h * 0.75, 0);
  g.add(lid);
  const leaf = std(0x2f5a2c, 0.8);
  for (let i = 0; i < 7; i++) {
    const s = new Mesh(new SphereGeometry(0.22 + (i % 3) * 0.05, 10, 8), leaf);
    s.position.set(-h.w / 2 + 0.2 + (i % 4) * 0.27, 0.12 + (i % 2) * 0.1, i < 4 ? -0.15 : 0.18);
    s.castShadow = true;
    lid.add(s);
  }
  return { group: g, lid };
}

/** Briefkasten (gelb) an der Fassade, Klappe nach vorn. */
function buildMailbox(h: StashHide): { group: Group; lid: Group } {
  const g = new Group();
  g.position.set(hideCenter(h), h.y, HIDE_Z.mailbox);
  const yellow = std(0xf2c500, 0.45, 0.2);
  box(g, h.w, h.h, 0.32, yellow, 0, h.h / 2, 0);
  const lid = new Group();
  lid.position.set(0, h.h - 0.08, 0.17);
  g.add(lid);
  box(lid, h.w - 0.1, 0.12, 0.03, std(0xd9ae00, 0.4, 0.3), 0, -0.06, 0, 'cast');
  box(g, 0.1, 0.06, 0.02, std(0x1d3b8a, 0.5), 0, h.h * 0.45, 0.17, 'none');
  return { group: g, lid };
}

/** Mülltonne (grau mit grünem Deckel), Deckel klappt nach hinten. */
function buildBin(h: StashHide): { group: Group; lid: Group } {
  const g = new Group();
  g.position.set(hideCenter(h), 0, HIDE_Z.bin);
  box(g, h.w, h.h - 0.08, 0.8, std(0x4a4f52, 0.7, 0.1), 0, (h.h - 0.08) / 2 + 0.06, 0);
  for (const sx of [-1, 1]) {
    const wheel = new Mesh(new CylinderGeometry(0.1, 0.1, 0.06, 12), std(0x111111, 0.9));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (h.w / 2 - 0.08), 0.1, -0.38);
    g.add(wheel);
  }
  const lid = new Group();
  lid.position.set(0, h.h - 0.02, -0.4);
  g.add(lid);
  box(lid, h.w + 0.06, 0.06, 0.86, std(0x2f6b3a, 0.55, 0.1), 0, 0, 0.42);
  return { group: g, lid };
}

// ---------------------------------------------------------------------------------------------- Szene

export function createStashScene(
  setup: StashSetup,
  phase: DayPhase,
  reduced: boolean,
  goods: GoodsPalette,
): StashScene {
  const warehouse = setup.setting === 'warehouse';
  const light = LIGHT[phase];
  const scene = new Scene();
  scene.background = new Color(light.bg);
  scene.fog = new Fog(light.bg, 26, 60);
  const camera = new PerspectiveCamera(30, 1, 0.5, 120);
  const textures: CanvasTexture[] = [];
  const keep = <T extends CanvasTexture>(t: T): T => {
    textures.push(t);
    return t;
  };
  const dot = keep(softDotTexture());
  const L = setup.length;
  const gate = setup.gate;
  const inside = gate ?? L;

  // ------------------------------------------------------------ Licht
  const hemi = new HemisphereLight(light.sky, light.ground, light.hemiI);
  scene.add(hemi);
  scene.add(new AmbientLight(0xffffff, 0.08));
  const sun = new DirectionalLight(light.sun, light.sunI);
  sun.position.set(-4, 14, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -11;
  sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -6;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  // Hallenlampen bzw. Laterne: warmes Licht von oben.
  const lamps: PointLight[] = [];
  const lampXs = warehouse ? [3.5, 9.5, 15.5] : [6, 16];
  const lampMat = new MeshStandardMaterial({ color: 0x222222, emissive: 0xfff1d0, emissiveIntensity: 2.2 });
  for (const x of lampXs) {
    const lamp = new PointLight(0xffd9a0, warehouse ? 34 : phase === 'day' ? 4 : 24, 12, 1.5);
    lamp.position.set(x, warehouse ? 4.3 : 4.1, -0.6);
    scene.add(lamp);
    lamps.push(lamp);
    if (warehouse) {
      box(scene, 1.3, 0.06, 0.18, lampMat, x, 4.45, -0.6, 'none');
      box(scene, 0.02, 0.5, 0.02, std(0x222222), x, 4.75, -0.6, 'none');
    }
  }
  // Blaulicht draußen (aus, bis die Streife da ist) und das Licht, das unter dem Tor durchfällt.
  const police = new PointLight(0x3a7bff, 0, 18, 1.4);
  police.position.set(warehouse ? (gate as number) + 4 : L + 1, 2.2, 1.5);
  scene.add(police);
  // Blau-rot innen: fällt durch Fenster und Ritzen in die Halle, sobald die Streife da ist.
  const policeIn = new PointLight(0x3a7bff, 0, 14, 1.3);
  policeIn.position.set(warehouse ? (gate as number) - 2.5 : L - 3, 3.4, -1.2);
  scene.add(policeIn);
  // Aufhelllicht von vorn (von der Kamera): Im Schnitt sieht man die Seite, die der Sonne abgewandt ist; ohne
  // dieses Licht wären Wagen, Figur und Regale nachts nur Umrisse.
  const fill = new DirectionalLight(phase === 'night' ? 0xb8c6ff : 0xfff2e0, FILL[phase]);
  fill.position.set(0, 4, 20);
  scene.add(fill);
  // Gegenlicht von hinten oben: Kanten der Figuren heben sich ab.
  const rim = new DirectionalLight(0xa9c0ff, phase === 'night' ? 0.9 : 0.6);
  rim.position.set(6, 9, -14);
  scene.add(rim);
  // Licht, das beim Reinstürmen durchs Tor flutet.
  const flood = new SpotLight(0xe8f0ff, 0, 26, 0.7, 0.6, 1.2);
  flood.position.set(warehouse ? (gate as number) + 3 : L + 2, 2.4, 0.5);
  flood.target.position.set(warehouse ? 10 : L - 8, 0, -0.5);
  scene.add(flood);
  scene.add(flood.target);

  // ------------------------------------------------------------ Boden und Wände
  const concrete = keep(concreteTexture());
  concrete.repeat.set(inside / 4, (FRONT - BACK) / 4);
  const floor = new Mesh(
    new PlaneGeometry(inside, FRONT - BACK),
    warehouse
      ? new MeshStandardMaterial({ map: concrete, roughness: 0.82, metalness: 0.02 })
      : new MeshStandardMaterial({ map: keep(streetTexture('paving')), roughness: 0.9 }),
  );
  if (!warehouse) (floor.material as MeshStandardMaterial).map?.repeat.set(inside / 2, (FRONT - BACK) / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(inside / 2, 0, (FRONT + BACK) / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  // Schnittkante vorn: Boden im Schnitt (Puppenhaus), unter der Bodenklappe der Hohlraum mit dem Versteckten.
  const section = new MeshBasicMaterial({ color: 0x2b2f36 });
  const ground = keep(groundTexture());
  const groundW = inside + (warehouse ? L - inside + 10 : 24);
  ground.repeat.set(groundW / 4, 1);
  // Unbeleuchtet: Ein Schnitt sieht aus wie gezeichnet, nicht wie eine Wand im Dunkeln.
  const groundMat = new MeshBasicMaterial({ map: ground, color: 0x9a9184 });
  box(
    scene,
    groundW,
    GROUND_DEPTH,
    0.3,
    groundMat,
    groundW / 2 - (warehouse ? 0 : 12),
    -GROUND_DEPTH / 2,
    FRONT + 0.15,
    'none',
  );
  const cavityHide = getHide(setup, 'floor');
  if (cavityHide) {
    const cavity = new MeshStandardMaterial({ color: 0x2a2219, roughness: 1 });
    box(
      scene,
      cavityHide.w + 0.5,
      CAVITY_H,
      0.05,
      cavity,
      hideCenter(cavityHide),
      -CAVITY_H / 2 - 0.02,
      FRONT + 0.31,
      'none',
    );
    const cavityLight = new PointLight(0xffb060, 1.2, 2.5, 1.5);
    cavityLight.position.set(hideCenter(cavityHide), -0.3, FRONT + 0.9);
    scene.add(cavityLight);
  }
  // Himmel weit hinten (über dem Dach und draußen zu sehen).
  const sky = new Mesh(
    new PlaneGeometry(160, 40),
    new MeshBasicMaterial({ map: keep(skyTexture(SKY_TOP[phase], SKY_HORIZON[phase])), fog: false }),
  );
  sky.position.set(L / 2, 12, -30);
  scene.add(sky);

  const wallTex = keep(wallTexture());
  if (warehouse) {
    wallTex.repeat.set(inside / 4, 1);
    const wallMat = new MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.15 });
    const wall = new Mesh(new PlaneGeometry(inside, CEIL), wallMat);
    wall.position.set(inside / 2, CEIL / 2, BACK);
    wall.receiveShadow = true;
    scene.add(wall);
    // Linke Wand und Decke als Schnitt.
    box(scene, 0.35, CEIL + 0.35, FRONT - BACK + 0.3, section, -0.17, (CEIL + 0.35) / 2, (FRONT + BACK) / 2, 'none');
    box(scene, inside + 0.35, 0.35, FRONT - BACK + 0.3, section, inside / 2, CEIL + 0.17, (FRONT + BACK) / 2, 'none');
    // Satteldach im Schnitt: zwei Dachflächen, dazwischen der dunkle Dachboden.
    const roofMat = new MeshBasicMaterial({ color: 0x3a3f47 });
    const pitch = Math.atan2(ROOF_RISE, inside / 2);
    const slope = Math.hypot(inside / 2, ROOF_RISE) + 0.6;
    for (const side of [-1, 1]) {
      const roof = box(
        scene,
        slope,
        0.22,
        FRONT - BACK + 0.5,
        roofMat,
        inside / 2 + (side * inside) / 4,
        CEIL + 0.35 + ROOF_RISE / 2,
        (FRONT + BACK) / 2,
        'none',
      );
      roof.rotation.z = -side * pitch;
    }
    const attic = new Mesh(new PlaneGeometry(inside, ROOF_RISE), new MeshBasicMaterial({ color: 0x1c1f24 }));
    attic.position.set(inside / 2, CEIL + 0.35 + ROOF_RISE / 2, BACK - 0.05);
    scene.add(attic);
    // Dachbinder.
    const steel = std(0x30343a, 0.6, 0.7);
    for (let x = 2; x < inside; x += 4) {
      box(scene, 0.12, 0.12, FRONT - BACK, steel, x, CEIL - 0.25, (FRONT + BACK) / 2, 'cast');
      box(scene, 0.12, CEIL, 0.16, steel, x, CEIL / 2, BACK + 0.1, 'cast');
    }
    // Gelbe Linie am Boden (Gang).
    const hazard = keep(hazardTexture());
    hazard.repeat.set(inside / 2, 1);
    const stripe = new Mesh(
      new PlaneGeometry(inside - 1, 0.12),
      new MeshStandardMaterial({ map: hazard, roughness: 0.7 }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(inside / 2, 0.004, 0.95);
    stripe.receiveShadow = true;
    scene.add(stripe);
  } else {
    // Fassade des Büdchens mit Schaufenster und Leuchtschrift.
    const facade = new Mesh(
      new PlaneGeometry(L + 12, 6),
      new MeshStandardMaterial({ map: wallTex, roughness: 0.9, color: 0xc9b8a0 }),
    );
    wallTex.repeat.set((L + 12) / 4, 1);
    facade.position.set(L / 2, 3, BACK);
    facade.receiveShadow = true;
    scene.add(facade);
    const shop = new MeshStandardMaterial({ color: 0x1b2026, emissive: 0xffc98a, emissiveIntensity: 0.55 });
    box(scene, 4.2, 1.9, 0.05, shop, 9.5, 1.45, BACK + 0.03, 'none');
    const sign = new MeshStandardMaterial({ color: 0x111111, emissive: 0xff5a3c, emissiveIntensity: 1.6 });
    box(scene, 3.4, 0.4, 0.08, sign, 9.5, 2.85, BACK + 0.06, 'none');
    // Straße vorn.
    const asphalt = keep(streetTexture('asphalt'));
    asphalt.repeat.set((L + 12) / 4, 2);
    const road = new Mesh(new PlaneGeometry(L + 12, 6), new MeshStandardMaterial({ map: asphalt, roughness: 0.75 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(L / 2, -0.12, FRONT + 3);
    road.receiveShadow = true;
    scene.add(road);
    box(scene, L + 12, 0.14, 0.22, std(0x9a958c, 0.9), L / 2, -0.05, FRONT + 0.05, 'receive');
    // Bank, auf der die Ware liegt.
    const wood = new MeshStandardMaterial({ map: keep(woodTexture()), roughness: 0.75 });
    box(scene, 4, 0.08, 0.5, wood, 15, 0.46, -1.25);
    box(scene, 4, 0.4, 0.06, wood, 15, 0.85, -1.5);
    for (const x of [13.3, 16.7]) box(scene, 0.08, 0.46, 0.5, std(0x2b2e31, 0.5, 0.7), x, 0.23, -1.25);
    // Laterne.
    box(scene, 0.12, 4.3, 0.12, std(0x2b2e31, 0.5, 0.7), 6, 2.15, -1.9);
    box(scene, 0.5, 0.12, 0.3, lampMat, 6, 4.25, -1.6, 'none');
  }

  // ------------------------------------------------------------ Fenster, Lichtstrahlen, Staub
  const windows: MeshStandardMaterial[] = [];
  const beamMat = new MeshBasicMaterial({
    map: keep(beamTexture()),
    color: light.sun,
    transparent: true,
    opacity: phase === 'night' ? 0.1 : phase === 'dusk' ? 0.17 : 0.2,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  if (warehouse) {
    for (const x of [3, 9, 15]) {
      const pane = new MeshStandardMaterial({
        color: 0x0c0f14,
        emissive: light.sun,
        emissiveIntensity: phase === 'night' ? 0.3 : 0.75,
        roughness: 0.2,
      });
      windows.push(pane);
      box(scene, 2.2, 0.9, 0.05, pane, x, 3.85, BACK + 0.04, 'none');
      for (let i = -1; i <= 1; i++) box(scene, 0.04, 0.9, 0.06, std(0x1d2024), x + i * 0.73, 3.85, BACK + 0.06, 'none');
      // Schräger Lichtstrahl bis auf den Boden.
      const beam = new Mesh(new PlaneGeometry(2.2, 5.2), beamMat);
      beam.position.set(x + 1.2, 2.2, -0.9);
      beam.rotation.set(-0.55, 0, 0.32);
      scene.add(beam);
    }
  }
  const motes = new Points(
    (() => {
      const g = new BufferGeometry();
      const n = reduced ? 60 : 160;
      const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++)
        p.set([Math.random() * inside, 0.4 + Math.random() * 4, BACK + Math.random() * 3], i * 3);
      g.setAttribute('position', new BufferAttribute(p, 3));
      return g;
    })(),
    new PointsMaterial({
      size: 0.035,
      map: dot,
      color: 0xfff3dc,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  scene.add(motes);

  // ------------------------------------------------------------ Regale, Paletten, Kulisse
  const wood = new MeshStandardMaterial({ map: keep(woodTexture()), roughness: 0.8 });
  if (warehouse) {
    const upright = std(0x2f5fa8, 0.5, 0.4);
    const beam = std(0xe07a1f, 0.5, 0.4);
    for (const [x0, x1] of [
      [2.3, 5],
      [7.3, 10.1],
    ]) {
      for (const x of [x0, x1]) {
        box(scene, 0.08, 2.9, 0.08, upright, x, 1.45, RACK_Z - 0.45);
        box(scene, 0.08, 2.9, 0.08, upright, x, 1.45, RACK_Z + 0.45);
      }
      for (const y of [0.1, 1.32, 2.55]) {
        box(scene, x1 - x0, 0.1, 0.06, beam, (x0 + x1) / 2, y, RACK_Z + 0.45);
        box(scene, x1 - x0, 0.1, 0.06, beam, (x0 + x1) / 2, y, RACK_Z - 0.45);
        box(scene, x1 - x0, 0.03, 0.9, wood, (x0 + x1) / 2, y + 0.06, RACK_Z);
      }
      // Kartons oben (Kulisse).
      const carton = std(0xb08a5a, 0.95);
      for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.75) box(scene, 0.6, 0.45, 0.6, carton, x, 2.85, RACK_Z);
    }
    for (const x of [14.2, 15.6, 17, 18.4]) {
      box(scene, 1.2, 0.04, 1, wood, x, 0.13, PALLET_Z);
      for (const dx of [-0.5, 0, 0.5]) box(scene, 0.12, 0.1, 1, wood, x + dx, 0.05, PALLET_Z);
    }
    // Fässer und ein Besen.
    const barrel = std(0x2d4f7a, 0.5, 0.5);
    for (const [x, z] of [
      [13, -2.1],
      [13.7, -2.2],
    ]) {
      const b = new Mesh(new CylinderGeometry(0.3, 0.3, 0.9, 16), barrel);
      b.position.set(x, 0.45, z);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
    }
  }

  // ------------------------------------------------------------ Tor und Straße
  let shutter: Mesh | null = null;
  let gapGlow: CrackLight | null = null;
  let ourCar: CarParts | null = null;
  let trunkLid: Group | null = null;
  const copCar = buildCar('police', 0xe8ecef);
  copCar.group.rotation.y = Math.PI / 2;
  copCar.group.position.set(L + 14, 0, 2.9);
  scene.add(copCar.group);
  if (warehouse && gate !== null) {
    const g = gate;
    // Sturz über dem Tor (Schnitt) und das Rolltor.
    box(
      scene,
      0.35,
      CEIL - 3.3 + 0.35,
      FRONT - BACK + 0.3,
      section,
      g,
      (CEIL + 3.3 + 0.35) / 2,
      (FRONT + BACK) / 2,
      'none',
    );
    box(scene, 0.5, 0.45, FRONT - BACK, std(0x40464c, 0.5, 0.7), g, 3.1, (FRONT + BACK) / 2, 'cast');
    const sh = keep(shutterTexture());
    sh.repeat.set(1, 6);
    shutter = new Mesh(
      new BoxGeometry(0.12, 3.2, FRONT - BACK),
      new MeshStandardMaterial({ map: sh, roughness: 0.45, metalness: 0.6 }),
    );
    shutter.geometry.translate(0, -1.6, 0);
    shutter.position.set(g, 3.2, (FRONT + BACK) / 2);
    shutter.scale.y = 0.02;
    shutter.castShadow = true;
    scene.add(shutter);
    // Licht von draußen unter dem Tor (Blaulicht, sobald es zu ist).
    gapGlow = createCrackLight(FRONT - BACK, 2.2);
    gapGlow.mesh.rotation.z = -Math.PI / 2;
    gapGlow.mesh.position.set(g - 1.1, 0.012, (FRONT + BACK) / 2);
    scene.add(gapGlow.mesh);
    // Draußen: Asphalt, Gehweg, Hauswand gegenüber, Laterne.
    const outside = L - g + 10;
    const asphalt = keep(streetTexture('asphalt'));
    asphalt.repeat.set(outside / 4, 2);
    const road = new Mesh(
      new PlaneGeometry(outside, FRONT - BACK + 4),
      new MeshStandardMaterial({ map: asphalt, roughness: 0.8 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(g + outside / 2, -0.005, (FRONT + BACK) / 2 + 1.5);
    road.receiveShadow = true;
    scene.add(road);
    const brick = keep(wallTexture());
    brick.repeat.set(outside / 4, 1.4);
    const across = new Mesh(
      new PlaneGeometry(outside, 7),
      new MeshStandardMaterial({ map: brick, roughness: 0.9, color: 0x9d8d7c }),
    );
    across.position.set(g + outside / 2, 3.5, BACK - 0.9);
    across.receiveShadow = true;
    scene.add(across);
    box(scene, 0.12, 4.2, 0.12, std(0x2b2e31, 0.5, 0.7), g + 4.9, 2.1, BACK - 0.5);
    box(scene, 0.5, 0.12, 0.3, lampMat, g + 4.9, 4.2, BACK - 0.2, 'none');
    const street = new PointLight(0xffc483, phase === 'day' ? 2 : 14, 10, 1.6);
    street.position.set(g + 4.9, 3.9, -1.2);
    scene.add(street);
    // Dein Wagen: Heck am Kofferraum, Nase nach rechts, eigener Deckel zum Aufklappen.
    const trunk = getHide(setup, 'trunk');
    if (trunk) {
      ourCar = buildCar('car', 0x3b4a5c);
      ourCar.group.rotation.y = -Math.PI / 2;
      ourCar.group.position.set(trunk.x + 2.2, 0, HIDE_Z.trunk);
      scene.add(ourCar.group);
      trunkLid = new Group();
      trunkLid.position.set(trunk.x + 0.05, 1.12, HIDE_Z.trunk);
      box(trunkLid, 0.9, 0.06, 1.7, std(0x3b4a5c, 0.35, 0.5), 0.45, 0, 0);
      scene.add(trunkLid);
    }
  } else if (!warehouse) {
    // Am Spot: ein parkender Wagen hinten links als Kulisse.
    const parked = buildCar('van', 0x6b6f75);
    parked.group.rotation.y = Math.PI / 2;
    parked.group.position.set(-3.5, 0, FRONT + 2.2);
    scene.add(parked.group);
  }

  // ------------------------------------------------------------ Verstecke
  const metal = std(0x50565d, 0.4, 0.8);
  const hideViews: HideView[] = [];
  const proxyMat = new MeshBasicMaterial();
  for (const h of setup.hides) {
    const built =
      h.id === 'vault'
        ? buildVault(h, metal)
        : h.id === 'vent'
          ? buildVent(h, metal)
          : h.id === 'floor'
            ? buildHatch(h, wood)
            : h.id === 'drain'
              ? buildDrain(h, warehouse ? HIDE_Z.drain : FRONT - 0.35)
              : h.id === 'planter'
                ? buildPlanter(h)
                : h.id === 'mailbox'
                  ? buildMailbox(h)
                  : h.id === 'bin'
                    ? buildBin(h)
                    : null;
    const group = built?.group ?? new Group();
    if (!built) group.position.set(hideCenter(h), 0, HIDE_Z[h.id]);
    scene.add(group);
    // Leuchtfleck (Fokus): weicher Schein am Boden vor dem Versteck.
    const glowMat = new MeshBasicMaterial({
      map: dot,
      color: 0xffc94a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const ring = new Mesh(new PlaneGeometry(h.w + 1, 1.6), glowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(hideCenter(h), 0.015, h.id === 'drain' || h.id === 'floor' ? HIDE_Z[h.id] : -0.4);
    scene.add(ring);
    const z = h.id === 'drain' && !warehouse ? FRONT - 0.35 : HIDE_Z[h.id];
    const proxy = new Mesh(new BoxGeometry(h.w + 0.6, Math.max(1.2, h.h + 0.8), Math.abs(z) + 1.2), proxyMat);
    proxy.position.set(hideCenter(h), h.y + Math.max(1.2, h.h + 0.8) / 2 - 0.3, z / 2);
    proxy.userData = { kind: 'hide', id: h.id };
    proxy.updateMatrixWorld();
    const open =
      h.id === 'vault'
        ? { axis: 'y' as const, angle: -1.9 }
        : h.id === 'floor' || h.id === 'bin'
          ? { axis: 'x' as const, angle: -1.7 }
          : h.id === 'vent' || h.id === 'mailbox'
            ? { axis: 'x' as const, angle: -1.2 }
            : h.id === 'drain'
              ? { axis: 'x' as const, angle: -1.3 }
              : h.id === 'trunk'
                ? { axis: 'z' as const, angle: 1.1 }
                : { axis: 'y' as const, angle: 0 };
    hideViews.push({
      hide: h,
      group,
      lid: h.id === 'trunk' ? trunkLid : (built?.lid ?? null),
      open,
      glow: glowMat,
      proxy,
      z,
    });
  }

  // ------------------------------------------------------------ Pakete
  const glyphTex = new Map<string, CanvasTexture>();
  const wrapTex = new Map<string, CanvasTexture>();
  const pkgMeshes: Mesh[] = [];
  const pkgGlow: MeshStandardMaterial[] = [];
  const homeZ: number[] = [];
  /** Reihenfolge der Pakete im Hohlraum unter der Klappe. */
  const floorSlots: number[] = [];
  for (const p of setup.packages) {
    const look = packageLook(goods, p.productId);
    const key = `${look.color}|${look.glyph}`;
    let label = glyphTex.get(key);
    if (!label) {
      label = keep(labelTexture(look.color, (g, s) => drawGoodsGlyph(g, look.glyph, s)));
      glyphTex.set(key, label);
    }
    let wrap = wrapTex.get(look.color);
    if (!wrap) {
      wrap = keep(wrapTexture(look.color));
      wrapTex.set(look.color, wrap);
    }
    const [w, h, d] = PKG_DIM[p.size];
    const side = new MeshStandardMaterial({ map: wrap, roughness: 0.42, metalness: 0.05, emissive: 0xffc94a });
    side.emissiveIntensity = 0;
    const top = new MeshStandardMaterial({ map: label, roughness: 0.6, emissive: 0xffc94a, emissiveIntensity: 0 });
    pkgGlow.push(side, top);
    const mesh = new Mesh(new BoxGeometry(w, h, d), [side, side, top, side, top, side]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: 'package', id: p.id };
    scene.add(mesh);
    pkgMeshes.push(mesh);
    const onRack = warehouse && (p.x < 5.2 || (p.x > 7.2 && p.x < 10.2));
    homeZ.push(warehouse ? (onRack ? RACK_Z : PALLET_Z) : p.shelf === 1 ? -1.25 : -0.9);
  }
  const shelfY = (p: { x: number; shelf: 0 | 1 }, size: PackageSize): number => {
    const half = PKG_DIM[size][1] / 2;
    if (warehouse) {
      const onRack = p.x < 5.2 || (p.x > 7.2 && p.x < 10.2);
      if (onRack) return (p.shelf === 1 ? 1.41 : 0.19) + half;
      return 0.15 + half;
    }
    return (p.shelf === 1 ? 0.5 : 0) + half;
  };

  // ------------------------------------------------------------ Du und die Streife
  const me = buildFigure({ top: 0x2f5a66, legs: 0x3a4252, skin: 0xc8916a, shoes: 0xe9e5dc, cap: null });
  scene.add(me.root);
  const cops: Figure[] = [];
  const copLights: SpotLight[] = [];
  for (let i = 0; i < 2; i++) {
    const cop = buildFigure({
      top: 0x1f3152,
      legs: 0x1a2337,
      skin: 0xd9a27c,
      shoes: 0x111111,
      cap: 0x1f3152,
      stripe: 0xd8e04a,
    });
    cop.root.visible = false;
    scene.add(cop.root);
    cops.push(cop);
    const torch = new SpotLight(0xf2f6ff, 0, 14, 0.32, 0.5, 1.3);
    torch.position.set(0, 1.4, 0.2);
    cop.root.add(torch);
    torch.target.position.set(0, 0.6, 4);
    cop.root.add(torch.target);
    copLights.push(torch);
  }

  const particles = new ParticlePool(dot, { count: 220, size: 0.14, floor: 0.02 });
  scene.add(particles.points);
  const stowLight = new PointLight(0xffc94a, 0, 4, 1.5);
  scene.add(stowLight);

  // ------------------------------------------------------------ Kamera
  let width = 1;
  let height = 1;
  let viewW = 16;
  let camX = setup.start;
  let camY = 2.4;
  let dist = 20;
  let stride = 0;
  let bend = 0;
  let carryK = 0;
  let reach = 0;
  let climb = 0;
  let turn = -Math.PI / 2;
  let stowGlow = 0;
  const hideScreen: Partial<Record<HideId, ScreenPoint>> = {};
  const head: ScreenPoint = { x: 0, y: 0, visible: false };
  const v3 = new Vector3();

  const resize = (w: number, h: number) => {
    width = Math.max(1, w);
    height = Math.max(1, h);
    const aspect = width / height;
    camera.aspect = aspect;
    // Hochkant (Handy) sieht man weniger Strecke, dafür größer (die Leiste oben zeigt die ganze Strecke); breit bis
    // zu 19 m.
    viewW = aspect < 0.6 ? 5.4 : aspect < 0.8 ? 6.8 : aspect < 1.2 ? 9 : Math.min(16, 5 + aspect * 4.4);
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const forWidth = viewW / 2 / (tanHalf * aspect);
    const forHeight = 3.3 / tanHalf;
    dist = Math.max(forWidth, forHeight);
    camera.far = dist + 60;
    camera.updateProjectionMatrix();
  };
  resize(800, 600);

  const project = (x: number, y: number, z: number): ScreenPoint => {
    v3.set(x, y, z).project(camera);
    const sx = (v3.x * 0.5 + 0.5) * width;
    const sy = (-v3.y * 0.5 + 0.5) * height;
    return { x: sx, y: sy, visible: v3.z < 1 && sx > -10 && sx < width + 10 && sy > -10 && sy < height + 10 };
  };

  const ease = (k: number) => k * k * (3 - 2 * k);

  const update = (state: StashState, fx: StashFx, dt: number) => {
    const t = fx.t;
    // --- Du: Lage, Drehung, Pose.
    const action = state.action;
    const progress = action ? Math.min(1, action.t / Math.max(0.01, action.total)) : 0;
    const speed = Math.abs(state.v);
    stride += dt * (speed * 2.6 + (speed > 0.1 ? 3 : 0));
    const run = Math.min(1, speed / 5);
    const carrying = state.carry !== null || action?.kind === 'stow';
    carryK += ((carrying ? 1 : 0) - carryK) * Math.min(1, dt * 10);
    const stowHide = action?.kind === 'stow' && action.hide ? getHide(setup, action.hide) : undefined;
    const climbing = stowHide?.id === 'vent';
    const pickPkg = action?.kind === 'pickup' ? state.items[action.id] : undefined;
    const wantBend =
      action?.kind === 'pickup'
        ? pickPkg?.shelf === 1
          ? 0.1
          : 0.85 * Math.sin(progress * Math.PI) + 0.15
        : stowHide && !climbing
          ? stowHide.y < 0.3
            ? 0.9 * Math.sin(progress * Math.PI)
            : 0.35 * Math.sin(progress * Math.PI)
          : 0;
    bend += (wantBend - bend) * Math.min(1, dt * 14);
    const wantReach = action?.kind === 'pickup' && pickPkg?.shelf === 1 ? Math.sin(progress * Math.PI) : 0;
    reach += (wantReach - reach) * Math.min(1, dt * 12);
    // Leiter: hoch, kurz oben, wieder runter.
    const wantClimb = climbing
      ? Math.min(1, progress < 0.4 ? progress / 0.4 : progress > 0.75 ? (1 - progress) / 0.25 : 1)
      : 0;
    climb += (wantClimb - climb) * Math.min(1, dt * 16);
    const strain = state.carry !== null ? (setup.packages[state.carry]?.size ?? 1) / 3 : 0;
    poseFigure(me, { stride, run, carry: carryK, bend, reach, strain });
    // Leben im Stand: atmen (schneller, je näher die Streife), Gewicht verlagern, beim Klopfen zum Tor schauen.
    if (!reduced && !action && speed < 0.3 && fx.clearT < 0) {
      const pace = 1.6 + 2.4 * fx.alarm;
      me.torso.rotation.x += Math.sin(t * pace) * 0.025;
      me.torso.rotation.z = Math.sin(t * 0.7) * 0.03;
      me.head.rotation.y = fx.knock > 0.2 ? -0.6 * state.facing : Math.sin(t * 0.45) * 0.25 * fx.alarm;
    } else {
      me.torso.rotation.z = 0;
      me.head.rotation.y = 0;
    }
    // Zur Seite drehen, beim Verstauen bzw. Greifen zur Wand.
    const facingWall = (stowHide && stowHide.id !== 'drain' && stowHide.id !== 'floor') || (pickPkg && action);
    const wantTurn = facingWall ? Math.PI : state.facing > 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25;
    let dTurn = wantTurn - turn;
    while (dTurn > Math.PI) dTurn -= Math.PI * 2;
    while (dTurn < -Math.PI) dTurn += Math.PI * 2;
    turn += dTurn * Math.min(1, dt * 14);
    me.root.rotation.y = turn;
    me.root.position.set(state.x, climb * 1.7, climbing ? -1.6 * climb : 0);
    if (fx.clearT >= 0) {
      // Geschafft: an die Wand lehnen, durchatmen.
      me.root.rotation.y += (0 - me.root.rotation.y) * Math.min(1, fx.clearT * 3);
    }
    me.root.updateMatrixWorld();

    // --- Pakete.
    for (const p of setup.packages) {
      const mesh = pkgMeshes[p.id];
      const item = state.items[p.id];
      const stowing = action?.kind === 'stow' && action.id === p.id;
      if (item.hide !== null && !stowing) {
        // Unter der Bodenklappe sieht man das Versteckte im Schnitt liegen; sonst ist es weg.
        if (item.hide === 'floor' && cavityHide) {
          const k = floorSlots.indexOf(p.id) >= 0 ? floorSlots.indexOf(p.id) : floorSlots.push(p.id) - 1;
          const dims = PKG_DIM[p.size];
          mesh.visible = true;
          mesh.scale.setScalar(0.8);
          mesh.rotation.set(0, 0.1 * ((k % 2) * 2 - 1), 0);
          mesh.position.set(
            cavityHide.x + 0.2 + (k % 3) * ((cavityHide.w + 0.1) / 3),
            -CAVITY_H + 0.02 + dims[1] * 0.4 + Math.floor(k / 3) * dims[1] * 0.8,
            FRONT + 0.55,
          );
        } else mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      if (stowing && stowHide) {
        // Vom Arm ins Versteck, am Ende klein (drin).
        me.hands.getWorldPosition(v3);
        const k = ease(Math.min(1, progress * 1.25));
        const tz = stowHide.id === 'drain' && !warehouse ? FRONT - 0.35 : HIDE_Z[stowHide.id];
        mesh.position.set(
          v3.x + (hideCenter(stowHide) - v3.x) * k,
          v3.y + (stowHide.y + stowHide.h * 0.4 - v3.y) * k,
          v3.z + (tz - v3.z) * k,
        );
        const s = 1 - 0.6 * Math.max(0, (progress - 0.6) / 0.4);
        mesh.scale.setScalar(s);
        mesh.rotation.set(0, 0, 0);
      } else if (state.carry === p.id || (action?.kind === 'pickup' && action.id === p.id && progress > 0.55)) {
        me.hands.getWorldPosition(v3);
        mesh.position.copy(v3);
        mesh.position.y -= 0.02;
        mesh.rotation.set(0, me.root.rotation.y, Math.sin(stride) * 0.04 * run);
        mesh.scale.setScalar(1);
      } else {
        const moved = Math.abs(item.x - p.x) > 0.01 || item.shelf !== p.shelf;
        mesh.position.set(item.x, moved ? PKG_DIM[p.size][1] / 2 : shelfY(item, p.size), moved ? DROP_Z : homeZ[p.id]);
        mesh.rotation.set(0, moved ? 0.25 : (p.id % 3) * 0.06 - 0.06, 0);
        mesh.scale.setScalar(1);
      }
      const focused = fx.focus?.kind === 'package' && fx.focus.id === p.id && state.carry === null;
      const pulse = focused ? 0.35 + 0.25 * Math.sin(t * 7) : 0;
      (mesh.material as MeshStandardMaterial[])[0].emissiveIntensity = pulse;
      (mesh.material as MeshStandardMaterial[])[2].emissiveIntensity = pulse * 0.6;
    }

    // --- Verstecke: Klappe auf und zu, Leuchtrand bei Fokus.
    for (const view of hideViews) {
      const h = view.hide;
      const active = stowHide?.id === h.id;
      const open = active ? Math.sin(Math.min(1, progress * 1.15) * Math.PI) : 0;
      if (view.lid) {
        const k = (view.lid.userData.open ?? 0) as number;
        const next = k + (open - k) * Math.min(1, dt * 18);
        view.lid.userData.open = next;
        view.lid.rotation[view.open.axis] = view.open.angle * next;
      }
      const closed = h.outside && fx.closedT >= 0;
      const focused = fx.focus?.kind === 'hide' && fx.focus.id === h.id;
      const want = closed ? 0 : focused ? 0.55 + 0.2 * Math.sin(t * 6) : 0;
      view.glow.opacity += (want - view.glow.opacity) * Math.min(1, dt * 10);
    }

    // --- Tor, Streife, Blaulicht, Klopfen, Reinstürmen.
    const blink = policeBlink(t);
    const copOn = fx.closedT >= 0 || fx.breachT >= 0 ? 1 : Math.max(0, (fx.alarm - 0.55) / 0.45) * 0.5;
    if (shutter && gate !== null) {
      const down =
        fx.breachT >= 0 ? Math.max(0, 1 - fx.breachT * 3) : fx.closedT >= 0 ? Math.min(1, fx.closedT / 0.35) : 0;
      shutter.scale.y = Math.max(0.02, down);
      // Beim Rammen beult es sich nach innen (zur Halle) und federt zurück.
      const bulge = fx.ram > 0 ? -0.16 * fx.ram ** 2 : 0;
      shutter.position.x = gate + bulge + (fx.knock > 0 ? Math.sin(t * 90) * 0.03 * fx.knock : 0);
      shutter.scale.z = 1 - 0.04 * fx.ram;
    }
    if (gapGlow) {
      // Licht unter dem Tor; bei jedem Stoß des Rammbocks springt der Spalt auf.
      const leak = fx.closedT >= 0 && fx.breachT < 0 ? (blink ? 0.75 : 0.3) + 0.9 * fx.ram : 0;
      gapGlow.set(leak, fx.ram > 0.5 ? 0xe8f0ff : blink ? POLICE_BLUE : POLICE_RED);
    }
    police.intensity = copOn * (blink ? 26 : 18) * (fx.closedT >= 0 ? 1 : 0.6);
    police.color.setHex(blink ? POLICE_BLUE : POLICE_RED);
    // Das Blaulicht fällt durch die Fenster dort, wo du gerade bist.
    policeIn.position.x = camX + (blink ? 2 : -2);
    policeIn.intensity = copOn * (blink ? 34 : 18) * (fx.breachT >= 0 ? 0.5 : 1);
    policeIn.color.setHex(blink ? POLICE_BLUE : POLICE_RED);
    for (const w of windows) {
      if (copOn > 0) {
        w.emissive.setHex(blink ? POLICE_BLUE : POLICE_RED);
        w.emissiveIntensity = 0.6 + 1.6 * copOn * (blink ? 1 : 0.6);
      } else {
        w.emissive.setHex(light.sun);
        w.emissiveIntensity = phase === 'night' ? 0.3 : 0.75;
      }
    }
    // Die Streife fährt vor (draußen vor dem Tor bzw. am Spot an den Rand).
    const arrive = fx.closedT >= 0 || fx.breachT >= 0 ? 1 : Math.max(0, (fx.alarm - 0.82) / 0.18);
    const stopX = warehouse ? L + 2.6 : L - 2;
    const fromX = L + 18;
    const k = ease(Math.min(1, arrive));
    copCar.group.position.x = fromX + (stopX - fromX) * k;
    setBlueLight(copCar, t, arrive > 0 ? 1 : 0);
    // Reinstürmen: Tor hoch, Licht flutet rein, zwei Beamte mit Taschenlampen.
    if (fx.breachT >= 0) {
      const b = fx.breachT;
      flood.intensity = Math.min(1, b * 4) * 140 * (0.85 + 0.15 * Math.sin(t * 30));
      const entry = warehouse ? (gate as number) + 1 : L + 1;
      cops.forEach((cop, i) => {
        cop.root.visible = true;
        const run = Math.max(0, b - 0.15 - i * 0.25);
        const x = entry - Math.min(5 + i * 1.5, run * 6.5);
        cop.root.position.set(x, 0, i === 0 ? 0.4 : -0.7);
        cop.root.rotation.y = -Math.PI / 2 + 0.3;
        poseFigure(cop, {
          stride: run * 13,
          run: run > 0 && x > entry - 5 - i * 1.5 ? 1 : 0,
          carry: 0.6,
          bend: 0,
          reach: 0,
          strain: 0,
        });
        copLights[i].intensity = Math.min(1, run * 3) * 70;
        copLights[i].target.position.set(-1.5, 0.4 + Math.sin(t * 3 + i) * 0.3, 4 + Math.sin(t * 2.3 + i * 2) * 2);
      });
    }

    // --- Licht beim Verstauen, Staub, Partikel.
    stowGlow = Math.max(0, stowGlow - dt * 3);
    stowLight.intensity = stowGlow * 10;
    particles.update(dt);
    if (!reduced) {
      const pos = motes.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        const y = pos.getY(i) + Math.sin(t * 0.7 + i) * 0.0015;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.cos(t * 0.4 + i * 1.3) * 0.0012);
      }
      pos.needsUpdate = true;
    }
    if (speed > 3.5 && Math.random() < dt * 8) particles.emit(state.x, 0.05, 0, 1, 0x5a5248, 0.5, 1.2, 0.5);

    // --- Kamera: folgt dir mit Vorlauf in Blickrichtung, bleibt in der Szene; wackelt bei Stößen.
    const lead = state.facing * Math.min(1.6, viewW * 0.12);
    const half = viewW / 2;
    const minX = half - 1.2;
    const maxX = L - half + (warehouse ? 1.5 : 1);
    let wantX = maxX < minX ? (minX + maxX) / 2 : Math.min(maxX, Math.max(minX, state.x + lead));
    if (fx.breachT >= 0) {
      // Sie stürmen rein: Die Kamera schwenkt zum Tor (bzw. zur Streife am Spot).
      const door = Math.min(maxX, (warehouse ? (gate as number) : L) - half * 0.35);
      wantX += (door - wantX) * ease(Math.min(1, fx.breachT * 1.6));
    }
    camX += (wantX - camX) * Math.min(1, dt * (fx.breachT >= 0 ? 5 : 3.2));
    // Hochkant tiefer: Dach und Himmel nehmen sonst das obere Drittel ein.
    const wantY = (width / height < 0.8 ? 1.75 : 2.25) + climb * 0.6;
    camY += (wantY - camY) * Math.min(1, dt * 4);
    const shake = reduced ? fx.shake * 0.2 : fx.shake;
    const sx = shake > 0.01 ? Math.sin(t * 71) * 0.12 * shake : 0;
    const sy = shake > 0.01 ? Math.cos(t * 53) * 0.08 * shake : 0;
    // Zum Schluss rückt die Kamera näher (Enge), bis sie reinstürmen.
    const tight = fx.breachT >= 0 || fx.clearT >= 0 ? 0 : Math.max(0, (fx.alarm - 0.78) / 0.22);
    camera.position.set(camX + sx, camY + 2.1 + sy, dist * (0.98 - 0.12 * tight));
    camera.lookAt(camX + sx * 0.5, camY + 0.5, -0.7);
    camera.updateMatrixWorld();
    // Schatten folgen der Kamera.
    sun.position.set(camX - 4, 14, -12);
    sun.target.position.set(camX, 0, 0);
    sun.target.updateMatrixWorld();
    // Licht ganz am Ende gedimmt (geschafft) bzw. kalt (Razzia).
    if (fx.clearT >= 0) for (const lamp of lamps) lamp.intensity = Math.max(2, lamp.intensity - dt * 8);
    // Bildschirmlagen erst jetzt, mit der Kamera dieses Bilds.
    for (const view of hideViews) {
      const h = view.hide;
      // Verstecke am Boden: Name unter der Bodenkante (im Schnitt), sonst stünde er dir vor der Brust.
      hideScreen[h.id] =
        h.y + h.h < 0.4 ? project(hideCenter(h), -0.25, FRONT + 0.3) : project(hideCenter(h), h.y + h.h + 0.55, view.z);
    }
    me.head.getWorldPosition(v3);
    const hp = project(v3.x, v3.y + 0.45, v3.z);
    head.x = hp.x;
    head.y = hp.y;
    head.visible = hp.visible;
  };

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const floorHit = new Vector3();
  const pick = (px: number, py: number, state: StashState): StashGoal | null => {
    ndc.set((px / width) * 2 - 1, -(py / height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets: Mesh[] = [];
    for (const p of setup.packages) {
      const mesh = pkgMeshes[p.id];
      if (mesh.visible && state.items[p.id].hide === null && state.carry !== p.id) {
        mesh.updateMatrixWorld();
        targets.push(mesh);
      }
    }
    // Pakete zuerst (sie liegen vor den Verstecken), mit etwas Rand: ein Tipp knapp daneben trifft auch.
    const hits = raycaster.intersectObjects(targets, false);
    if (hits[0]) return { kind: 'package', id: hits[0].object.userData.id as number };
    const ray = raycaster.ray;
    let near: { id: number; d: number } | null = null;
    for (const mesh of targets) {
      const d = ray.distanceToPoint(mesh.position);
      if (d < 0.45 && (!near || d < near.d)) near = { id: mesh.userData.id as number, d };
    }
    if (near) return { kind: 'package', id: near.id };
    const hide = raycaster.intersectObjects(
      hideViews.map((v) => v.proxy),
      false,
    )[0];
    if (hide) return { kind: 'hide', id: hide.object.userData.id as HideId };
    // Sonst: ein Punkt auf der Laufbahn (Schnitt mit dem Boden bzw. der Ebene z = 0).
    const tFloor = ray.direction.y < -0.01 ? -ray.origin.y / ray.direction.y : -1;
    if (tFloor > 0) {
      ray.at(tFloor, floorHit);
      return { kind: 'point', x: floorHit.x };
    }
    const tPlane = ray.direction.z !== 0 ? -ray.origin.z / ray.direction.z : -1;
    if (tPlane > 0) {
      ray.at(tPlane, floorHit);
      return { kind: 'point', x: floorHit.x };
    }
    return null;
  };

  const burst: StashScene['burst'] = (kind, x, y = 0.4, z = 0) => {
    const n = reduced ? 6 : 22;
    if (kind === 'stow') {
      stowGlow = 1;
      stowLight.position.set(x, y + 0.6, z + 0.6);
      particles.emit(x, y + 0.2, z + 0.3, n, 0xffd36a, 1.8, 3, 0.7);
    } else if (kind === 'splash') {
      particles.emit(x, 0.05, z, n + 10, 0x7fb8ff, 2.4, 7, 0.8);
    } else if (kind === 'refuse') {
      particles.emit(x, y + 0.3, z + 0.3, Math.round(n / 2), 0xff4a3a, 1.2, 1, 0.45);
    } else if (kind === 'pick') {
      particles.emit(x, y, z, Math.round(n / 3), 0xbfae94, 0.9, 2, 0.5);
    } else {
      // Staub, z.B. oben vom Tor, wenn der Rammbock trifft.
      particles.emit(x, y, z, n, 0x8a7f70, 1.4, 1.5, 0.9);
    }
  };

  return {
    update,
    render: (stage) => stage.renderer.render(scene, camera),
    warm: (stage) => {
      // Einmal alles zeichnen, mit einer Kamera, die die ganze Strecke sieht: lädt Geometrie und Texturen hoch und baut
      // die Shader (auch für den Schluss). Das nächste Bild zeichnet ohnehin neu.
      for (const cop of cops) cop.root.visible = true;
      if (gapGlow) gapGlow.mesh.visible = true;
      const fov = camera.fov;
      camera.fov = 70;
      camera.updateProjectionMatrix();
      // So weit weg, dass die ganze Strecke samt Straße auch hochkant ins Bild passt.
      const far = (L / 2 + 6) / (Math.tan((35 * Math.PI) / 180) * Math.min(1, camera.aspect));
      camera.far = far + 60;
      camera.position.set(L / 2 + 2, 3, far);
      camera.lookAt(L / 2 + 2, 1, 0);
      camera.updateMatrixWorld();
      stage.renderer.render(scene, camera);
      for (const cop of cops) cop.root.visible = false;
      if (gapGlow) gapGlow.mesh.visible = false;
      stage.renderer.render(scene, camera);
      camera.fov = fov;
      camera.far = dist + 60;
      camera.updateProjectionMatrix();
    },
    resize,
    pick,
    hideScreen,
    head,
    project,
    burst,
    dispose: () => {
      disposeObject(scene);
      for (const v of hideViews) v.proxy.geometry.dispose();
      proxyMat.dispose();
      for (const t of textures) t.dispose();
      particles.points.geometry.dispose();
      gapGlow?.dispose();
    },
  };
}
