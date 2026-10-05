import { describe, expect, it } from 'vitest';
import { fillText } from '../../core';
import { HIERARCHY_TEXTS } from './texts';

describe('Meldungen der Leutnants', () => {
  it('mindestens vier Varianten, alle Platzhalter ersetzt', () => {
    for (const [key, list] of Object.entries(HIERARCHY_TEXTS)) {
      expect(list.length, key).toBeGreaterThanOrEqual(4);
      for (const text of list) {
        expect(fillText(text, { veedel: 'Nippes', what: 'den Spot', wage: '120 €' })).not.toMatch(/\{\w*\}/);
      }
    }
  });
});
