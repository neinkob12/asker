// Razzia-Lauf: eine Figur aus Grundformen (three.js), Gesicht nach +z gebaut, Ursprung zwischen den Füßen. Gelenke
// als Gruppen (Hüfte, Schultern, Knie, Ellbogen), damit Laufen, Bücken, Tragen und Klettern nur Winkel sind. Nur
// Optik: kein Einfluss auf die Simulation.

import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
} from 'three';

export interface FigureLook {
  /** Pulli bzw. Uniform. */
  top: number;
  legs: number;
  skin: number;
  shoes: number;
  /** Mütze bzw. Cap (null: ohne). */
  cap: number | null;
  /** Reflexstreifen (Polizei). */
  stripe?: number;
}

export interface Figure {
  root: Group;
  /** Oberkörper (kippt beim Bücken und Laufen). */
  torso: Group;
  head: Group;
  armL: Group;
  armR: Group;
  foreL: Group;
  foreR: Group;
  legL: Group;
  legR: Group;
  shinL: Group;
  shinR: Group;
  /** Hier hält die Figur ein Paket (vor der Brust). */
  hands: Group;
}

const geo = {
  torso: new CapsuleGeometry(0.17, 0.36, 4, 10),
  head: new SphereGeometry(0.115, 16, 12),
  upper: new CapsuleGeometry(0.055, 0.24, 3, 8),
  fore: new CapsuleGeometry(0.048, 0.22, 3, 8),
  hand: new SphereGeometry(0.05, 8, 6),
  thigh: new CapsuleGeometry(0.075, 0.3, 3, 8),
  shin: new CapsuleGeometry(0.062, 0.3, 3, 8),
  shoe: new BoxGeometry(0.11, 0.08, 0.24),
  cap: new SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new CylinderGeometry(0.1, 0.1, 0.015, 14, 1, false, -Math.PI / 2, Math.PI),
  hood: new SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, Math.PI / 2.2, Math.PI / 2),
  stripe: new BoxGeometry(0.36, 0.05, 0.3),
};

function part(geometry: BufferGeometry, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function joint(parent: Object3D, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Figur bauen (etwa 1,8 m groß). */
export function buildFigure(look: FigureLook): Figure {
  const cloth = new MeshStandardMaterial({ color: look.top, roughness: 0.92 });
  const pants = new MeshStandardMaterial({ color: look.legs, roughness: 0.88 });
  const skin = new MeshStandardMaterial({ color: look.skin, roughness: 0.6 });
  const shoe = new MeshStandardMaterial({ color: look.shoes, roughness: 0.5 });
  const root = new Group();
  const hips = joint(root, 0, 0.92, 0);
  const torso = joint(hips, 0, 0, 0);
  const body = part(geo.torso, cloth);
  body.position.y = 0.3;
  body.scale.set(1.05, 1, 0.72);
  torso.add(body);
  if (look.stripe !== undefined) {
    const stripe = part(geo.stripe, new MeshStandardMaterial({ color: look.stripe, roughness: 0.3, metalness: 0.2 }));
    stripe.position.y = 0.26;
    stripe.scale.z = 0.85;
    torso.add(stripe);
  }
  const head = joint(torso, 0, 0.66, 0.01);
  head.add(part(geo.head, skin));
  if (look.cap !== null) {
    const capMat = new MeshStandardMaterial({ color: look.cap, roughness: 0.7 });
    const cap = part(geo.cap, capMat);
    cap.position.y = 0.03;
    cap.scale.set(1.04, 0.9, 1.06);
    head.add(cap);
    const brim = part(geo.brim, capMat);
    brim.position.set(0, 0.035, 0.1);
    brim.scale.set(1, 1, 0.9);
    head.add(brim);
  } else {
    const hood = part(geo.hood, cloth);
    hood.position.set(0, 0.01, -0.035);
    head.add(hood);
  }
  const arm = (side: 1 | -1) => {
    const shoulder = joint(torso, side * 0.215, 0.5, 0);
    const upper = part(geo.upper, cloth);
    upper.position.y = -0.15;
    shoulder.add(upper);
    const elbow = joint(shoulder, 0, -0.3, 0);
    const fore = part(geo.fore, cloth);
    fore.position.y = -0.13;
    elbow.add(fore);
    const hand = part(geo.hand, skin);
    hand.position.y = -0.28;
    elbow.add(hand);
    return { shoulder, elbow };
  };
  const leg = (side: 1 | -1) => {
    const hip = joint(hips, side * 0.095, -0.02, 0);
    const thigh = part(geo.thigh, pants);
    thigh.position.y = -0.2;
    hip.add(thigh);
    const knee = joint(hip, 0, -0.42, 0);
    const shin = part(geo.shin, pants);
    shin.position.y = -0.2;
    knee.add(shin);
    const foot = part(geo.shoe, shoe);
    foot.position.set(0, -0.44, 0.05);
    knee.add(foot);
    return { hip, knee };
  };
  const l = arm(-1);
  const r = arm(1);
  const ll = leg(-1);
  const lr = leg(1);
  const hands = joint(torso, 0, 0.2, 0.3);
  return {
    root,
    torso,
    head,
    armL: l.shoulder,
    armR: r.shoulder,
    foreL: l.elbow,
    foreR: r.elbow,
    legL: ll.hip,
    legR: lr.hip,
    shinL: ll.knee,
    shinR: lr.knee,
    hands,
  };
}

export interface Pose {
  /** Laufphase (Bogenmaß) und Stärke des Laufens (0 steht, 1 rennt). */
  stride: number;
  run: number;
  /** Trägt etwas (Arme nach vorn), 0 bis 1. */
  carry: number;
  /** Bücken (0 aufrecht, 1 tief). */
  bend: number;
  /** Nach oben greifen (0 bis 1). */
  reach: number;
  /** Nach hinten lehnen unter Last (0 bis 1). */
  strain: number;
}

/** Winkel aller Gelenke aus einer Pose (jedes Bild, billig). */
export function poseFigure(f: Figure, p: Pose): void {
  const swing = Math.sin(p.stride) * (0.25 + 0.6 * p.run);
  const lift = Math.max(0, Math.cos(p.stride));
  const lift2 = Math.max(0, -Math.cos(p.stride));
  f.legL.rotation.x = swing - p.bend * 1.1;
  f.legR.rotation.x = -swing - p.bend * 1.1;
  f.shinL.rotation.x = (0.2 + 1.1 * lift * p.run) * (p.run > 0.05 ? 1 : 0) + p.bend * 1.6;
  f.shinR.rotation.x = (0.2 + 1.1 * lift2 * p.run) * (p.run > 0.05 ? 1 : 0) + p.bend * 1.6;
  // Hüfte sinkt beim Bücken, wippt beim Laufen.
  f.legL.parent?.position.set(0, 0.92 - p.bend * 0.38 + Math.abs(Math.sin(p.stride)) * 0.05 * p.run, 0);
  f.torso.rotation.x = 0.12 * p.run + p.bend * 0.75 - p.strain * 0.18;
  const armSwing = -swing * (1 - p.carry) * 0.9;
  const carryUp = p.carry * 1.1 + p.reach * 2.6;
  f.armL.rotation.x = -armSwing - carryUp;
  f.armR.rotation.x = armSwing - carryUp;
  f.foreL.rotation.x = -0.35 * (1 - p.reach) - p.carry * 0.55;
  f.foreR.rotation.x = -0.35 * (1 - p.reach) - p.carry * 0.55;
  f.armL.rotation.z = -0.08 - p.carry * 0.1;
  f.armR.rotation.z = 0.08 + p.carry * 0.1;
  f.head.rotation.x = -f.torso.rotation.x * 0.6;
}
