// Schwierigkeit von „Papiere fälschen“ (Auftrag 48, Prüfliste „fühlt sich gut an“): Test-Fälscher bei 0,2, 0,5 und
// 0,9 über viele Seeds, an der Autobahn und am Kai. Ein Fälscher prüft Feld für Feld vor dem Finger des Zöllners her
// (Prüfzeit je Feld mit Streuung), behebt, was nicht stimmt (der Wert steht erst nach der Zeit zum Umschreiben), und
// übersieht manchmal etwas. BALANCE_LOG=1 npx vitest run papers/model.balance --silent=false druckt die Tabelle.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../../core';
import { advance, choose, createPapers, type FieldSlot, initPapers, isDone, isEditable, papersScore } from './model';

interface Forger {
  /** Sekunden je Feld (fest plus Streuung bis jitter) und fürs Umschreiben. */
  check: number;
  jitter: number;
  fix: number;
  /** Chance, einen falschen Wert zu übersehen. */
  miss: number;
  /** Springt der Zöllner zu einer Stichprobe, schaut er nach so vielen Sekunden dorthin (null = merkt es nicht). */
  react: number | null;
}

const FORGERS: Record<'good' | 'weak', Forger> = {
  good: { check: 0.8, jitter: 0.9, fix: 1.1, miss: 0.04, react: 0.5 },
  weak: { check: 1.4, jitter: 1.4, fix: 1.8, miss: 0.15, react: null },
};

const DT = 1 / 20;

function playPapers(seed: number, difficulty: number, forger: Forger | null, setting: 'autobahn' | 'port') {
  const setup = createPapers(seed, difficulty, { setting, time: 60 * 24 * 11 });
  const s = initPapers(setup);
  const rng = createRng(seed * 131 + Math.round(difficulty * 100) + (setting === 'port' ? 7 : 0));
  let next = 0;
  let busy = 0;
  let fixing: FieldSlot | null = null;
  let t = 0;
  while (!isDone(s) && t < 300) {
    advance(setup, s, DT);
    t += DT;
    if (!forger || s.phase === 'end') continue;
    // Stichprobe: Wer es merkt, lässt alles liegen und schaut, was er gleich liest.
    const peeked = s.resume !== null && s.phase === 'turn' ? setup.slots[s.cursor] : undefined;
    if (peeked && forger.react !== null && fixing?.id !== peeked.id && s.values[peeked.id] !== peeked.truth) {
      if (fixing) next = Math.min(next, setup.slots.indexOf(fixing));
      fixing = peeked;
      busy = forger.react + rng() * forger.jitter + forger.fix;
    }
    busy -= DT;
    if (busy > 0) continue;
    if (fixing) {
      choose(setup, s, fixing.id, fixing.truth);
      fixing = null;
    }
    // Nächstes Feld, das er noch nicht gelesen hat, vor dem Finger her.
    next = Math.max(next, s.cursor + (s.phase === 'browse' ? 0 : 1));
    const slot = setup.slots[next];
    if (!slot) continue;
    next += 1;
    busy = forger.check + rng() * forger.jitter;
    if (!isEditable(s, slot.id) || s.values[slot.id] === slot.truth || rng() < forger.miss) continue;
    busy += forger.fix;
    fixing = slot;
  }
  return { won: papersScore(setup, s) >= 0.5, t: s.t };
}

function rate(difficulty: number, forger: Forger | null, seeds = 60) {
  let won = 0;
  let time = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    for (const setting of ['autobahn', 'port'] as const) {
      const r = playPapers(seed, difficulty, forger, setting);
      if (r.won) won += 1;
      time += r.t;
    }
  }
  return { win: won / (seeds * 2), time: time / (seeds * 2) };
}

describe('Papiere fälschen: Schwierigkeit mit Test-Fälschern', () => {
  const table = [0.2, 0.5, 0.9].map((d) => ({
    d,
    good: rate(d, FORGERS.good),
    weak: rate(d, FORGERS.weak),
    none: rate(d, null, 15),
  }));
  if (process.env.BALANCE_LOG) {
    for (const row of table)
      console.log(
        `${row.d}: gut ${(row.good.win * 100).toFixed(0)} % (${row.good.time.toFixed(0)} s), schwach ${(row.weak.win * 100).toFixed(0)} % (${row.weak.time.toFixed(0)} s), nichts ${(row.none.win * 100).toFixed(0)} %`,
      );
  }
  const at = (d: number) => table.find((r) => r.d === d) ?? table[0];

  it('guter Fälscher: 0,5 in 85 bis 95 %, 0,9 in 60 bis 80 %', () => {
    expect(at(0.5).good.win).toBeGreaterThanOrEqual(0.85);
    expect(at(0.5).good.win).toBeLessThanOrEqual(0.95);
    expect(at(0.9).good.win).toBeGreaterThanOrEqual(0.6);
    expect(at(0.9).good.win).toBeLessThanOrEqual(0.8);
    expect(at(0.2).good.win).toBeGreaterThanOrEqual(at(0.5).good.win);
  });

  it('schwacher Fälscher: 0,5 in 30 bis 60 %', () => {
    expect(at(0.5).weak.win).toBeGreaterThanOrEqual(0.3);
    expect(at(0.5).weak.win).toBeLessThanOrEqual(0.6);
  });

  it('ohne Eingabe nie', () => {
    for (const row of table) expect(row.none.win).toBe(0);
  });

  it('Dauer 20 bis 90 Sekunden', () => {
    for (const row of table) {
      expect(row.good.time).toBeGreaterThanOrEqual(20);
      expect(row.weak.time).toBeLessThanOrEqual(90);
    }
  });
});
