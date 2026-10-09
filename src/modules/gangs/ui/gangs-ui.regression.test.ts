// Regressionstests (Gangs, Oberfläche): Hauptquartiere und Vorstöße auf der Karte nur für die aktive Stadt.
// Ohne Browser: Kartenwerkzeuge aus src/map und src/ui als Attrappe, Zustand und Befehle echt.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Simulation } from '../../../core';
import { createTestGame } from '../../../core/testing';
import type { MapLayerContext } from '../../../map';
import type { UiState } from '../../../ui';
import { unlockCity } from '../../city';
import { allVeedel } from '../../veedel';
import { getGangStatus, getGangs } from '../index';
import { gangsLayer } from './map';

const fake = vi.hoisted(() => ({
  markers: [] as { title: string; className: string; removed: boolean }[],
}));

vi.mock('../../../map', () => ({
  addHtmlMarker: (_map: unknown, options: { title?: string; className: string }) => {
    const entry = { title: options.title ?? '', className: options.className, removed: false };
    fake.markers.push(entry);
    return {
      marker: {
        remove: () => {
          entry.removed = true;
        },
      },
      element: { style: { setProperty() {} } },
    };
  },
  el: () => ({ appendChild() {}, style: { setProperty() {} } }),
}));

vi.mock('../../../ui', () => ({ iconElement: () => ({}) }));

/** Titel der Marker einer Art, die gerade auf der Karte stehen. */
function shown(className: string): string[] {
  return fake.markers
    .filter((m) => !m.removed && m.className === className)
    .map((m) => m.title)
    .sort();
}

function mount(sim: Simulation) {
  const ctx = {
    map: {},
    ui: { openPanel() {} },
    getState: () => sim.state,
    isPicking: () => false,
  } as unknown as MapLayerContext;
  return gangsLayer.mount(ctx);
}

function switchToHamburg(sim: Simulation): void {
  unlockCity(sim.ctx('city'), 'hamburg');
  expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
}

describe('Hauptquartiere der Gangs nur für die aktive Stadt', () => {
  beforeEach(() => {
    fake.markers = [];
  });

  it('in Köln nur die Kölner Gangs, nach dem Wechsel nach Hamburg nur die Hamburger', () => {
    const sim = createTestGame();
    const hq = (cityId: string) =>
      getGangs(sim.state, cityId)
        .map((g) => `${g.name} (Hauptquartier)`)
        .sort();
    const layer = mount(sim);
    expect(shown('gang-hq')).toEqual(hq('koeln'));
    switchToHamburg(sim);
    layer.update?.(sim.state, {} as UiState);
    expect(shown('gang-hq')).toEqual(hq('hamburg'));
    layer.destroy?.();
    expect(shown('gang-hq')).toEqual([]);
  });

  it('der Ring eines Vorstoßes nur bei einer Gang der aktiven Stadt', () => {
    const sim = createTestGame();
    switchToHamburg(sim);
    const now = sim.state.time;
    const koeln = getGangStatus(sim.state, 'ost');
    const hh = getGangs(sim.state, 'hamburg')[0];
    const hhStatus = getGangStatus(sim.state, hh.id);
    if (!koeln || !hhStatus) throw new Error('Gang fehlt');
    koeln.push = { veedelId: allVeedel('koeln')[0].id, startedAt: now, until: now + 600 };
    hhStatus.push = { veedelId: allVeedel('hamburg')[0].id, startedAt: now, until: now + 600 };
    mount(sim);
    const rings = shown('gang-push');
    expect(rings).toHaveLength(1);
    expect(rings[0].startsWith(`${hh.name} drängt nach`)).toBe(true);
  });
});
