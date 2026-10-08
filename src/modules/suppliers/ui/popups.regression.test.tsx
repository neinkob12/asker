// Pop-up „Neuer Lieferant“ im laufenden Spiel (Befund): Die Oberfläche zeichnet nach jedem Spielschritt neu
// (bei Tempo 1 etwa alle 250 ms), useUi() liefert dabei jedes Mal ein neues Objekt (src/ui/hooks.ts). Der Öffner darf
// seinen 400-ms-Timer deshalb nicht bei jedem Zeichnen neu starten, sonst kommt das Pop-up nur in der Pause.
// Gezeichnet wird der echte Öffner mit Preact, ohne Browser: Hooks und Registrierung aus src/ui als Attrappe.

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiState } from '../../../ui';
import './meet';

type Reaction = (payload: unknown, ui: unknown, state: unknown) => void;

const fake = vi.hoisted(() => ({
  slots: new Map<string, () => unknown>(),
  reactions: new Map<string, (payload: unknown, ui: unknown, state: unknown) => void>(),
  ui: {} as Record<string, unknown>,
  opened: [] as { id: string; props: unknown }[],
  state: { meta: { runId: 'run' } } as unknown,
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
      closeDialog: () => {
        (fake.ui as { dialog: unknown }).dialog = null;
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
  const Opener = fake.slots.get('suppliers.meetOpener');
  if (!Opener) throw new Error('Öffner nicht registriert');
  render(h(Opener as () => null, {}), container);
}

function introduce(runId: string, supplierIds: string[]): void {
  fake.state = { meta: { runId } };
  fake.reactions.get('suppliers.meet')?.({ supplierIds }, {}, fake.state);
}

describe('Pop-up „Neuer Lieferant“ öffnet sich auch im laufenden Spiel', () => {
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
    introduce('lauf-1', ['kalle']);
    for (let t = 0; t < 2000; t += 250) {
      draw();
      vi.advanceTimersByTime(250);
    }
    expect(fake.opened).toEqual([{ id: 'suppliers.meet', props: { supplierIds: ['kalle'] } }]);
  });

  it('wartet weiter, solange ein anderer Dialog offen ist, und kommt danach', () => {
    introduce('lauf-2', ['toni']);
    (fake.ui as { dialog: unknown }).dialog = { id: 'encounters.result', props: {} };
    for (let t = 0; t < 2000; t += 250) {
      draw();
      vi.advanceTimersByTime(250);
    }
    expect(fake.opened).toEqual([]);
    (fake.ui as { dialog: unknown }).dialog = null;
    for (let t = 0; t < 1000; t += 250) {
      draw();
      vi.advanceTimersByTime(250);
    }
    expect(fake.opened.map((o) => o.id)).toEqual(['suppliers.meet']);
  });
});
