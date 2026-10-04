import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { createFleet } from './fleet';

/** Eine Karte, die nur Ebenen und Ereignisse kennt; der Test spielt den Kontextverlust nach. */
function fakeMap() {
  const layers = new Map<string, unknown>();
  const handlers = new Map<string, Set<() => void>>();
  let styleReady = true;
  const map = {
    getLayer: (id: string) => layers.get(id),
    addLayer: (layer: { id: string }) => {
      if (!styleReady) throw new Error('Style is not done loading');
      layers.set(layer.id, layer);
    },
    removeLayer: (id: string) => layers.delete(id),
    on: (type: string, fn: () => void) => {
      const set = handlers.get(type) ?? new Set<() => void>();
      handlers.set(type, set);
      set.add(fn);
    },
    off: (type: string, fn: () => void) => handlers.get(type)?.delete(fn),
  };
  return {
    map: map as unknown as MapLibreMap,
    layers,
    fire: (type: string) => {
      for (const fn of [...(handlers.get(type) ?? [])]) fn();
    },
    /** MapLibre baut den Stil neu auf und lässt eigene Ebenen fallen. */
    loseContext: (ready: boolean) => {
      layers.clear();
      styleReady = ready;
    },
    setReady: (ready: boolean) => {
      styleReady = ready;
    },
    listeners: () => [...handlers.values()].reduce((n, set) => n + set.size, 0),
  };
}

describe('Verkehrs-Ebene nach WebGL-Kontextverlust', () => {
  it('legt die Ebene nach style.load wieder an', () => {
    const f = fakeMap();
    createFleet(f.map, { id: 'roads.traffic' });
    expect(f.layers.has('roads.traffic')).toBe(true);
    f.loseContext(false);
    // Stil noch nicht geladen: webglcontextrestored scheitert leise, style.load holt es nach.
    f.fire('webglcontextrestored');
    expect(f.layers.has('roads.traffic')).toBe(false);
    f.setReady(true);
    f.fire('style.load');
    expect(f.layers.has('roads.traffic')).toBe(true);
  });

  it('legt sie nicht doppelt an und gibt die Listener bei remove() zurück', () => {
    const f = fakeMap();
    const handle = createFleet(f.map, { id: 'roads.traffic' });
    f.fire('style.load');
    f.fire('webglcontextrestored');
    expect(f.layers.size).toBe(1);
    handle.remove();
    expect(f.layers.size).toBe(0);
    expect(f.listeners()).toBe(0);
    f.fire('style.load');
    expect(f.layers.size).toBe(0);
  });

  it('startet ohne geladenen Stil und wartet auf style.load', () => {
    const f = fakeMap();
    f.setReady(false);
    createFleet(f.map, { id: 'roads.traffic' });
    expect(f.layers.size).toBe(0);
    f.setReady(true);
    f.fire('style.load');
    expect(f.layers.size).toBe(1);
  });
});
