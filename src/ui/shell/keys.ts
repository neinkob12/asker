// Tastatur am Mac/PC: Leertaste Pause, 1/2/3 Tempo, T Handy, Buchstaben der Tabs (Apps im Handy), Strg/⌘+K Suche,
// Escape schließt bzw. geht im Handy einen Schritt zurück.

import { SPEEDS } from '../../core';
import { dialogs, sidebarTabs } from '../registry';
import { TAB_APP_PREFIX, type UiRuntime } from '../runtime';
import { tabShortcuts } from './layout';

export function bindKeys(runtime: UiRuntime): void {
  document.addEventListener('keydown', (e) => {
    const { ui, api } = runtime;
    // Suche öffnen geht immer, auch im Textfeld.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      if (!runtime.state) return;
      e.preventDefault();
      api.togglePalette();
      return;
    }
    const target = e.target as HTMLElement | null;
    const typing =
      !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (e.code === 'Escape') {
      if (ui.picking) api.cancelPick();
      else if (ui.palette) api.togglePalette(false);
      else if (ui.popover) api.setPopover(null);
      else if (ui.dialog) {
        if (dialogs.get(ui.dialog.id)?.dismissable !== false) api.closeDialog();
      } else if (ui.panel) api.closePanel();
      else if (ui.notification) api.dismissNotification();
      else if (ui.phone.open && ui.section && ui.phone.app === `${TAB_APP_PREFIX}${ui.tab}`) api.openSection(null);
      // Im Chat geht Esc zuerst zur Chat-Liste, dann nach Hause.
      else if (ui.phone.open && ui.phone.app && ui.phone.params?.contactId) api.openPhone(ui.phone.app);
      else if (ui.phone.open && ui.phone.app) api.openPhone(null);
      else if (ui.phone.open) api.closePhone();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !runtime.state || ui.dialog || ui.palette) return;
    if (e.code === 'Space') {
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
    for (const [tabId, letter] of tabShortcuts()) {
      if (letter !== key || !sidebarTabs.get(tabId)) continue;
      // Gleiche Taste noch einmal: zurück zum Startbildschirm.
      if (ui.phone.open && !ui.panel && ui.phone.app === `${TAB_APP_PREFIX}${tabId}`) api.openPhone(null);
      else api.selectTab(tabId);
      return;
    }
  });
}
