// Tastatur am Mac/PC: Leertaste Pause, 1/2/3 Tempo, T Handy, Buchstaben der Tabs (Apps im Handy), Strg/⌘+K Suche,
// Escape schließt bzw. geht im Handy einen Schritt zurück.

import { SPEEDS } from '../../core';
import { closeTopOverlay } from '../overlays';
import { top } from '../phone/navModel';
import { dialogs, sidebarTabs } from '../registry';
import type { UiRuntime } from '../runtime';
import { tabShortcuts } from './layout';

/** Bindet die Tastatur. Gibt die Abmeldung zurück (Neuladen von Modulen im Entwicklungsserver, Tests). */
export function bindKeys(runtime: UiRuntime): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const { ui, api } = runtime;
    const target = e.target as HTMLElement | null;
    const typing =
      !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    // Auf einem Knopf, Schalter oder einer Auswahl gehört die Leertaste dem Element (sonst lässt sich nichts per
    // Tastatur bedienen). Gehaltene Tasten lösen nichts mehrfach aus.
    const onControl = !!target?.closest(
      'button, select, summary, a[href], [role="button"], [role="switch"], [role="tab"]',
    );
    // Tour (Auftrag 46a): Enter oder Leertaste = Weiter, Esc tut nichts, alle anderen Kürzel sind gesperrt. Auf einem
    // Knopf (Weiter, Überspringen, der Anker) bleibt die Taste dem Knopf.
    if (runtime.tours.active()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        return;
      }
      if (typing || onControl || e.metaKey || e.ctrlKey || e.altKey) return;
      // Liegt ein Dialog oder die Suche über der Tour, gehört die Taste nicht der verdeckten Tour.
      if (ui.dialog || ui.palette) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) runtime.tours.next();
      }
      return;
    }
    // Suche öffnen geht immer, auch im Textfeld.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      if (!runtime.state) return;
      e.preventDefault();
      api.togglePalette();
      return;
    }
    if (e.code === 'Escape') {
      if (ui.picking) api.cancelPick();
      else if (ui.palette) api.togglePalette(false);
      else if (ui.popover) api.setPopover(null);
      else if (ui.dialog) {
        const dismissable = dialogs.get(ui.dialog.id)?.dismissable;
        const can = typeof dismissable === 'function' ? dismissable(ui.dialog.props as never) : dismissable !== false;
        if (can) api.closeDialog();
      } else if (closeTopOverlay()) {
        // Blatt, Aktionsblatt oder Kontextmenü geschlossen
      } else if (ui.panel) api.closePanel();
      else if (ui.error) api.dismissError();
      // Im Handy eine Seite zurück (Details, Abschnitt, Chat, App), auf dem Startbildschirm weglegen.
      else if (ui.phone.open) api.back();
      return;
    }
    if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !runtime.state || ui.dialog || ui.palette) return;
    if (e.code === 'Space') {
      if (onControl) return;
      e.preventDefault();
      api.togglePause();
      return;
    }
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      const speed = SPEEDS[Number(e.key)];
      if (speed !== undefined) api.setSpeed(speed);
      return;
    }
    const key = e.key.toUpperCase();
    if (key === 'T') {
      if (ui.phone.open) api.closePhone();
      else api.openPhone();
      return;
    }
    // Nur Tabs, die gerade auf dem Startbildschirm stehen (hiddenWhen: z.B. am Anfang noch nicht freigeschaltet).
    for (const [tabId, letter] of tabShortcuts(runtime.state)) {
      if (letter !== key || !sidebarTabs.get(tabId)) continue;
      // Gleiche Taste noch einmal: zurück zum Startbildschirm.
      const inTab = ui.phone.stack[1]?.kind === 'tab' && ui.phone.stack[1].id === tabId;
      if (ui.phone.open && inTab && top(ui.phone.stack).kind !== 'panel') api.openPhone(null);
      else api.selectTab(tabId);
      return;
    }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
