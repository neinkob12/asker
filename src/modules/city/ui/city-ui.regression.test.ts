// Regressionstests aus dem Bugreview (Paket city, Oberfläche): Kamera während der eigenen Fahrt zwischen den Städten.
// Ohne Browser: Karte von MapLibre als Attrappe (mit dessen Verhalten bei jumpTo und flyTo), Registrierung, Hooks und
// Kartenwerkzeuge aus src/ui und src/map als Attrappe, Zustand und Befehle echt.

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Simulation } from '../../../core';
import { createTestGame } from '../../../core/testing';
import type { MapLayerContext } from '../../../map';
import type { UiState } from '../../../ui';
import { activeCity, cityTravel } from '../index';
import './index';
import { travelLayer } from './travel';

type FrameCallback = (now: number, dt: number) => void;

const fake = vi.hoisted(() => ({
  frames: [] as ((now: number, dt: number) => void)[],
  slots: new Map<string, () => unknown>(),
  reactions: new Map<string, (payload: unknown, ui: unknown, state: unknown) => void>(),
  state: null as unknown,
  view: 'city:koeln',
  flights: [] as string[],
}));

vi.mock('../../../map', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../map')>();
  return {
    ...original,
    registerMapLayer: () => {},
    onMapFrame: (callback: FrameCallback) => {
      fake.frames.push(callback);
      return () => {
        fake.frames = fake.frames.filter((f) => f !== callback);
      };
    },
    addHtmlMarker: () => ({ marker: { setLngLat() {}, remove() {} }, element: { hidden: false } }),
    el: () => ({ appendChild() {}, textContent: '' }),
    createVehicle: () => ({ jumpTo() {}, setLabel() {}, remove() {} }),
    addFootpath: () => ({ remove() {} }),
  };
});

vi.mock('../../../ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../ui')>();
  return {
    ...original,
    iconElement: () => ({}),
    registerSlot: (_name: string, item: { id: string; component: () => unknown }) => {
      fake.slots.set(item.id, item.component);
    },
    onGameEvent: (_type: string, id: string, reaction: (payload: unknown, ui: unknown, state: unknown) => void) => {
      fake.reactions.set(id, reaction);
    },
    useGame: () => ({ state: fake.state, dispatch: () => ({ ok: true }) }),
    useUi: () => ({
      mapView: () => fake.view,
      flyToCity: (cityId: string) => {
        fake.flights.push(cityId);
      },
    }),
  };
});

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

type MapHandler = (event: Record<string, unknown>) => void;

/**
 * Karte, die nur kann, was die Fahrt braucht, mit dem Verhalten von MapLibre 6: jumpTo bricht einen laufenden Flug ab
 * (stop) und meldet Zoomen mit den mitgegebenen Ereignisdaten; flyTo meldet zoomstart sofort und ohne originalEvent.
 */
class FakeMap {
  center = { lng: 6.958, lat: 50.938 };
  zoom = 13;
  flight: { center: [number, number]; zoom: number } | null = null;
  jumps = 0;
  private handlers = new Map<string, Set<MapHandler>>();

  on(type: string, handler: MapHandler): void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
  }

  off(type: string, handler: MapHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private fire(type: string, data: object = {}): void {
    for (const handler of this.handlers.get(type) ?? []) handler({ type, ...data });
  }

  getZoom(): number {
    return this.zoom;
  }

  getCenter(): { lng: number; lat: number } {
    return { ...this.center };
  }

  jumpTo(options: { center?: [number, number]; zoom?: number }, data: object = {}): void {
    this.flight = null;
    this.jumps++;
    const zoomChanged = options.zoom !== undefined && options.zoom !== this.zoom;
    if (options.center) this.center = { lng: options.center[0], lat: options.center[1] };
    if (options.zoom !== undefined) this.zoom = options.zoom;
    this.fire('movestart', data);
    if (zoomChanged) {
      this.fire('zoomstart', data);
      this.fire('zoomend', data);
    }
    this.fire('moveend', data);
  }

  flyTo(options: { center: [number, number]; zoom: number }, data: object = {}): void {
    this.flight = { center: options.center, zoom: options.zoom };
    this.fire('movestart', data);
    this.fire('zoomstart', data);
  }

  /** Der Flug kommt an. */
  land(): void {
    if (!this.flight) return;
    this.center = { lng: this.flight.center[0], lat: this.flight.center[1] };
    this.zoom = this.flight.zoom;
    this.flight = null;
    this.fire('zoomend');
    this.fire('moveend');
  }
}

/** Hamburg frei, du fährst los (Köln bleibt aktiv, bis du ankommst). */
function travellingToHamburg(): Simulation {
  const sim = quietGame();
  expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
  expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }).ok).toBe(true);
  expect(cityTravel(sim.state)?.to).toBe('hamburg');
  return sim;
}

describe('Kamera während der eigenen Fahrt', () => {
  beforeEach(() => {
    fake.flights = [];
    fake.view = 'city:koeln';
    // Neue Fahrt: Die Kamera klebt wieder am Auto.
    fake.reactions.get('city.travel.camera')?.({}, {}, null);
  });

  it('Übersicht und Stadtmenü fliegen zu Ende, statt im nächsten Bild abzubrechen; eigenes Nachziehen löst nichts', () => {
    const sim = travellingToHamburg();
    const map = new FakeMap();
    const layer = travelLayer.mount({ map } as unknown as MapLayerContext);
    try {
      layer.update?.(sim.state, {} as UiState);
      const frame = fake.frames[fake.frames.length - 1];
      let now = performance.now() + 60_000;
      const play = (frames: number) => {
        for (let i = 0; i < frames; i++) {
          now += 16;
          frame(now, 1 / 60);
        }
      };
      // Die Verfolgung zoomt mit eigenem jumpTo (und eigenem zoomstart) und bleibt dabei am Auto.
      play(30);
      expect(map.jumps).toBe(30);
      const followZoom = map.zoom;
      // Übersicht (ui.flyToDeutschland, ebenso das Stadtmenü): GameMap startet einen Flug mit map.flyTo.
      map.flyTo({ center: [10.4, 51.1], zoom: 5.6 });
      play(5);
      expect(map.flight).not.toBeNull();
      expect(map.jumps).toBe(30);
      map.land();
      play(30);
      expect(map.center).toEqual({ lng: 10.4, lat: 51.1 });
      expect(map.zoom).toBe(5.6);
      expect(map.jumps).toBe(30);
      // „Folgen“ bzw. eine neue Fahrt holt die Kamera zurück ans Auto.
      fake.reactions.get('city.travel.camera')?.({}, {}, sim.state);
      play(1);
      expect(map.jumps).toBe(31);
      expect(map.zoom).toBeCloseTo(followZoom, 0);
    } finally {
      layer.destroy?.();
    }
  });

  describe('Stadt der Kamera', () => {
    const container = {} as unknown as Element;
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('document', {});
    });
    afterEach(() => {
      render(null, container);
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    const draw = (sim: Simulation) => {
      const CitySync = fake.slots.get('city.sync');
      if (!CitySync) throw new Error('city.sync nicht registriert');
      fake.state = sim.state;
      render(h(CitySync as () => null, {}), container);
      vi.advanceTimersByTime(250);
    };

    it('unterwegs in die schon aktive Stadt (wie nach dem Verkauf) folgt sie dem Auto und fliegt erst bei der Ankunft', () => {
      const sim = travellingToHamburg();
      draw(sim);
      expect(fake.flights).toEqual([]);
      // Hamburg wird aktiv, während du noch fährst (so schaltet der Verkauf auf Rotterdam).
      expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
      expect(activeCity(sim.state)).toBe('hamburg');
      draw(sim);
      expect(fake.flights).toEqual([]);
      const travel = cityTravel(sim.state);
      if (!travel) throw new Error('keine Fahrt');
      sim.advance(travel.arrivesAt - sim.state.time + 1);
      expect(cityTravel(sim.state)).toBeNull();
      fake.view = 'deutschland';
      draw(sim);
      expect(fake.flights).toEqual(['hamburg']);
    });

    it('wer unterwegs auf eine andere Stadt schaltet, bekommt sie zu sehen', () => {
      const sim = travellingToHamburg();
      expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
      draw(sim);
      expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } }).ok).toBe(true);
      fake.view = 'deutschland';
      draw(sim);
      expect(fake.flights).toEqual(['koeln']);
    });
  });
});
