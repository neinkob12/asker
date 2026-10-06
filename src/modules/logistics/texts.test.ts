import { describe, expect, it } from 'vitest';
import { clock, fillText } from '../../core';
import { PORTS } from './config';
import { PORT_TEXTS } from './texts';

describe('Hafen-Nachrichten', () => {
  it('jeder Hafen hat mindestens vier Varianten pro Anlass, alle Platzhalter ersetzt', () => {
    // Echte Dauer: endet mit dem Punkt der Abkürzung, dahinter darf keiner mehr stehen (J3: „6 Std. 15 Min..“).
    const vars = { goods: '1 kg Gras', duration: clock.formatDuration(375), quay: 'Kai 7' };
    for (const cityId of Object.keys(PORTS)) {
      const port = PORT_TEXTS[cityId];
      expect(port, cityId).toBeDefined();
      for (const [key, list] of Object.entries(port)) {
        expect(list.length, `${cityId}:${key}`).toBeGreaterThanOrEqual(4);
        for (const text of list) {
          const filled = fillText(text, vars);
          expect(filled, text).not.toMatch(/\{\w*\}/);
          expect(filled, text).not.toMatch(/(^|[^.])\.\.(?!\.)/);
        }
      }
    }
  });
});
