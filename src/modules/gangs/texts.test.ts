import { describe, expect, it } from 'vitest';
import { fillText } from '../../core';
import { GANGS } from './data';
import { GANG_VOICES, type GangTextKey } from './texts';

/** Alle Platzhalter, die die Gang-Logik für Nachrichten mitgibt. */
const VARS = {
  boss: 'Boss',
  gang: 'Gang',
  veedel: 'Nippes',
  tribute: '500 €',
  amount: '100 g',
  price: '400 €',
  enemy: 'Rivalen',
  spot: 'Ebertplatz',
  warehouse: 'Lager Ehrenfeld',
};

describe('Gang-Stimmen', () => {
  it('jede Gang hat für jeden Anlass mindestens fünf eigene Varianten', () => {
    const keys = Object.keys(GANG_VOICES.nord) as GangTextKey[];
    for (const gang of GANGS) {
      const voice = GANG_VOICES[gang.id];
      expect(voice, gang.id).toBeDefined();
      for (const key of keys) {
        expect(voice[key].length, `${gang.id}:${key}`).toBeGreaterThanOrEqual(5);
        expect(new Set(voice[key]).size, `${gang.id}:${key} doppelt`).toBe(voice[key].length);
      }
    }
  });

  it('alle Platzhalter werden ersetzt', () => {
    for (const [id, voice] of Object.entries(GANG_VOICES)) {
      for (const [key, list] of Object.entries(voice)) {
        for (const text of list) expect(fillText(text, VARS), `${id}:${key}`).not.toMatch(/\{\w*\}/);
      }
    }
  });

  it('die Gangs klingen verschieden (keine Variante teilen sich zwei Gangs)', () => {
    const seen = new Map<string, string>();
    for (const [id, voice] of Object.entries(GANG_VOICES)) {
      for (const list of Object.values(voice)) {
        for (const text of list) {
          expect(seen.get(text), text).toBeUndefined();
          seen.set(text, id);
        }
      }
    }
  });
});
