// Offene Überlagerungen (Blatt, Aktionsblatt, Kontextmenü, Mitteilungszentrale) als Stapel: Esc schließt die oberste,
// ein Wechsel der Seite im Handy schließt alle (sonst stünde ein Menü über der falschen Seite), und Gesten wie das
// Rand-Wischen ruhen, solange eine offen ist.

import { useEffect, useRef } from 'preact/hooks';

const open: { close: () => void }[] = [];

/** Überlagerung anmelden. Gibt die Abmeldung zurück. */
export function pushOverlay(close: () => void): () => void {
  const entry = { close };
  open.push(entry);
  return () => {
    const i = open.indexOf(entry);
    if (i >= 0) open.splice(i, 1);
  };
}

/** Oberste Überlagerung schließen (Esc). false, wenn keine offen ist. */
export function closeTopOverlay(): boolean {
  const top = open[open.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** Alle schließen (Navigation). */
export function closeAllOverlays(): void {
  for (const entry of [...open].reverse()) entry.close();
}

export function hasOverlay(): boolean {
  return open.length > 0;
}

/** Hook: solange `isOpen`, ist die Überlagerung angemeldet; Esc und Navigation rufen onClose. */
export function useOverlay(isOpen: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => (isOpen ? pushOverlay(() => close.current()) : undefined), [isOpen]);
}
