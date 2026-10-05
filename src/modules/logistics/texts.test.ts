import { describe, expect, it } from 'vitest';
import { fillText } from '../../core';
import { PORTS } from './config';
import { PORT_TEXTS } from './texts';

describe('Hafen-Nachrichten', () => {
  it('jeder Hafen hat mindestens vier Varianten pro Anlass, alle Platzhalter ersetzt', () => {
    for (const cityId of Object.keys(PORTS)) {
      const port = PORT_TEXTS[cityId];
      expect(port, cityId).toBeDefined();
      for (const [key, list] of Object.entries(port)) {
        expect(list.length, `${cityId}:${key}`).toBeGreaterThanOrEqual(4);
        for (const text of list) {
          expect(fillText(text, { goods: '1 kg Gras', duration: '6 Std.', quay: 'Kai 7' })).not.toMatch(/\{\w*\}/);
        }
      }
    }
  });
});
