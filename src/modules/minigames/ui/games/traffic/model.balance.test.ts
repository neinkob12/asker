// Schwierigkeit der Verkehrskontrolle (Auftrag 48, Prüfliste „fühlt sich gut an“): Test-Spieler bei 0,2, 0,5 und 0,9
// über viele Seeds. Ein Spieler liest Frage und Antworten (Lesetempo in Zeichen pro Sekunde), überlegt und tippt;
// manchmal greift er daneben (Fehlerquote), unter Zeitdruck öfter. Gemessen werden Gewinnquote und Dauer.
// BALANCE_LOG=1 npx vitest run traffic/model.balance druckt die Tabelle.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../../core';
import { advance, answer, createTraffic, initTraffic, isDone, patience, trafficScore } from './model';

interface TrafficPlayer {
  /** Lesetempo (Zeichen pro Sekunde) und feste Überlegzeit (s) je Frage, dazu Streuung bis jitter Sekunden. */
  cps: number;
  think: number;
  jitter: number;
  /** Chance, die falsche Antwort zu nehmen; unter Druck (Geduld unter der Hälfte) mal pressure. */
  error: number;
  pressure: number;
}

const PLAYERS: Record<'good' | 'weak', TrafficPlayer> = {
  good: { cps: 24, think: 1.2, jitter: 1.6, error: 0.045, pressure: 4 },
  weak: { cps: 14, think: 2.2, jitter: 3, error: 0.14, pressure: 2 },
};

const CITIES = ['Köln', 'Hamburg', 'Berlin'];

/** Spielt eine Kontrolle mit einem Test-Spieler (null = keine Eingabe). */
function playTraffic(seed: number, difficulty: number, player: TrafficPlayer | null) {
  const setup = createTraffic(seed, difficulty, { hour: (seed * 5) % 24, homeCity: CITIES[seed % CITIES.length] });
  const state = initTraffic(setup);
  const rng = createRng(seed * 977 + Math.round(difficulty * 100));
  let wait = -1;
  let asked = -1;
  let t = 0;
  while (!isDone(state) && t < 400) {
    advance(setup, state, 1 / 20);
    t += 1 / 20;
    const q = state.question;
    if (!player || state.phase !== 'ask' || !q) continue;
    if (asked !== state.index) {
      asked = state.index;
      const chars = q.text.length + q.answers.reduce((n, a) => n + a.text.length, 0);
      wait = player.think + chars / player.cps + rng() * player.jitter;
    }
    if (state.thinking < wait) continue;
    const rushed = patience(setup, state) < 0.5;
    const wrong = rng() < player.error * (rushed ? player.pressure : 1);
    const others = [0, 1, 2].filter((i) => i !== q.good && i < q.answers.length);
    answer(setup, state, wrong && others.length ? others[Math.floor(rng() * others.length)] : q.good);
  }
  return { won: trafficScore(state) >= 0.5, t: state.t, hits: state.hits };
}

function rate(difficulty: number, player: TrafficPlayer | null, seeds = 120) {
  let won = 0;
  let time = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = playTraffic(seed, difficulty, player);
    if (r.won) won += 1;
    time += r.t;
  }
  return { win: won / seeds, time: time / seeds };
}

describe('Verkehrskontrolle: Schwierigkeit mit Test-Spielern', () => {
  const table = [0.2, 0.5, 0.9].map((d) => ({
    d,
    good: rate(d, PLAYERS.good),
    weak: rate(d, PLAYERS.weak),
    none: rate(d, null, 30),
  }));
  if (process.env.BALANCE_LOG) {
    for (const row of table)
      console.log(
        `${row.d}: gut ${(row.good.win * 100).toFixed(0)} % (${row.good.time.toFixed(0)} s), schwach ${(row.weak.win * 100).toFixed(0)} % (${row.weak.time.toFixed(0)} s), nichts ${(row.none.win * 100).toFixed(0)} %`,
      );
  }
  const at = (d: number) => table.find((r) => r.d === d) ?? table[0];

  it('guter Spieler: 0,5 in 85 bis 95 %, 0,9 in 60 bis 80 %', () => {
    expect(at(0.5).good.win).toBeGreaterThanOrEqual(0.85);
    expect(at(0.5).good.win).toBeLessThanOrEqual(0.95);
    expect(at(0.9).good.win).toBeGreaterThanOrEqual(0.6);
    expect(at(0.9).good.win).toBeLessThanOrEqual(0.8);
    expect(at(0.2).good.win).toBeGreaterThanOrEqual(at(0.5).good.win);
  });

  it('schwacher Spieler: 0,5 in 30 bis 60 %', () => {
    expect(at(0.5).weak.win).toBeGreaterThanOrEqual(0.3);
    expect(at(0.5).weak.win).toBeLessThanOrEqual(0.6);
  });

  it('ohne Eingabe nie', () => {
    for (const row of table) expect(row.none.win).toBe(0);
  });

  it('Dauer 30 bis 90 Sekunden', () => {
    for (const row of table) {
      expect(row.good.time).toBeGreaterThanOrEqual(30);
      expect(row.weak.time).toBeLessThanOrEqual(90);
    }
  });
});
