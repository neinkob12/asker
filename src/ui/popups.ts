// Pop-ups über der Karte (Auftrag 46e: Lieferant kennenlernen, Start eines Stadt-Events) warten, bis der Spieler frei
// ist: kein Dialog, kein Menü oder Popover im HUD, keine Suche, kein Klick auf die Karte, kein Gespräch, keine
// Mitteilungszentrale; am Handy-Bildschirm auch nicht, solange das Handy offen ist (das Blatt läge sonst über der App,
// die der Spieler gerade bedient). Die Öffner (Slots in 'map.overlay') fragen das vor jedem Versuch.

import type { UiState } from './runtime';

/** Darf jetzt ein Pop-up über der Karte aufgehen? `mobile` = Handy-Aufbau (useIsMobile). */
export function popupMayOpen(ui: UiState, mobile = false): boolean {
  if (ui.dialog || ui.popover || ui.palette || ui.picking || ui.call || ui.notificationCenter) return false;
  if (mobile && ui.phone.open) return false;
  return true;
}
