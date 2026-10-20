// Bude durchsuchen: Schwierigkeit als Simulation (Auftrag 48, Prüfliste „fühlt sich gut an“). Drei Spieler bei
// Schwierigkeit 0,2, 0,5 und 0,9 über viele Seeds; geschafft heißt Score ≥ winAt (0,5, Standard des Kerns).
// Richtwerte aus docs/auftraege/48-minispiele-gefuehl.md, Zahlen in docs/auftraege/48/d-razzia-bude.md.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../../core';
import { DEFAULT_WIN_AT } from '../../../config';
import { advance, createSearch, ITEMS, initSearch, pick, ROOMS, type SearchSetup, searchScore } from './model';

const SEEDS = 40;
const DT = 0.05;
type Player = 'good' | 'weak' | 'none';

function run(setup: SearchSetup, state: ReturnType<typeof initSearch>, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9 && !state.done; t += DT) advance(setup, state, DT);
}

/**
 * Guter Spieler: Raum für Raum erst Spuren und klassische Verstecke (laute Dinge nur mit Spur), dann der Rest;
 * 0,6 s pro Raumwechsel, 0,35 s Bedenkzeit pro Ding. Schwacher Spieler: Räume in zufälliger Reihenfolge, darin die
 * Dinge in zufälliger Reihenfolge, Spuren übersieht er; 1 s pro Raumwechsel, 0,9 s pro Ding. Keine Eingabe: wartet.
 */
function play(setup: SearchSetup, player: Player, seed: number): number {
  const state = initSearch(setup);
  if (player === 'none') {
    run(setup, state, setup.duration + 1);
    return searchScore(setup, state);
  }
  const rng = createRng(seed * 104729 + 7);
  const loud = new Set(ITEMS.filter((d) => d.loud >= 0.5).map((d) => d.id));
  const plan: number[] = [];
  if (player === 'good') {
    const passes = [
      (i: number) => setup.items[i].tell || setup.items[i].peek,
      (i: number) => ITEMS.find((d) => d.id === setup.items[i].id)?.classic === true && !loud.has(setup.items[i].id),
      (i: number) => !loud.has(setup.items[i].id),
      () => true,
    ];
    for (const pass of passes)
      for (const room of ['hall', 'living', 'kitchen', 'bedroom', 'bath'] as const)
        for (let i = 0; i < setup.items.length; i++)
          if (setup.items[i].room === room && !plan.includes(i) && pass(i)) plan.push(i);
  } else {
    const rooms = [...ROOMS].sort(() => rng() - 0.5);
    for (const room of rooms) {
      const inRoom = setup.items.map((it, i) => (it.room === room ? i : -1)).filter((i) => i >= 0);
      plan.push(...inRoom.sort(() => rng() - 0.5));
    }
  }
  const walk = player === 'good' ? 0.6 : 1;
  const react = player === 'good' ? 0.35 : 0.9;
  let room = 'hall';
  for (const i of plan) {
    if (state.done) break;
    if (setup.items[i].room !== room) {
      run(setup, state, walk);
      room = setup.items[i].room;
    }
    run(setup, state, react);
    if (state.done) break;
    pick(setup, state, i);
    run(setup, state, setup.items[i].duration + 0.06);
  }
  run(setup, state, setup.duration + 1);
  return searchScore(setup, state);
}

function winRate(difficulty: number, player: Player): number {
  let wins = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const setup = createSearch(seed, difficulty, 1000);
    if (play(setup, player, seed) >= DEFAULT_WIN_AT) wins += 1;
  }
  return wins / SEEDS;
}

describe('Bude durchsuchen: Schwierigkeit als Simulation', () => {
  // Gemessen (40 Seeds, Stand Teil D): guter Spieler 100/95/75 %, schwacher 57/48/30 %, keine Eingabe 0 %.
  it('guter Spieler gewinnt bei mittel fast immer, bei schwer meist; schwacher etwa jedes zweite Mal', () => {
    expect(winRate(0.5, 'good')).toBeGreaterThanOrEqual(0.85);
    const hard = winRate(0.9, 'good');
    expect(hard).toBeGreaterThanOrEqual(0.6);
    expect(hard).toBeLessThanOrEqual(0.85);
    const weak = winRate(0.5, 'weak');
    expect(weak).toBeGreaterThanOrEqual(0.3);
    expect(weak).toBeLessThanOrEqual(0.6);
  });

  it('keine Eingabe gewinnt nie', () => {
    for (const d of [0.2, 0.5, 0.9]) expect(winRate(d, 'none')).toBe(0);
  });

  it('Tabelle (BALANCE_PRINT=1 zeigt sie)', () => {
    if (!process.env.BALANCE_PRINT) return;
    for (const player of ['good', 'weak', 'none'] as const) {
      const row = [0.2, 0.5, 0.9].map((d) => `${Math.round(winRate(d, player) * 100)} %`);
      process.stdout.write(`Bude ${player} ${row.join(' | ')}\n`);
    }
  });
});
