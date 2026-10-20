// Der Beamte in 3D (Auftrag 48): Körper aus gedrehten Profilen (Rumpf mit Taille, Brust und Schultern), Armen mit
// Schulter, Ellbogen und Hand, Gürtel mit Holster, Funkgerät an der Brust, Schulterklappen und Schirmmütze. Das Gesicht
// ist eine Fläche mit dem Porträt aus dem Look-System (faceTexture.ts), vor einem Kopf in Hautfarbe, damit es von der
// Seite nicht flach wirkt. Er lebt: atmet, verlagert das Gewicht, beugt sich vor, hebt die Taschenlampe, greift zum
// Funkgerät oder zum Holster, winkt. Posen sind Zielwinkel, zwischen denen weich übergeblendet wird. Nur Optik.

import {
  AdditiveBlending,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACE_CROP } from './faceTexture';
import { beamTexture, glowSprite, jacketTextures } from './textures';

/** Höhe des Rumpfs (Hüfte bis Kragen) und wo die Reflexstreifen sitzen (Anteil der Höhe). */
const TORSO_H = 0.63;
const BANDS = [0.3, 0.5];

export interface Arm {
  shoulder: Group;
  elbow: Group;
  hand: Group;
}

/** Eine Haltung: Winkel in Radiant. */
export interface Pose {
  /** Oberkörper nach vorn (positiv = zum Auto hin), zur Seite. */
  lean: number;
  side: number;
  /** Kopf: nicken (positiv = runter), drehen, neigen. */
  nod: number;
  turn: number;
  tilt: number;
  /**
   * Rechter Arm (Lampe) und linker Arm: Schulter (x negativ = nach vorn bzw. oben, z positiv = vom Körper weg),
   * Ellbogen (negativ = Unterarm nach vorn gebeugt). Der Oberkörper beugt sich mit lean dazu.
   */
  rx: number;
  rz: number;
  re: number;
  lx: number;
  lz: number;
  le: number;
}

export const POSES = {
  /** Am Fenster, entspannt: Lampe locker nach unten, linke Hand am Gürtel. */
  window: {
    lean: 0.38,
    side: 0,
    nod: 0.05,
    turn: 0,
    tilt: 0.04,
    rx: -0.2,
    rz: 0.12,
    re: -0.5,
    lx: 0.15,
    lz: 0.2,
    le: -1.3,
  },
  /** Fragt nach, beugt sich tiefer, linke Hand stützt sich vorn aufs Dach. */
  ask: {
    lean: 0.5,
    side: 0.04,
    nod: 0.12,
    turn: 0,
    tilt: 0.08,
    rx: -0.2,
    rz: 0.12,
    re: -0.45,
    lx: -1.0,
    lz: 0.3,
    le: -0.6,
  },
  /** Widerspruch: ganz nah heran, leuchtet dir ins Gesicht. */
  glare: {
    lean: 0.48,
    side: 0.02,
    nod: 0.18,
    turn: 0.05,
    tilt: 0,
    rx: -0.6,
    rz: 1.35,
    re: -1.2,
    lx: -1.0,
    lz: 0.3,
    le: -0.6,
  },
  /** Hinten am Wagen: leuchtet durch die Scheibe. */
  rear: { lean: 0.15, side: 0, nod: 0.25, turn: 0, tilt: 0, rx: -0.6, rz: 1.2, re: -1.2, lx: 0.15, lz: 0.2, le: -1.3 },
  /** Funkt: linke Hand am Funkgerät, Kopf zur Schulter. */
  radio: {
    lean: 0.05,
    side: 0,
    nod: 0.12,
    turn: -0.35,
    tilt: -0.12,
    rx: -0.1,
    rz: 0.12,
    re: -0.3,
    lx: -0.55,
    lz: -0.45,
    le: -2.1,
  },
  /** Gute Fahrt: tritt zurück, hebt die freie Hand zum Gruß. */
  wave: {
    lean: 0.05,
    side: 0,
    nod: -0.05,
    turn: 0,
    tilt: 0.05,
    rx: -0.1,
    rz: 0.12,
    re: -0.4,
    lx: -0.4,
    lz: 1.2,
    le: -1.1,
  },
  /** Aussteigen: einen Schritt zurück, Hand am Holster, Lampe auf dich. */
  fail: { lean: 0.12, side: 0, nod: 0.02, turn: 0, tilt: 0, rx: -0.6, rz: 1.3, re: -1.2, lx: 0.2, lz: 0.15, le: -0.4 },
  /** Schein: nimmt ihn mit der linken Hand, schaut sich um. */
  take: {
    lean: 0.45,
    side: 0,
    nod: 0.18,
    turn: 0.25,
    tilt: 0,
    rx: -0.2,
    rz: 0.12,
    re: -0.45,
    lx: -0.9,
    lz: 0.1,
    le: -0.9,
  },
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

export interface OfficerParts {
  group: Group;
  /** Oberkörper ab der Hüfte, darin Brustkorb (atmet), Kopf, Arme. */
  upper: Group;
  chest: Group;
  head: Group;
  face: Mesh;
  right: Arm;
  left: Arm;
  /** Taschenlampe: Licht, sichtbarer Kegel und Linse (Blendung). */
  lamp: SpotLight;
  beam: Mesh;
  flare: Sprite;
  /** Reflexstreifen und Schrift (Farbe des Blaulichts setzt die Szene). */
  reflect: MeshStandardMaterial;
  /** Ein Schein in der linken Hand (beim Bestechen sichtbar). */
  note: Mesh;
  pose: Pose;
}

function rounded(w: number, h: number, d: number, r: number) {
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

/** Rumpf als gedrehtes Profil: Hüfte, Taille, Brust, Schultern, Halsansatz. uv.y läuft gleichmäßig mit der Höhe. */
function torsoGeometry(): LatheGeometry {
  const profile = [
    [0.0, 0.0],
    [0.16, 0.0],
    [0.172, 0.05],
    [0.162, 0.16],
    [0.17, 0.28],
    [0.195, 0.4],
    [0.205, 0.48],
    [0.19, 0.55],
    [0.14, 0.6],
    [0.075, 0.63],
  ].map(([r, y]) => new Vector2(r, y));
  const geo = new LatheGeometry(profile, 28);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / TORSO_H);
  uv.needsUpdate = true;
  return geo;
}

function arm(side: 1 | -1, coat: MeshStandardMaterial, skin: MeshStandardMaterial, cuff: MeshStandardMaterial): Arm {
  const shoulder = new Group();
  shoulder.position.set(side * 0.215, 0.53, 0);
  const deltoid = new Mesh(new SphereGeometry(0.075, 14, 10), coat);
  deltoid.scale.set(1, 0.9, 1.05);
  shoulder.add(deltoid);
  const upperArm = new Mesh(new CapsuleGeometry(0.058, 0.2, 4, 12), coat);
  upperArm.position.y = -0.15;
  shoulder.add(upperArm);
  const elbow = new Group();
  elbow.position.y = -0.3;
  shoulder.add(elbow);
  const fore = new Mesh(new CapsuleGeometry(0.05, 0.19, 4, 12), coat);
  fore.position.y = -0.13;
  elbow.add(fore);
  const band = new Mesh(new CylinderGeometry(0.052, 0.052, 0.035, 12), cuff);
  band.position.y = -0.245;
  elbow.add(band);
  const hand = new Group();
  hand.position.y = -0.29;
  elbow.add(hand);
  const palm = new Mesh(new SphereGeometry(0.045, 12, 10), skin);
  palm.scale.set(0.8, 1.25, 0.55);
  palm.position.y = -0.03;
  hand.add(palm);
  const thumb = new Mesh(new CapsuleGeometry(0.014, 0.035, 3, 6), skin);
  thumb.position.set(-side * 0.03, -0.02, -0.02);
  thumb.rotation.z = side * 0.6;
  hand.add(thumb);
  return { shoulder, elbow, hand };
}

/** Den Beamten bauen. face: Textur des Ausdrucks (wird pro Bild getauscht). */
export function buildOfficer(options: { skin: string; jacket: string; face: Texture; night: boolean }): OfficerParts {
  const g = new Group();
  const { map, glow } = jacketTextures(options.jacket, BANDS);
  const reflect = new MeshStandardMaterial({
    map,
    emissiveMap: glow,
    emissive: new Color(0x000000),
    roughness: 0.82,
  });
  const coat = new MeshStandardMaterial({ color: new Color(options.jacket), roughness: 0.82 });
  const trousers = new MeshStandardMaterial({ color: 0x1b2231, roughness: 0.88 });
  const leather = new MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.45, metalness: 0.1 });
  const skin = new MeshStandardMaterial({ color: new Color(options.skin), roughness: 0.62 });
  const metal = new MeshStandardMaterial({ color: 0xc9a54a, roughness: 0.3, metalness: 0.9 });
  const cuff = new MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.3, emissive: 0x000000 });

  // Beine mit Knie-Knick und Stiefeln.
  for (const side of [-1, 1]) {
    const thigh = new Mesh(new CapsuleGeometry(0.085, 0.36, 4, 12), trousers);
    thigh.position.set(side * 0.1, 0.72, 0);
    g.add(thigh);
    const shin = new Mesh(new CapsuleGeometry(0.07, 0.36, 4, 12), trousers);
    shin.position.set(side * 0.1, 0.3, 0.01);
    g.add(shin);
    const boot = new Mesh(rounded(0.11, 0.1, 0.26, 0.04), leather);
    boot.position.set(side * 0.1, 0.05, -0.04);
    g.add(boot);
  }

  const upper = new Group();
  upper.position.y = 0.93;
  g.add(upper);
  const chest = new Group();
  upper.add(chest);
  const torso = new Mesh(torsoGeometry(), reflect);
  torso.scale.set(1, 1, 0.66);
  chest.add(torso);
  // Gürtel mit Schnalle, Holster rechts, Handschellen hinten.
  const belt = new Mesh(new CylinderGeometry(0.176, 0.176, 0.06, 24, 1, true), leather);
  belt.scale.set(1, 1, 0.68);
  belt.position.y = 0.04;
  upper.add(belt);
  const buckle = new Mesh(rounded(0.06, 0.045, 0.02, 0.008), metal);
  buckle.position.set(0, 0.04, -0.122);
  upper.add(buckle);
  const holster = new Mesh(rounded(0.06, 0.16, 0.1, 0.02), leather);
  holster.position.set(0.19, -0.03, 0.02);
  upper.add(holster);
  const cuffs = new Mesh(rounded(0.09, 0.05, 0.04, 0.015), leather);
  cuffs.position.set(-0.05, 0.03, 0.12);
  upper.add(cuffs);
  // Funkgerät an der linken Brust, Abzeichen rechts, Schulterklappen, Kragen.
  const radio = new Mesh(rounded(0.06, 0.09, 0.035, 0.012), leather);
  radio.position.set(-0.1, 0.46, -0.13);
  radio.rotation.x = 0.15;
  chest.add(radio);
  const antenna = new Mesh(new CylinderGeometry(0.005, 0.006, 0.07, 6), leather);
  antenna.position.set(-0.12, 0.53, -0.125);
  chest.add(antenna);
  const badge = new Mesh(new CylinderGeometry(0.022, 0.022, 0.006, 16), metal);
  badge.rotation.x = Math.PI / 2 - 0.2;
  badge.position.set(0.1, 0.47, -0.132);
  chest.add(badge);
  for (const side of [-1, 1]) {
    const flap = new Mesh(rounded(0.06, 0.016, 0.13, 0.006), coat);
    flap.position.set(side * 0.17, 0.585, 0);
    flap.rotation.z = side * -0.35;
    chest.add(flap);
  }
  const collar = new Mesh(new CylinderGeometry(0.085, 0.105, 0.07, 20, 1, true), coat);
  collar.material = coat;
  collar.position.y = 0.635;
  chest.add(collar);
  const neck = new Mesh(new CylinderGeometry(0.058, 0.066, 0.1, 14), skin);
  neck.position.y = 0.67;
  chest.add(neck);

  // Kopf: Schädel in Hautfarbe, davor das Gesicht als Fläche, darüber die Schirmmütze.
  const head = new Group();
  head.position.y = 0.765;
  chest.add(head);
  const skull = new Mesh(new SphereGeometry(0.088, 20, 16), skin);
  skull.scale.set(0.95, 1.12, 1.02);
  head.add(skull);
  // 40 von 64 Porträt-Einheiten zeigen Stirn bis Kinn samt Ohren: so groß wie der Kopf.
  const faceSize = 0.3 * (FACE_CROP.size / 40);
  const face = new Mesh(
    new PlaneGeometry(faceSize, faceSize),
    new MeshStandardMaterial({ map: options.face, transparent: true, alphaTest: 0.35, roughness: 0.66 }),
  );
  face.position.set(0, -0.012, -0.104);
  face.rotation.y = Math.PI;
  head.add(face);
  const capMat = new MeshStandardMaterial({ color: new Color(options.jacket).multiplyScalar(0.9), roughness: 0.7 });
  // Schirmmütze: flacher, breiter Deckel über einem schmalen Band, vorn etwas höher.
  const crown = new Mesh(new CylinderGeometry(0.132, 0.106, 0.05, 28), capMat);
  crown.scale.set(1, 1, 1.12);
  crown.position.set(0, 0.105, 0.006);
  crown.rotation.x = -0.12;
  head.add(crown);
  const bandMesh = new Mesh(new CylinderGeometry(0.106, 0.106, 0.034, 24, 1, true), leather);
  bandMesh.position.y = 0.068;
  head.add(bandMesh);
  const capBadge = new Mesh(new CylinderGeometry(0.016, 0.016, 0.006, 14), metal);
  capBadge.rotation.x = Math.PI / 2;
  capBadge.position.set(0, 0.078, -0.108);
  head.add(capBadge);
  const visor = new Mesh(
    new CylinderGeometry(0.115, 0.115, 0.008, 20, 1, false, Math.PI / 2, Math.PI),
    new MeshStandardMaterial({ color: 0x07080a, roughness: 0.25, metalness: 0.2 }),
  );
  visor.scale.set(1, 1, 0.75);
  visor.position.set(0, 0.06, -0.04);
  visor.rotation.x = 0.3;
  head.add(visor);

  // Arme. Rechts die Taschenlampe in der Hand (zeigt die Unterarm-Achse entlang), links frei.
  const right = arm(1, coat, skin, cuff);
  const left = arm(-1, coat, skin, cuff);
  chest.add(right.shoulder, left.shoulder);
  const torch = new Mesh(new CylinderGeometry(0.022, 0.028, 0.22, 12), leather);
  torch.position.set(0, -0.08, -0.01);
  right.hand.add(torch);
  const lens = new Mesh(
    new CylinderGeometry(0.03, 0.03, 0.012, 14),
    new MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2c8, emissiveIntensity: 2.5 }),
  );
  lens.position.set(0, -0.19, -0.01);
  right.hand.add(lens);
  const lamp = new SpotLight(0xfff0c8, 0, 12, 0.36, 0.5, 1.4);
  lamp.position.set(0, -0.2, -0.01);
  lamp.target.position.set(0, -4, -0.01);
  right.hand.add(lamp, lamp.target);
  const beam = new Mesh(
    new ConeGeometry(0.5, 2.6, 20, 1, true),
    new MeshBasicMaterial({
      map: beamTexture(),
      color: 0xfff0c8,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    }),
  );
  beam.position.set(0, -0.2 - 1.3, -0.01);
  right.hand.add(beam);
  const flare = new Sprite(
    new SpriteMaterial({
      map: glowSprite(),
      color: 0xfff4d8,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  );
  flare.position.copy(lens.position).setY(-0.21);
  flare.scale.setScalar(0.25);
  right.hand.add(flare);
  const note = new Mesh(new PlaneGeometry(0.14, 0.07), new MeshBasicMaterial({ color: 0x7fa37a, side: DoubleSide }));
  note.position.set(0, -0.07, -0.04);
  note.visible = false;
  left.hand.add(note);

  return {
    group: g,
    upper,
    chest,
    head,
    face,
    right,
    left,
    lamp,
    beam,
    flare,
    reflect,
    note,
    pose: { ...POSES.window },
  };
}

/** Zur Haltung hin überblenden (k: Anteil pro Bild, 0 bis 1). */
export function blendPose(parts: OfficerParts, target: Pose, k: number): void {
  const p = parts.pose;
  for (const key of Object.keys(p) as (keyof Pose)[]) p[key] += (target[key] - p[key]) * k;
}

/**
 * Haltung anwenden, dazu Leben: Atmen (Brustkorb hebt sich, Schultern mit), Gewicht verlagern, kleines Wippen des
 * Kopfes. breath: 0 bis 1 (schneller bei Anspannung), t: Zeit in Sekunden.
 */
export function applyPose(parts: OfficerParts, t: number, breathRate: number): void {
  const p = parts.pose;
  const breath = Math.sin(t * breathRate);
  parts.upper.rotation.x = -p.lean + breath * 0.008;
  parts.upper.rotation.z = p.side + Math.sin(t * 0.37) * 0.015;
  parts.chest.scale.set(1 + breath * 0.008, 1 + breath * 0.012, 1 + breath * 0.02);
  parts.head.rotation.set(p.nod + Math.sin(t * 0.8) * 0.012, p.turn + Math.sin(t * 0.43) * 0.03, p.tilt);
  // Vorn ist −z: Eine positive Drehung um x schwenkt den hängenden Arm nach vorn, deshalb das Vorzeichen.
  parts.right.shoulder.rotation.set(-p.rx, 0, p.rz + breath * 0.01);
  parts.right.elbow.rotation.set(-p.re, 0, 0);
  parts.left.shoulder.rotation.set(-p.lx, 0, -p.lz - breath * 0.01);
  parts.left.elbow.rotation.set(-p.le, 0, 0);
  // Hände halten sich gerade zur Unterarm-Achse, die Lampe zeigt dorthin, wohin der Unterarm zeigt.
  parts.group.position.y = Math.sin(t * 0.37 * 2) * 0.004;
}
