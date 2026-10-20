// Container packen (Auftrag 48, Teil E): Schwierigkeit als Simulation. Ein Spieler legt Teil für Teil ab und braucht
// für jedes `pace` Sekunden (wählen, drehen, ziehen). Er sieht die guten Plätze, nimmt aber nicht immer den besten:
// `sloppy` ist der Anteil der Züge, bei denen er irgendeinen aus den besseren `pool` nimmt. Erst die Ware, dann
// Deckladung, solange sie hilft. Geschafft ab Score 0,5 (winAt der Art).
// BALANCE_REPORT=1 npx vitest run src/modules/minigames/ui/games/container/model.balance.test.ts druckt die Tabelle.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../../core';
import {
  analyze,
  type ContainerSizeId,
  type CoverKind,
  canPlace,
  createPacking,
  initPacking,
  isPlaced,
  lift,
  type PackPiece,
  type PackSetup,
  type PackState,
  packScore,
  place,
  step,
} from './model';

interface Player {
  pace: number;
  sloppy: number;
  /** Anteil der Plätze (nach Güte sortiert), aus denen er beim schlampigen Zug wählt. */
  pool: number;
}

const PLAYERS: Record<'good' | 'weak', Player> = {
  good: { pace: 3.2, sloppy: 0.2, pool: 0.15 },
  weak: { pace: 5, sloppy: 0.6, pool: 0.4 },
};

function spots(setup: PackSetup, state: PackState, piece: PackPiece) {
  const list: { rot: number; x: number; y: number; score: number }[] = [];
  for (let rot = 0; rot < 4; rot++) {
    for (let y = 0; y < setup.rows; y++) {
      for (let x = 0; x < setup.cols; x++) {
        if (canPlace(setup, state, piece.id, rot, x, y) !== 'ok') continue;
        place(setup, state, piece.id, rot, x, y);
        const a = analyze(setup, state);
        list.push({ rot, x, y, score: piece.kind === 'goods' ? a.cover : a.stowed * a.cover });
        lift(setup, state, piece.id);
      }
    }
  }
  return list.sort((a, b) => b.score - a.score);
}

function playPacking(seed: number, d: number, size: ContainerSizeId, cover: CoverKind, player: Player | null) {
  const setup = createPacking(seed, d, { products: [{ id: 'hash', name: 'Hasch' }], size, cover, count: 1 });
  const state = initPacking(setup);
  const rng = createRng(seed * 31 + Math.round(d * 100));
  if (!player) {
    step(setup, state, setup.duration + 1);
    return packScore(setup, state);
  }
  const choose = (list: ReturnType<typeof spots>) => {
    if (list.length === 0) return null;
    if (rng() >= player.sloppy) return list[0];
    return list[Math.floor(rng() * Math.max(1, Math.ceil(list.length * player.pool)))];
  };
  while (!state.done) {
    if (step(setup, state, player.pace)) break;
    const goods = setup.pieces.find((p) => p.kind === 'goods' && !isPlaced(state, p.id));
    if (goods) {
      const spot = choose(spots(setup, state, goods));
      if (!spot) break;
      place(setup, state, goods.id, spot.rot, spot.x, spot.y);
      continue;
    }
    const now = packScore(setup, state);
    let best: { piece: PackPiece; spot: ReturnType<typeof spots>[number] } | null = null;
    const tried = new Set<string>();
    for (const piece of setup.pieces) {
      if (piece.kind !== 'cover' || isPlaced(state, piece.id) || tried.has(piece.shapeId)) continue;
      tried.add(piece.shapeId);
      const spot = choose(spots(setup, state, piece));
      if (spot && (!best || spot.score > best.spot.score)) best = { piece, spot };
    }
    if (!best || best.spot.score <= now + 1e-9) break;
    place(setup, state, best.piece.id, best.spot.rot, best.spot.x, best.spot.y);
  }
  return packScore(setup, state);
}

function winRate(d: number, player: Player | null) {
  let won = 0;
  let n = 0;
  let sum = 0;
  for (let seed = 1; seed <= 8; seed++)
    for (const size of ['small', 'medium', 'full'] as const)
      for (const cover of ['none', 'tiles', 'bananas'] as const) {
        const score = playPacking(seed, d, size, cover, player);
        sum += score;
        if (score >= 0.5) won += 1;
        n += 1;
      }
  return { rate: won / n, mean: sum / n };
}

describe('Container packen: Schwierigkeit (Simulation)', () => {
  it('Tabelle', () => {
    const rows = [0.2, 0.5, 0.9].map((d) => {
      const good = winRate(d, PLAYERS.good);
      const weak = winRate(d, PLAYERS.weak);
      const none = winRate(d, null);
      return { d, good: good.rate, goodScore: good.mean, weak: weak.rate, weakScore: weak.mean, none: none.rate };
    });
    if (process.env.BALANCE_REPORT) console.table(rows);
    expect(rows.every((r) => r.none === 0)).toBe(true);
  }, 60000);
});
