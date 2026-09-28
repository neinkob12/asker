// Registry für Karten-Layer. Module legen ihren Kartencode in src/modules/<id>/ui/ ab und melden ihn hier an.

import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GameState } from '../core';
import type { UiApi, UiState } from '../ui/runtime';

export interface MapLayerContext {
  /** Die MapLibre-Karte. Quellen, Layer und Marker dürfen frei hinzugefügt werden (IDs mit Modul-Präfix!). */
  map: MapLibreMap;
  ui: UiApi;
  /** Aktueller Spielzustand, null solange kein Spiel geladen ist. */
  getState(): GameState | null;
  /** Wartet die Karte gerade auf einen Klick (pickLocation)? Dann eigene Klick-Handler ignorieren. */
  isPicking(): boolean;
}

export interface MapLayerInstance {
  /** Nach jedem Neuzeichnen (ca. 10 Mal pro Sekunde). Nur lesen! */
  update?(state: GameState, ui: UiState): void;
  destroy?(): void;
}

export interface MapLayer {
  /** Eindeutig, mit Modul-Präfix, z.B. 'spots.markers'. */
  id: string;
  /** Reihenfolge beim Hinzufügen: kleiner = weiter unten. */
  order?: number;
  /** Wird einmal aufgerufen, sobald der Kartenstil geladen ist. */
  mount(ctx: MapLayerContext): MapLayerInstance;
}

const layers = new Map<string, MapLayer>();

export function registerMapLayer(layer: MapLayer): void {
  layers.set(layer.id, layer);
}

export function mapLayers(): MapLayer[] {
  return [...layers.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}
