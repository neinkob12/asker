// Kartenansicht der Veedel: nach Kontrolle oder nach Heat eingefärbt. Reiner UI-Zustand, nicht im Spielstand.

export type VeedelMapView = 'control' | 'heat';

export const MAP_VIEW_OPTIONS: { value: VeedelMapView; label: string }[] = [
  { value: 'control', label: 'Kontrolle' },
  { value: 'heat', label: 'Heat' },
];

let current: VeedelMapView = 'control';
const listeners = new Set<(view: VeedelMapView) => void>();

export function getMapView(): VeedelMapView {
  return current;
}

export function setMapView(view: VeedelMapView): void {
  if (view === current) return;
  current = view;
  for (const listener of listeners) listener(view);
}

/** Auf Umschalten hören. Gibt eine Funktion zum Abmelden zurück. */
export function onMapViewChange(listener: (view: VeedelMapView) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
