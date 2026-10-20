// Bewerbungsgespräch (Auftrag 48, Teil E): Schwierigkeit als Simulation. Ein Mensch schaut nur ab und zu auf den Ring
// (`glance`) und hält den Druck grob in der Zone, braucht etwa `reaction` Sekunden (mal 0,75 bis 1,35), bis er ein
// Zeichen antippt, und hält manche Geste für ein Zeichen (`confuse`). Geschafft ab Score 0,5 (zwei von drei Runden richtig).
// BALANCE_REPORT=1 npx vitest run src/modules/minigames/ui/games/interview/model.balance.test.ts druckt die Tabelle.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../../core';
import {
  activeCue,
  advance,
  bandAt,
  choose,
  createInterview,
  type InterviewPerson,
  initInterview,
  interviewScore,
  isDone,
  mark,
  press,
} from './model';

interface Player {
  reaction: number;
  /** Wie oft er auf den Ring schaut (Sekunden) und wie weit er beim Zielen daneben liegt (Anteil der Zone). */
  glance: number;
  aim: number;
  /** Anteil der Gesten, die er für ein Zeichen hält. */
  confuse: number;
}

const PLAYERS: Record<'good' | 'weak', Player> = {
  good: { reaction: 0.5, glance: 0.3, aim: 0.25, confuse: 0.1 },
  weak: { reaction: 0.7, glance: 0.6, aim: 0.6, confuse: 0.25 },
};

const PEOPLE: InterviewPerson[] = [
  { traits: ['drinker', 'charmer'] },
  { traits: ['hothead', 'loyal', 'drinker'], known: ['loyal'] },
  { traits: ['coward', 'gambler'] },
  { traits: ['braggart', 'family', 'nimble'] },
  { traits: ['ambitious'] },
];

const DT = 1 / 30;

function playInterview(seed: number, d: number, player: Player | null) {
  const setup = createInterview(seed, d, PEOPLE[seed % PEOPLE.length]);
  const s = initInterview(setup);
  const rng = createRng(seed * 131 + Math.round(d * 100));
  const seen = new Map<string, { at: number; tap: boolean }>();
  let total = 0;
  let glance = 0;
  let target = 0.5;
  while (!isDone(s) && total < 400) {
    if (player && s.phase === 'choose' && s.t >= 2.5) choose(setup, s, Math.floor(rng() * 3));
    if (player) {
      glance -= DT;
      if (glance <= 0) {
        const { lo, hi } = bandAt(setup, s);
        target = (lo + hi) / 2 + (rng() * 2 - 1) * player.aim * ((hi - lo) / 2);
        glance = player.glance;
      }
      press(s, s.pressure < target);
    }
    advance(setup, s, DT);
    total += DT;
    if (!player) continue;
    const active = activeCue(setup, s);
    if (!active) continue;
    const key = `${s.round}:${active.index}`;
    let note = seen.get(key);
    if (!note) {
      note = {
        at: total + player.reaction * (0.75 + 0.6 * rng()),
        tap: active.cue.tell ? true : rng() < player.confuse,
      };
      seen.set(key, note);
    }
    if (note.tap && total >= note.at) {
      mark(setup, s);
      note.tap = false;
    }
  }
  const score = interviewScore(setup, s);
  return { score, won: score >= 0.5, time: total };
}

function winRate(d: number, player: Player | null, seeds = 60) {
  let won = 0;
  let time = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = playInterview(seed, d, player);
    if (r.won) won += 1;
    time += r.time;
  }
  return { rate: won / seeds, time: time / seeds };
}

describe('Bewerbungsgespräch: Schwierigkeit (Simulation)', () => {
  it('Tabelle', () => {
    const rows = [0.2, 0.5, 0.9].map((d) => {
      const good = winRate(d, PLAYERS.good);
      const weak = winRate(d, PLAYERS.weak);
      const none = winRate(d, null);
      return { d, good: good.rate, weak: weak.rate, none: none.rate, seconds: Math.round(good.time) };
    });
    if (process.env.BALANCE_REPORT) console.table(rows);
    // Gemessen (Auftrag 48, Teil E): gut 100 / 98 / 68 %, schwach 95 / 58 / 30 %, ohne Eingabe nie, 38 bis 43 s.
    const [easy, mid, hard] = rows;
    expect(rows.every((r) => r.none === 0)).toBe(true);
    expect(easy.good).toBeGreaterThanOrEqual(0.95);
    expect(mid.good).toBeGreaterThanOrEqual(0.85);
    expect(hard.good).toBeGreaterThanOrEqual(0.55);
    expect(hard.good).toBeLessThanOrEqual(0.85);
    expect(mid.weak).toBeGreaterThanOrEqual(0.3);
    expect(mid.weak).toBeLessThanOrEqual(0.65);
    expect(hard.weak).toBeLessThan(mid.weak);
    for (const r of rows) expect(r.seconds).toBeGreaterThanOrEqual(30);
  }, 30000);
});
