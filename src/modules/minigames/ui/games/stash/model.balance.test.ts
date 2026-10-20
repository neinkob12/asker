// Razzia-Lauf: Schwierigkeit als Simulation (Auftrag 48, Prüfliste „fühlt sich gut an“). Drei Spieler bei
// Schwierigkeit 0,2, 0,5 und 0,9 über viele Seeds; geschafft heißt Score ≥ winAt (0,5, Standard des Kerns).
// Richtwerte aus docs/auftraege/48-minispiele-gefuehl.md: guter Spieler bei 0,5 in 85–95 %, bei 0,9 in 60–80 %,
// schwacher Spieler bei 0,5 in 30–60 %, keine Eingabe nie. Zahlen: docs/auftraege/48/d-razzia-bude.md.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../../core';
import { DEFAULT_WIN_AT } from '../../../config';
import {
  bestMove,
  canHide,
  createStash,
  initStash,
  isLoose,
  type StashInput,
  type StashSetup,
  send,
  stashScore,
  step,
} from './model';

const DT = 1 / 30;
const SEEDS = 40;

const LAGER: StashInput = {
  setting: 'warehouse',
  lots: [
    { productId: 'weed', name: 'Gras', amount: 1200, unit: 'g', grams: 1200, value: 13200 },
    { productId: 'kush', name: 'OG Kush', amount: 300, unit: 'g', grams: 300, value: 5400 },
    { productId: 'edibles', name: 'Edibles', amount: 60, unit: 'Stück', grams: 300, value: 900 },
  ],
  money: 2400,
  warehouse: { vault: 1, cover: 0 },
};

const SPOT: StashInput = {
  setting: 'street',
  lots: [
    { productId: 'weed', name: 'Gras', amount: 15, unit: 'g', grams: 15, value: 165 },
    { productId: 'hash', name: 'Hasch', amount: 8, unit: 'g', grams: 8, value: 80 },
  ],
  money: 120,
};

type Player = 'good' | 'weak' | 'none';

/**
 * Guter Spieler: nimmt den besten Zug (bestMove) nach 0,5 s Bedenkzeit. Schwacher Spieler: braucht 1 s, nimmt
 * irgendein loses Paket und irgendein Versteck, in das es passt (auch den Gully), und vertut sich jedes vierte Mal
 * (tippt ein Versteck an, das nicht passt: noch einmal 1 s). Keine Eingabe: steht nur da.
 */
function play(setup: StashSetup, player: Player, seed: number): number {
  const state = initStash(setup);
  const rng = createRng(seed * 7919 + 13);
  const reaction = player === 'good' ? 0.5 : 1;
  let wait = reaction;
  for (let i = 0; i < 120 * 30 && !state.done; i++) {
    if (player !== 'none' && !state.goal && !state.action) {
      wait -= DT;
      if (wait <= 0) {
        wait = reaction;
        if (player === 'good') {
          const move = bestMove(setup, state);
          if (move) send(setup, state, move.id, move.hide);
        } else if (rng() < 0.25) {
          wait += reaction;
        } else {
          const loose = setup.packages.filter((p) => isLoose(state, p.id) || state.carry === p.id);
          const p = loose[Math.floor(rng() * loose.length)];
          const fits = p ? setup.hides.filter((h) => canHide(setup, state, p.id, h.id) === 'ok') : [];
          const h = fits[Math.floor(rng() * fits.length)];
          if (p && h) send(setup, state, p.id, h.id);
        }
      }
    }
    step(setup, state, DT);
  }
  return stashScore(setup, state);
}

function hardPlain(): number {
  return winRate(PLAIN, 0.9, 'good').win;
}

function winRate(input: StashInput, difficulty: number, player: Player): { win: number; seconds: number } {
  let wins = 0;
  let seconds = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const setup = createStash(seed, difficulty, input);
    if (play(setup, player, seed) >= DEFAULT_WIN_AT) wins += 1;
    seconds += setup.duration;
  }
  return { win: wins / SEEDS, seconds: seconds / SEEDS };
}

const PLAIN: StashInput = { ...LAGER, warehouse: { vault: 0, cover: 0 } };

describe('Razzia-Lauf: Schwierigkeit als Simulation', () => {
  // Gemessen (40 Seeds, Stand Teil D): Lager ohne Ausbau guter Spieler 100/100/73 %, schwacher 80/30/3 %; mit
  // Tresor guter 100/100/100 %, schwacher 95/55/3 % (der Ausbau lohnt sich); am Spot guter 100 %, schwacher 93/53/10 %.
  it('Lager ohne Ausbau: guter Spieler gewinnt meist, bei schwer knapp; schwacher bei mittel selten', () => {
    expect(winRate(PLAIN, 0.5, 'good').win).toBeGreaterThanOrEqual(0.85);
    const hard = winRate(PLAIN, 0.9, 'good').win;
    expect(hard).toBeGreaterThanOrEqual(0.55);
    expect(hard).toBeLessThanOrEqual(0.85);
    const weak = winRate(PLAIN, 0.5, 'weak').win;
    expect(weak).toBeGreaterThanOrEqual(0.2);
    expect(weak).toBeLessThanOrEqual(0.6);
  });

  it('mit Tresor leichter, am Spot schnell; schwacher Spieler bei mittel etwa die Hälfte', () => {
    expect(winRate(LAGER, 0.9, 'good').win).toBeGreaterThanOrEqual(hardPlain());
    const weak = winRate(LAGER, 0.5, 'weak').win;
    expect(weak).toBeGreaterThanOrEqual(0.3);
    expect(weak).toBeLessThanOrEqual(0.7);
    const spot = winRate(SPOT, 0.5, 'weak').win;
    expect(spot).toBeGreaterThanOrEqual(0.3);
    expect(spot).toBeLessThanOrEqual(0.7);
  });

  it('keine Eingabe gewinnt nie; Dauer 13 bis 32 s', () => {
    for (const input of [LAGER, PLAIN, SPOT]) {
      for (const d of [0.2, 0.5, 0.9]) {
        const r = winRate(input, d, 'none');
        expect(r.win).toBe(0);
        expect(r.seconds).toBeGreaterThanOrEqual(13);
        expect(r.seconds).toBeLessThanOrEqual(32);
      }
    }
  });

  it('Tabelle (BALANCE_PRINT=1 zeigt sie)', () => {
    if (!process.env.BALANCE_PRINT) return;
    for (const [name, input] of [
      ['Lager mit Tresor', LAGER],
      ['Lager ohne Ausbau', PLAIN],
      ['Am Spot', SPOT],
    ] as const) {
      for (const player of ['good', 'weak', 'none'] as const) {
        const row = [0.2, 0.5, 0.9].map((d) => winRate(input, d, player));
        process.stdout.write(
          `${[name, player, row.map((r) => `${Math.round(r.win * 100)} % (${r.seconds.toFixed(0)} s)`).join(' | ')].join(' ')}\n`,
        );
      }
    }
  });
});
