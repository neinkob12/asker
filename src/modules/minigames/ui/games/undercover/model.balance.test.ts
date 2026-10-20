// Zivi oder Kunde (Auftrag 49, Teil E): Schwierigkeit als Simulation. Ein Mensch braucht Zeit zum Hinsehen (jedes neue
// Merkmal erst nach `notice` Sekunden bemerkt, was im Satz steckt, erst wenn er nach `read` Sekunden gelesen ist) und
// macht unter Zeitdruck Fehler (je weniger Luft bis zum Ablaufen der Karte, desto öfter daneben). Geschafft ist eine Schicht ab Score 0,5 (winAt der Art).
// BALANCE_REPORT=1 npx vitest run src/modules/minigames/ui/games/undercover/model.balance.test.ts druckt die Tabelle.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../../core';
import {
  cardElapsed,
  createShift,
  type Decision,
  decide,
  initShift,
  inputFrom,
  shiftOutcome,
  shiftScore,
  step,
  visibleTells,
} from './model';
import { isSuspicious, tellDef } from './tells';

const input = inputFrom({
  customers: 8,
  zivis: 2,
  goods: [
    { productId: 'weed', name: 'Gras', unit: 'g' },
    { productId: 'edibles', name: 'Edibles', unit: 'Stück' },
  ],
});

interface Player {
  /** So lange, bis ein neues Merkmal bemerkt ist (Sekunden), und bis der Satz gelesen ist (Merkmale im Gesagten). */
  notice: number;
  read: number;
  /** Grundfehler und Fehler bei voller Hast (Anteil der Entscheidungen, die kippen). */
  slip: number;
  rush: number;
  /** Entscheidet spätestens nach diesem Anteil der Kartenzeit, auch wenn noch etwas kommt (ungeduldig). */
  patience: number;
}

const PLAYERS: Record<'good' | 'weak', Player> = {
  good: { notice: 0.5, read: 1.1, slip: 0.02, rush: 0.25, patience: 1 },
  weak: { notice: 0.9, read: 1.7, slip: 0.1, rush: 0.4, patience: 0.5 },
};

const DT = 0.05;

/** Eine Schicht mit einem Spieler (oder ohne Eingabe). Gibt Score, Dauer und ob geschafft. */
function playShift(seed: number, difficulty: number, player: Player | null) {
  const shift = createShift(seed, difficulty, input);
  const state = initShift(shift);
  const rng = createRng(seed * 7919 + Math.round(difficulty * 100));
  const noticed = new Map<string, number>();
  let time = 0;
  while (!state.done && time < 600) {
    step(shift, state, DT);
    time += DT;
    if (!player || state.done || state.gapLeft > 0) continue;
    const person = shift.people[state.index];
    const elapsed = cardElapsed(shift, state);
    const seen = visibleTells(person, elapsed);
    for (const id of seen) {
      const key = `${person.index}:${id}`;
      const said = tellDef(id)?.show === 'speech';
      if (!noticed.has(key)) noticed.set(key, said ? Math.max(elapsed, player.read) : elapsed + player.notice);
    }
    const known = seen.filter((id) => (noticed.get(`${person.index}:${id}`) ?? 99) <= elapsed);
    const suspicious = known.filter(isSuspicious).length;
    const complete = known.length === person.tells.length;
    if (suspicious < 2 && !complete && elapsed < player.patience * person.seconds) continue;
    let decision: Decision = suspicious >= 2 ? 'refuse' : 'sell';
    const slack = Math.max(0, state.cardLeft);
    const p = player.slip + player.rush * Math.max(0, 1 - slack / 1.5);
    if (rng() < p) decision = decision === 'sell' ? 'refuse' : 'sell';
    decide(shift, state, decision);
  }
  const out = shiftOutcome(shift, state);
  const score = shiftScore(shift, out);
  return { score, won: score >= 0.5, time };
}

function winRate(difficulty: number, player: Player | null, seeds = 120) {
  let won = 0;
  let time = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = playShift(seed, difficulty, player);
    if (r.won) won += 1;
    time += r.time;
  }
  return { rate: won / seeds, time: time / seeds };
}

describe('Zivi oder Kunde: Schwierigkeit (Simulation)', () => {
  it('Tabelle', () => {
    const rows = [0.2, 0.5, 0.9].map((d) => {
      const good = winRate(d, PLAYERS.good);
      const weak = winRate(d, PLAYERS.weak);
      const none = winRate(d, null);
      return { d, good: good.rate, weak: weak.rate, none: none.rate, seconds: Math.round(good.time) };
    });
    if (process.env.BALANCE_REPORT) console.table(rows);
    // Gemessen (Auftrag 49, Teil E; vorher gut 94 / 98 / 95 %, schwach 28 / 34 / 39 %):
    // gut 94 / 98 / 86 %, schwach 63 / 33 / 7 %, ohne Eingabe nie, 20 bis 22 s (6 bis 10 Leute, police).
    const [easy, mid, hard] = rows;
    expect(rows.every((r) => r.none === 0)).toBe(true);
    expect(mid.good).toBeGreaterThanOrEqual(0.85);
    expect(hard.good).toBeGreaterThanOrEqual(0.6);
    expect(hard.good).toBeLessThan(mid.good);
    expect(mid.weak).toBeGreaterThanOrEqual(0.25);
    expect(mid.weak).toBeLessThanOrEqual(0.6);
    expect(easy.weak).toBeGreaterThan(mid.weak);
    expect(hard.weak).toBeLessThan(mid.weak);
  });
});
