// Regressionstests aus dem Bugreview (Paket Fahrer und Karte): Klicks auf HTML-Marker während der Kartenauswahl.
// Ohne DOM in den Tests: Marker von MapLibre und document sind kleine Attrappen.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', () => ({
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      return this;
    }
  },
}));

type Listener = (event: { stopPropagation(): void }) => void;

/** Element, das nur kann, was addHtmlMarker braucht; click() löst den Klick-Listener aus. */
function fakeElement() {
  const listeners = new Map<string, Listener>();
  return {
    className: '',
    title: '',
    tabIndex: 0,
    type: '',
    appendChild() {},
    addEventListener(type: string, fn: Listener) {
      listeners.set(type, fn);
    },
    click() {
      const stopPropagation = vi.fn();
      listeners.get('click')?.({ stopPropagation });
      return stopPropagation;
    },
  };
}

/** Karte, deren Container die Klasse is-picking trägt, solange picking.on wahr ist (wie GameMap.pickLocation). */
function fakeMap(picking: { on: boolean }) {
  return {
    getContainer: () => ({ classList: { contains: (name: string) => name === 'is-picking' && picking.on } }),
  } as unknown as MapLibreMap;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Klick auf einen Marker während der Kartenauswahl', () => {
  it('reicht den Klick an die Karte weiter und öffnet nichts; sonst wie bisher', async () => {
    const element = fakeElement();
    vi.stubGlobal('document', { createElement: () => element });
    const { addHtmlMarker } = await import('./markers');
    const picking = { on: false };
    const onClick = vi.fn();
    addHtmlMarker(fakeMap(picking), {
      position: { lng: 6.95, lat: 50.94 },
      className: 'map-place',
      tag: 'button',
      onClick,
    });

    // Normal: Der Marker nimmt den Klick, die Karte sieht ihn nicht.
    expect(element.click()).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);

    // Kartenauswahl: Der Klick geht an die Karte (GameMap löst die Auswahl auf), der Marker tut nichts.
    picking.on = true;
    expect(element.click()).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
