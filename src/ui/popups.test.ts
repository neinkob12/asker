import { describe, expect, it } from 'vitest';
import { popupMayOpen } from './popups';
import type { UiState } from './runtime';

/** Nur die Felder, die popupMayOpen liest; alles andere spielt keine Rolle. */
function uiWith(partial: Partial<UiState>): UiState {
  return {
    dialog: null,
    popover: null,
    palette: false,
    picking: null,
    call: null,
    notificationCenter: false,
    phone: { open: false, app: null, stack: [] },
    ...partial,
  } as UiState;
}

describe('popupMayOpen (Auftrag 46e)', () => {
  it('ist frei, wenn nichts offen ist', () => {
    expect(popupMayOpen(uiWith({}))).toBe(true);
    expect(popupMayOpen(uiWith({}), true)).toBe(true);
  });

  it('wartet bei Dialog, Menü, Suche, Kartenklick, Gespräch und Mitteilungszentrale', () => {
    expect(popupMayOpen(uiWith({ dialog: { id: 'core.saves', props: {} } }))).toBe(false);
    expect(popupMayOpen(uiWith({ popover: 'menu' }))).toBe(false);
    expect(popupMayOpen(uiWith({ palette: true }))).toBe(false);
    expect(popupMayOpen(uiWith({ picking: { prompt: 'Wo?' } }))).toBe(false);
    expect(popupMayOpen(uiWith({ call: { messageId: 1 } }))).toBe(false);
    expect(popupMayOpen(uiWith({ notificationCenter: true }))).toBe(false);
  });

  it('wartet am Handy-Bildschirm, solange das Handy offen ist, am Desktop nicht', () => {
    const phoneOpen = uiWith({ phone: { open: true, app: 'suppliers.app', stack: [] } });
    expect(popupMayOpen(phoneOpen)).toBe(true);
    expect(popupMayOpen(phoneOpen, true)).toBe(false);
  });
});
