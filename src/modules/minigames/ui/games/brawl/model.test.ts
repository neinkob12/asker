// Spiellogik vom Straßenkampf (Auftrag 44, Teil 2), ohne DOM.

import { describe, expect, it } from 'vitest';
import {
  ATTACKS,
  type BrawlInput,
  type BrawlSetup,
  type BrawlState,
  brawlPicks,
  brawlScore,
  createBrawl,
  type Fighter,
  FOE_TELL,
  fighterById,
  finished,
  foesLeft,
  initBrawl,
  moveReady,
  playerOf,
  stepBrawl,
  timeLeft,
} from './model';

const DT = 1 / 60;

const PARAMS = {
  setting: 'spot',
  phase: 'night',
  weather: 'rain',
  opponent: { label: 'Leute von Schäl Sick', strength: 50, count: 3, roles: ['leader', 'nervous', 'bruiser'] },
  intent: { id: 'grabGoods', label: 'Sie gehen auf die Ware', stake: 'goods' },
  crew: [
    {
      id: 's1',
      name: 'Kalle Brück',
      stats: { speed: 50, caution: 50, strength: 70, charisma: 30 },
      condition: 'ok',
      move: 'block',
      age: 31,
    },
    {
      id: 's2',
      name: 'Aylin Demir',
      stats: { speed: 80, caution: 40, strength: 40, charisma: 70 },
      condition: 'ok',
      move: 'secondTalk',
      age: 24,
    },
    { id: 's3', name: 'Weg', stats: {}, condition: 'down', move: null, age: 40 },
  ],
  player: { stats: { strength: 60, speed: 50 }, condition: 'ok' },
  clock: 4,
};

function setup(params: Record<string, unknown> = PARAMS, difficulty = 0.5): BrawlSetup {
  return createBrawl(7, difficulty, params);
}

function run(s: BrawlSetup, state: BrawlState, seconds: number, input: (t: number) => BrawlInput = () => ({ dx: 0 })) {
  const events = [];
  for (let t = 0; t < seconds; t += DT) events.push(...stepBrawl(s, state, DT, input(t)));
  return events;
}

/** Alle anderen außer Gefecht setzen (für Tests mit einem Gegner). */
function only(state: BrawlState, keep: string[]): void {
  for (const f of state.fighters) {
    if (f.kind === 'player' || keep.includes(f.id)) continue;
    f.out = f.side === 'foe' ? 'down' : null;
    f.state = 'down';
    f.hp = f.side === 'foe' ? 0 : f.hp;
  }
}

function place(f: Fighter, x: number, lane: 0 | 1 = 0, facing: 1 | -1 = -1): void {
  f.x = x;
  f.lane = lane;
  f.depth = lane;
  f.facing = facing;
  f.state = 'idle';
  f.t = 0;
  f.vx = 0;
}

function foe(state: BrawlState, i: number): Fighter {
  const f = fighterById(state, `foe:${i}`);
  if (!f) throw new Error('Gegner fehlt');
  return f;
}

function crew(state: BrawlState, id: string): Fighter {
  const f = fighterById(state, id);
  if (!f) throw new Error('Crew fehlt');
  return f;
}

describe('Straßenkampf: Aufbau', () => {
  it('liest Gegner, Rollen, Crew, Absicht und Polizei-Uhr aus den params', () => {
    const s = setup();
    expect(s.foes.map((f) => f.kind)).toEqual(['leader', 'nervous', 'bruiser']);
    // Wer schon am Boden ist, kämpft nicht mit.
    expect(s.own.map((f) => f.id)).toEqual(['player', 's1', 's2']);
    expect(s.own[1].move).toBe('block');
    expect(s.loot).not.toBeNull();
    expect(s.callout).toContain('Ware');
    expect(s.duration).toBeGreaterThanOrEqual(30);
    expect(s.duration).toBeLessThanOrEqual(80);
    // Schläger halten mehr aus als der Nervöse.
    expect(s.foes[2].hp).toBeGreaterThan(s.foes[1].hp);
  });

  it('ohne Rollen: Anführer, Nervöser, dann Schläger; höchstens sechs; leere params gehen auch', () => {
    const s = setup({ opponent: { count: 9 } });
    expect(s.foes).toHaveLength(6);
    expect(s.foes.slice(0, 3).map((f) => f.kind)).toEqual(['leader', 'nervous', 'bruiser']);
    const empty = createBrawl(1, 0.5, {});
    expect(empty.foes.length).toBeGreaterThan(0);
    expect(empty.own).toHaveLength(1);
    expect(initBrawl(empty).fighters.length).toBe(empty.foes.length + 1);
  });

  it('Absicht Messer: der Anführer hat das Messer; Lärm macht die Uhr kürzer', () => {
    const knife = setup({ ...PARAMS, intent: { id: 'knife', label: 'Einer zieht ein Messer', stake: 'people' } });
    expect(knife.foes.find((f) => f.knife)?.kind).toBe('leader');
    expect(knife.loot).toBeNull();
    const noise = setup({ ...PARAMS, intent: { id: 'noise', label: '', stake: 'noise' } });
    expect(noise.duration).toBeLessThan(setup().duration);
  });

  it('gleicher Seed und gleiche Eingaben: gleicher Kampf', () => {
    const a = setup();
    const b = setup();
    const sa = initBrawl(a);
    const sb = initBrawl(b);
    const input = (t: number): BrawlInput => ({ dx: t < 1 ? 1 : 0, light: Math.floor(t * 4) % 2 === 0 });
    run(a, sa, 8, input);
    run(b, sb, 8, input);
    expect(sb.fighters.map((f) => [f.x.toFixed(3), f.hp])).toEqual(sa.fighters.map((f) => [f.x.toFixed(3), f.hp]));
  });
});

describe('Straßenkampf: Schläge', () => {
  it('ein leichter Schlag trifft nur in derselben Ebene und in Reichweite', () => {
    const s = setup();
    const state = initBrawl(s);
    only(state, ['foe:1']);
    const p = playerOf(state);
    const f = foe(state, 1);
    place(p, 5, 0, 1);
    place(f, 5.8, 1);
    f.cooldown = 99;
    run(s, state, 0.5, (t) => ({ dx: 0, light: t === 0 }));
    expect(f.hp).toBe(f.maxHp);
    place(f, 5.8, 0);
    const events = run(s, state, 0.5, (t) => ({ dx: 0, light: t === 0 }));
    expect(f.hp).toBeLessThan(f.maxHp);
    expect(events.some((e) => e.type === 'hit' && e.target === 'foe:1')).toBe(true);
  });

  it('Gegner kündigen den Angriff an (Ansage), bevor er trifft', () => {
    const s = setup({ ...PARAMS, crew: [] }, 0);
    const state = initBrawl(s);
    only(state, ['foe:2']);
    const p = playerOf(state);
    const f = foe(state, 2);
    place(p, 5, 0, 1);
    place(f, 5.9, 0);
    f.cooldown = 0;
    const events = run(s, state, FOE_TELL.heavy * 0.9);
    expect(events.some((e) => e.type === 'telegraph' && e.id === 'foe:2')).toBe(true);
    expect(p.hp).toBe(p.maxHp);
    run(s, state, 1);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('Block hält fast alles ab; im letzten Moment ist es ein Konter mit Zeitlupe und doppeltem Schaden', () => {
    const s = setup({ ...PARAMS, crew: [] }, 0);
    // Gehaltener Block: wenig Schaden.
    const held = initBrawl(s);
    only(held, ['foe:2']);
    const p = playerOf(held);
    const f = foe(held, 2);
    place(p, 5, 0, 1);
    place(f, 5.9, 0);
    f.cooldown = 0;
    run(s, held, 1.5, () => ({ dx: 0, block: true }));
    expect(p.maxHp - p.hp).toBeGreaterThan(0);
    expect(p.maxHp - p.hp).toBeLessThan(ATTACKS.heavy.damage * f.power * 0.5);

    // Block erst kurz vor dem Treffer: Konter.
    const late = initBrawl(s);
    only(late, ['foe:2']);
    const p2 = playerOf(late);
    const f2 = foe(late, 2);
    place(p2, 5, 0, 1);
    place(f2, 5.9, 0);
    f2.cooldown = 0;
    run(s, late, DT); // holt aus
    expect(f2.state).toBe('windup');
    const wait = f2.dur - 0.1;
    run(s, late, wait);
    const events = run(s, late, 0.4, () => ({ dx: 0, block: true }));
    expect(events.some((e) => e.type === 'parry')).toBe(true);
    expect(p2.hp).toBe(p2.maxHp);
    expect(late.counterUntil).toBeGreaterThan(late.time);
    // Der nächste Schlag zählt doppelt.
    const before = f2.hp;
    const hitEvents = run(s, late, 0.5, (t) => ({ dx: 0, light: t < DT }));
    const hit = hitEvents.find((e) => e.type === 'hit' && e.target === 'foe:2');
    expect(hit && hit.type === 'hit' && hit.counter).toBe(true);
    expect(before - f2.hp).toBeGreaterThanOrEqual(Math.round(ATTACKS.light.damage * p2.power * 2) - 1);
  });

  it('Ausweichen macht kurz unverwundbar', () => {
    const s = setup({ ...PARAMS, crew: [] }, 0);
    const state = initBrawl(s);
    only(state, ['foe:2']);
    const p = playerOf(state);
    const f = foe(state, 2);
    place(p, 5, 0, 1);
    place(f, 5.9, 0);
    f.cooldown = 0;
    run(s, state, DT);
    run(s, state, f.dur - 0.12);
    const events = run(s, state, 0.3, (t) => ({ dx: 0, dodge: t < DT }));
    expect(p.hp).toBe(p.maxHp);
    expect(events.some((e) => e.type === 'parry' && e.how === 'dodge')).toBe(true);
  });

  it('der Anführer blockt leichte Schläge, ein schwerer bricht die Deckung', () => {
    const s = setup({ ...PARAMS, crew: [] }, 1);
    const state = initBrawl(s);
    only(state, ['foe:0']);
    const p = playerOf(state);
    const leader = foe(state, 0);
    place(p, 5, 0, 1);
    place(leader, 5.9, 0);
    leader.cooldown = 99;
    leader.state = 'block';
    leader.dur = 5;
    leader.blockSince = 0;
    const light = run(s, state, 0.4, (t) => ({ dx: 0, light: t < DT }));
    expect(light.find((e) => e.type === 'hit')).toMatchObject({ blocked: true });
    place(leader, 5.9, 0);
    leader.state = 'block';
    leader.dur = 5;
    leader.cooldown = 99;
    const heavy = run(s, state, 0.8, (t) => ({ dx: 0, heavy: t < DT }));
    expect(heavy.some((e) => e.type === 'guardBreak')).toBe(true);
  });

  it('Deckung durch die Crew fängt den nächsten Treffer ab', () => {
    const s = setup(PARAMS, 0);
    const state = initBrawl(s);
    only(state, ['foe:2', 's1']);
    const p = playerOf(state);
    const f = foe(state, 2);
    place(p, 5, 0, 1);
    place(f, 5.9, 0);
    const kalle = crew(state, 's1');
    kalle.x = 1;
    kalle.lane = 1;
    f.cooldown = 0;
    f.target = 'player';
    expect(moveReady(state, 's1')).toBe(0);
    const events = run(s, state, 1.4, (t) => ({ dx: 0, special: t < DT ? 's1' : null }));
    expect(events.some((e) => e.type === 'guarded' && e.by === 's1')).toBe(true);
    expect(moveReady(state, 's1')).toBeGreaterThan(0);
  });
});

describe('Straßenkampf: Ende und Ergebnis', () => {
  it('alle Gegner am Boden: gewonnen, Score mindestens 0,6, picks down:<n>', () => {
    const s = setup({ ...PARAMS, crew: [], intent: null });
    const state = initBrawl(s);
    for (const f of state.fighters) if (f.side === 'foe') f.hp = 1;
    // Hinlaufen und schlagen, bis keiner mehr steht.
    run(s, state, 40, (t) => {
      const p = playerOf(state);
      const target = foesLeft(state)[0];
      if (!target) return { dx: 0 };
      if (target.lane !== p.lane) return { dx: 0, lane: target.lane > p.lane ? -1 : 1 };
      const dx = target.x - p.x;
      if (Math.abs(dx) > 0.9) return { dx: dx > 0 ? 1 : -1 };
      return { dx: 0, light: Math.floor(t * 10) % 2 === 0 };
    });
    expect(state.end).toBe('won');
    expect(finished(state)).toBe(true);
    expect(brawlScore(state)).toBeGreaterThanOrEqual(0.6);
    const picks = brawlPicks(state);
    const down = Number(picks.find((p) => p.startsWith('down:'))?.slice(5) ?? 0);
    const fled = Number(picks.find((p) => p.startsWith('fled:'))?.slice(5) ?? 0);
    expect(down + fled).toBe(3);
    expect(picks).not.toContain('ko');
  });

  it('du gehst zu Boden: ko, Score höchstens 0,3', () => {
    const s = setup({ ...PARAMS, crew: [] });
    const state = initBrawl(s);
    playerOf(state).hp = 1;
    run(s, state, 30);
    expect(state.end).toBe('ko');
    expect(brawlPicks(state)).toContain('ko');
    expect(brawlScore(state)).toBeLessThanOrEqual(0.3);
  });

  it('die Polizei-Uhr läuft ab: Sirenen, wer dann wegrennt, zählt nicht als abgehauen', () => {
    const s = setup({ ...PARAMS, crew: [], intent: null }, 0);
    const state = initBrawl(s);
    // Keiner greift an.
    for (const f of state.fighters) f.hesitate = 999;
    run(s, state, s.duration + 0.5);
    expect(timeLeft(s, state)).toBe(0);
    expect(state.end).toBe('sirens');
    run(s, state, 3);
    const picks = brawlPicks(state);
    expect(picks).toContain('sirens');
    expect(picks.some((p) => p.startsWith('fled:'))).toBe(false);
    expect(brawlScore(state)).toBe(0);
  });

  it('der Nervöse haut nach genug Treffern ab (fled)', () => {
    const s = setup({ ...PARAMS, crew: [], intent: null });
    const state = initBrawl(s);
    only(state, ['foe:1', 'foe:0']);
    const nervous = foe(state, 1);
    nervous.hp = Math.round(nervous.maxHp * 0.55);
    nervous.cooldown = 99;
    const p = playerOf(state);
    place(p, 5, 0, 1);
    place(nervous, 5.8, 0);
    foe(state, 0).x = 15;
    foe(state, 0).hesitate = 99;
    for (let i = 0; i < 6 && !nervous.fleeing; i++) {
      place(nervous, 5.8, 0);
      nervous.cooldown = 99;
      run(s, state, 0.4, (t) => ({ dx: 0, light: t < DT }));
    }
    expect(nervous.fleeing).toBe(true);
    run(s, state, 6);
    expect(nervous.out).toBe('fled');
    expect(brawlPicks(state)).toContain('fled:1');
  });

  it('einer kommt an die Beute: grabbed, er ist weg und zählt nicht für den Score', () => {
    const s = setup({ ...PARAMS, crew: [] }, 0);
    const state = initBrawl(s);
    for (const f of state.fighters) if (f.side === 'foe' && !f.grabber) f.hesitate = 999;
    const events = run(s, state, 12);
    expect(events.some((e) => e.type === 'grabStart')).toBe(true);
    expect(events.some((e) => e.type === 'grabbed')).toBe(true);
    expect(state.grabbed).toBe(true);
    expect(brawlPicks(state)).toContain('grabbed');
    expect(brawlScore(state)).toBe(0);
  });

  it('verletzte Crew: hurt:<id>, außer Gefecht zweimal; dein Leben unter der Hälfte: playerHurt', () => {
    const s = setup(PARAMS);
    const state = initBrawl(s);
    const kalle = crew(state, 's1');
    const aylin = crew(state, 's2');
    kalle.hp = 0;
    aylin.hp = Math.round(aylin.maxHp * 0.3);
    playerOf(state).hp = 40;
    const picks = brawlPicks(state);
    expect(picks.filter((p) => p === 'hurt:s1')).toHaveLength(2);
    expect(picks.filter((p) => p === 'hurt:s2')).toHaveLength(1);
    expect(picks).toContain('playerHurt');
    expect(picks.length).toBeLessThanOrEqual(20);
  });
});
