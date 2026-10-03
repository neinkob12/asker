import { describe, expect, it } from 'vitest';
import { describeLook, feminineName, lookFor, lookTraits, personLook, voiceFor } from './looks';
import { contactLook, contactVoice } from './messages';

describe('Aussehen von Figuren', () => {
  it('ist fest pro Figur und hängt nicht vom Spiel-Zufall ab', () => {
    expect(personLook('Kevin K.', 24)).toEqual(personLook('Kevin K.', 24));
    expect(lookFor('a')).toEqual(lookFor('a'));
    // Verschiedene Leute sehen verschieden aus (nicht alle gleich).
    const looks = ['Kevin K.', 'Murat B.', 'Dennis S.', 'Sascha M.', 'Dragan W.', 'Nico R.'].map((n) => personLook(n));
    expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(looks.length);
  });

  it('nimmt eigene Angaben vor dem Abgeleiteten und kennt weibliche Vornamen', () => {
    const look = lookFor('x', 'Fiete', { hat: 'skipper', beard: 'full', age: 58 });
    expect(look.hat).toBe('skipper');
    expect(look.beard).toBe('full');
    expect(look.age).toBe(58);
    expect(feminineName('Jana K.')).toBe(true);
    expect(feminineName('Lea vom Campus')).toBe(true);
    expect(feminineName('Kevin „Hase“ K.')).toBe(false);
    const jana = personLook('Jana K.');
    expect(jana.feminine).toBe(true);
    expect(jana.beard).toBe('none');
  });

  it('beschreibt das Aussehen auf Deutsch', () => {
    const fiete = lookFor('f', 'Fiete', {
      feminine: false,
      age: 58,
      hair: 'short',
      hairColor: 5,
      beard: 'full',
      glasses: 'none',
      hat: 'skipper',
      top: 'raincoat',
      topColor: 0,
      extra: 'none',
    });
    expect(lookTraits(fiete)).toEqual(['Ende fünfzig', 'grauer Vollbart', 'Elbsegler-Mütze', 'Öljacke in Dunkelblau']);
    expect(describeLook(fiete)).toBe('Ende fünfzig, grauer Vollbart, Elbsegler-Mütze, Öljacke in Dunkelblau.');
  });

  it('gibt Personen ein Gesicht, Gangs und Tickern nicht', () => {
    expect(contactLook({ id: 'staff:s1', name: 'Kevin K.', kind: 'staff' })).not.toBeNull();
    expect(contactLook({ id: 'customer:1', name: 'Lea vom Campus', kind: 'customer' })?.feminine).toBe(true);
    expect(contactLook({ id: 'gang:nord', name: 'Nordstadt', kind: 'gang', avatar: '🐺' })).toBeNull();
    expect(contactLook({ id: 'other:koeln-ticker', name: 'Köln-Ticker', kind: 'other' })).toBeNull();
    // Ein leeres Aussehen macht auch 'other' zur Person.
    expect(contactLook({ id: 'laundering:kiosk', name: 'Kumpel mit Kiosk', kind: 'other', look: {} })).not.toBeNull();
    // Personal ohne eigenes Aussehen (alte Spielstände) sieht aus wie im Personal ohne Alter.
    expect(contactLook({ id: 'staff:s1', name: 'Kevin K.', kind: 'staff' })).toEqual(personLook('Kevin K.'));
  });
});

describe('Stimmen', () => {
  it('Frauen höher, Männer tiefer, Alte langsamer; eigene Werte gehen vor', () => {
    const woman = voiceFor('a', lookFor('a', '', { feminine: true, age: 30 }));
    const man = voiceFor('b', lookFor('b', '', { feminine: false, age: 30 }));
    const old = voiceFor('c', lookFor('c', '', { feminine: false, age: 70 }));
    expect(woman.pitch).toBeGreaterThan(man.pitch);
    expect(woman.feminine).toBe(true);
    expect(old.rate).toBeLessThan(1);
    const fiete = contactVoice({ id: 'x', name: 'Fiete', kind: 'other', look: { age: 58 }, voice: { pitch: 0.7 } });
    expect(fiete.pitch).toBe(0.7);
    expect(fiete.feminine).toBe(false);
  });
});
