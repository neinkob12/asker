// Bude durchsuchen: Lage der Wohnung auf der Bühne (reine Rechnung, ohne DOM, getestet in model.test.ts).
//
// Fünf Räume im Raster: breit (Desktop) Wohnzimmer und Küche oben, Schlafzimmer, Flur und Bad unten; schmal (Handy)
// Wohnzimmer oben, darunter Küche und Bad, dann Schlafzimmer und Flur. Die Wohnungstür liegt immer unten im Flur.
// Dinge und Möbel liegen relativ zu ihrem Raum: Anteil der Breite bzw. Höhe (rx, ry) plus ein Versatz und eine Größe
// in Einheiten der kürzeren Raumseite (so bleibt ein Blumentopf rund, egal wie der Raum geschnitten ist).

import type { ItemId, RoomId } from './model';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lage relativ zum Raum: rx/ry Anteil, ox/oy Versatz und w/h Größe in Einheiten der kürzeren Raumseite. */
export interface Place {
  rx: number;
  ry: number;
  ox?: number;
  oy?: number;
  w: number;
  h: number;
}

/** Möbel, die nur Kulisse sind (nicht durchsuchbar). */
export type FurnitureId =
  | 'sofaBase'
  | 'rug'
  | 'table'
  | 'shelf'
  | 'counter'
  | 'kitchenTable'
  | 'toilet'
  | 'sink'
  | 'tub'
  | 'bed'
  | 'hooks';

export const ITEM_PLACES: Record<ItemId, Place> = {
  // Wohnzimmer
  sofa: { rx: 0.44, ry: 1, oy: -0.13, w: 0.74, h: 0.16 },
  rug: { rx: 0.52, ry: 0.42, ox: 0.4, oy: 0.17, w: 0.2, h: 0.17 },
  frame: { rx: 0.52, ry: 0, oy: 0.07, w: 0.3, h: 0.11 },
  plant: { rx: 1, ox: -0.11, ry: 0, oy: 0.12, w: 0.17, h: 0.17 },
  book: { rx: 0, ox: 0.07, ry: 0.4, oy: -0.08, w: 0.11, h: 0.15 },
  tv: { rx: 1, ox: -0.07, ry: 0.64, w: 0.11, h: 0.4 },
  // Küche
  freezer: { rx: 1, ox: -0.15, ry: 0, oy: 0.17, w: 0.27, h: 0.31 },
  dishes: { rx: 0.48, ry: 0, oy: 0.08, w: 0.32, h: 0.13 },
  microwave: { rx: 0, ox: 0.13, ry: 0, oy: 0.11, w: 0.2, h: 0.14 },
  oven: { rx: 0, ox: 0.12, ry: 0.6, w: 0.21, h: 0.26 },
  cereal: { rx: 0.64, ox: -0.1, ry: 0.68, oy: -0.03, w: 0.1, h: 0.15 },
  cookies: { rx: 0.64, ox: 0.11, ry: 0.68, oy: 0.04, w: 0.12, h: 0.12 },
  // Bad
  cistern: { rx: 0, ox: 0.2, ry: 0, oy: 0.07, w: 0.3, h: 0.12 },
  cabinet: { rx: 0.64, ry: 0, oy: 0.07, w: 0.3, h: 0.12 },
  vent: { rx: 0, ox: 0.05, ry: 0.56, w: 0.08, h: 0.22 },
  laundry: { rx: 1, ox: -0.14, ry: 0.5, w: 0.2, h: 0.2 },
  // Schlafzimmer
  mattress: { rx: 0.42, ry: 0.45, oy: 0.09, w: 0.48, h: 0.48 },
  nightstand: { rx: 1, ox: -0.12, ry: 0, oy: 0.12, w: 0.17, h: 0.17 },
  wardrobe: { rx: 1, ox: -0.08, ry: 0.64, w: 0.15, h: 0.48 },
  shoebox: { rx: 0, ox: 0.12, ry: 1, oy: -0.1, w: 0.17, h: 0.12 },
  teddy: { rx: 0.42, ox: 0.12, ry: 0.45, oy: -0.27, w: 0.12, h: 0.12 },
  floorboard: { rx: 0.5, ry: 1, oy: -0.08, w: 0.26, h: 0.09 },
  // Flur
  mat: { rx: 0.5, ry: 1, oy: -0.08, w: 0.32, h: 0.13 },
  jacket: { rx: 0, ox: 0.07, ry: 0.3, w: 0.12, h: 0.3 },
  shoes: { rx: 0, ox: 0.08, ry: 0.73, w: 0.13, h: 0.26 },
  fuse: { rx: 1, ox: -0.06, ry: 0.22, w: 0.1, h: 0.16 },
  umbrella: { rx: 1, ox: -0.1, ry: 0.7, w: 0.13, h: 0.13 },
};

export const FURNITURE: readonly { id: FurnitureId; room: RoomId; place: Place }[] = [
  { id: 'rug', room: 'living', place: { rx: 0.52, ry: 0.42, w: 0.98, h: 0.52 } },
  { id: 'table', room: 'living', place: { rx: 0.52, ry: 0.42, w: 0.36, h: 0.2 } },
  { id: 'sofaBase', room: 'living', place: { rx: 0.44, ry: 1, oy: -0.15, w: 0.86, h: 0.28 } },
  { id: 'shelf', room: 'living', place: { rx: 0, ox: 0.07, ry: 0.4, w: 0.12, h: 0.52 } },
  { id: 'counter', room: 'kitchen', place: { rx: 0.5, ry: 0, oy: 0.12, w: 9, h: 0.22 } },
  { id: 'kitchenTable', room: 'kitchen', place: { rx: 0.64, ry: 0.68, w: 0.5, h: 0.36 } },
  { id: 'toilet', room: 'bath', place: { rx: 0, ox: 0.2, ry: 0, oy: 0.25, w: 0.22, h: 0.24 } },
  { id: 'sink', room: 'bath', place: { rx: 0.64, ry: 0, oy: 0.21, w: 0.26, h: 0.16 } },
  { id: 'tub', room: 'bath', place: { rx: 0.62, ry: 1, oy: -0.16, w: 0.7, h: 0.28 } },
  { id: 'bed', room: 'bedroom', place: { rx: 0.42, ry: 0.45, w: 0.56, h: 0.8 } },
  { id: 'hooks', room: 'hall', place: { rx: 0, ox: 0.035, ry: 0.3, w: 0.05, h: 0.36 } },
];

export interface ApartmentLayout {
  width: number;
  height: number;
  /** Schmal (Handy): Räume in drei Reihen. */
  portrait: boolean;
  /** Außenmaß der Wohnung (mit Außenwand). */
  outer: Rect;
  wall: number;
  /** Bodenfläche je Raum (innerhalb der Wände). */
  rooms: Record<RoomId, Rect>;
  /** Wohnungstür unten im Flur: Mitte und Breite. */
  door: { x: number; y: number; w: number };
  /** Fenster in der Außenwand oben (Jalousien). */
  windows: Rect[];
}

/** Platz oben fürs HUD, unten für Meldungen. */
export function apartmentLayout(width: number, height: number): ApartmentLayout {
  const narrow = width < 640;
  const top = narrow ? 92 : 86;
  const bottom = narrow ? 64 : 58;
  const side = narrow ? 8 : 24;
  const availW = Math.max(200, width - 2 * side);
  const availH = Math.max(240, height - top - bottom);
  const portrait = availW / availH < 0.95;
  // Seitenverhältnis der Wohnung folgt der Bühne in Grenzen (so bleiben die Räume wohnlich).
  const ratio = availW / availH;
  const aspect = portrait ? Math.min(0.72, Math.max(0.52, ratio)) : Math.min(1.75, Math.max(1.3, ratio));
  const w = Math.min(availW, availH * aspect);
  const h = Math.min(availH, w / aspect);
  const outer = { x: (width - w) / 2, y: top + (availH - h) / 2, w, h };
  const wall = Math.max(6, Math.round(Math.min(w, h) * 0.018));
  const inner = { x: outer.x + wall, y: outer.y + wall, w: outer.w - 2 * wall, h: outer.h - 2 * wall };
  const t = Math.max(4, Math.round(wall * 0.7));
  const cell = (c0: number, c1: number, r0: number, r1: number, cols: number[], rows: number[]): Rect => {
    const cx = (i: number) => inner.x + inner.w * cols.slice(0, i).reduce((a, b) => a + b, 0);
    const cy = (i: number) => inner.y + inner.h * rows.slice(0, i).reduce((a, b) => a + b, 0);
    const x0 = cx(c0) + (c0 > 0 ? t / 2 : 0);
    const x1 = cx(c1) - (c1 < cols.length ? t / 2 : 0);
    const y0 = cy(r0) + (r0 > 0 ? t / 2 : 0);
    const y1 = cy(r1) - (r1 < rows.length ? t / 2 : 0);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  let rooms: Record<RoomId, Rect>;
  if (portrait) {
    const cols = [0.52, 0.48];
    const rows = [0.34, 0.33, 0.33];
    rooms = {
      living: cell(0, 2, 0, 1, cols, rows),
      kitchen: cell(0, 1, 1, 2, cols, rows),
      bath: cell(1, 2, 1, 2, cols, rows),
      bedroom: cell(0, 1, 2, 3, cols, rows),
      hall: cell(1, 2, 2, 3, cols, rows),
    };
  } else {
    const cols = [0.36, 0.3, 0.34];
    const rows = [0.52, 0.48];
    rooms = {
      living: cell(0, 2, 0, 1, cols, rows),
      kitchen: cell(2, 3, 0, 1, cols, rows),
      bedroom: cell(0, 1, 1, 2, cols, rows),
      hall: cell(1, 2, 1, 2, cols, rows),
      bath: cell(2, 3, 1, 2, cols, rows),
    };
  }
  const hall = rooms.hall;
  const door = { x: hall.x + hall.w / 2, y: outer.y + outer.h - wall / 2, w: Math.min(hall.w * 0.42, 70) };
  const living = rooms.living;
  const kitchen = rooms.kitchen;
  const winW = Math.min(living.w * 0.22, 110);
  const windows = portrait
    ? [
        { x: living.x + living.w * 0.2 - winW / 2, y: outer.y, w: winW, h: wall },
        { x: living.x + living.w * 0.78 - winW / 2, y: outer.y, w: winW, h: wall },
      ]
    : [
        { x: living.x + living.w * 0.22 - winW / 2, y: outer.y, w: winW, h: wall },
        { x: living.x + living.w * 0.78 - winW / 2, y: outer.y, w: winW, h: wall },
        { x: kitchen.x + kitchen.w * 0.3 - winW / 2, y: outer.y, w: winW, h: wall },
      ];
  return { width, height, portrait, outer, wall, rooms, door, windows };
}

/** Rechteck einer Lage im Raum (in den Raum geschoben, Breiten über die Raumbreite gekappt). */
export function placeRect(room: Rect, place: Place, pad = 3): Rect {
  const m = Math.min(room.w, room.h);
  const w = Math.min(room.w - 2 * pad, m * place.w);
  const h = Math.min(room.h - 2 * pad, m * place.h);
  const cx = room.x + room.w * place.rx + m * (place.ox ?? 0);
  const cy = room.y + room.h * place.ry + m * (place.oy ?? 0);
  const x = Math.min(room.x + room.w - pad - w, Math.max(room.x + pad, cx - w / 2));
  const y = Math.min(room.y + room.h - pad - h, Math.max(room.y + pad, cy - h / 2));
  return { x, y, w, h };
}

export function itemRect(layout: ApartmentLayout, id: ItemId, room: RoomId): Rect {
  return placeRect(layout.rooms[room], ITEM_PLACES[id]);
}

/** Mindestgröße der Trefferfläche (Touch). */
export const HIT_MIN = 44;

/** Trefferfläche: das Rechteck, mindestens HIT_MIN × HIT_MIN um die Mitte. */
export function hitRect(r: Rect): Rect {
  const w = Math.max(HIT_MIN, r.w);
  const h = Math.max(HIT_MIN, r.h);
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}

/** Welches Ding liegt unter dem Punkt? Bei mehreren das mit der nächsten Mitte; -1, wenn keins. */
export function hitTest(rects: readonly Rect[], x: number, y: number): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  rects.forEach((r, i) => {
    const h = hitRect(r);
    if (x < h.x || x > h.x + h.w || y < h.y || y > h.y + h.h) return;
    const d = (x - (r.x + r.w / 2)) ** 2 + (y - (r.y + r.h / 2)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Nächstes Ding in einer Richtung (Pfeiltasten): im Halbraum dieser Richtung, Abstand quer zählt doppelt. */
export function neighbour(
  rects: readonly Rect[],
  from: number,
  dx: number,
  dy: number,
  skip?: (i: number) => boolean,
): number {
  const a = rects[from];
  if (!a) return rects.length > 0 ? 0 : -1;
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  let best = from;
  let bestD = Number.POSITIVE_INFINITY;
  rects.forEach((r, i) => {
    if (i === from || skip?.(i)) return;
    const vx = r.x + r.w / 2 - ax;
    const vy = r.y + r.h / 2 - ay;
    const along = vx * dx + vy * dy;
    if (along <= 1) return;
    const across = Math.abs(vx * dy - vy * dx);
    const d = along + 2 * across;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Platz für den Raumnamen (Breite w, Höhe h): erste Ecke bzw. Kante, die nichts verdeckt (unten links, unten rechts,
 * oben links, oben rechts, unten Mitte, oben Mitte), sonst unten links. Gibt die linke obere Ecke zurück.
 */
export function labelSpot(room: Rect, w: number, h: number, blockers: readonly Rect[]): { x: number; y: number } {
  const m = 7;
  const candidates = [
    { x: room.x + m, y: room.y + room.h - m - h },
    { x: room.x + room.w - m - w, y: room.y + room.h - m - h },
    { x: room.x + m, y: room.y + m },
    { x: room.x + room.w - m - w, y: room.y + m },
    { x: room.x + (room.w - w) / 2, y: room.y + room.h - m - h },
    { x: room.x + (room.w - w) / 2, y: room.y + m },
  ];
  const free = candidates.find(
    (c) => !blockers.some((b) => c.x < b.x + b.w + 3 && b.x - 3 < c.x + w && c.y < b.y + b.h + 3 && b.y - 3 < c.y + h),
  );
  return free ?? candidates[0];
}
