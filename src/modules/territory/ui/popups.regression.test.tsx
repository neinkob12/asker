// „Veedel übernommen“ wartet wie die anderen Pop-ups über der Karte, bis der Spieler frei ist (Befund):
// popupMayOpen aus src/ui (kein Dialog, kein Menü, keine Suche, kein Kartenklick, kein Gespräch, keine Tour, am
// Handy-Bildschirm das Handy zu). Gezeichnet wird der echte Öffner mit Preact, ohne Browser: Hooks und Registrierung
// aus src/ui als Attrappe, popupMayOpen und isMobileLayout echt.

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiState } from '../../../ui';
import { PLAYER_FACTION } from '../index';
import './takeover';

type Reaction = (payload: unknown, ui: unknown, state: unknown) => void;

const fake = vi.hoisted(() => ({
  slots: new Map<string, () => unknown>(),
  reactions: new Map<string, (payload: unknown, ui: unknown, state: unknown) => void>(),
  ui: {} as Record<string, unknown>,
  opened: [] as { id: string; props: unknown }[],
  state: { meta: { runId: 'run' }, outcome: { gameOver: false }, time: 0 } as unknown,
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
let runs = 0;

/** Zeichnet den Öffner neu, wie es die Shell nach jedem Spielschritt tut, und lässt dabei Zeit vergehen. */
function play(ms: number): void {
  const Opener = fake.slots.get('territory.takeoverOpener');
  if (!Opener) throw new Error('Öffner nicht registriert');
  for (let t = 0; t < ms; t += 250) {
    render(h(Opener as () => null, {}), container);
    vi.advanceTimersByTime(250);
  }
}

/** Ein neuer Durchgang, in dem der Spieler ein Veedel übernimmt (erstes Mal: mit Dialog). */
function takeOver(): void {
  fake.state = { meta: { runId: `lauf-${++runs}` }, outcome: { gameOver: false }, time: 600 };
  fake.reactions.get('territory.takeover')?.({ veedelId: 'ehrenfeld', from: null, to: PLAYER_FACTION }, {}, fake.state);
}

describe('„Veedel übernommen“ wartet, bis der Spieler frei ist', () => {
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

  it('ohne Hindernis öffnet es sich kurz nach der Übernahme, am Desktop auch bei offenem Handy', () => {
    takeOver();
    play(1000);
    expect(fake.opened).toEqual([{ id: 'territory.takeover', props: { veedelId: 'ehrenfeld', from: null } }]);
  });

  it.each([
    ['Tour', { tour: 'tutorial:7' }],
    ['Gespräch', { call: { messageId: 1 } }],
    ['Menü', { popover: 'menu' }],
    ['Suche', { palette: true }],
    ['Kartenklick', { picking: { prompt: 'Wo?' } }],
    ['Dialog', { dialog: { id: 'encounters.result', props: {} } }],
  ])('wartet bei %s und kommt danach', (_name, busy) => {
    takeOver();
    Object.assign(fake.ui, busy);
    play(4000);
    expect(fake.opened).toEqual([]);
    Object.assign(fake.ui, freeUi());
    play(1500);
    expect(fake.opened.map((o) => o.id)).toEqual(['territory.takeover']);
  });

  it('am Handy-Bildschirm wartet es, solange das Handy offen ist', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    takeOver();
    play(4000);
    expect(fake.opened).toEqual([]);
    (fake.ui as { phone: { open: boolean } }).phone.open = false;
    play(1500);
    expect(fake.opened.map((o) => o.id)).toEqual(['territory.takeover']);
  });
});
