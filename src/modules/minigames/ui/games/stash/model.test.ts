import { describe, expect, it } from 'vitest';
import {
  act,
  bestMove,
  CARRY_SPEED,
  canHide,
  contextOf,
  createStash,
  getHide,
  goTo,
  hideCenter,
  initStash,
  isLoose,
  RUN_SPEED,
  rightLimit,
  type StashEvent,
  type StashInput,
  type StashSetup,
  type StashState,
  savedValue,
  send,
  sendTo,
  stashCounts,
  stashPicks,
  stashScore,
  stashStats,
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

const DT = 1 / 30;

/** So lange laufen lassen, bis du nichts mehr vorhast (oder die Zeit um ist). */
function settle(setup: StashSetup, state: StashState, max = 30): StashEvent[] {
  const events: StashEvent[] = [];
  for (let t = 0; t < max && (state.goal || state.action) && !state.done; t += DT)
    events.push(...step(setup, state, DT));
  return events;
}

/**
 * Bot: nimmt immer den besten Zug (bestMove) und braucht für jede Entscheidung reaction Sekunden (ein Mensch schaut
 * erst hin). Gibt den Score zurück.
 */
function play(setup: StashSetup, reaction: number): { state: StashState; score: number } {
  const state = initStash(setup);
  let wait = reaction;
  for (let i = 0; i < 60 * 30 && !state.done; i++) {
    if (!state.goal && !state.action) {
      wait -= DT;
      if (wait <= 0) {
        const move = bestMove(setup, state);
        if (move) send(setup, state, move.id, move.hide);
        wait = reaction;
      }
    }
    step(setup, state, DT);
  }
  return { state, score: stashScore(setup, state) };
}

function average(input: StashInput, difficulty: number, reaction: number): number {
  let sum = 0;
  for (let seed = 1; seed <= 30; seed++) sum += play(createStash(seed, difficulty, input), reaction).score;
  return sum / 30;
}

describe('Razzia-Lauf: Szene', () => {
  it('gleicher Seed, gleiche Szene; schwerer heißt mehr Pakete und weniger Zeit', () => {
    expect(createStash(3, 0.5, LAGER)).toEqual(createStash(3, 0.5, LAGER));
    const easy = createStash(3, 0, LAGER);
    const hard = createStash(3, 1, LAGER);
    expect(hard.packages.length).toBeGreaterThan(easy.packages.length);
    expect(hard.duration).toBeLessThan(easy.duration);
    expect(easy.closeAt).toBe(easy.duration - 7);
    expect(createStash(3, 0.5, SPOT).closeAt).toBeNull();
    expect(createStash(3, 0.5, SPOT).gate).toBeNull();
  });

  it('jede Partie bekommt mindestens ein Paket, Schwarzgeld ist ein Bündel, Werte gehen auf', () => {
    const setup = createStash(4, 0.5, LAGER);
    for (const lot of LAGER.lots) expect(setup.packages.some((p) => p.productId === lot.productId)).toBe(true);
    expect(setup.packages.filter((p) => p.productId === null)).toHaveLength(1);
    const total = LAGER.lots.reduce((s, l) => s + l.value, 0) + LAGER.money;
    expect(Math.abs(setup.totalValue - total)).toBeLessThanOrEqual(setup.packages.length);
  });

  it('Pakete liegen auf eigenen Plätzen drinnen, große nie oben im Regal', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const setup = createStash(seed, 1, LAGER);
      const xs = setup.packages.map((p) => `${Math.round(p.x)}:${p.shelf}`);
      expect(new Set(xs).size).toBe(xs.length);
      for (const p of setup.packages) {
        expect(p.x).toBeLessThan(setup.gate as number);
        if (p.size === 3) expect(p.shelf).toBe(0);
      }
    }
  });

  it('Verstecke im Lager: Tresor nur mit Ausbau, Platz nach Stufe, der Boden wächst mit der Tarnung', () => {
    const plain = createStash(1, 0.5, { ...LAGER, warehouse: { vault: 0, cover: 0 } });
    expect(plain.hides.map((h) => h.id)).toEqual(['vent', 'floor', 'trunk', 'drain']);
    const big = createStash(1, 0.5, { ...LAGER, warehouse: { vault: 2, cover: 2 } });
    expect(getHide(big, 'vault')?.capacity).toBe(7);
    expect(getHide(big, 'floor')?.capacity).toBe(6);
    // Von links nach rechts, draußen hinter dem Tor.
    const xs = big.hides.map((h) => h.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const h of big.hides) expect(h.outside).toBe(h.x > (big.gate as number));
  });
});

describe('Razzia-Lauf: Laufen, Tragen, Verstecken', () => {
  it('mit ←/→ laufen; Tragen macht langsam, große Pakete am meisten', () => {
    const setup = createStash(2, 0.5, LAGER);
    const state = initStash(setup);
    const x0 = state.x;
    for (let t = 0; t < 1; t += DT) step(setup, state, DT, 1);
    expect(state.x - x0).toBeGreaterThan(RUN_SPEED * 0.8);
    expect(state.facing).toBe(1);
    expect(CARRY_SPEED[3]).toBeLessThan(CARRY_SPEED[2]);
    expect(CARRY_SPEED[2]).toBeLessThan(CARRY_SPEED[1]);
    expect(CARRY_SPEED[1]).toBeLessThan(RUN_SPEED);
  });

  it('Antippen: hinlaufen, aufheben (dauert), dann ein Versteck antippen und verstauen', () => {
    const setup = createStash(2, 0.5, LAGER);
    const state = initStash(setup);
    const pkg = setup.packages.find((p) => p.size === 2) ?? setup.packages[0];
    expect(goTo(setup, state, { kind: 'package', id: pkg.id })).toBe(true);
    const picked = settle(setup, state);
    expect(picked.map((e) => e.type)).toContain('picked');
    expect(state.carry).toBe(pkg.id);
    expect(isLoose(state, pkg.id)).toBe(false);
    goTo(setup, state, { kind: 'hide', id: 'floor' });
    const t0 = state.time;
    const stowed = settle(setup, state);
    expect(stowed.map((e) => e.type)).toEqual(['stowing', 'stowed']);
    expect(state.items[pkg.id].hide).toBe('floor');
    expect(state.carry).toBeNull();
    // Laufen plus Verstauen: mindestens die Strecke im Trage-Tempo.
    const floor = getHide(setup, 'floor');
    if (!floor) throw new Error('kein Boden');
    expect(state.time - t0).toBeGreaterThan(floor.stow);
  });

  it('Leertaste macht, was gerade geht: aufheben, verstauen, sonst ablegen', () => {
    const setup = createStash(2, 0.5, LAGER);
    const state = initStash(setup);
    const pkg = setup.packages[0];
    state.x = state.items[pkg.id].x;
    expect(contextOf(setup, state)).toEqual({ kind: 'pickup', id: pkg.id });
    act(setup, state);
    settle(setup, state);
    expect(state.carry).toBe(pkg.id);
    // Mitten im Raum: ablegen.
    state.x = 13.5;
    expect(contextOf(setup, state).kind).toBe('drop');
    act(setup, state);
    expect(state.carry).toBeNull();
    expect(state.items[pkg.id].x).toBe(13.5);
    // Vor dem Versteck: verstauen (wenn es passt).
    act(setup, state);
    settle(setup, state);
    expect(state.carry).toBe(pkg.id);
    const trunk = getHide(setup, 'trunk');
    if (!trunk) throw new Error('kein Kofferraum');
    state.x = hideCenter(trunk);
    expect(contextOf(setup, state)).toEqual({ kind: 'stow', hide: 'trunk', check: 'ok' });
    act(setup, state);
    settle(setup, state);
    expect(state.items[pkg.id].hide).toBe('trunk');
  });

  it('selbst laufen bricht das Hinlaufen ab', () => {
    const setup = createStash(2, 0.5, LAGER);
    const state = initStash(setup);
    goTo(setup, state, { kind: 'point', x: 2 });
    step(setup, state, DT);
    step(setup, state, DT, 1);
    expect(state.goal).toBeNull();
  });

  it('zu groß, voll, draußen zu', () => {
    const setup = createStash(6, 1, { ...LAGER, warehouse: { vault: 0, cover: 0 } });
    const state = initStash(setup);
    const big = setup.packages.find((p) => p.size >= 2);
    if (!big) throw new Error('kein großes Paket');
    expect(canHide(setup, state, big.id, 'vent')).toBe('tooBig');
    const small = setup.packages.find((p) => p.size <= 2);
    if (!small) throw new Error('kein kleines Paket');
    state.used.floor = getHide(setup, 'floor')?.capacity;
    expect(canHide(setup, state, small.id, 'floor')).toBe('full');
    state.time = setup.closeAt as number;
    expect(streetClosed(setup, state)).toBe(true);
    expect(canHide(setup, state, setup.packages[0].id, 'trunk')).toBe('closed');
    expect(sendTo(setup, state, 'trunk')).toBe('closed');
  });

  it('Versteck lehnt ab, wenn du ankommst: Paket bleibt in der Hand', () => {
    const setup = createStash(6, 1, LAGER);
    const state = initStash(setup);
    const big = setup.packages.find((p) => p.size === 3);
    if (!big) throw new Error('kein großes Paket');
    goTo(setup, state, { kind: 'package', id: big.id });
    settle(setup, state);
    goTo(setup, state, { kind: 'hide', id: 'vent' });
    const events = settle(setup, state);
    expect(events).toContainEqual({ type: 'refused', id: big.id, hide: 'vent', check: 'tooBig' });
    expect(state.carry).toBe(big.id);
    expect(state.goal).toBeNull();
  });

  it('Taste für ein Versteck holt das nächste Paket, das passt', () => {
    const setup = createStash(6, 0.5, LAGER);
    const state = initStash(setup);
    expect(sendTo(setup, state, 'vent')).toBe('ok');
    settle(setup, state);
    const inVent = setup.packages.filter((p) => state.items[p.id].hide === 'vent');
    expect(inVent).toHaveLength(1);
    expect(inVent[0].size).toBe(1);
  });
});

describe('Razzia-Lauf: Tor und Zeit', () => {
  it('Tor zu: wer nach draußen läuft, bleibt drinnen stehen, das Paket in der Hand', () => {
    const setup = createStash(5, 1, { ...LAGER, warehouse: { vault: 0, cover: 0 } });
    const state = initStash(setup);
    const pkg = setup.packages.find((p) => canHide(setup, state, p.id, 'drain') === 'ok');
    if (!pkg) throw new Error('kein passendes Paket');
    state.x = state.items[pkg.id].x;
    act(setup, state);
    settle(setup, state);
    state.time = (setup.closeAt as number) - 0.3;
    expect(send(setup, state, pkg.id, 'drain')).toBe('ok');
    const types = settle(setup, state).map((e) => e.type);
    expect(types).toContain('closed');
    expect(types).not.toContain('stowed');
    expect(state.carry).toBe(pkg.id);
    expect(state.x).toBeLessThanOrEqual(rightLimit(setup, state));
    expect(savedValue(setup, state)).toBe(0);
  });

  it('wer beim Schließen draußen steht, wird reingeschoben; was dort schon verstaut wird, ist drin', () => {
    const setup = createStash(5, 1, LAGER);
    const outside = initStash(setup);
    outside.x = 25;
    outside.time = (setup.closeAt as number) - 0.01;
    const pushed = step(setup, outside, DT).map((e) => e.type);
    expect(pushed).toEqual(['closed', 'pushed']);
    expect(outside.x).toBe(rightLimit(setup, outside));

    const state = initStash(setup);
    const trunk = getHide(setup, 'trunk');
    const pkg = setup.packages.find((p) => canHide(setup, state, p.id, 'trunk') === 'ok');
    if (!trunk || !pkg) throw new Error('kein Kofferraum');
    state.carry = pkg.id;
    state.x = hideCenter(trunk);
    state.time = (setup.closeAt as number) - 0.1;
    act(setup, state);
    const types = settle(setup, state).map((e) => e.type);
    expect(types).toContain('closed');
    expect(types).toContain('stowed');
    expect(state.items[pkg.id].hide).toBe('trunk');
  });

  it('Score nach Wert, nasse Ware zählt weniger; alles versteckt beendet das Spiel früh', () => {
    const setup = createStash(2, 0, SPOT);
    const state = initStash(setup);
    const first = setup.packages.find((p) => p.size <= 2);
    if (!first) throw new Error('kein Paket für den Gully');
    const rest = setup.packages.filter((p) => p.id !== first.id);
    state.carry = first.id;
    state.x = hideCenter(getHide(setup, 'drain') as never);
    act(setup, state);
    settle(setup, state);
    expect(state.items[first.id].hide).toBe('drain');
    expect(stashScore(setup, state)).toBeCloseTo((first.value * WET_FACTOR) / setup.totalValue, 2);
    for (const p of rest) {
      expect(send(setup, state, p.id, p.size === 1 ? 'mailbox' : 'bin')).toBe('ok');
      settle(setup, state);
    }
    expect(state.done).toBe(true);
    expect(state.cleared).toBe(true);
    expect(timeLeft(setup, state)).toBeGreaterThan(0);
    expect(stashCounts(setup, state)).toEqual({ hidden: setup.packages.length, wet: 1, left: 0 });
    expect(stashPicks(setup, state)).toContain('drain:1');
  });

  it('Zeit um: was liegt oder in der Hand ist, ist weg; was gerade verstaut wird, ist drin', () => {
    const setup = createStash(2, 0.5, LAGER);
    const state = initStash(setup);
    const a = setup.packages.find((p) => p.size <= 2);
    const b = setup.packages.find((p) => p.id !== a?.id);
    if (!a || !b) throw new Error('zu wenig Pakete');
    state.carry = a.id;
    state.x = hideCenter(getHide(setup, 'floor') as never);
    act(setup, state);
    state.time = setup.duration - 0.01;
    step(setup, state, DT);
    expect(state.done).toBe(true);
    expect(state.items[a.id].hide).toBe('floor');
    expect(state.items[b.id].hide).toBeNull();
    expect(stashPicks(setup, state)).toContain(`left:${setup.packages.length - 1}`);

    const holding = initStash(setup);
    holding.carry = a.id;
    holding.time = setup.duration - 0.01;
    step(setup, holding, DT);
    expect(holding.items[a.id].hide).toBeNull();
    expect(stashScore(setup, holding)).toBe(0);
  });

  it('kommt ohne Ware aus (leere Szene, Score 0)', () => {
    const setup = createStash(1, 0.5, { setting: 'warehouse', lots: [], money: 0 });
    expect(setup.packages).toHaveLength(0);
    const state = initStash(setup);
    expect(contextOf(setup, state)).toEqual({ kind: 'none' });
    expect(stashScore(setup, state)).toBe(0);
    for (let t = 0; t < setup.duration + 1; t += 0.5) step(setup, state, 0.5);
    expect(state.done).toBe(true);
  });
});

describe('Razzia-Lauf: Schwierigkeit (Bot mit Reaktionszeit)', () => {
  // Gemessen mit bestMove und 0,35 s Bedenkzeit pro Entscheidung (Stand Auftrag 48, siehe
  // docs/auftraege/48-minispiele-einbruch.md): Lager mit Tresor leicht ~0,95, mittel ~0,85, schwer ~0,7.
  it('leicht: fast alles zu retten; schwer: spürbar weniger, aber machbar', () => {
    const easy = average(LAGER, 0.2, 0.35);
    const mid = average(LAGER, 0.5, 0.35);
    const hard = average(LAGER, 0.9, 0.35);
    expect(easy).toBeGreaterThan(0.88);
    expect(hard).toBeLessThan(easy - 0.08);
    expect(hard).toBeGreaterThan(0.5);
    expect(mid).toBeLessThanOrEqual(easy + 0.001);
  });

  it('ohne Tresor ist es enger, am Spot schnell erledigt', () => {
    const plain = { ...LAGER, warehouse: { vault: 0, cover: 0 } };
    expect(average(plain, 0.9, 0.35)).toBeGreaterThan(0.4);
    expect(average(SPOT, 0.9, 0.35)).toBeGreaterThan(0.8);
  });
});

describe('Razzia-Lauf: Ergebnis-Werte', () => {
  it('versteckt, nass, gefunden; höchstens vier', () => {
    const setup = createStash(2, 0, SPOT);
    const state = initStash(setup);
    const pkg = setup.packages.find((p) => p.size <= 2);
    if (!pkg) throw new Error('kein Paket');
    state.items[pkg.id].hide = 'drain';
    state.done = true;
    const stats = stashStats(setup, state);
    expect(stats[0]).toMatchObject({ label: 'Versteckt', value: `1/${setup.packages.length}` });
    expect(stats.map((s) => s.label)).toEqual(['Versteckt', 'Nass', 'Gefunden']);
  });
});
