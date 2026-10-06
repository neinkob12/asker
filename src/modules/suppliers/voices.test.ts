import { describe, expect, it } from 'vitest';
import { clock, fillText } from '../../core';
import { SUPPLIERS } from './config';
import { PROBLEM_REASONS, ROUTE_NAMES, type RouteKind } from './problems';
import { SUPPLIER_VOICES, type SupplierTextKey } from './voices';

const VARS = {
  goods: '50 g Gras',
  reason: 'Stau',
  // Echte Dauer: endet wie jede mit einem Punkt (J3: „6 Std. 15 Min..“).
  delay: clock.formatDuration(375),
  cost: '50 €',
  debt: '200 €',
  extra: '5 g Gras',
  warehouse: 'Lager',
  share: '25 g Gras',
  road: 'A3',
  city: 'Köln',
  river: 'Rhein',
  port: 'Niehler Hafen',
};

/** Zwei Punkte hintereinander, die keine Auslassungspunkte („…“ als „...“) sind. */
const DOUBLE_DOT = /(^|[^.])\.\.(?!\.)/;

describe('Lieferanten-Stimmen und Gründe', () => {
  it('jeder Lieferant hat eine eigene Stimme für jeden Anlass', () => {
    const keys = Object.keys(SUPPLIER_VOICES.frankfurt) as SupplierTextKey[];
    for (const supplier of SUPPLIERS) {
      const voice = SUPPLIER_VOICES[supplier.id];
      expect(voice, supplier.id).toBeDefined();
      for (const key of keys) {
        // Routine (Probleme, Mahnungen) mit mindestens vier Varianten, seltene Antworten mit drei.
        const min = ['delayed', 'delayedAsk', 'seized', 'seizedCredit', 'seizeThreat', 'badQuality'].includes(key)
          ? 4
          : 3;
        expect(voice[key].length, `${supplier.id}:${key}`).toBeGreaterThanOrEqual(min);
        for (const text of voice[key]) {
          expect(fillText(text, VARS), text).not.toMatch(/\{\w*\}/);
          expect(fillText(text, VARS), text).not.toMatch(DOUBLE_DOT);
        }
      }
    }
  });

  it('pro Weg mindestens acht Gründe für Verspätung und je vier für Beschlagnahme und schlechte Ware', () => {
    for (const route of Object.keys(ROUTE_NAMES) as RouteKind[]) {
      const reasons = PROBLEM_REASONS[route];
      expect(reasons.delay.length, route).toBeGreaterThanOrEqual(8);
      expect(reasons.seize.length, route).toBeGreaterThanOrEqual(4);
      expect(reasons.badQuality.length, route).toBeGreaterThanOrEqual(4);
      for (const list of [reasons.delay, reasons.seize, reasons.badQuality]) {
        expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
        for (const r of list) {
          expect(fillText(r.text, VARS), r.text).not.toMatch(/\{\w*\}/);
          expect(fillText(r.label, VARS), r.label).not.toMatch(/\{\w*\}/);
          expect(fillText(r.text, VARS), r.text).not.toMatch(DOUBLE_DOT);
        }
      }
    }
  });
});
