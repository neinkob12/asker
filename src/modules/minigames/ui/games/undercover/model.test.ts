// Zivi oder Kunde (Auftrag 44, Teil 5): Modell der Schicht. Fest aus dem Seed, faire Merkmale, Zeit pro Karte,
// Entscheidungen, Ergebnis und picks wie police sie liest.

import { describe, expect, it } from 'vitest';
import { undercoverOutcome } from '../../../../police';
import {
  cardSeconds,
  createShift,
  decide,
  initShift,
  inputFrom,
  shiftOutcome,
  shiftPicks,
  shiftScore,
  step,
  verdictOf,
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

/** Alle richtig entscheiden. */
function playPerfect(seed: number, difficulty: number) {
  const shift = createShift(seed, difficulty, input);
  const state = initShift(shift);
  while (!state.done) {
    step(shift, state, 1);
    if (state.gapLeft <= 0 && !state.done) decide(shift, state, shift.people[state.index].zivi ? 'refuse' : 'sell');
  }
  return { shift, state };
}

describe('Zivi oder Kunde: Modell', () => {
  it('ist fest aus dem Seed', () => {
    expect(createShift(7, 0.5, input)).toEqual(createShift(7, 0.5, input));
    expect(createShift(7, 0.5, input).people.map((p) => p.line)).not.toEqual(
      createShift(8, 0.5, input).people.map((p) => p.line),
    );
  });

  it('so viele Leute und Zivis wie bestellt, der erste ist nie ein Zivi', () => {
    for (let seed = 1; seed < 40; seed++) {
      const shift = createShift(seed, 0.6, input);
      expect(shift.people).toHaveLength(8);
      expect(shift.people.filter((p) => p.zivi)).toHaveLength(2);
      expect(shift.people[0].zivi).toBe(false);
    }
  });

  it('fair: Zivis haben mindestens zwei verdächtige Merkmale, echte Kunden höchstens eins', () => {
    for (const difficulty of [0.2, 0.5, 0.95]) {
      for (let seed = 1; seed < 80; seed++) {
        for (const p of createShift(seed, difficulty, input).people) {
          const suspicious = p.tells.filter(isSuspicious).length;
          if (p.zivi) expect(suspicious).toBeGreaterThanOrEqual(2);
          else expect(suspicious).toBeLessThanOrEqual(1);
          expect(p.tells.length).toBeLessThanOrEqual(4);
          for (const id of p.tells) expect(tellDef(id)).toBeDefined();
        }
      }
    }
  });

  it('Merkmale stecken im Bild und im Satz', () => {
    const people = Array.from({ length: 60 }, (_, s) => createShift(s + 1, 0.3, input).people).flat();
    const ear = people.find((p) => p.tells.includes('earpiece'));
    expect(ear?.shows.ear).toBe(true);
    expect(['long', 'afro', 'dreads', 'braids', 'curly', 'mullet']).not.toContain(ear?.look.hair);
    expect(people.find((p) => p.tells.includes('newShoes'))?.shoes).toBe('new');
    expect(people.find((p) => p.tells.includes('tooPolite'))?.line).toMatch(/Entschuldigung|Verzeihung|Guten|störe/);
    const formal = people.find((p) => p.tells.includes('noSlang') && p.productId === 'weed');
    expect(formal?.line).toContain('Marihuana');
    expect(people.find((p) => p.tells.includes('bigOrder'))?.amount).toBeGreaterThanOrEqual(20);
  });

  it('6 Sekunden pro Karte, schwer 4', () => {
    expect(cardSeconds(0.2)).toBe(6);
    expect(cardSeconds(0.9)).toBe(4);
    expect(cardSeconds(0.55)).toBeGreaterThan(4);
  });

  it('alles richtig: Score 1, alle Zivis erkannt', () => {
    const { shift, state } = playPerfect(3, 0.5);
    const out = shiftOutcome(shift, state);
    expect(out).toEqual({ soldZivi: 0, spotted: 2, turnedAway: 0, sold: 6, missed: 0 });
    expect(shiftScore(shift, out)).toBe(1);
    expect(shiftPicks(out)).toEqual(['spotted:2', 'sold:6']);
  });

  it('zu lange gezögert: der Kunde geht, ein Zivi gilt nicht als erkannt', () => {
    const shift = createShift(5, 0.5, input);
    const state = initShift(shift);
    const events = step(shift, state, shift.perCard + 0.01);
    expect(events[0]).toMatchObject({ type: 'decided', decision: 'timeout', verdict: 'turnedAway' });
    expect(verdictOf({ zivi: true }, 'timeout')).toBe('missed');
    // In der Pause nimmt die nächste Karte noch nichts an.
    expect(decide(shift, state, 'sell')).toBeNull();
    step(shift, state, shift.gap);
    expect(decide(shift, state, 'sell')).not.toBeNull();
  });

  it('Verkauf an einen Zivi: nicht geschafft, police liest die picks genauso', () => {
    const shift = createShift(9, 0.5, input);
    const state = initShift(shift);
    while (!state.done) {
      step(shift, state, 1);
      if (state.gapLeft <= 0 && !state.done) decide(shift, state, 'sell');
    }
    const out = shiftOutcome(shift, state);
    expect(out.soldZivi).toBe(2);
    expect(shiftScore(shift, out)).toBeLessThan(0.5);
    const picks = shiftPicks(out);
    expect(undercoverOutcome({ customers: 8, zivis: 2 }, 0, picks, 'player')).toMatchObject({
      soldZivi: 2,
      sold: 6,
    });
  });

  it('liest fremde params robust', () => {
    expect(inputFrom({})).toMatchObject({ customers: 8, zivis: 1 });
    expect(inputFrom({ customers: 99, zivis: 9 })).toMatchObject({ customers: 12, zivis: 3 });
  });
});
