// Pop-up zum Start eines Stadt-Events im laufenden Spiel (Befund): Die Oberfläche zeichnet nach jedem
// Spielschritt neu (bei Tempo 1 etwa alle 250 ms), useUi() liefert dabei jedes Mal ein neues Objekt (src/ui/hooks.ts).
// Der Öffner darf seinen 400-ms-Timer deshalb nicht bei jedem Zeichnen neu starten, sonst kommt das Pop-up nur in der
// Pause. Gezeichnet wird der echte Öffner mit Preact, ohne Browser: Hooks und Registrierung aus src/ui als Attrappe.

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../../core';
import { createTestGame } from '../../../core/testing';
import type { UiState } from '../../../ui';
import { activeCity } from '../../city';
import './index';

type Reaction = (payload: unknown, ui: unknown, state: unknown) => void;

const fake = vi.hoisted(() => ({
  slots: new Map<string, () => unknown>(),
  reactions: new Map<string, (payload: unknown, ui: unknown, state: unknown) => void>(),
  ui: {} as Record<string, unknown>,
  opened: [] as { id: string; props: unknown }[],
  state: null as unknown,
}));

vi.mock('../../../ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../ui')>();
  return {
    ...original,
    registerDialog: () => {},
    registerSlot: (_name: string, item: { id: string; component: () => unknown }) => {
      fake.slots.set(item.id, item.component);
    },
    onGameEvent: (_type: string, id: string, reaction: Reaction) => {
      fake.reactions.set(id, reaction);
    },
    // Wie src/ui/hooks.ts: bei jedem Aufruf ein neues Objekt, der UI-Zustand darin ist live.
    useUi: () => ({
      openDialog: (id: string, props: unknown) => {
        fake.opened.push({ id, props });
        (fake.ui as { dialog: unknown }).dialog = { id, props };
      },
      state: fake.ui,
    }),
    useGame: () => ({ state: fake.state, dispatch: () => ({ ok: true }) }),
    useIsMobile: () => false,
  };
});

function freeUi(): UiState {
  return {
    dialog: null,
    popover: null,
    palette: false,
    picking: null,
    call: null,
    tour: null,
    phone: { open: true, app: null, stack: [] },
  } as unknown as UiState;
}

const container = {} as unknown as Element;

/** Zeichnet den Öffner neu, wie es die Shell nach jedem Spielschritt tut. */
function draw(): void {
  const Opener = fake.slots.get('events.startOpener');
  if (!Opener) throw new Error('Öffner nicht registriert');
  render(h(Opener as () => null, {}), container);
}

describe('Pop-up zum Start eines Stadt-Events öffnet sich auch im laufenden Spiel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', {});
    fake.ui = freeUi() as unknown as Record<string, unknown>;
    fake.opened = [];
  });
  afterEach(() => {
    render(null, container);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('Tempo 1: Neuzeichnen alle 250 ms bricht den Timer nicht ab', () => {
    const state: GameState = createTestGame().state;
    fake.state = state;
    const toast = vi.fn();
    fake.reactions.get('events.startedToast')?.({ eventId: 'karneval', cityId: activeCity(state) }, { toast }, state);
    expect(toast).toHaveBeenCalledTimes(1);
    for (let t = 0; t < 2000; t += 250) {
      draw();
      vi.advanceTimersByTime(250);
    }
    expect(fake.opened).toEqual([{ id: 'events.started', props: { eventId: 'karneval' } }]);
  });
});
