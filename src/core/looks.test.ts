import { describe, expect, it } from 'vitest';
import { describeLook, feminineName, type Look, lookFor, lookTraits, personLook, voiceFor } from './looks';
import { contactLook, contactVoice } from './messages';

/** Fiete, vollständig angegeben (so sieht er im Test immer gleich aus, egal wie die Gewichte sich ändern). */
const FIETE: Look = {
  feminine: false,
  age: 58,
  skin: 1,
  face: 'square',
  hair: 'short',
  hairColor: 5,
  beard: 'full',
  brows: 'heavy',
  eyes: 'heavy',
  mouth: 'hard',
  glasses: 'none',
  hat: 'skipper',
  top: 'raincoat',
  topColor: 0,
  scar: 'none',
  bruise: false,
  tattoo: 'none',
  teeth: 'none',
  mouthItem: 'none',
  earring: 'none',
  chain: 'none',
  mask: 'none',
};

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

  it('lässt eine Vorgabe den Rest des Gesichts nicht verändern', () => {
    const plain = lookFor('z', 'Murat B.');
    const sun = lookFor('z', 'Murat B.', { glasses: 'sun' });
    expect(sun.glasses).toBe('sun');
    expect({ ...sun, glasses: plain.glasses }).toEqual(plain);
  });

  it('übersetzt das alte Extra in die neuen Merkmale', () => {
    // 'none' heißt: keine der vier Verzierungen, egal was der Hash sagt.
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const none = lookFor(seed, '', { extra: 'none' });
      expect([none.scar, none.earring, none.chain, none.tattoo]).toEqual(['none', 'none', 'none', 'none']);
      expect(none.extra).toBeUndefined();
    }
    expect(lookFor('a', '', { extra: 'chain' }).chain).toBe('thin');
    expect(lookFor('a', '', { extra: 'scar' }).scar).toBe('cheek');
    expect(lookFor('a', '', { extra: 'earring' }).earring).toBe('hoop');
    expect(lookFor('a', '', { extra: 'tattoo' }).tattoo).toBe('neck');
    // Ein neues Feld daneben hat Vorrang vor dem alten Extra.
    expect(lookFor('a', '', { extra: 'chain', chain: 'pendant' }).chain).toBe('pendant');
  });

  it('verteilt die Straße nach Alter und Geschlecht, aber deterministisch', () => {
    const seeds = Array.from({ length: 600 }, (_, i) => `p:${i}`);
    const young = seeds.map((s) => lookFor(s, '', { feminine: false, age: 22 }));
    const old = seeds.map((s) => lookFor(s, '', { feminine: false, age: 62 }));
    const women = seeds.map((s) => lookFor(s, '', { feminine: true, age: 24 }));
    const share = (list: Look[], test: (l: Look) => boolean) => list.filter(test).length / list.length;
    // Junge: Fade, Cap nach hinten, Daunenjacke, Tattoos. Alte: Glatze, Anzug, Lederjacke, kaum Tattoos.
    expect(share(young, (l) => l.hair === 'fade')).toBeGreaterThan(share(old, (l) => l.hair === 'fade'));
    expect(share(young, (l) => l.hat === 'backcap')).toBeGreaterThan(share(old, (l) => l.hat === 'backcap'));
    expect(share(young, (l) => l.tattoo !== 'none')).toBeGreaterThan(share(old, (l) => l.tattoo !== 'none'));
    expect(share(old, (l) => l.top === 'suit' || l.top === 'leather')).toBeGreaterThan(
      share(young, (l) => l.top === 'suit' || l.top === 'leather'),
    );
    expect(share(old, (l) => l.hair === 'bald')).toBeGreaterThan(share(young, (l) => l.hair === 'bald'));
    // Frauen sind genauso Straße: Creolen, Puffer, Ketten, Cap nach hinten kommen vor; Bart nie.
    expect(share(women, (l) => l.earring === 'hoops')).toBeGreaterThan(0.2);
    expect(share(women, (l) => l.top === 'puffer' || l.top === 'hoodie' || l.top === 'tracksuit')).toBeGreaterThan(0.3);
    expect(share(women, (l) => l.chain !== 'none')).toBeGreaterThan(0.2);
    expect(share(women, (l) => l.hat === 'backcap' || l.hat === 'bandana')).toBeGreaterThan(0.1);
    expect(women.every((l) => l.beard === 'none')).toBe(true);
    // Mehrere Extras pro Figur kommen vor, aber nicht alle auf einmal.
    const extras = (l: Look) =>
      [
        l.scar !== 'none',
        l.tattoo !== 'none',
        l.teeth !== 'none',
        l.mouthItem !== 'none',
        l.chain !== 'none',
        l.bruise,
      ].filter(Boolean).length;
    expect(share(young, (l) => extras(l) >= 2)).toBeGreaterThan(0.2);
    expect(young.every((l) => extras(l) <= 5)).toBe(true);
  });

  it('gibt die Sturmhaube nur Unbekannten aus dem Gangs-Umfeld', () => {
    const seeds = Array.from({ length: 400 }, (_, i) => `${i}`);
    expect(seeds.some((s) => lookFor(`gang:${s}`, '').hat === 'balaclava')).toBe(true);
    expect(seeds.every((s) => personLook(`Kevin ${s}`).hat !== 'balaclava')).toBe(true);
    expect(seeds.every((s) => lookFor(`staff:${s}`, 'Murat').hat !== 'balaclava')).toBe(true);
    // Unter der Sturmhaube keine Maske, ausdrücklich gesetzt geht sie überall.
    expect(seeds.every((s) => lookFor(`gang:${s}`, '', { hat: 'balaclava' }).mask === 'none')).toBe(true);
    expect(lookFor('staff:1', 'Murat', { hat: 'balaclava' }).hat).toBe('balaclava');
  });

  it('setzt Zigarette und Zähne unter der Maske aus und die Kapuze nur auf etwas mit Kapuze', () => {
    const seeds = Array.from({ length: 400 }, (_, i) => `m:${i}`);
    for (const s of seeds) {
      const look = lookFor(s, '', { mask: 'tube' });
      expect(look.mouthItem).toBe('none');
      expect(look.teeth).toBe('none');
      const hooded = lookFor(s, '', { hat: 'hood' });
      expect(['tee', 'tank', 'suit', 'openshirt']).not.toContain(hooded.top);
    }
    // Goldzahn nur bei offenem Mund.
    for (const s of seeds) {
      const look = lookFor(s);
      if (look.teeth !== 'none') expect(['grin', 'smirk']).toContain(look.mouth);
    }
  });

  it('beschreibt das Aussehen auf Deutsch', () => {
    expect(lookTraits(FIETE)).toEqual([
      'Ende fünfzig',
      'kantiges Gesicht',
      'grauer Vollbart',
      'buschige Brauen',
      'schwere Lider',
      'harter Zug um den Mund',
      'Elbsegler-Mütze',
      'Öljacke in Dunkelblau',
    ]);
    expect(describeLook({ ...FIETE, face: 'oval', brows: 'soft', eyes: 'open', mouth: 'neutral' })).toBe(
      'Ende fünfzig, grauer Vollbart, Elbsegler-Mütze, Öljacke in Dunkelblau.',
    );
    const street: Look = {
      ...FIETE,
      age: 24,
      face: 'oval',
      hair: 'fade',
      hairColor: 0,
      beard: 'chinstrap',
      brows: 'hard',
      eyes: 'rings',
      mouth: 'smirk',
      hat: 'backcap',
      top: 'puffer',
      topColor: 1,
      scar: 'brow',
      tattoo: 'tear',
      teeth: 'gold',
      mouthItem: 'cigarette',
      earring: 'hoop',
      chain: 'pendant',
    };
    expect(lookTraits(street)).toEqual([
      'Mitte zwanzig',
      'Kinnrandbart',
      'harte Brauen',
      'Augenringe',
      'schiefes Grinsen',
      'Cap nach hinten',
      'Daunenjacke in Schwarz',
      'Narbe durch die Braue',
      'Tränen-Tattoo',
      'Goldzahn',
      'Zigarette im Mundwinkel',
      'Ohrring',
      'Goldkette mit Anhänger',
    ]);
    // Ohne Mütze sieht man die Haare, Grammatik passt zur Farbe.
    expect(lookTraits({ ...street, hat: 'none' })[1]).toBe('Fade-Cut mit schwarzen Haaren');
    expect(lookTraits({ ...street, hat: 'none', hair: 'undercut', hairColor: 3 })[1]).toBe(
      'Undercut mit blonder Strähne',
    );
    expect(lookTraits({ ...street, hat: 'none', hair: 'cornrows' })[1]).toBe('schwarze Cornrows');
    // Unter der Sturmhaube bleibt nur, was man sieht; die Maske verdeckt Mund und Zigarette.
    expect(lookTraits({ ...street, hat: 'balaclava' })).toEqual([
      'Mitte zwanzig',
      'harte Brauen',
      'Augenringe',
      'Sturmhaube',
      'Daunenjacke in Schwarz',
      'Goldkette mit Anhänger',
    ]);
    expect(lookTraits({ ...street, mask: 'tube', mouthItem: 'none', teeth: 'none' })).toContain(
      'Schlauchschal halb hoch',
    );
    expect(lookTraits({ ...street, mask: 'tube', mouthItem: 'none', teeth: 'none' })).not.toContain('schiefes Grinsen');
    // Jedes Merkmal hat einen Text: Nichts fällt stumm aus der Beschreibung.
    const everything: Look = {
      ...street,
      hat: 'none',
      bruise: true,
      mask: 'none',
    };
    expect(lookTraits(everything)).toContain('Veilchen');
    for (const hat of ['cap', 'beanie', 'hood', 'bucket', 'durag', 'bandana'] as const) {
      expect(
        lookTraits({ ...street, hat }).some((t) => t.length > 0 && /cap|Mütze|Kapuze|Bucket|Durag|Bandana/i.test(t)),
      ).toBe(true);
    }
    for (const top of [
      'tee',
      'tank',
      'hoodie',
      'jacket',
      'leather',
      'bomber',
      'suit',
      'tracksuit',
      'openshirt',
    ] as const) {
      expect(lookTraits({ ...street, top }).some((t) => t.endsWith(' in Schwarz'))).toBe(true);
    }
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
    // Alte Kontakte mit `extra` bleiben gültig.
    expect(contactLook({ id: 'x', name: 'Toni', kind: 'supplier', look: { extra: 'chain', hat: 'cap' } })?.chain).toBe(
      'thin',
    );
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
