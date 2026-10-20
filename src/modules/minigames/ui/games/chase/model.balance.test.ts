// Schwierigkeit der Verfolgungsjagd (Auftrag 48, Teil A): Ein guter Spieler (der Fahr-Bot), ein schwacher (Bot mit
// Reaktionszeit, unruhiger Hand, ohne Turbo und ohne Ausweichen) und keine Eingabe, je bei 0,2, 0,5 und 0,9 über
// viele Seeds. Richtwerte aus docs/auftraege/48-minispiele-gefuehl.md; die Zahlen stehen in docs/auftraege/48/a-jagd.md.

import { describe, expect, it } from 'vitest';
import { clumsyInput, createClumsyPilot, createPilot, pilotInput } from './bot';
import { type ChaseInput, createChase, initChase, stepChase } from './model';

type Player = 'good' | 'weak' | 'none';
const IDLE: ChaseInput = { steer: 0, gas: false, brake: false, turbo: false };
const SEEDS = 40;

function play(player: Player, difficulty: number): { wins: number; seconds: number } {
  let wins = 0;
  let seconds = 0;
  for (let k = 1; k <= SEEDS; k++) {
    const setup = createChase({ seed: k * 7919, difficulty });
    const state = initChase(setup);
    const good = createPilot();
    const weak = createClumsyPilot(k);
    while (!state.end) {
      const input =
        player === 'good' ? pilotInput(setup, state, good) : player === 'weak' ? clumsyInput(setup, state, weak) : IDLE;
      stepChase(setup, state, input, 1 / 30);
    }
    if (state.end === 'escaped') wins++;
    seconds += state.endAt;
  }
  return { wins: wins / SEEDS, seconds: seconds / SEEDS };
}

describe('Verfolgungsjagd: Schwierigkeit', () => {
  it('guter Spieler: leicht fast immer, mittel 85 bis 95 %, schwer 60 bis 80 % (mit Spielraum für Rauschen)', () => {
    const easy = play('good', 0.2);
    const mid = play('good', 0.5);
    const hard = play('good', 0.9);
    expect(easy.wins).toBeGreaterThanOrEqual(0.8);
    expect(mid.wins).toBeGreaterThanOrEqual(0.82);
    expect(mid.wins).toBeLessThanOrEqual(0.98);
    expect(hard.wins).toBeGreaterThanOrEqual(0.55);
    expect(hard.wins).toBeLessThanOrEqual(0.85);
    // Dauer 30 bis 90 Sekunden (leicht darf etwas kürzer sein), schwer dauert länger.
    for (const r of [mid, hard]) expect(r.seconds).toBeGreaterThan(25);
    expect(hard.seconds).toBeGreaterThan(easy.seconds);
  }, 120000);

  it('schwacher Spieler: mittel 30 bis 60 % (mit Spielraum), schwer seltener', () => {
    const mid = play('weak', 0.5);
    const hard = play('weak', 0.9);
    expect(mid.wins).toBeGreaterThanOrEqual(0.25);
    expect(mid.wins).toBeLessThanOrEqual(0.65);
    expect(hard.wins).toBeLessThan(mid.wins + 0.05);
  }, 120000);

  it('ohne Eingabe entkommt man nie', () => {
    for (const d of [0.2, 0.5, 0.9]) expect(play('none', d).wins).toBe(0);
  }, 60000);
});
