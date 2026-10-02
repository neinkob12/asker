// Meldungen (ui.toast): Symbol und Bedeutungsfarbe je Art für das Banner im Handy. Die Liste aller Meldungen steht
// seit Auftrag 26 im Verlauf (Einstellungen › Verlauf, src/ui/builtin/HistoryApp.tsx), nicht mehr in einer eigenen App.

import type { ToastKind } from '../runtime';

export const TOAST_ICONS: Record<ToastKind, string> = { info: 'info', good: 'check', warn: 'alert', bad: 'siren' };
export const TOAST_CHIPS: Record<ToastKind, 'place' | 'money' | 'warn' | 'danger'> = {
  info: 'place',
  good: 'money',
  warn: 'warn',
  bad: 'danger',
};
