// Container packen (Auftrag 44, Teil 7): Spiellogik als reines Modell, ohne DOM (getestet in model.test.ts).
//
// Der Container von oben als Raster (Größe nach Container: Kiste 7 × 4, halber Container 9 × 5, Container 12 × 5). Die
// Türen sind rechts (letzte Spalte), die Wand zum Röntgen-Scanner oben (erste Reihe). Ware kommt als Blöcke in
// Tetris-Formen, dazu die Deckladung (Bananenkisten, Fliesenpaletten, ohne Deckladung Kartons mit Altkleidern) als
// Stapel je Form. Ziel: alle Ware hinein, und zwar von Deckladung umgeben: nicht an den Türen, nicht an der Wand zum
// Röntgen, keine Lücken daneben, keine großen zusammenhängenden Ware-Blöcke. Drehen, Ablegen, Rückgängig.
// Score = verstaute Ware × Tarnung (beides 0 bis 1).

import { createRng } from '../../../../../core';

export type CoverKind = 'none' | 'tiles' | 'bananas';
export type ContainerSizeId = 'small' | 'medium' | 'full';

/** Eine Form als Zellen (x nach rechts, y nach unten), normalisiert auf 0. */
export type Shape = readonly (readonly [number, number])[];

/** Was die Oberfläche aus den params bekommt (trade/packing.ts, PackingParams). */
export interface PackingInput {
  products: readonly { id: string; name: string }[];
  size: ContainerSizeId;
  cover: CoverKind;
  count: number;
}

export interface PackPiece {
  id: number;
  kind: 'goods' | 'cover';
  /** Form-ID (für Stapel der Deckladung und das Zeichnen). */
  shapeId: string;
  shape: Shape;
  /** Ware: welche (für Farbe und Namen). */
  productId: string | null;
  label: string;
}

export interface PackSetup {
  cols: number;
  rows: number;
  cover: CoverKind;
  pieces: PackPiece[];
  /** Zellen Ware zusammen. */
  goodsCells: number;
  /** Größter erlaubter zusammenhängender Ware-Block (größer leuchtet im Röntgen). */
  clusterMax: number;
  duration: number;
}

export interface Placement {
  pieceId: number;
  x: number;
  y: number;
  rot: number;
}

export interface PackState {
  time: number;
  /** In der Reihenfolge des Ablegens (für Rückgängig). */
  placed: Placement[];
  /** Belegung: pieceId je Zelle, −1 frei (Zeile für Zeile). */
  grid: number[];
  /** Ausgewähltes Teil (−1: keins mehr übrig). */
  selected: number;
  /** Drehung des ausgewählten Teils (0 bis 3, je 90°). */
  rot: number;
  /** Zelle unter Cursor bzw. Finger (Anker des Teils). */
  cursor: { x: number; y: number };
  done: boolean;
}

/** Warum eine Zelle Ware auffällt. */
export type ExposureReason = 'door' | 'xray' | 'gap' | 'cluster';

export interface CellExposure {
  x: number;
  y: number;
  /** 0 = gut versteckt, 1 = sofort zu sehen. */
  value: number;
  reasons: ExposureReason[];
  /** Seiten mit Lücke daneben (für die Anzeige). */
  gaps: ('up' | 'down' | 'left' | 'right')[];
}

export interface PackAnalysis {
  /** Verstaute Ware (Anteil der Zellen). */
  stowed: number;
  /** Tarnung der verstauten Ware (1 = nichts zu sehen). */
  cover: number;
  cells: CellExposure[];
  /** Zellen, die im Röntgen deutlich leuchten (value ≥ 0,5). */
  flagged: number;
  placedGoods: number;
  placedGoodsPieces: number;
}

export type PlaceCheck = 'ok' | 'out' | 'blocked' | 'placed' | 'done' | 'none';

/** Raster je Containergröße. */
export const GRID: Readonly<Record<ContainerSizeId, { cols: number; rows: number; goods: number; seconds: number }>> = {
  small: { cols: 7, rows: 4, goods: 5, seconds: 45 },
  medium: { cols: 9, rows: 5, goods: 8, seconds: 52 },
  full: { cols: 12, rows: 5, goods: 11, seconds: 60 },
};

/** Gewicht der Auffälligkeit je Grund (gedeckelt auf 1 je Zelle). */
export const EXPOSURE = { door: 1, xray: 1, gap: 0.3, cluster: 0.5 } as const;
/** Ab diesem Wert leuchtet eine Zelle beim Röntgen deutlich. */
export const FLAG_AT = 0.5;

/** Formen der Ware (Blöcke in Tetris-Formen) und ab welcher Schwierigkeit sie kommen. */
export const GOODS_SHAPES: Readonly<Record<string, { shape: Shape; from: number }>> = {
  I2: {
    shape: [
      [0, 0],
      [1, 0],
    ],
    from: 0,
  },
  I3: {
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    from: 0,
  },
  L3: {
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    from: 0,
  },
  O: {
    shape: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    from: 0.3,
  },
  T: {
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ],
    from: 0.35,
  },
  L4: {
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
    from: 0.5,
  },
  S: {
    shape: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    from: 0.6,
  },
  I4: {
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    from: 0.7,
  },
};

/**
 * Deckladung je Art: Formen mit Gewicht und wie viel vom freien Platz sie füllt (weniger, je schwerer). Bananen (die
 * teuerste Tarnung im Einkauf) sind kleine Kisten in Fülle, Fliesen sperrige Paletten, ohne Deckladung gibt es nur ein
 * paar Kartons Altkleider: Dann reicht es oft nicht, um alle Ware zu umgeben.
 */
export const COVER_SETS: Readonly<
  Record<
    CoverKind,
    {
      name: string;
      unit: string;
      shapes: readonly { id: string; shape: Shape; weight: number }[];
      fill: number;
      fillHard: number;
    }
  >
> = {
  bananas: {
    name: 'Bananen',
    unit: 'Bananenkiste',
    shapes: [
      {
        id: 'B2',
        shape: [
          [0, 0],
          [1, 0],
        ],
        weight: 5,
      },
      { id: 'B1', shape: [[0, 0]], weight: 2 },
      {
        id: 'B4',
        shape: [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ],
        weight: 2,
      },
    ],
    fill: 1,
    fillHard: 0.85,
  },
  tiles: {
    name: 'Fliesen',
    unit: 'Fliesenpalette',
    shapes: [
      {
        id: 'P4',
        shape: [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ],
        weight: 4,
      },
      {
        id: 'P6',
        shape: [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 1],
          [1, 1],
          [2, 1],
        ],
        weight: 2,
      },
      {
        id: 'P2',
        shape: [
          [0, 0],
          [1, 0],
        ],
        weight: 2,
      },
    ],
    fill: 0.95,
    fillHard: 0.8,
  },
  none: {
    name: 'Altkleider',
    unit: 'Karton Altkleider',
    shapes: [
      { id: 'C1', shape: [[0, 0]], weight: 3 },
      {
        id: 'C2',
        shape: [
          [0, 0],
          [1, 0],
        ],
        weight: 3,
      },
      {
        id: 'C3',
        shape: [
          [0, 0],
          [0, 1],
          [1, 1],
        ],
        weight: 2,
      },
    ],
    fill: 0.5,
    fillHard: 0.35,
  },
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function pickWeighted<T extends { weight: number }>(list: readonly T[], random: () => number): T {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = random() * total;
  for (const x of list) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return list[list.length - 1];
}

/** Form um rot × 90° im Uhrzeigersinn gedreht, normalisiert auf 0. */
export function rotate(shape: Shape, rot: number): Shape {
  let cells = shape.map(([x, y]) => [x, y] as [number, number]);
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([x, y]) => [-y, x]);
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY] as const);
}

/** Breite und Höhe einer Form. */
export function bounds(shape: Shape): { w: number; h: number } {
  return { w: Math.max(...shape.map((c) => c[0])) + 1, h: Math.max(...shape.map((c) => c[1])) + 1 };
}

/** Linke obere Ecke, damit die Mitte der Form auf der Zelle (cx, cy) liegt. */
export function originFor(shape: Shape, cx: number, cy: number): { x: number; y: number } {
  const { w, h } = bounds(shape);
  return { x: cx - Math.floor((w - 1) / 2), y: cy - Math.floor((h - 1) / 2) };
}

/**
 * Container aus Seed, Schwierigkeit und Bestellung. Mehr Ware, sperrigere Formen, weniger Deckladung und kleinere
 * erlaubte Ware-Blöcke, je schwerer. Zeit 45 s (Kiste) bis 60 s (ganzer Container).
 */
export function createPacking(seed: number, difficulty: number, input: PackingInput): PackSetup {
  const random = createRng(seed);
  const d = clamp01(difficulty);
  const grid = GRID[input.size] ?? GRID.medium;
  const cover: CoverKind = input.cover in COVER_SETS ? input.cover : 'none';
  const products = input.products.length > 0 ? input.products : [{ id: 'weed', name: 'Ware' }];
  const pieces: PackPiece[] = [];
  // Ware: Formen ziehen, bis die Zellen voll sind (die letzte darf eine Zelle drüber gehen).
  const target = grid.goods + Math.round(3 * d);
  const pool = Object.entries(GOODS_SHAPES).filter(([, s]) => s.from <= d + 1e-9);
  let left = target;
  while (left > 0) {
    const fitting = pool.filter(([, s]) => s.shape.length <= Math.max(2, left));
    const [shapeId, s] = fitting[Math.floor(random() * fitting.length)];
    const product = products[pieces.length % products.length];
    pieces.push({
      id: pieces.length,
      kind: 'goods',
      shapeId,
      shape: rotate(s.shape, Math.floor(random() * 4)),
      productId: product.id,
      label: product.name,
    });
    left -= s.shape.length;
  }
  const goodsCells = pieces.reduce((sum, p) => sum + p.shape.length, 0);
  // Deckladung: so viel, wie der freie Platz mal Füllgrad hergibt.
  const set = COVER_SETS[cover];
  const fill = set.fill - (set.fill - set.fillHard) * d;
  let room = Math.floor((grid.cols * grid.rows - goodsCells) * fill);
  while (room > 0) {
    const fitting = set.shapes.filter((s) => s.shape.length <= room);
    if (fitting.length === 0) break;
    const s = pickWeighted(fitting, random);
    pieces.push({ id: pieces.length, kind: 'cover', shapeId: s.id, shape: s.shape, productId: null, label: set.unit });
    room -= s.shape.length;
  }
  return {
    cols: grid.cols,
    rows: grid.rows,
    cover,
    pieces,
    goodsCells,
    clusterMax: d < 0.4 ? 6 : d < 0.75 ? 5 : 4,
    duration: grid.seconds,
  };
}

export function initPacking(setup: PackSetup): PackState {
  return {
    time: 0,
    placed: [],
    grid: new Array(setup.cols * setup.rows).fill(-1),
    selected: setup.pieces.length > 0 ? 0 : -1,
    rot: 0,
    cursor: { x: Math.floor(setup.cols / 2) - 1, y: Math.floor(setup.rows / 2) },
    done: false,
  };
}

export function isPlaced(state: PackState, pieceId: number): boolean {
  return state.placed.some((p) => p.pieceId === pieceId);
}

/** Zellen eines Teils mit Drehung an (x, y). */
export function cellsAt(piece: PackPiece, rot: number, x: number, y: number): [number, number][] {
  return rotate(piece.shape, rot).map(([cx, cy]) => [x + cx, y + cy]);
}

/** Wer steht an dieser Zelle (pieceId, −1 frei oder außerhalb)? */
export function pieceAt(setup: PackSetup, state: PackState, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= setup.cols || y >= setup.rows) return -1;
  return state.grid[y * setup.cols + x];
}

/** Passt das Teil mit dieser Drehung an diese Stelle (linke obere Ecke)? */
export function canPlace(
  setup: PackSetup,
  state: PackState,
  pieceId: number,
  rot: number,
  x: number,
  y: number,
): PlaceCheck {
  if (state.done) return 'done';
  const piece = setup.pieces[pieceId];
  if (!piece) return 'none';
  if (isPlaced(state, pieceId)) return 'placed';
  for (const [cx, cy] of cellsAt(piece, rot, x, y)) {
    if (cx < 0 || cy < 0 || cx >= setup.cols || cy >= setup.rows) return 'out';
    if (state.grid[cy * setup.cols + cx] !== -1) return 'blocked';
  }
  return 'ok';
}

/** Nächstes freies Teil derselben Art (Ware: das nächste Ware-Teil; Deckladung: dieselbe Form), sonst irgendeins. */
function nextFree(setup: PackSetup, state: PackState, after: PackPiece): number {
  const free = setup.pieces.filter((p) => !isPlaced(state, p.id));
  const same =
    after.kind === 'goods'
      ? free.find((p) => p.kind === 'goods')
      : free.find((p) => p.kind === 'cover' && p.shapeId === after.shapeId);
  return (same ?? free.find((p) => p.kind === 'goods') ?? free[0])?.id ?? -1;
}

/** Teil ablegen (linke obere Ecke). Danach ist das nächste Teil derselben Art ausgewählt. */
export function place(setup: PackSetup, state: PackState, pieceId: number, rot: number, x: number, y: number): boolean {
  if (canPlace(setup, state, pieceId, rot, x, y) !== 'ok') return false;
  const piece = setup.pieces[pieceId];
  for (const [cx, cy] of cellsAt(piece, rot, x, y)) state.grid[cy * setup.cols + cx] = pieceId;
  state.placed.push({ pieceId, x, y, rot: ((rot % 4) + 4) % 4 });
  state.selected = nextFree(setup, state, piece);
  return true;
}

/** Teil wieder herausnehmen (es ist dann ausgewählt, mit seiner Drehung). */
export function lift(_setup: PackSetup, state: PackState, pieceId: number): boolean {
  if (state.done) return false;
  const i = state.placed.findIndex((p) => p.pieceId === pieceId);
  if (i < 0) return false;
  const [p] = state.placed.splice(i, 1);
  for (let k = 0; k < state.grid.length; k++) if (state.grid[k] === pieceId) state.grid[k] = -1;
  state.selected = pieceId;
  state.rot = p.rot;
  return true;
}

/** Rückgängig: das zuletzt abgelegte Teil wieder heraus. */
export function undo(setup: PackSetup, state: PackState): number {
  const last = state.placed.at(-1);
  if (!last || !lift(setup, state, last.pieceId)) return -1;
  return last.pieceId;
}

/** Ausgewähltes Teil drehen (im Uhrzeigersinn). */
export function turn(state: PackState, dir: 1 | -1 = 1): void {
  if (state.done) return;
  state.rot = (state.rot + dir + 4) % 4;
}

/** Teil auswählen (nur freie). */
export function select(setup: PackSetup, state: PackState, pieceId: number): boolean {
  if (state.done || !setup.pieces[pieceId] || isPlaced(state, pieceId)) return false;
  state.selected = pieceId;
  return true;
}

/**
 * Was die Auswahl der Reihe nach durchgeht: jedes freie Ware-Teil einzeln, dann je Form der Deckladung ein Stapel
 * (das erste freie Teil der Form).
 */
export function trayOrder(setup: PackSetup, state: PackState): number[] {
  const list: number[] = [];
  const seen = new Set<string>();
  for (const p of setup.pieces) {
    if (isPlaced(state, p.id)) continue;
    if (p.kind === 'goods') list.push(p.id);
    else if (!seen.has(p.shapeId)) {
      seen.add(p.shapeId);
      list.push(p.id);
    }
  }
  return list;
}

/** Nächstes bzw. voriges Teil in der Auswahl. */
export function cycle(setup: PackSetup, state: PackState, dir: 1 | -1): number {
  const list = trayOrder(setup, state);
  if (list.length === 0) return -1;
  const cur = setup.pieces[state.selected];
  // Bei Deckladung zählt der Stapel der Form, nicht das einzelne Teil.
  const at = list.findIndex(
    (id) => id === state.selected || (cur?.kind === 'cover' && setup.pieces[id].shapeId === cur.shapeId),
  );
  const next = list[((((at < 0 ? -dir : at) + dir) % list.length) + list.length) % list.length];
  state.selected = next;
  return next;
}

/** Freie Teile einer Form der Deckladung. */
export function stackCount(setup: PackSetup, state: PackState, shapeId: string): number {
  return setup.pieces.filter((p) => p.kind === 'cover' && p.shapeId === shapeId && !isPlaced(state, p.id)).length;
}

/** Cursor bewegen (bleibt im Raster). */
export function moveCursor(setup: PackSetup, state: PackState, dx: number, dy: number): void {
  state.cursor = {
    x: Math.min(setup.cols - 1, Math.max(0, state.cursor.x + dx)),
    y: Math.min(setup.rows - 1, Math.max(0, state.cursor.y + dy)),
  };
}

/** Wie auffällig jede Zelle Ware ist, verstaute Ware und Tarnung. */
export function analyze(setup: PackSetup, state: PackState): PackAnalysis {
  const { cols, rows } = setup;
  const isGoods = (x: number, y: number) => {
    const id = pieceAt(setup, state, x, y);
    return id >= 0 && setup.pieces[id].kind === 'goods';
  };
  // Zusammenhängende Ware-Blöcke (über Teile hinweg).
  const comp = new Array(cols * rows).fill(-1);
  const sizes: number[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isGoods(x, y) || comp[y * cols + x] >= 0) continue;
      const c = sizes.length;
      sizes.push(0);
      const stack = [[x, y]];
      comp[y * cols + x] = c;
      while (stack.length > 0) {
        const [sx, sy] = stack.pop() as number[];
        sizes[c] += 1;
        for (const [nx, ny] of [
          [sx + 1, sy],
          [sx - 1, sy],
          [sx, sy + 1],
          [sx, sy - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (comp[ny * cols + nx] >= 0 || !isGoods(nx, ny)) continue;
          comp[ny * cols + nx] = c;
          stack.push([nx, ny]);
        }
      }
    }
  }
  const cells: CellExposure[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isGoods(x, y)) continue;
      const reasons: ExposureReason[] = [];
      const gaps: CellExposure['gaps'] = [];
      let value = 0;
      if (x === cols - 1) {
        value += EXPOSURE.door;
        reasons.push('door');
      }
      if (y === 0) {
        value += EXPOSURE.xray;
        reasons.push('xray');
      }
      const sides: [number, number, CellExposure['gaps'][number]][] = [
        [x, y - 1, 'up'],
        [x, y + 1, 'down'],
        [x - 1, y, 'left'],
        [x + 1, y, 'right'],
      ];
      for (const [nx, ny, side] of sides) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (pieceAt(setup, state, nx, ny) === -1) {
          value += EXPOSURE.gap;
          gaps.push(side);
        }
      }
      if (gaps.length > 0) reasons.push('gap');
      if (sizes[comp[y * cols + x]] > setup.clusterMax) {
        value += EXPOSURE.cluster;
        reasons.push('cluster');
      }
      cells.push({ x, y, value: Math.min(1, Math.round(value * 1000) / 1000), reasons, gaps });
    }
  }
  const placedGoods = cells.length;
  const exposure = placedGoods > 0 ? cells.reduce((s, c) => s + c.value, 0) / placedGoods : 1;
  return {
    stowed: setup.goodsCells > 0 ? clamp01(placedGoods / setup.goodsCells) : 0,
    cover: placedGoods > 0 ? clamp01(1 - exposure) : 0,
    cells,
    flagged: cells.filter((c) => c.value >= FLAG_AT).length,
    placedGoods,
    placedGoodsPieces: state.placed.filter((p) => setup.pieces[p.pieceId].kind === 'goods').length,
  };
}

/** Score = verstaute Ware × Tarnung (0 bis 1). */
export function packScore(setup: PackSetup, state: PackState): number {
  const a = analyze(setup, state);
  return Math.round(clamp01(a.stowed * a.cover) * 1000) / 1000;
}

/** Restliche Zeit in Sekunden. */
export function timeLeft(setup: PackSetup, state: PackState): number {
  return Math.max(0, setup.duration - state.time);
}

/** Zeit laufen lassen; true, wenn sie gerade abgelaufen ist. */
export function step(setup: PackSetup, state: PackState, dt: number): boolean {
  if (state.done || !(dt > 0)) return false;
  state.time += dt;
  if (timeLeft(setup, state) <= 0) {
    state.done = true;
    return true;
  }
  return false;
}

/** Fertig gepackt (vor Ablauf der Zeit). */
export function finishPacking(state: PackState): void {
  state.done = true;
}

/** Was passiert ist, für den Kern und das Ergebnis: Ware-Teile verstaut, auffällige Zellen, Deckladung. */
export function packPicks(setup: PackSetup, state: PackState): string[] {
  const a = analyze(setup, state);
  const goods = setup.pieces.filter((p) => p.kind === 'goods').length;
  const picks = [`goods:${a.placedGoodsPieces}/${goods}`, `flagged:${a.flagged}`, `cover:${setup.cover}`];
  const reasons = new Set(a.cells.filter((c) => c.value >= FLAG_AT).flatMap((c) => c.reasons));
  for (const r of ['door', 'xray', 'cluster'] as const) if (reasons.has(r)) picks.push(r);
  return picks;
}

/**
 * Gieriges Packen (für Tests, Vorschau-Bilder und den Dev-Haken): erst jedes Ware-Teil an die Stelle, die den Score
 * am meisten hebt, dann Deckladung, solange sie den Score hebt. Höchstens steps Teile. Gibt die Zahl der Teile zurück.
 */
export function autoPack(setup: PackSetup, state: PackState, steps = Number.POSITIVE_INFINITY): number {
  let placed = 0;
  const best = (piece: PackPiece) => {
    let top: { rot: number; x: number; y: number; score: number } | null = null;
    for (let rot = 0; rot < 4; rot++) {
      for (let y = 0; y < setup.rows; y++) {
        for (let x = 0; x < setup.cols; x++) {
          if (canPlace(setup, state, piece.id, rot, x, y) !== 'ok') continue;
          place(setup, state, piece.id, rot, x, y);
          const a = analyze(setup, state);
          // Ware: Tarnung zählt (verstaut ist sie so oder so); Deckladung: der Score.
          const score = piece.kind === 'goods' ? a.cover : a.stowed * a.cover;
          lift(setup, state, piece.id);
          if (!top || score > top.score + 1e-9) top = { rot, x, y, score };
        }
      }
    }
    return top;
  };
  for (const piece of setup.pieces.filter((p) => p.kind === 'goods')) {
    if (placed >= steps || state.done) return placed;
    if (isPlaced(state, piece.id)) continue;
    const spot = best(piece);
    if (spot && place(setup, state, piece.id, spot.rot, spot.x, spot.y)) placed += 1;
  }
  while (placed < steps && !state.done) {
    const now = packScore(setup, state);
    let pick: { id: number; rot: number; x: number; y: number; score: number } | null = null;
    const tried = new Set<string>();
    for (const piece of setup.pieces) {
      if (piece.kind !== 'cover' || isPlaced(state, piece.id) || tried.has(piece.shapeId)) continue;
      tried.add(piece.shapeId);
      const spot = best(piece);
      if (spot && (!pick || spot.score > pick.score + 1e-9)) pick = { id: piece.id, ...spot };
    }
    if (!pick || pick.score <= now + 1e-9) break;
    place(setup, state, pick.id, pick.rot, pick.x, pick.y);
    placed += 1;
  }
  return placed;
}
