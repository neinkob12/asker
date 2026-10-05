// Auftrag 34, Etappe 1: Leute mit Geschichte (Eigenschaften, Beziehungen, Geschichten).

import { describe, expect, it } from 'vitest';
import { fillText, loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { STORY_GAP, TRAIT_EXCLUDES, TRAITS } from './config';
import {
  betrayalChance,
  enlist,
  expectedWage,
  generateProfile,
  getStaff,
  getStaffMember,
  openStories,
  relationBetween,
  relationsOf,
  rollTraits,
  STORIES,
  type StaffMember,
  type StaffRole,
  type StoryId,
  serveTime,
  startStory,
  storyChoices,
  type TraitId,
  talkChance,
} from './index';
import { addRelation } from './traits';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, patch: Partial<StaffMember> = {}): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role), { origin: 'pool' });
  Object.assign(member, patch);
  return member;
}

function answer(sim: Simulation, storyId: string, choice: string) {
  return sim.dispatch({ type: 'staff.storyChoice', payload: { storyId, choice } });
}

describe('Eigenschaften', () => {
  it('zwei bis drei, ohne ausgeschlossene Paare, fest aus dem Schlüssel', () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 300; i++) {
      const traits = rollTraits(`k${i}`);
      counts.set(traits.length, (counts.get(traits.length) ?? 0) + 1);
      expect(new Set(traits).size).toBe(traits.length);
      for (const [a, b] of TRAIT_EXCLUDES) expect(traits.includes(a) && traits.includes(b)).toBe(false);
      expect(rollTraits(`k${i}`)).toEqual(traits);
    }
    expect([...counts.keys()].sort()).toEqual([2, 3]);
  });

  it('jede Person bekommt beim Einstellen Eigenschaften, auch von der Straße', () => {
    const sim = quietGame();
    const pool = recruit(sim, 'runner');
    expect(pool.traits.length).toBeGreaterThanOrEqual(2);
    const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } });
    if (!result.ok) throw new Error(result.reason);
    const street = getStaffMember(sim.state, (result.data as { staffId: string }).staffId);
    expect(street?.traits.length).toBeGreaterThanOrEqual(2);
  });

  it('wirken als kleine Faktoren: Lohnwunsch, Tempo, Verrat, Reden', () => {
    const sim = quietGame();
    const base = recruit(sim, 'runner', { traits: [] });
    const ambitious = recruit(sim, 'runner', { traits: ['ambitious'], level: base.level, demand: base.demand });
    expect(expectedWage(sim.state, ambitious.id)).toBeGreaterThan(expectedWage(sim.state, base.id));
    const nimble = recruit(sim, 'runner', { traits: ['nimble'], stats: { ...base.stats }, level: base.level });
    expect(serveTime(nimble)).toBeLessThan(serveTime(base));
    const loyal = recruit(sim, 'runner', { traits: ['loyal'], stats: { ...base.stats, loyalty: 10 } });
    expect(betrayalChance(loyal)).toBe(0);
    expect(talkChance(loyal)).toBe(0);
    const gambler = recruit(sim, 'runner', { traits: ['gambler'], stats: { ...base.stats, loyalty: 10 } });
    const plain = recruit(sim, 'runner', { traits: [], stats: { ...base.stats, loyalty: 10 } });
    expect(betrayalChance(gambler)).toBeGreaterThan(betrayalChance(plain));
  });

  it('Version 6 → 7: alte Leute bekommen Eigenschaften fest aus der ID', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner', { traits: [] });
    const raw = structuredClone(sim.state) as unknown as {
      moduleVersions: Record<string, number>;
      modules: { staff: { members: Partial<StaffMember>[]; relations?: unknown; stories?: unknown } };
    };
    raw.moduleVersions.staff = 6;
    for (const m of raw.modules.staff.members) delete m.traits;
    delete raw.modules.staff.relations;
    delete raw.modules.staff.stories;
    const one = loadSimulation(structuredClone(raw), sim.modules);
    const two = loadSimulation(structuredClone(raw), sim.modules);
    const traits = getStaffMember(one.state, a.id)?.traits ?? [];
    expect(traits.length).toBeGreaterThanOrEqual(2);
    expect(getStaffMember(two.state, a.id)?.traits).toEqual(traits);
    expect(one.state.modules.staff.relations).toEqual([]);
    // Der erwartete Lohn bleibt, wie er vorher war (Anspruch gleicht den Lohnfaktor der Eigenschaften aus).
    expect(Math.abs(expectedWage(one.state, a.id) - expectedWage(sim.state, a.id))).toBeLessThanOrEqual(5);
    expect(openStories(one.state)).toEqual([]);
  });

  it('jede Eigenschaft hat Namen, Satz und Symbol', () => {
    for (const info of Object.values(TRAITS)) {
      expect(info.name.length).toBeGreaterThan(2);
      expect(info.hint.endsWith('.')).toBe(true);
      expect(info.icon).toBeTruthy();
    }
  });
});

describe('Beziehungen', () => {
  it('Empfehlungen kennen sich, das Team bekommt nur wenige Beziehungen', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner');
    const ctx = sim.ctx('staff');
    const b = enlist(ctx, generateProfile(ctx, 'runner'), { origin: 'referral', referrerId: a.id });
    expect(relationBetween(sim.state, a.id, b.id)).toMatch(/friends|siblings/);
    for (let i = 0; i < 20; i++) recruit(sim, 'runner');
    const team = getStaff(sim.state).length;
    expect(sim.state.modules.staff.relations.length).toBeLessThanOrEqual(Math.max(1, Math.floor(team / 3)) + 1);
  });

  it('wer jemanden entlässt, verliert die Loyalität der Freunde; Rivalen freuen sich', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner', { traits: [] });
    const friend = recruit(sim, 'runner', { traits: [] });
    const rival = recruit(sim, 'runner', { traits: [] });
    sim.state.modules.staff.relations = [];
    addRelation(sim.ctx('staff'), a.id, friend.id, 'friends');
    addRelation(sim.ctx('staff'), a.id, rival.id, 'rivals');
    friend.stats.loyalty = 60;
    rival.stats.loyalty = 60;
    expect(sim.dispatch({ type: 'staff.fire', payload: { staffId: a.id } }).ok).toBe(true);
    const f = getStaffMember(sim.state, friend.id);
    if (f?.leftAt === null) expect(f.stats.loyalty).toBe(50);
    expect(getStaffMember(sim.state, rival.id)?.stats.loyalty).toBe(64);
  });

  it('Festnahme trifft das Paar, am selben Spot arbeiten Freunde schneller', () => {
    const sim = quietGame();
    const runner = recruit(sim, 'runner', { traits: [], assignment: { kind: 'spot', targetId: 'neumarkt' } });
    const guard = recruit(sim, 'security', { traits: [], assignment: { kind: 'spot', targetId: 'neumarkt' } });
    sim.state.modules.staff.relations = [];
    addRelation(sim.ctx('staff'), runner.id, guard.id, 'couple');
    expect(relationsOf(sim.state, runner.id).map((r) => r.kind)).toEqual(['couple']);
    guard.stats.loyalty = 60;
    sim.ctx('police').emit('police.arrest', { staffId: runner.id, veedelId: 'altstadt-nord' } as never);
    sim.advance(1);
    expect(getStaffMember(sim.state, guard.id)?.stats.loyalty).toBeLessThan(60);
  });
});

describe('Geschichten', () => {
  it('mindestens zwölf Vorlagen, je mit Varianten, Antworten und gültiger Rückfall-Wahl', () => {
    const ids = Object.keys(STORIES) as StoryId[];
    expect(ids.length).toBeGreaterThanOrEqual(12);
    const vars = {
      name: 'Kevin K.',
      first: 'Kevin',
      other: 'Murat Ö.',
      amount: '500 €',
      spot: 'Ring',
      veedel: 'Nippes',
      gang: 'Hafenkolonne',
    };
    for (const id of ids) {
      const t = STORIES[id];
      expect(t.texts.length, id).toBeGreaterThanOrEqual(3);
      expect(t.choices.length, id).toBeGreaterThanOrEqual(2);
      expect(
        t.choices.some((c) => c.id === t.fallback),
        id,
      ).toBe(true);
      for (const text of [...t.texts, ...t.choices.flatMap((c) => [c.label, c.reply, ...(c.answer ?? [])])]) {
        expect(fillText(text, vars), id).not.toMatch(/\{\w*\}/);
      }
    }
  });

  it('Geldbitte: Zahlen kostet und freut, Ablehnen ärgert, ohne Antwort gilt die Rückfall-Wahl', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner', { traits: ['family'] });
    m.stats.loyalty = 50;
    const story = startStory(sim.ctx('staff'), 'loan', m.id);
    if (!story) throw new Error('keine Geschichte');
    expect(story.amount).toBeGreaterThan(0);
    const msg = sim.state.messages.list.find((x) => x.id === story.messageId);
    expect(msg?.options?.map((o) => o.id)).toEqual(['give', 'work', 'refuse']);
    wallet.earn(sim.ctx('test'), 10_000, 'dirty', 'Test', 'income.other');
    const before = sim.state.wallet.dirty;
    expect(answer(sim, story.id, 'give').ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(before - story.amount);
    expect(getStaffMember(sim.state, m.id)?.stats.loyalty).toBe(65);
    expect(openStories(sim.state)).toHaveLength(0);

    const other = recruit(sim, 'runner', { traits: ['family'] });
    other.stats.loyalty = 50;
    const late = startStory(sim.ctx('staff'), 'loan', other.id);
    if (!late) throw new Error('keine Geschichte');
    sim.advance(9 * 60);
    expect(openStories(sim.state)).toHaveLength(0);
    expect(getStaffMember(sim.state, other.id)?.stats.loyalty).toBeLessThan(50);
  });

  it('Zahlen ohne Geld geht nicht; Kaution für Geschwister nur, wenn das Geld reicht', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner', { traits: ['gambler'] });
    const story = startStory(sim.ctx('staff'), 'debt', m.id);
    if (!story) throw new Error('keine Geschichte');
    wallet.lose(sim.ctx('test'), sim.state.wallet.dirty, 'dirty', 'Test', 'expense.other');
    expect(answer(sim, story.id, 'pay').ok).toBe(false);
    const sib = recruit(sim, 'runner', { traits: [] });
    const jailed = recruit(sim, 'runner', { traits: [] });
    jailed.status = 'jailed';
    jailed.statusUntil = sim.state.time + 2000;
    const s2 = startStory(sim.ctx('staff'), 'siblingJailed', sib.id, jailed.id);
    if (!s2) throw new Error('keine Geschichte');
    expect(storyChoices(sim.state, s2).map((c) => c.id)).toEqual(['wait']);
  });

  it('kommen spürbar, aber nicht hagelnd, und sind deterministisch', () => {
    const run = () => {
      const sim = quietGame(3);
      const events = recordEvents(sim);
      for (const trait of ['family', 'drinker', 'gambler', 'ambitious', 'braggart', 'hothead'] as TraitId[]) {
        recruit(sim, 'runner', {
          traits: [trait, 'loyal'],
          level: 4,
          assignment: { kind: 'spot', targetId: 'neumarkt' },
        });
      }
      wallet.earn(sim.ctx('test'), 50_000, 'dirty', 'Test', 'income.other');
      sim.advance(28 * 1440);
      return eventsOfType(events, 'staff.story').map((e) => `${e.time}:${e.payload.story}:${e.payload.staffId}`);
    };
    const first = run();
    expect(run()).toEqual(first);
    // Vier Wochen: mindestens eine pro Woche, höchstens eine alle STORY_GAP.
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(first.length).toBeLessThanOrEqual(Math.ceil((28 * 1440) / STORY_GAP));
  });
});
