// Bude durchsuchen (Auftrag 48): die fünf Räume der Wohnung in 3D (three.js) aus Grundformen. Jeder Raum ist ein
// Kasten (Rückwand, Seitenwände, Boden, Decke; die Wand hinter der Kamera fehlt), darin Möbel als Kulisse und die
// Dinge zum Durchsuchen. Jedes Ding hat ein bewegliches Teil (Tür, Schublade, Deckel, Kissen), das beim Suchen
// aufgeht und offen bleibt. Spuren (verrutscht, Kratzer) und ein lugender Schein sind echte Geometrie: Man sieht sie
// nur, wenn die Taschenlampe drauf fällt. Nur Optik; Math.random nur für Texturen.

import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import type { ItemId, RoomId, SearchItem } from './model';

/** Raum: Breite (x), Tiefe (z), Höhe. Die Kamera steht vorn in der Tür und schaut nach −z. */
export const ROOM_W = 4.4;
export const ROOM_D = 4.2;
export const ROOM_H = 2.6;
/** Abstand der Räume in der Szene (nebeneinander, nur der aktuelle wird gezeichnet). */
export const ROOM_GAP = 9;

const HW = ROOM_W / 2;
const HD = ROOM_D / 2;

// ---------------------------------------------------------------------------------------------- Texturen

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = true): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) paint(g);
  const tex = new CanvasTexture(c);
  if (repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

function blotches(g: CanvasRenderingContext2D, w: number, h: number, n: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 15 + Math.random() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Raufaser: weiß mit Körnung, Flecken und Schmutz unten. */
function plaster(tint: string): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, 256, 256);
    grain(g, 256, 256, 9000, 0.06);
    blotches(g, 256, 256, 8, 'rgba(60,50,30,0.08)');
  });
}

function parquet(): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    for (let y = 0; y < 256; y += 32) {
      for (let x = (y / 32) % 2 ? -64 : 0; x < 256; x += 128) {
        const l = 40 + Math.random() * 18;
        g.fillStyle = `hsl(28, 38%, ${l}%)`;
        g.fillRect(x, y, 128, 32);
        g.strokeStyle = 'rgba(30,18,8,0.5)';
        g.strokeRect(x + 0.5, y + 0.5, 127, 31);
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = `rgba(40,24,10,${0.1 + Math.random() * 0.15})`;
          g.beginPath();
          const yy = y + 4 + Math.random() * 24;
          g.moveTo(x, yy);
          g.lineTo(x + 128, yy + (Math.random() - 0.5) * 4);
          g.stroke();
        }
      }
    }
    grain(g, 256, 256, 4000, 0.05);
  });
}

function tiles(base: string, line: string): CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, 6, 'rgba(255,255,255,0.08)');
    g.strokeStyle = line;
    g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    grain(g, 256, 256, 3000, 0.05);
  });
}

/** Kratzer am Boden (vor einem verrutschten Ding): helle Bögen, sonst durchsichtig. */
function scratchTex(): CanvasTexture {
  return canvasTex(
    128,
    64,
    (g) => {
      g.strokeStyle = 'rgba(255,240,215,0.75)';
      for (let i = 0; i < 7; i++) {
        g.lineWidth = 1 + Math.random() * 1.5;
        g.beginPath();
        const y = 10 + Math.random() * 44;
        g.moveTo(10 + Math.random() * 20, y);
        g.quadraticCurveTo(
          64,
          y + (Math.random() - 0.5) * 18,
          100 + Math.random() * 20,
          y + (Math.random() - 0.5) * 10,
        );
        g.stroke();
      }
    },
    false,
  );
}

/** Ein Geldschein (grünlich, mit Rand und Zahl). */
export function billTexture(): CanvasTexture {
  return canvasTex(
    128,
    64,
    (g) => {
      g.fillStyle = '#7fae86';
      g.fillRect(0, 0, 128, 64);
      g.strokeStyle = '#3f6b4a';
      g.lineWidth = 4;
      g.strokeRect(5, 5, 118, 54);
      g.fillStyle = 'rgba(40,80,50,0.55)';
      g.beginPath();
      g.arc(40, 32, 15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2d4f37';
      g.font = 'bold 22px sans-serif';
      g.fillText('50', 78, 40);
      grain(g, 128, 64, 600, 0.08);
    },
    false,
  );
}

// ---------------------------------------------------------------------------------------------- Bausteine

export interface ItemView {
  index: number;
  id: ItemId;
  room: RoomId;
  /** Das ganze Ding (Raycast trifft seine Teile). */
  group: Group;
  /** Teil, das beim Suchen aufgeht (Tür, Deckel …), und wie. */
  lid: Object3D | null;
  open: { axis: 'x' | 'y' | 'z'; angle: number; lift?: number; slide?: number };
  /** Mitte für Licht, Namen und Effekte (Raum-Koordinaten). */
  center: [number, number, number];
}

export interface RoomView {
  id: RoomId;
  group: Group;
  /** Fenster (für Mondlicht bzw. Blaulicht). */
  windows: MeshStandardMaterial[];
  /** Lichtspalt unter der Wohnungstür (nur Flur). */
  doorGap: MeshBasicMaterial | null;
  /** Die Wohnungstür (dreht am Ende auf). */
  door: Group | null;
  /** Türen in andere Räume (nur im Flur; aus den Räumen geht es hinter dir zurück in den Flur). */
  exits: RoomExit[];
}

/** Eine Tür in einen anderen Raum: Ziel, Mitte (für Beschriftung und Gang) und die Fläche, die Klicks fängt. */
export interface RoomExit {
  to: RoomId;
  center: [number, number, number];
  hit: Mesh;
}

/** Breite und Höhe einer Zimmertür. */
const INNER_DOOR_W = 0.82;
const INNER_DOOR_H = 2.0;

/**
 * Zimmertür in einer Wand, halb offen in den Flur: Zarge, Blatt mit Klinke, dahinter dunkel. x, z: Mitte der Öffnung
 * an der Wand; turn: Drehung um y (0 Rückwand, π/2 linke Wand, −π/2 rechte Wand).
 */
function innerDoor(
  parent: Group,
  m: Materials,
  leaf: MeshStandardMaterial,
  dark: MeshBasicMaterial,
  to: RoomId,
  x: number,
  z: number,
  turn: number,
): RoomExit {
  const g = new Group();
  g.position.set(x, 0, z);
  g.rotation.y = turn;
  parent.add(g);
  const W = INNER_DOOR_W;
  const H = INNER_DOOR_H;
  const hit = new Mesh(new PlaneGeometry(W, H), dark);
  hit.position.set(0, H / 2, 0.006);
  hit.userData.exit = to;
  g.add(hit);
  box(g, 0.06, H + 0.06, 0.08, m.white, -W / 2 - 0.03, (H + 0.06) / 2, 0.02);
  box(g, 0.06, H + 0.06, 0.08, m.white, W / 2 + 0.03, (H + 0.06) / 2, 0.02);
  box(g, W + 0.12, 0.06, 0.08, m.white, 0, H + 0.03, 0.02);
  // Das Blatt steht halb offen in den Flur (an der linken Zarge angeschlagen).
  const hingeL = hinge(g, -W / 2, 0, 0.04);
  hingeL.rotation.y = -1.05;
  box(hingeL, W - 0.02, H - 0.02, 0.04, leaf, W / 2, H / 2, 0);
  cyl(hingeL, 0.02, 0.12, m.metal, W - 0.1, 1.0, 0.04).rotation.z = Math.PI / 2;
  // Mitte der Öffnung, etwas vor der Wand (in Raumkoordinaten).
  return { to, center: [x + 0.05 * Math.sin(turn), 1.25, z + 0.05 * Math.cos(turn)], hit };
}

export interface Materials {
  wood: MeshStandardMaterial;
  darkWood: MeshStandardMaterial;
  white: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  fabric: MeshStandardMaterial;
  cushion: MeshStandardMaterial;
  plant: MeshStandardMaterial;
  pot: MeshStandardMaterial;
  cardboard: MeshStandardMaterial;
  black: MeshStandardMaterial;
  ceramic: MeshStandardMaterial;
  bill: MeshStandardMaterial;
  scratch: MeshBasicMaterial;
  textures: CanvasTexture[];
}

export function createMaterials(): Materials {
  const bill = billTexture();
  const scratch = scratchTex();
  return {
    wood: new MeshStandardMaterial({ color: 0x9a6b42, roughness: 0.6 }),
    darkWood: new MeshStandardMaterial({ color: 0x4a3426, roughness: 0.55 }),
    white: new MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.45 }),
    metal: new MeshStandardMaterial({ color: 0xb6bcc2, roughness: 0.3, metalness: 0.85 }),
    fabric: new MeshStandardMaterial({ color: 0x55607a, roughness: 0.95 }),
    cushion: new MeshStandardMaterial({ color: 0x8a5a4a, roughness: 0.95 }),
    plant: new MeshStandardMaterial({ color: 0x3d6b35, roughness: 0.8 }),
    pot: new MeshStandardMaterial({ color: 0xb4643c, roughness: 0.75 }),
    cardboard: new MeshStandardMaterial({ color: 0xb8915e, roughness: 0.9 }),
    black: new MeshStandardMaterial({ color: 0x16171a, roughness: 0.35, metalness: 0.2 }),
    ceramic: new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.18, metalness: 0.05 }),
    bill: new MeshStandardMaterial({
      map: bill,
      roughness: 0.6,
      emissive: 0x2a4a30,
      emissiveIntensity: 0.25,
      side: DoubleSide,
    }),
    scratch: new MeshBasicMaterial({ map: scratch, transparent: true, opacity: 0.55, depthWrite: false }),
    textures: [bill, scratch],
  };
}

function box(
  parent: Object3D,
  w: number,
  h: number,
  d: number,
  m: MeshStandardMaterial | MeshBasicMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(
  parent: Object3D,
  r: number,
  h: number,
  m: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
  seg = 16,
) {
  const mesh = new Mesh(new CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ball(parent: Object3D, r: number, m: MeshStandardMaterial, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new SphereGeometry(r, 14, 10), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Gelenk: eine Gruppe an (x, y, z), in die das bewegliche Teil kommt. */
function hinge(parent: Object3D, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------------------------- Räume

const ROOM_LOOK: Record<RoomId, { wall: string; floor: 'parquet' | 'tiles' | 'kitchen'; window: boolean }> = {
  living: { wall: '#d8cfbf', floor: 'parquet', window: true },
  kitchen: { wall: '#d9d3b8', floor: 'kitchen', window: true },
  bath: { wall: '#c8d4d6', floor: 'tiles', window: false },
  bedroom: { wall: '#cfc3b8', floor: 'parquet', window: true },
  hall: { wall: '#cdc6b6', floor: 'parquet', window: false },
};

/** Ein Raum mit Wänden, Fenster (Jalousie), Möbeln als Kulisse. */
export function buildRoom(id: RoomId, m: Materials): RoomView {
  const look = ROOM_LOOK[id];
  const group = new Group();
  const wallTex = plaster(look.wall);
  wallTex.repeat.set(2, 1.2);
  m.textures.push(wallTex);
  const wall = new MeshStandardMaterial({ map: wallTex, roughness: 0.92 });
  const floorTex =
    look.floor === 'parquet'
      ? parquet()
      : look.floor === 'kitchen'
        ? tiles('#8a8478', 'rgba(40,36,30,0.6)')
        : tiles('#dfe6e8', 'rgba(90,110,120,0.55)');
  floorTex.repeat.set(look.floor === 'parquet' ? 2.5 : 4, look.floor === 'parquet' ? 2.5 : 4);
  m.textures.push(floorTex);
  const floorMat = new MeshStandardMaterial({ map: floorTex, roughness: look.floor === 'parquet' ? 0.55 : 0.3 });
  const floor = new Mesh(new PlaneGeometry(ROOM_W, ROOM_D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const ceiling = new Mesh(
    new PlaneGeometry(ROOM_W, ROOM_D),
    new MeshStandardMaterial({ color: 0xdedad2, roughness: 1 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  group.add(ceiling);
  const back = new Mesh(new PlaneGeometry(ROOM_W, ROOM_H), wall);
  back.position.set(0, ROOM_H / 2, -HD);
  back.receiveShadow = true;
  group.add(back);
  for (const side of [-1, 1]) {
    const w = new Mesh(new PlaneGeometry(ROOM_D, ROOM_H), wall);
    w.position.set(side * HW, ROOM_H / 2, 0);
    w.rotation.y = -side * (Math.PI / 2);
    w.receiveShadow = true;
    group.add(w);
  }
  // Fußleisten.
  box(group, ROOM_W, 0.08, 0.02, m.white, 0, 0.04, -HD + 0.01);
  const windows: MeshStandardMaterial[] = [];
  if (look.window) {
    // Fenster in der rechten Wand mit Jalousie (Licht kommt in Streifen).
    const pane = new MeshStandardMaterial({ color: 0x0a0d14, emissive: 0x6f86b8, emissiveIntensity: 0.6 });
    windows.push(pane);
    const win = new Mesh(new PlaneGeometry(1.3, 1.2), pane);
    win.position.set(HW - 0.01, 1.5, -0.6);
    win.rotation.y = -Math.PI / 2;
    group.add(win);
    for (let i = 0; i < 10; i++) box(group, 0.03, 0.05, 1.32, m.white, HW - 0.06, 0.96 + i * 0.12, -0.6);
    box(group, 0.12, 0.05, 1.5, m.white, HW - 0.06, 0.88, -0.6);
  }
  let doorGap: MeshBasicMaterial | null = null;
  let door: Group | null = null;
  const exits: RoomExit[] = [];
  if (id === 'living') {
    box(group, 2.4, 0.42, 0.95, m.fabric, -0.2, 0.25, -1.55);
    box(group, 2.4, 0.6, 0.22, m.fabric, -0.2, 0.62, -1.95);
    box(group, 0.22, 0.6, 0.95, m.fabric, -1.4, 0.45, -1.55);
    box(group, 0.22, 0.6, 0.95, m.fabric, 1.0, 0.45, -1.55);
    const rug = new Mesh(new PlaneGeometry(2.8, 1.9), new MeshStandardMaterial({ color: 0x7a3b3b, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-0.1, 0.006, -0.25);
    rug.receiveShadow = true;
    group.add(rug);
    box(group, 1.1, 0.06, 0.6, m.darkWood, -0.2, 0.42, -0.35);
    for (const [x, z] of [
      [-0.7, -0.6],
      [0.3, -0.6],
      [-0.7, -0.1],
      [0.3, -0.1],
    ])
      box(group, 0.05, 0.4, 0.05, m.darkWood, x, 0.2, z);
    // Regal an der linken Wand.
    box(group, 0.35, 1.9, 1.3, m.wood, -HW + 0.18, 0.95, -0.4);
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 7; k++) {
        const book = box(
          group,
          0.24,
          0.26 + (k % 3) * 0.03,
          0.06,
          [m.cushion, m.fabric, m.darkWood][k % 3],
          -HW + 0.2,
          0.32 + i * 0.45,
          -0.9 + k * 0.08,
        );
        book.rotation.x = (k % 4 === 0 ? 0.1 : 0) * (i % 2 ? 1 : -1);
      }
    }
  } else if (id === 'kitchen') {
    box(group, 3.2, 0.9, 0.62, m.white, 0.4, 0.45, -HD + 0.31);
    box(group, 3.2, 0.04, 0.64, m.darkWood, 0.4, 0.92, -HD + 0.32);
    box(group, 0.5, 0.05, 0.36, m.metal, -0.4, 0.95, -HD + 0.3);
    box(group, 1.2, 0.05, 0.8, m.wood, -0.5, 0.75, 0.3);
    for (const [x, z] of [
      [-1.05, -0.05],
      [0.05, -0.05],
      [-1.05, 0.65],
      [0.05, 0.65],
    ])
      box(group, 0.05, 0.74, 0.05, m.wood, x, 0.37, z);
  } else if (id === 'bath') {
    box(group, 0.8, 0.55, 1.8, m.ceramic, HW - 0.42, 0.28, -0.9);
    box(group, 0.6, 0.12, 0.45, m.ceramic, 0.4, 0.85, -HD + 0.24);
    cyl(group, 0.06, 0.82, m.ceramic, 0.4, 0.42, -HD + 0.2);
  } else if (id === 'bedroom') {
    box(group, 1.7, 0.3, 2.1, m.darkWood, -0.5, 0.15, -1.0);
    box(group, 1.7, 0.75, 0.08, m.darkWood, -0.5, 0.55, -HD + 0.05);
    const blanket = box(
      group,
      1.62,
      0.08,
      1.2,
      new MeshStandardMaterial({ color: 0x3e5c76, roughness: 0.95 }),
      -0.5,
      0.56,
      -0.55,
    );
    blanket.rotation.x = 0.02;
    box(group, 0.6, 0.12, 0.38, m.white, -0.9, 0.58, -1.8);
    box(group, 0.6, 0.12, 0.38, m.white, -0.1, 0.58, -1.8);
  } else if (id === 'hall') {
    // Wohnungstür in der Rückwand, darunter ein Spalt Licht aus dem Treppenhaus.
    box(group, 1.1, 2.15, 0.06, m.white, 0.6, 1.075, -HD + 0.02);
    door = hinge(group, 0.06, 0, -HD + 0.06);
    box(door, 0.98, 2.05, 0.05, new MeshStandardMaterial({ color: 0x6b5242, roughness: 0.6 }), 0.49, 1.04, 0);
    cyl(door, 0.025, 0.14, m.metal, 0.88, 1.0, 0.05).rotation.z = Math.PI / 2;
    doorGap = new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.25 });
    const gap = new Mesh(new PlaneGeometry(0.95, 0.025), doorGap);
    gap.position.set(0.6, 0.012, -HD + 0.08);
    group.add(gap);
    box(group, 0.8, 1.1, 0.03, m.metal, 1.6, 1.4, -HD + 0.02);
    // Türen in die Zimmer (Auftrag 49): geradeaus das Schlafzimmer, links das Wohnzimmer, rechts Küche und Bad.
    const leaf = new MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.55 });
    const dark = new MeshBasicMaterial({ color: 0x050506 });
    exits.push(
      innerDoor(group, m, leaf, dark, 'bedroom', -0.85, -HD + 0.001, 0),
      innerDoor(group, m, leaf, dark, 'living', -HW + 0.001, -1.6, Math.PI / 2),
      innerDoor(group, m, leaf, dark, 'kitchen', HW - 0.001, -1.65, -Math.PI / 2),
      innerDoor(group, m, leaf, dark, 'bath', HW - 0.001, 0.4, -Math.PI / 2),
    );
  }
  return { id, group, windows, doorGap, door, exits };
}

// ---------------------------------------------------------------------------------------------- Dinge

interface Built {
  lid: Object3D | null;
  open: ItemView['open'];
  center: [number, number, number];
}

/** Ein Ding bauen (in die Gruppe am Nullpunkt des Raums). */
function buildItem(id: ItemId, g: Group, m: Materials): Built {
  switch (id) {
    // Wohnzimmer
    case 'sofa': {
      const lid = hinge(g, -0.2, 0.5, -1.55);
      for (const x of [-0.75, 0, 0.75]) box(lid, 0.7, 0.16, 0.8, m.cushion, x, 0.06, 0.02);
      return { lid, open: { axis: 'x', angle: -0.5, lift: 0.25 }, center: [-0.2, 0.6, -1.5] };
    }
    case 'rug': {
      const lid = hinge(g, 0.75, 0.008, 0.15);
      const flap = new Mesh(
        new PlaneGeometry(0.55, 0.5),
        new MeshStandardMaterial({ color: 0x7a3b3b, roughness: 1, side: DoubleSide }),
      );
      flap.rotation.x = -Math.PI / 2;
      flap.position.set(0.27, 0, 0.25);
      flap.receiveShadow = true;
      lid.add(flap);
      return { lid, open: { axis: 'x', angle: -1.4 }, center: [1.0, 0.05, 0.4] };
    }
    case 'frame': {
      const lid = hinge(g, 0.6, 1.95, -HD + 0.03);
      box(lid, 0.9, 0.6, 0.04, m.darkWood, 0, -0.3, 0);
      box(lid, 0.8, 0.5, 0.01, new MeshStandardMaterial({ color: 0x4f7aa0, roughness: 0.5 }), 0, -0.3, 0.025);
      return { lid, open: { axis: 'x', angle: 0.6 }, center: [0.6, 1.65, -HD + 0.05] };
    }
    case 'plant': {
      cyl(g, 0.22, 0.42, m.pot, 1.75, 0.21, -1.75);
      const lid = hinge(g, 1.75, 0.42, -1.75);
      for (let i = 0; i < 6; i++)
        ball(lid, 0.18 + (i % 3) * 0.05, m.plant, Math.cos(i) * 0.15, 0.25 + (i % 2) * 0.25, Math.sin(i) * 0.15);
      return { lid, open: { axis: 'z', angle: 0.6, lift: 0.15 }, center: [1.75, 0.6, -1.75] };
    }
    case 'book': {
      const lid = hinge(g, -HW + 0.2, 1.67, -0.15);
      box(lid, 0.26, 0.34, 0.12, new MeshStandardMaterial({ color: 0x2e4a33, roughness: 0.7 }), 0, 0, 0);
      return { lid, open: { axis: 'z', angle: 0, slide: 0.25 }, center: [-HW + 0.25, 1.67, -0.15] };
    }
    case 'tv': {
      box(g, 0.5, 0.55, 1.3, m.darkWood, HW - 0.26, 0.28, 0.4);
      box(g, 0.08, 0.6, 1.0, m.black, HW - 0.3, 0.9, 0.4).rotation.y = 0;
      const lid = hinge(g, HW - 0.52, 0.05, 0.95);
      box(lid, 0.03, 0.45, 0.6, m.wood, 0, 0.23, -0.3);
      return { lid, open: { axis: 'y', angle: -1.3 }, center: [HW - 0.3, 0.35, 0.4] };
    }
    // Küche
    case 'freezer': {
      box(g, 0.7, 1.85, 0.68, m.white, HW - 0.4, 0.93, -HD + 0.36);
      const lid = hinge(g, HW - 0.75, 1.3, -HD + 0.71);
      box(lid, 0.7, 0.55, 0.05, m.white, 0.35, 0.27, 0);
      box(lid, 0.04, 0.35, 0.04, m.metal, 0.62, 0.27, 0.04);
      return { lid, open: { axis: 'y', angle: -1.6 }, center: [HW - 0.4, 1.55, -HD + 0.7] };
    }
    case 'dishes': {
      box(g, 1.2, 0.6, 0.35, m.white, 0.3, 1.75, -HD + 0.18);
      const lid = hinge(g, -0.3, 1.45, -HD + 0.36);
      box(lid, 0.6, 0.58, 0.03, m.white, 0.3, 0.3, 0);
      for (let k = 0; k < 4; k++) cyl(g, 0.11, 0.02, m.ceramic, 0.0 + k * 0.03, 1.55 + k * 0.025, -HD + 0.18);
      return { lid, open: { axis: 'y', angle: -1.5 }, center: [0.3, 1.75, -HD + 0.35] };
    }
    case 'microwave': {
      box(g, 0.55, 0.32, 0.38, m.black, -0.95, 1.1, -HD + 0.25);
      const lid = hinge(g, -1.22, 0.95, -HD + 0.45);
      box(
        lid,
        0.42,
        0.3,
        0.02,
        new MeshStandardMaterial({ color: 0x20262c, roughness: 0.1, metalness: 0.4 }),
        0.21,
        0.15,
        0,
      );
      return { lid, open: { axis: 'y', angle: -1.4 }, center: [-0.95, 1.1, -HD + 0.45] };
    }
    case 'oven': {
      box(g, 0.6, 0.85, 0.05, m.black, 1.35, 0.45, -HD + 0.63);
      const lid = hinge(g, 1.35, 0.1, -HD + 0.66);
      box(
        lid,
        0.56,
        0.5,
        0.03,
        new MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.15, metalness: 0.6 }),
        0,
        0.25,
        0,
      );
      box(lid, 0.4, 0.03, 0.04, m.metal, 0, 0.45, 0.03);
      return { lid, open: { axis: 'x', angle: 1.3 }, center: [1.35, 0.4, -HD + 0.66] };
    }
    case 'cereal': {
      const lid = hinge(g, -0.75, 0.78, 0.25);
      box(lid, 0.2, 0.3, 0.07, new MeshStandardMaterial({ color: 0xd9a12b, roughness: 0.8 }), 0, 0.15, 0);
      return { lid, open: { axis: 'z', angle: 1.2 }, center: [-0.75, 0.93, 0.25] };
    }
    case 'cookies': {
      cyl(
        g,
        0.12,
        0.12,
        new MeshStandardMaterial({ color: 0x2c4f8a, roughness: 0.35, metalness: 0.6 }),
        -0.3,
        0.84,
        0.45,
      );
      const lid = hinge(g, -0.3, 0.9, 0.45);
      cyl(
        lid,
        0.125,
        0.025,
        new MeshStandardMaterial({ color: 0x3a64a8, roughness: 0.35, metalness: 0.6 }),
        0,
        0.012,
        0,
      );
      return { lid, open: { axis: 'z', angle: 0.4, lift: 0.18 }, center: [-0.3, 0.88, 0.45] };
    }
    // Bad
    case 'cistern': {
      box(g, 0.4, 0.4, 0.55, m.ceramic, -1.4, 0.2, -HD + 0.45);
      box(g, 0.45, 0.42, 0.18, m.ceramic, -1.4, 0.65, -HD + 0.1);
      const lid = hinge(g, -1.4, 0.87, -HD + 0.1);
      box(lid, 0.48, 0.04, 0.2, m.ceramic, 0, 0.02, 0);
      return { lid, open: { axis: 'z', angle: 0.3, lift: 0.25 }, center: [-1.4, 0.75, -HD + 0.12] };
    }
    case 'cabinet': {
      box(g, 0.6, 0.55, 0.14, m.white, 0.4, 1.55, -HD + 0.07);
      const lid = hinge(g, 0.1, 1.28, -HD + 0.15);
      box(
        lid,
        0.6,
        0.53,
        0.02,
        new MeshStandardMaterial({ color: 0xbfd0d6, roughness: 0.05, metalness: 0.9 }),
        0.3,
        0.27,
        0,
      );
      return { lid, open: { axis: 'y', angle: -1.5 }, center: [0.4, 1.55, -HD + 0.15] };
    }
    case 'vent': {
      const lid = hinge(g, -HW + 0.02, 2.05, -0.3);
      box(lid, 0.02, 0.3, 0.4, m.white, 0, -0.15, 0);
      for (let i = 0; i < 5; i++) box(lid, 0.03, 0.02, 0.36, m.black, 0.01, -0.04 - i * 0.055, 0);
      return { lid, open: { axis: 'z', angle: 1.2 }, center: [-HW + 0.05, 1.9, -0.3] };
    }
    case 'laundry': {
      cyl(g, 0.24, 0.5, new MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.95 }), 1.2, 0.25, 0.75, 12);
      const lid = hinge(g, 1.2, 0.5, 0.75);
      cyl(lid, 0.25, 0.04, new MeshStandardMaterial({ color: 0xb8a77c, roughness: 0.95 }), 0, 0.02, 0, 12);
      ball(lid, 0.18, new MeshStandardMaterial({ color: 0x8aa0b8, roughness: 1 }), 0.05, 0.08, 0);
      return { lid, open: { axis: 'x', angle: 0.4, lift: 0.3 }, center: [1.2, 0.4, 0.75] };
    }
    // Schlafzimmer
    case 'mattress': {
      const lid = hinge(g, -0.5, 0.32, -0.1);
      box(lid, 1.6, 0.2, 1.95, m.white, 0, 0.1, -0.9);
      return { lid, open: { axis: 'x', angle: -0.32 }, center: [-0.5, 0.5, -0.6] };
    }
    case 'nightstand': {
      box(g, 0.45, 0.5, 0.4, m.wood, 0.75, 0.25, -HD + 0.22);
      const lid = hinge(g, 0.75, 0.38, -HD + 0.42);
      box(lid, 0.4, 0.15, 0.36, m.wood, 0, 0, -0.18);
      cyl(lid, 0.02, 0.06, m.metal, 0, 0, 0.02).rotation.x = Math.PI / 2;
      return { lid, open: { axis: 'x', angle: 0, slide: 0.3 }, center: [0.75, 0.45, -HD + 0.42] };
    }
    case 'wardrobe': {
      box(g, 0.6, 2.1, 1.3, m.wood, HW - 0.31, 1.05, 0.2);
      const lid = hinge(g, HW - 0.61, 0.05, 0.85);
      box(lid, 0.03, 2.0, 0.64, m.wood, 0, 1.0, -0.32);
      return { lid, open: { axis: 'y', angle: -1.4 }, center: [HW - 0.6, 1.1, 0.2] };
    }
    case 'shoebox': {
      box(g, 0.4, 0.14, 0.26, m.cardboard, -1.6, 0.07, 0.4);
      const lid = hinge(g, -1.6, 0.14, 0.4);
      box(lid, 0.42, 0.04, 0.28, new MeshStandardMaterial({ color: 0xc93b3b, roughness: 0.8 }), 0, 0.02, 0);
      return { lid, open: { axis: 'z', angle: 0.6, lift: 0.15 }, center: [-1.6, 0.15, 0.4] };
    }
    case 'teddy': {
      const lid = hinge(g, -0.2, 0.62, -1.55);
      const fur = new MeshStandardMaterial({ color: 0xa7754b, roughness: 1 });
      ball(lid, 0.14, fur, 0, 0.12, 0);
      ball(lid, 0.1, fur, 0, 0.33, 0);
      ball(lid, 0.04, fur, -0.07, 0.42, 0);
      ball(lid, 0.04, fur, 0.07, 0.42, 0);
      return { lid, open: { axis: 'x', angle: -1.2, lift: 0.1 }, center: [-0.2, 0.8, -1.55] };
    }
    case 'floorboard': {
      const lid = hinge(g, 0.6, 0.005, 1.05);
      box(lid, 0.9, 0.025, 0.16, m.wood, 0.45, 0.012, 0);
      return { lid, open: { axis: 'z', angle: 0.6 }, center: [1.05, 0.05, 1.05] };
    }
    // Flur
    case 'mat': {
      const lid = hinge(g, 0.2, 0.01, -1.35);
      box(lid, 0.85, 0.02, 0.55, new MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), 0.42, 0.01, 0);
      return { lid, open: { axis: 'z', angle: 0.9 }, center: [0.62, 0.05, -1.35] };
    }
    case 'jacket': {
      box(g, 0.05, 0.08, 1.1, m.darkWood, -HW + 0.04, 1.75, -0.6);
      const lid = hinge(g, -HW + 0.12, 1.72, -0.85);
      box(lid, 0.18, 0.75, 0.48, new MeshStandardMaterial({ color: 0x3b4a3a, roughness: 0.9 }), 0.03, -0.38, 0);
      return { lid, open: { axis: 'x', angle: 0.5 }, center: [-HW + 0.15, 1.35, -0.85] };
    }
    case 'shoes': {
      box(g, 0.35, 0.6, 0.9, m.white, -HW + 0.2, 0.3, 0.55);
      const lid = hinge(g, -HW + 0.38, 0.6, 0.55);
      box(lid, 0.03, 0.55, 0.85, m.white, 0, -0.28, 0);
      return { lid, open: { axis: 'z', angle: -1.1 }, center: [-HW + 0.3, 0.35, 0.55] };
    }
    case 'fuse': {
      box(g, 0.08, 0.45, 0.35, m.white, HW - 0.05, 1.75, -1.0);
      const lid = hinge(g, HW - 0.1, 1.75, -1.18);
      box(lid, 0.02, 0.43, 0.34, m.white, 0, 0, 0.17);
      return { lid, open: { axis: 'y', angle: 1.4 }, center: [HW - 0.1, 1.75, -1.0] };
    }
    case 'umbrella': {
      // Unter dem Spiegel neben der Wohnungstür (links ist die Tür zum Schlafzimmer).
      cyl(g, 0.13, 0.5, m.black, 1.45, 0.25, -1.8);
      const lid = hinge(g, 1.45, 0.45, -1.8);
      cyl(lid, 0.02, 0.6, new MeshStandardMaterial({ color: 0x7a2a2a, roughness: 0.6 }), 0.03, 0.3, 0).rotation.z =
        0.12;
      cyl(lid, 0.02, 0.55, m.darkWood, -0.04, 0.28, 0.03).rotation.z = -0.1;
      return { lid, open: { axis: 'z', angle: 0.5, lift: 0.2 }, center: [1.45, 0.6, -1.8] };
    }
  }
}

/**
 * Ein Ding der Wohnung aufbauen, mit Spur (verrutscht, Kratzer davor) und lugendem Schein, wenn das Modell sie
 * vorsieht. tellSide: in welche Richtung es verrutscht ist (fest je Index).
 */
export function buildItemView(item: SearchItem, index: number, m: Materials): ItemView {
  const group = new Group();
  const built = buildItem(item.id, group, m);
  group.traverse((o) => {
    o.userData.index = index;
  });
  const [cx, cy, cz] = built.center;
  if (item.tell && built.lid) {
    // Verrutscht: das bewegliche Teil sitzt schief.
    const side = index % 2 ? 1 : -1;
    const ax = built.open.axis;
    built.lid.rotation[ax] += 0.07 * side * (built.open.angle >= 0 ? 1 : -1);
    built.lid.position.x += 0.025 * side;
    // Kratzer am Boden davor (nur im Licht deutlich).
    const scratch = new Mesh(new PlaneGeometry(0.5, 0.25), m.scratch);
    scratch.rotation.x = -Math.PI / 2;
    scratch.position.set(cx + 0.1 * side, 0.012, Math.min(HD - 0.2, cz + 0.35));
    group.add(scratch);
  }
  if (item.peek && built.lid) {
    // Ein Schein lugt hervor.
    const bill = new Mesh(new PlaneGeometry(0.16, 0.08), m.bill);
    bill.position.set(cx + 0.05, cy - 0.02, cz + 0.06);
    bill.rotation.set(-0.3, 0.4, 0.25);
    bill.castShadow = true;
    group.add(bill);
  }
  return { index, id: item.id, room: item.room, group, lid: built.lid, open: built.open, center: built.center };
}

/** Bewegliches Teil auf Stand k (0 zu, 1 offen); Grundlage ist der Stand beim Bau (schief bei Spuren). */
export function setOpen(view: ItemView, k: number): void {
  const lid = view.lid;
  if (!lid) return;
  if (lid.userData.base === undefined) {
    lid.userData.base = {
      x: lid.rotation.x,
      y: lid.rotation.y,
      z: lid.rotation.z,
      py: lid.position.y,
      pz: lid.position.z,
    };
  }
  const base = lid.userData.base as { x: number; y: number; z: number; py: number; pz: number };
  lid.rotation.x = base.x + (view.open.axis === 'x' ? view.open.angle * k : 0);
  lid.rotation.y = base.y + (view.open.axis === 'y' ? view.open.angle * k : 0);
  lid.rotation.z = base.z + (view.open.axis === 'z' ? view.open.angle * k : 0);
  lid.position.y = base.py + (view.open.lift ?? 0) * k;
  lid.position.z = base.pz + (view.open.slide ?? 0) * k;
}
