// Container packen: Modell (Raster, Teile, Ablegen, Drehen, Rückgängig, Tarnung, Score).

import { describe, expect, it } from 'vitest';
import {
  analyze,
  autoPack,
  bounds,
  canPlace,
  createPacking,
  cycle,
  finishPacking,
  GRID,
  initPacking,
  lift,
  type PackPiece,
  type PackSetup,
  packPicks,
  packScore,
  pieceAt,
  place,
  rotate,
  stackCount,
  step,
  trayOrder,
  undo,
} from './model';

const INPUT = {
  products: [{ id: 'hash', name: 'Hasch' }],
  size: 'medium' as const,
  cover: 'bananas' as const,
  count: 1,
};

/** Kleines Raster 5 × 4 mit einem Ware-Teil (1 × 2) und Kisten (1 × 1) zum Umranden. */
function tiny(): PackSetup {
  const pieces: PackPiece[] = [
    {
      id: 0,
      kind: 'goods',
      shapeId: 'I2',
      shape: [
        [0, 0],
        [1, 0],
      ],
      productId: 'hash',
      label: 'Hasch',
    },
  ];
  for (let i = 1; i <= 12; i++) {
    pieces.push({ id: i, kind: 'cover', shapeId: 'B1', shape: [[0, 0]], productId: null, label: 'Bananenkiste' });
  }
  return { cols: 5, rows: 4, cover: 'bananas', pieces, goodsCells: 2, clusterMax: 4, duration: 45 };
}

describe('Container packen: Aufbau', () => {
  it('gleicher Seed, gleicher Container; Raster und Zeit nach Größe', () => {
    expect(createPacking(7, 0.5, INPUT)).toEqual(createPacking(7, 0.5, INPUT));
    expect(createPacking(7, 0.5, INPUT)).not.toEqual(createPacking(8, 0.5, INPUT));
    const small = createPacking(1, 0.3, { ...INPUT, size: 'small' });
    const full = createPacking(1, 0.3, { ...INPUT, size: 'full' });
    expect([small.cols, small.rows, small.duration]).toEqual([7, 4, 45]);
    expect([full.cols, full.rows, full.duration]).toEqual([12, 5, 60]);
  });

  it('Ware füllt mindestens das Ziel, Deckladung passt in den Rest; schwerer heißt mehr Ware, weniger Deckladung', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const size of ['small', 'medium', 'full'] as const) {
        for (const cover of ['none', 'tiles', 'bananas'] as const) {
          const s = createPacking(seed, 0.5, { ...INPUT, size, cover });
          const cells = s.cols * s.rows;
          const goods = s.pieces.filter((p) => p.kind === 'goods');
          const coverCells = s.pieces.filter((p) => p.kind === 'cover').reduce((n, p) => n + p.shape.length, 0);
          expect(s.goodsCells).toBe(goods.reduce((n, p) => n + p.shape.length, 0));
          expect(s.goodsCells).toBeGreaterThanOrEqual(GRID[size].goods);
          expect(s.goodsCells + coverCells).toBeLessThanOrEqual(cells);
        }
      }
    }
    const easy = createPacking(3, 0, { ...INPUT, cover: 'none' });
    const hard = createPacking(3, 1, { ...INPUT, cover: 'none' });
    expect(hard.goodsCells).toBeGreaterThan(easy.goodsCells);
    expect(hard.clusterMax).toBeLessThan(easy.clusterMax);
    const coverOf = (s: PackSetup) =>
      s.pieces.filter((p) => p.kind === 'cover').reduce((n, p) => n + p.shape.length, 0);
    expect(coverOf(hard)).toBeLessThan(coverOf(easy));
    // Bananen füllen mehr als Altkleider.
    expect(coverOf(createPacking(3, 0.5, INPUT))).toBeGreaterThan(
      coverOf(createPacking(3, 0.5, { ...INPUT, cover: 'none' })),
    );
  });

  it('mehrere Waren wechseln sich bei den Ware-Teilen ab', () => {
    const s = createPacking(2, 0.8, {
      ...INPUT,
      products: [
        { id: 'weed', name: 'Gras' },
        { id: 'haze', name: 'Haze' },
      ],
    });
    const goods = s.pieces.filter((p) => p.kind === 'goods').map((p) => p.productId);
    expect(goods.slice(0, 2)).toEqual(['weed', 'haze']);
  });

  it('drehen: vier Mal ist wie vorher, Breite und Höhe tauschen', () => {
    const L: PackPiece['shape'] = [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    expect(bounds(rotate(L, 1))).toEqual({ w: 3, h: 2 });
    expect([...rotate(L, 4)].sort()).toEqual([...L].sort());
  });
});

describe('Container packen: Ablegen', () => {
  it('ablegen, blockiert, außerhalb, rückgängig und herausnehmen', () => {
    const s = tiny();
    const st = initPacking(s);
    expect(canPlace(s, st, 0, 0, 4, 0)).toBe('out');
    expect(place(s, st, 0, 0, 1, 1)).toBe(true);
    expect(pieceAt(s, st, 2, 1)).toBe(0);
    expect(canPlace(s, st, 1, 0, 2, 1)).toBe('blocked');
    expect(canPlace(s, st, 0, 0, 1, 2)).toBe('placed');
    // Danach ist das nächste Teil ausgewählt (keine Ware mehr: eine Kiste).
    expect(s.pieces[st.selected].kind).toBe('cover');
    expect(place(s, st, 1, 0, 0, 0)).toBe(true);
    expect(undo(s, st)).toBe(1);
    expect(pieceAt(s, st, 0, 0)).toBe(-1);
    expect(st.selected).toBe(1);
    expect(lift(s, st, 0)).toBe(true);
    expect(st.placed).toHaveLength(0);
    expect(st.grid.every((c) => c === -1)).toBe(true);
  });

  it('Auswahl: jedes Ware-Teil einzeln, Deckladung als Stapel je Form', () => {
    const s = createPacking(4, 0.5, INPUT);
    const st = initPacking(s);
    const tray = trayOrder(s, st);
    const goods = s.pieces.filter((p) => p.kind === 'goods').length;
    const shapes = new Set(s.pieces.filter((p) => p.kind === 'cover').map((p) => p.shapeId)).size;
    expect(tray).toHaveLength(goods + shapes);
    const first = st.selected;
    cycle(s, st, 1);
    expect(st.selected).not.toBe(first);
    cycle(s, st, -1);
    expect(st.selected).toBe(first);
    const coverId = s.pieces.find((p) => p.kind === 'cover')?.shapeId ?? '';
    expect(stackCount(s, st, coverId)).toBe(s.pieces.filter((p) => p.shapeId === coverId).length);
  });

  it('Zeit läuft ab, dann geht nichts mehr', () => {
    const s = tiny();
    const st = initPacking(s);
    expect(step(s, st, 44)).toBe(false);
    expect(step(s, st, 2)).toBe(true);
    expect(place(s, st, 0, 0, 1, 1)).toBe(false);
  });
});

describe('Container packen: Tarnung und Score', () => {
  it('rundum von Deckladung umgeben: nichts zu sehen, Score 1', () => {
    const s = tiny();
    const st = initPacking(s);
    place(s, st, 0, 0, 1, 2);
    // Um (1,2)-(2,2): oben (1,1), (2,1); links (0,2); rechts (3,2); unten (1,3), (2,3).
    let id = 1;
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [0, 2],
      [3, 2],
      [1, 3],
      [2, 3],
    ]) {
      expect(place(s, st, id++, 0, x, y)).toBe(true);
    }
    const a = analyze(s, st);
    expect(a.stowed).toBe(1);
    expect(a.cover).toBe(1);
    expect(a.flagged).toBe(0);
    expect(packScore(s, st)).toBe(1);
  });

  it('an der Tür oder an der Wand zum Röntgen: sofort zu sehen', () => {
    const s = tiny();
    const door = initPacking(s);
    place(s, door, 0, 1, 4, 1);
    const a = analyze(s, door);
    expect(a.cells.every((c) => c.reasons.includes('door'))).toBe(true);
    expect(a.cover).toBe(0);
    expect(packScore(s, door)).toBe(0);
    const xray = initPacking(s);
    place(s, xray, 0, 0, 1, 0);
    expect(analyze(s, xray).cells.every((c) => c.reasons.includes('xray'))).toBe(true);
    expect(packPicks(s, xray)).toEqual(expect.arrayContaining(['goods:1/1', 'flagged:2', 'cover:bananas', 'xray']));
  });

  it('Lücken neben der Ware kosten Tarnung, nicht verstaute Ware kostet Score', () => {
    const s = tiny();
    const st = initPacking(s);
    expect(packScore(s, st)).toBe(0);
    place(s, st, 0, 0, 1, 2);
    const open = analyze(s, st);
    // Ohne Deckladung: links 1, rechts 1, oben 2, unten 2 Lücken = 6 × 0,3 auf 2 Zellen, je Zelle höchstens 1.
    expect(open.cells.map((c) => c.value)).toEqual([0.9, 0.9]);
    expect(open.cover).toBeCloseTo(0.1, 6);
  });

  it('große Ware-Blöcke fallen im Röntgen auf', () => {
    const s: PackSetup = { ...tiny(), clusterMax: 3 };
    s.pieces.push({
      id: 13,
      kind: 'goods',
      shapeId: 'I2',
      shape: [
        [0, 0],
        [1, 0],
      ],
      productId: 'hash',
      label: 'Hasch',
    });
    s.goodsCells = 4;
    const st = initPacking(s);
    place(s, st, 0, 0, 1, 1);
    place(s, st, 13, 0, 1, 2);
    expect(analyze(s, st).cells.every((c) => c.reasons.includes('cluster'))).toBe(true);
    finishPacking(st);
    expect(st.done).toBe(true);
  });
});

describe('Container packen: machbar', () => {
  it('gierig gepackt schafft jeder Container einen guten Score, ohne Deckladung schwerer', () => {
    for (const seed of [1, 2, 3]) {
      for (const size of ['small', 'medium', 'full'] as const) {
        const s = createPacking(seed, 0.5, { ...INPUT, size });
        const st = initPacking(s);
        autoPack(s, st);
        expect(analyze(s, st).stowed).toBe(1);
        expect(packScore(s, st)).toBeGreaterThan(0.6);
      }
    }
    const s = createPacking(2, 0.2, INPUT);
    const st = initPacking(s);
    expect(autoPack(s, st, 2)).toBe(2);
    expect(st.placed).toHaveLength(2);
  });
});
