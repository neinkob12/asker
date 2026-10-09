import { describe, expect, it } from 'vitest';
import { fillText } from '../../core';
import { fitArticles, warehouseSites } from '../goods';
import { GANGS } from './data';
import { MEMORY_TEXTS_FORMAL } from './memory';
import { formalVoice, GANG_VOICES, type GangTextKey, INCIDENT_TEXTS } from './texts';

/** Alle Platzhalter, die die Gang-Logik für Nachrichten mitgibt. */
const VARS = {
  boss: 'Boss',
  gang: 'Gang',
  veedel: 'Nippes',
  tribute: '500 €',
  amount: '100 g',
  price: '400 €',
  enemy: 'Rivalen',
  spot: 'Uni-Wiese',
  atSpot: 'auf der Uni-Wiese',
  AtSpot: 'Auf der Uni-Wiese',
  warehouse: 'Lager Ehrenfeld',
};

/** Ein Artikel oder „am“ fest vor dem Spot-Namen passt nicht zu jedem Spot („am Uni-Wiese“, J4): {atSpot} nehmen. */
const ARTICLE_BEFORE_SPOT =
  /\b(am|Am|an|An|der|Der|den|dem|deinem|deinen|dein|Dein|Ihr|Ihren|Ihrem|vom|im|Da)\s\{spot\}/;

/** Nennt die Variante den Spot (als Name oder als Wendung)? */
const mentions = (text: string, name: string) =>
  name === 'spot' ? /\{(spot|atSpot|AtSpot)\}/.test(text) : text.includes(`{${name}}`);

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
        for (const text of list) {
          expect(fillText(text, VARS), `${id}:${key}`).not.toMatch(/\{\w*\}/);
          expect(text, `${id}:${key}`).not.toMatch(ARTICLE_BEFORE_SPOT);
        }
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
    crew: 'Leute der Hafenkolonne',
    name: 'Kalle',
    extra: '30 €',
    spot: 'Landungsbrücken',
    atSpot: 'an den Landungsbrücken',
    AtSpot: 'An den Landungsbrücken',
  };
  /** Platzhalter, die in jeder Variante eines Anlasses vorkommen müssen. */
  const needs: Record<keyof typeof INCIDENT_TEXTS, string[]> = {
    burglaryGang: ['warehouse', 'goods', 'crew'],
    burglaryJunkies: ['warehouse', 'goods'],
    burglaryInsider: ['warehouse', 'goods', 'name'],
    burglaryFoiled: ['warehouse'],
    poach: ['crew', 'extra'],
    intimidationReport: ['spot', 'crew'],
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
        for (const name of needs[key]) expect(mentions(text, name), `${key}: {${name}} in ${text}`).toBe(true);
        expect(fillText(text, vars), key).not.toMatch(/\{\w*\}/);
        expect(text, key).not.toMatch(ARTICLE_BEFORE_SPOT);
      }
    }
  });
});

describe('Sie oder du (Auftrag 43, K3)', () => {
  it('Gangs, die siezen, erinnern sich auch per Sie; die anderen per du', () => {
    expect(formalVoice('west')).toBe(true);
    expect(formalVoice('sued')).toBe(true);
    expect(formalVoice('nord')).toBe(false);
    for (const list of Object.values(MEMORY_TEXTS_FORMAL)) {
      for (const line of list) expect(line).not.toMatch(/\b(du|dir|dich|dein|deine|deinen|deinem|deiner)\b/);
    }
  });
});

describe('Artikel vor Lagernamen (Auftrag 43, L3)', () => {
  it('keine Vorlage sagt „dein Garage“, „im Halle“ oder „der Lager“', () => {
    const wrong =
      /\b(dein|deinen|deinem|im|vom|zum|beim|am|den|Ihr|Ihren|Ihres)\s(Garage|Halle|Werkstatt|Remise)\b|\b(der|den)\s(Lager|Bootshaus)\b/i;
    const all = [
      ...Object.values(GANG_VOICES).flatMap((voice) => Object.values(voice).flat()),
      ...Object.values(INCIDENT_TEXTS).flat(),
    ].filter((t) => t.includes('{warehouse}'));
    expect(all.length).toBeGreaterThan(50);
    for (const site of warehouseSites()) {
      for (const template of all) {
        const text = fillText(fitArticles(template, 'warehouse', site.name), { ...VARS, warehouse: site.name });
        expect(text, template).not.toMatch(wrong);
      }
    }
  });
});
