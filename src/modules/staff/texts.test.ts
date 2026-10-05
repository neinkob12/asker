import { describe, expect, it } from 'vitest';
import { fillText } from '../../core';
import { STAFF_TEXTS } from './texts';

describe('Routine-Nachrichten des Personals', () => {
  it('mindestens vier Varianten, alle Platzhalter ersetzt', () => {
    for (const [key, list] of Object.entries(STAFF_TEXTS)) {
      expect(list.length, key).toBeGreaterThanOrEqual(4);
      for (const text of list) {
        expect(fillText(text, { amount: '80 €', time: '14:00', veedel: 'Nippes' })).not.toMatch(/\{\w*\}/);
      }
    }
  });
});
