import { describe, expect, it } from 'vitest';
import { fillText } from '../../core';
import { PRESET_SPOTS } from './config';
import { atSpot, atSpotStart, spotVars } from './places';

describe('Wendung für Spots (J4)', () => {
  it('nimmt die Präposition nach dem Namen statt immer „am“', () => {
    const at = (name: string) => atSpot({ name });
    expect(at('Ebertplatz')).toBe('am Ebertplatz');
    expect(at('Uni-Wiese')).toBe('auf der Uni-Wiese');
    expect(at('Theresienwiese')).toBe('auf der Theresienwiese');
    expect(at('Neusser Straße')).toBe('an der Neusser Straße');
    expect(at('Warschauer Straße')).toBe('an der Warschauer Straße');
    expect(at('Landungsbrücken')).toBe('an den Landungsbrücken');
    expect(at('Domplatte')).toBe('auf der Domplatte');
    expect(at('Konstablerwache')).toBe('an der Konstablerwache');
    expect(at('Hauptbahnhof')).toBe('am Hauptbahnhof');
    expect(at('Kneipe Neusser Straße')).toBe('in der Kneipe Neusser Straße');
    expect(at('Club am Spreeufer')).toBe('im Club am Spreeufer');
    expect(at('Am Weiher')).toBe('am Weiher');
    // Eigene Spots heißen nach ihrer Art (kinds.ts) und dem Veedel.
    expect(at('Ecke Kalk')).toBe('an der Ecke Kalk');
    expect(at('Späti-Hinterzimmer Nippes 2')).toBe('im Späti-Hinterzimmer Nippes 2');
    expect(at('Park Deutz')).toBe('im Park Deutz');
    expect(at('Bahnhof/Haltestelle Kalk')).toBe('am Bahnhof/Haltestelle Kalk');
  });

  it('eigene Wendung als Daten geht vor, am Satzanfang groß', () => {
    expect(atSpot({ name: 'Tempelhofer Feld', at: 'auf dem Tempelhofer Feld' })).toBe('auf dem Tempelhofer Feld');
    expect(atSpotStart({ name: 'Uni-Wiese' })).toBe('Auf der Uni-Wiese');
    const vars = spotVars({ name: 'Landungsbrücken' });
    expect(fillText('{AtSpot} stehen jetzt meine Jungs. Wir sind {atSpot}.', vars)).toBe(
      'An den Landungsbrücken stehen jetzt meine Jungs. Wir sind an den Landungsbrücken.',
    );
  });

  it('jeder vorgegebene Spot bekommt eine Wendung mit Präposition, nie doppelt', () => {
    const start = /^(am|an der|an den|auf der|auf dem|im|in der|in) /;
    for (const spot of PRESET_SPOTS) {
      const text = atSpot(spot);
      expect(text, spot.id).toMatch(start);
      expect(text, spot.id).not.toMatch(/^(am|an der|im|in der) (Am|An|Im|In) /);
    }
  });
});
