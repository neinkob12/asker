import { describe, expect, it } from 'vitest';
import { fillText } from '../../core';
import { GANGS } from './data';
import { GANG_VOICES, type GangTextKey, INCIDENT_TEXTS } from './texts';

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

describe('Texte zu Vorfällen (Nachbarin, Abwerben, Einschüchtern)', () => {
  const vars = {
    warehouse: 'Lager Ehrenfeld',
    goods: '40 g Gras',
    gang: 'Hafenkolonne',
    name: 'Kalle',
    extra: '30 €',
    spot: 'Ebertplatz',
  };
  /** Platzhalter, die in jeder Variante eines Anlasses vorkommen müssen. */
  const needs: Record<keyof typeof INCIDENT_TEXTS, string[]> = {
    burglaryGang: ['warehouse', 'goods', 'gang'],
    burglaryJunkies: ['warehouse', 'goods'],
    burglaryInsider: ['warehouse', 'goods', 'name'],
    burglaryFoiled: ['warehouse'],
    poach: ['gang', 'extra'],
    intimidationReport: ['spot', 'gang'],
  };

  it('jeder Anlass hat mindestens vier verschiedene Varianten', () => {
    for (const [key, list] of Object.entries(INCIDENT_TEXTS)) {
      expect(list.length, key).toBeGreaterThanOrEqual(4);
      expect(new Set(list).size, `${key} doppelt`).toBe(list.length);
    }
  });

  it('jede Variante nennt, was sie braucht, und alle Platzhalter werden ersetzt', () => {
    for (const [key, list] of Object.entries(INCIDENT_TEXTS) as [keyof typeof INCIDENT_TEXTS, readonly string[]][]) {
      for (const text of list) {
        for (const name of needs[key]) expect(text, `${key}: {${name}}`).toContain(`{${name}}`);
        expect(fillText(text, vars), key).not.toMatch(/\{\w*\}/);
      }
    }
  });
});
