// Touren des Tutorials (Auftrag 46c): nur Anker aus TOUR_ANCHORS (plus die App-Symbole), kein Text über 140
// Zeichen, jede Stufe 0 bis 12 hat eine Tour, Erklär-Stufen und Stufen mit Handlung sind richtig markiert.

import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../../core/testing';
import { TOUR_ANCHORS, type UiApi, type UiState } from '../../../ui';
import { LAST_STAGE } from '../config';
import { allTours, EXPLAIN_STAGES, stageTour, TOUR_TEXT_MAX, type TourContext } from './tours';

/** Die Oberfläche als Attrappe: Jede Funktion tut nichts (die Touren rufen sie erst in `before`). */
const fakeUi = new Proxy({} as UiApi, { get: () => () => undefined });

function context(): TourContext {
  const sim = createTestGame();
  sim.dispatch({ type: 'tutorial.start', payload: {} });
  return { ui: fakeUi, state: sim.state };
}

describe('tutorial: Touren', () => {
  it('jede Stufe 0 bis 12 hat eine Tour mit mindestens einem Schritt, Peter spricht', () => {
    const ctx = context();
    for (let stage = 0; stage <= LAST_STAGE; stage++) {
      const tour = stageTour(stage, ctx);
      expect(tour.id).toBe(`tutorial:${stage}`);
      expect(tour.steps.length, `Stufe ${stage}`).toBeGreaterThan(0);
      for (const step of tour.steps) expect(step.speaker?.name, `${tour.id}/${step.id}`).toBe('Peter');
    }
    expect(() => stageTour(LAST_STAGE + 1, ctx)).toThrow();
  });

  it('referenziert nur Anker aus TOUR_ANCHORS bzw. App-Symbole, Schritt-IDs sind eindeutig', () => {
    const anchors = new Set<string>(TOUR_ANCHORS);
    for (const tour of allTours(context())) {
      const ids = new Set<string>();
      for (const step of tour.steps) {
        expect(ids.has(step.id), `${tour.id}/${step.id} doppelt`).toBe(false);
        ids.add(step.id);
        if (!step.anchor) continue;
        const ok = anchors.has(step.anchor) || step.anchor.startsWith('phone.app.');
        expect(ok, `${tour.id}/${step.id}: Anker ${step.anchor}`).toBe(true);
      }
    }
  });

  it('kein Text über 140 Zeichen, keiner leer', () => {
    for (const tour of allTours(context())) {
      for (const step of tour.steps) {
        expect(step.text.trim().length, `${tour.id}/${step.id}`).toBeGreaterThan(0);
        expect(step.text.length, `${tour.id}/${step.id}: ${step.text}`).toBeLessThanOrEqual(TOUR_TEXT_MAX);
      }
    }
  });

  it('Erklär-Stufen halten die Uhr an; wer selbst etwas tun muss, spielt mit laufender Uhr und darf überspringen', () => {
    const ctx = context();
    expect(EXPLAIN_STAGES).toEqual([0, 3, 4, 10]);
    for (const stage of [0, 2, 3, 4, 6, 8, 9, 12]) {
      const tour = stageTour(stage, ctx);
      expect(tour.pause, `Stufe ${stage}`).toBe(true);
      expect(tour.skippable, `Stufe ${stage}`).toBe(false);
    }
    for (const stage of [1, 5, 7, 10, 11]) {
      const tour = stageTour(stage, ctx);
      expect(tour.pause, `Stufe ${stage}`).toBe(false);
      expect(tour.skippable, `Stufe ${stage}`).toBe(true);
      expect(
        tour.steps.some((s) => s.waitFor !== undefined),
        `Stufe ${stage}`,
      ).toBe(true);
    }
  });

  it('Stufe 1 wartet auf den ersten Verkauf, Stufe 2 zeigt beide Spots zum Kauf', () => {
    const ctx = context();
    const sell = stageTour(1, ctx).steps.find((s) => s.id === 'sell');
    expect(sell?.waitFor).toEqual({ event: 'sale.completed' });
    expect(stageTour(2, ctx).steps.map((s) => [s.anchor, s.anchorKey])).toEqual([
      ['spot.marker', 'zuelpicher'],
      ['spot.marker', 'rudolfplatz'],
    ]);
  });
  it('Stufe 5: Der Spieler tippt selbst einen Lieferanten an und bestellt einmal (Anker bleibt frei)', () => {
    const ctx = context();
    const steps = stageTour(5, ctx).steps;
    const list = steps.find((s) => s.id === 'list');
    const offer = steps.find((s) => s.id === 'offer');
    expect(list?.waitFor && typeof list.waitFor === 'object' && 'ui' in list.waitFor).toBe(true);
    expect(offer?.anchor).toBe('suppliers.offer');
    expect(offer?.waitFor).toEqual({ event: 'shipment.ordered' });
    // Die Bedingung der Liste: erfüllt, sobald im Handy ein Lieferant offen ist.
    const wait = list?.waitFor as { ui: (ui: UiState) => boolean };
    const phone = (app: string | null, params?: Record<string, unknown>) =>
      ({ phone: { open: true, app, params, stack: [] } }) as unknown as UiState;
    expect(wait.ui(phone('suppliers.app'))).toBe(false);
    expect(wait.ui(phone('tab:staff', { supplierId: 'koeln' }))).toBe(false);
    expect(wait.ui(phone('suppliers.app', { supplierId: 'koeln' }))).toBe(true);
  });
});
