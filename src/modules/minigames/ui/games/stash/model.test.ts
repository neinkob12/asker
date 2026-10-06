import { describe, expect, it } from 'vitest';
import {
  CARRY_SPEED,
  canHide,
  createStash,
  grab,
  hideAt,
  initStash,
  nextLoose,
  packageAt,
  release,
  type StashInput,
  type StashSetup,
  type StashState,
  send,
  stashCounts,
  stashPicks,
  stashScore,
  steer,
  step,
  streetClosed,
  timeLeft,
  WET_FACTOR,
} from './model';

const LAGER: StashInput = {
  setting: 'warehouse',
  lots: [
    { productId: 'weed', name: 'Gras', amount: 1200, unit: 'g', grams: 1200, value: 13200 },
    { productId: 'kush', name: 'OG Kush', amount: 300, unit: 'g', grams: 300, value: 5400 },
    { productId: 'edibles', name: 'Edibles', amount: 60, unit: 'Stück', grams: 300, value: 900 },
  ],
  money: 2400,
  warehouse: { vault: 1, cover: 0 },
};

const SPOT: StashInput = {
  setting: 'street',
  lots: [
    { productId: 'weed', name: 'Gras', amount: 15, unit: 'g', grams: 15, value: 165 },
    { productId: 'hash', name: 'Hasch', amount: 8, unit: 'g', grams: 8, value: 80 },
  ],
  money: 120,
};

/** So lange laufen lassen, bis nichts mehr getragen wird (oder die Zeit um ist). */
function settle(setup: StashSetup, state: StashState): void {
  for (let i = 0; i < 400 && state.carry && !state.done; i++) step(setup, state, 0.05);
}

describe('Razzia-Countdown: Modell', () => {
  it('gleicher Seed, gleiche Szene; schwerer heißt mehr Pakete und weniger Zeit', () => {
    expect(createStash(5, 0.5, LAGER)).toEqual(createStash(5, 0.5, LAGER));
    const easy = createStash(5, 0, LAGER);
    const hard = createStash(5, 1, LAGER);
    expect(easy.duration).toBe(30);
    expect(hard.duration).toBe(20);
    expect(hard.packages.length).toBeGreaterThan(easy.packages.length);
    expect(hard.closeAt).toBe(13);
  });

  it('jede Partie bekommt mindestens ein Paket, Schwarzgeld ist ein Bündel, Werte gehen auf', () => {
    const setup = createStash(2, 0.5, LAGER);
    const products = new Set(setup.packages.map((p) => p.productId));
    expect(products).toEqual(new Set(['weed', 'kush', 'edibles', null]));
    expect(setup.totalValue).toBeCloseTo(13200 + 5400 + 900 + 2400, -1);
    const weed = setup.packages.filter((p) => p.productId === 'weed');
    expect(weed.reduce((s, p) => s + p.amount, 0)).toBe(1200);
    // Das schwerste Paket ist groß, die Edibles sind klein.
    expect(Math.max(...setup.packages.map((p) => p.size))).toBe(3);
    expect(setup.packages.find((p) => p.productId === 'edibles')?.size).toBeLessThan(3);
  });

  it('Verstecke im Lager: Tresor nur mit Ausbau, Platz nach Stufe, der Boden wächst mit der Tarnung', () => {
    const without = createStash(1, 0.5, { ...LAGER, warehouse: { vault: 0, cover: 0 } });
    expect(without.hides.map((h) => h.id)).toEqual(['floor', 'vent', 'trunk', 'drain']);
    const full = createStash(1, 0.5, { ...LAGER, warehouse: { vault: 2, cover: 2 } });
    expect(full.hides.find((h) => h.id === 'vault')?.capacity).toBe(7);
    expect(full.hides.find((h) => h.id === 'floor')?.capacity).toBe(6);
    const street = createStash(1, 0.5, SPOT);
    expect(street.hides.map((h) => h.id)).toEqual(['planter', 'mailbox', 'bin', 'drain']);
    expect(street.closeAt).toBeNull();
  });

  it('ein Paket wird hingetragen und verstaut, das dauert nach Größe und Versteck', () => {
    const setup = createStash(3, 0.3, LAGER);
    const state = initStash(setup);
    const small = setup.packages.find((p) => p.size === 1) ?? setup.packages[0];
    expect(send(setup, state, small.id, 'vault')).toBe('ok');
    // Nur eins zur Zeit.
    const other = setup.packages.find((p) => p.id !== small.id)?.id ?? 0;
    expect(send(setup, state, other, 'trunk')).toBe('busy');
    const events = [];
    for (let i = 0; i < 200 && state.carry; i++) events.push(...step(setup, state, 0.05));
    expect(events.map((e) => e.type)).toEqual(['arrived', 'stowed']);
    expect(state.items[small.id].hide).toBe('vault');
    expect(state.used.vault).toBe(small.size);
    const hide = setup.hides.find((h) => h.id === 'vault');
    const dist = Math.hypot(
      (hide?.x ?? 0) + (hide?.w ?? 0) / 2 - small.x,
      (hide?.y ?? 0) + (hide?.h ?? 0) / 2 - small.y,
    );
    expect(state.time).toBeGreaterThanOrEqual(dist / CARRY_SPEED[small.size] + (hide?.stow ?? 0) - 0.06);
  });

  it('zu groß, voll, draußen zu', () => {
    const setup = createStash(3, 0.5, LAGER);
    const state = initStash(setup);
    const big = setup.packages.find((p) => p.size === 3);
    expect(big).toBeDefined();
    expect(canHide(setup, state, big?.id ?? 0, 'vent')).toBe('tooBig');
    expect(canHide(setup, state, big?.id ?? 0, 'drain')).toBe('tooBig');
    state.used.trunk = 4;
    expect(canHide(setup, state, big?.id ?? 0, 'trunk')).toBe('full');
    state.used.trunk = 0;
    state.time = (setup.closeAt ?? 0) + 0.1;
    expect(streetClosed(setup, state)).toBe(true);
    expect(canHide(setup, state, big?.id ?? 0, 'trunk')).toBe('closed');
    expect(canHide(setup, state, big?.id ?? 0, 'vault')).toBe('ok');
  });

  it('Ziehen: das Paket folgt dem Finger, losgelassen über einem Versteck läuft es hinein, sonst bleibt es liegen', () => {
    const setup = createStash(4, 0.5, LAGER);
    const state = initStash(setup);
    const p = setup.packages[0];
    expect(packageAt(setup, state, p.x + 1, p.y - 1)).toBe(p.id);
    expect(grab(state, p.id)).toBe(true);
    expect(packageAt(setup, state, p.x, p.y)).toBe(-1);
    steer(state, 50, 60);
    for (let i = 0; i < 4; i++) step(setup, state, 0.05);
    const moved = state.items[p.id];
    expect(Math.hypot(moved.x - p.x, moved.y - p.y)).toBeGreaterThan(1);
    expect(release(setup, state, null)).toBe('ok');
    expect(state.carry).toBeNull();
    expect(state.items[p.id].hide).toBeNull();
    // Noch einmal, diesmal über dem Gully loslassen (klein genug?).
    const small = setup.packages.find((x) => x.size <= 2) ?? p;
    grab(state, small.id);
    const drain = setup.hides.find((h) => h.id === 'drain');
    expect(hideAt(setup, (drain?.x ?? 0) + 2, (drain?.y ?? 0) + 2)).toBe('drain');
    expect(release(setup, state, 'drain')).toBe('ok');
    settle(setup, state);
    expect(state.items[small.id].hide).toBe('drain');
  });

  it('Score nach Wert, nasse Ware zählt weniger; alles versteckt beendet das Spiel früh', () => {
    const setup = createStash(6, 0, SPOT);
    const state = initStash(setup);
    expect(stashScore(setup, state)).toBe(0);
    const order: Record<number, 'bin' | 'drain'> = {};
    for (const p of setup.packages) order[p.id] = 'bin';
    const wetOne = setup.packages.find((p) => p.size <= 2) ?? setup.packages[0];
    order[wetOne.id] = 'drain';
    for (const p of setup.packages) {
      expect(send(setup, state, p.id, order[p.id])).toBe('ok');
      settle(setup, state);
    }
    expect(state.done).toBe(true);
    expect(state.cleared).toBe(true);
    const expected = (setup.totalValue - wetOne.value * (1 - WET_FACTOR)) / setup.totalValue;
    expect(stashScore(setup, state)).toBeCloseTo(expected, 2);
    expect(stashCounts(setup, state)).toEqual({ hidden: setup.packages.length, wet: 1, left: 0 });
    expect(stashPicks(setup, state)).toContain('drain:1');
  });

  it('Zeit um: was liegt, ist weg; was gerade verstaut wird, ist drin', () => {
    const setup = createStash(7, 0.5, LAGER);
    const state = initStash(setup);
    const p = setup.packages.find((x) => x.size <= 2) ?? setup.packages[0];
    expect(send(setup, state, p.id, 'floor')).toBe('ok');
    // Bis zum Verstauen tragen, dann die Zeit ablaufen lassen.
    for (let i = 0; i < 200 && state.carry && state.carry.stowing < 0; i++) step(setup, state, 0.05);
    state.time = setup.duration - 0.01;
    const events = step(setup, state, 0.05);
    expect(events.some((e) => e.type === 'timeUp')).toBe(true);
    expect(state.done).toBe(true);
    expect(timeLeft(setup, state)).toBe(0);
    expect(state.items[p.id].hide).toBe('floor');
    expect(stashPicks(setup, state)).toContain(`left:${setup.packages.length - 1}`);
    expect(send(setup, state, p.id === 1 ? 2 : 1, 'vault')).toBe('done');
  });

  it('Auswahl springt über versteckte Pakete', () => {
    const setup = createStash(8, 0.5, LAGER);
    const state = initStash(setup);
    state.items[1].hide = 'vault';
    state.selected = 0;
    expect(nextLoose(setup, state, 1)).toBe(2);
    expect(nextLoose(setup, state, -1)).toBe(setup.packages.length - 1);
  });

  it('kommt ohne Ware aus (leere Szene, Score 0)', () => {
    const setup = createStash(1, 0.5, { setting: 'warehouse', lots: [], money: 0 });
    expect(setup.packages).toEqual([]);
    const state = initStash(setup);
    expect(state.selected).toBe(-1);
    expect(stashScore(setup, state)).toBe(0);
  });
});
