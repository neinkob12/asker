import { describe, expect, it } from 'vitest';
import { clock } from './clock';
import { START_DIRTY_MONEY, START_TIME } from './config';
import { messages } from './messages';
import { defineModule, type ModuleDefinition, sortModules } from './module';
import { outcome } from './outcome';
import { Simulation } from './sim';
import { eventsOfType, recordEvents } from './testing';
import type { GameEvent } from './types';
import { MONEY_CATEGORIES, wallet } from './wallet';

// Testmodule, nur für diese Datei. Sie erweitern die Kerntypen wie echte Module.
interface CounterState {
  count: number;
  hourly: number;
  rolls: number[];
  seen: string[];
}

declare module './types' {
  interface ModuleStates {
    testCounter: CounterState;
  }
  interface GameCommands {
    'testCounter.add': { by: number };
    'testCounter.roll': Record<string, never>;
    'testCounter.chain': Record<string, never>;
  }
  interface GameEvents {
    'testCounter.added': { by: number };
    'testCounter.second': { from: string };
  }
}

const counter = defineModule({
  id: 'testCounter',
  version: 1,
  init: () => ({ count: 0, hourly: 0, rolls: [], seen: [] }),
  tick: (ctx) => {
    ctx.state.modules.testCounter.count += 1;
  },
  commands: {
    'testCounter.add': (ctx, { by }) => {
      if (by <= 0) return { ok: false, reason: 'Nur positive Zahlen.' };
      ctx.state.modules.testCounter.count += by;
      ctx.emit('testCounter.added', { by });
      return { ok: true };
    },
    'testCounter.roll': (ctx) => {
      ctx.state.modules.testCounter.rolls.push(ctx.randomInt(1, 6));
      return undefined;
    },
    'testCounter.chain': (ctx) => {
      ctx.emit('testCounter.added', { by: 0 });
      return undefined;
    },
  },
  on: {
    'testCounter.added': (ctx, { by }) => {
      ctx.state.modules.testCounter.seen.push(`added:${by}`);
      if (by === 0) ctx.emit('testCounter.second', { from: 'handler' });
    },
    'testCounter.second': (ctx, { from }) => {
      ctx.state.modules.testCounter.seen.push(`second:${from}`);
    },
  },
});

const hourly = defineModule({
  id: 'testHourly',
  version: 1,
  dependsOn: ['testCounter'],
  tickEvery: 60,
  tick: (ctx) => {
    ctx.state.modules.testCounter.hourly += 1;
  },
});

const modules = [hourly, counter] as ModuleDefinition[];
const create = (seed = 1) => Simulation.create(modules, { seed });

describe('Simulation: feste Zeitschritte', () => {
  it('startet an Tag 1 um 18 Uhr mit Startgeld', () => {
    const sim = create();
    expect(sim.state.time).toBe(START_TIME);
    expect(clock.format(sim.state.time)).toBe('Tag 1, 18:00');
    expect(clock.weekdayName(sim.state.time)).toBe('Freitag');
    expect(wallet.balance(sim.state, 'dirty')).toBe(START_DIRTY_MONEY);
  });

  it('ein Schritt ist genau eine Spielminute, jedes Modul tickt pro Schritt', () => {
    const sim = create();
    sim.advance(90);
    expect(sim.state.time).toBe(START_TIME + 90);
    expect(sim.state.modules.testCounter.count).toBe(90);
  });

  it('tickEvery lässt Module seltener ticken (hier stündlich)', () => {
    const sim = create();
    sim.advance(6 * 60);
    expect(sim.state.modules.testCounter.hourly).toBe(6);
  });

  it('meldet volle Stunden und neue Tage', () => {
    const sim = create();
    const events = recordEvents(sim);
    sim.advance(7 * 60); // 18:00 → 01:00
    const hours = events.filter((e) => e.type === 'clock.hourStarted').map((e) => (e.payload as { hour: number }).hour);
    expect(hours).toEqual([19, 20, 21, 22, 23, 0, 1]);
    const days = events.filter((e) => e.type === 'clock.dayStarted');
    expect(days).toHaveLength(1);
    expect(days[0].payload).toEqual({ day: 2, weekday: 5 });
  });

  it('läuft in Abhängigkeits-Reihenfolge, bei Gleichstand nach ID', () => {
    expect(sortModules(modules).map((m) => m.id)).toEqual(['testCounter', 'testHourly']);
    const a = defineModule({ id: 'a', version: 1 });
    const b = defineModule({ id: 'b', version: 1, dependsOn: ['c'] });
    const c = defineModule({ id: 'c', version: 1 });
    expect(sortModules([b, c, a]).map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('erkennt fehlende Abhängigkeiten, Zyklen und doppelte IDs', () => {
    const x = defineModule({ id: 'x', version: 1, dependsOn: ['y'] });
    const y = defineModule({ id: 'y', version: 1, dependsOn: ['x'] });
    expect(() => sortModules([x])).toThrow(/nicht registriert/);
    expect(() => sortModules([x, y])).toThrow(/Zyklische/);
    expect(() => sortModules([x, x])).toThrow(/doppelt/);
  });
});

describe('Simulation: Zufall und Determinismus', () => {
  const play = (seed: number) => {
    const sim = create(seed);
    for (let i = 0; i < 20; i++) {
      sim.dispatch({ type: 'testCounter.roll', payload: {} });
      sim.advance(37);
    }
    return sim;
  };

  it('gleicher Seed und gleiche Befehle ergeben den gleichen Zustand', () => {
    expect(JSON.stringify(play(42).state)).toBe(JSON.stringify(play(42).state));
  });

  it('anderer Seed ergibt andere Würfe', () => {
    expect(play(1).state.modules.testCounter.rolls).not.toEqual(play(2).state.modules.testCounter.rolls);
  });

  it('der Zufallszustand liegt im Spielstand: eine Kopie würfelt genauso weiter', () => {
    const a = play(7);
    const b = new Simulation(modules, structuredClone(a.state));
    a.dispatch({ type: 'testCounter.roll', payload: {} });
    b.dispatch({ type: 'testCounter.roll', payload: {} });
    expect(b.state.modules.testCounter.rolls).toEqual(a.state.modules.testCounter.rolls);
  });

  it('jedes Modul hat seinen eigenen Zufallsstrom', () => {
    const sim = create(3);
    const r1 = sim.ctx('a').random();
    const other = create(3);
    other.ctx('b').random();
    expect(other.ctx('a').random()).toBe(r1);
  });
});

describe('Simulation: Befehle', () => {
  it('werden von genau einem Modul verarbeitet und melden Erfolg oder Grund', () => {
    const sim = create();
    expect(sim.dispatch({ type: 'testCounter.add', payload: { by: 5 } })).toEqual({ ok: true });
    expect(sim.state.modules.testCounter.count).toBe(5);
    expect(sim.dispatch({ type: 'testCounter.add', payload: { by: -1 } })).toEqual({
      ok: false,
      reason: 'Nur positive Zahlen.',
    });
    expect(sim.commandOwner('testCounter.add')).toBe('testCounter');
  });

  it('unbekannte Befehle schlagen fehl', () => {
    const sim = create();
    const result = sim.dispatch({ type: 'gibts.nicht', payload: {} } as never);
    expect(result.ok).toBe(false);
  });

  it('zwei Module dürfen nicht denselben Befehl verarbeiten', () => {
    const clash = defineModule({ id: 'clash', version: 1, commands: { 'testCounter.add': () => undefined } });
    expect(() => Simulation.create([counter, clash], { seed: 1 })).toThrow(/testCounter.add/);
  });

  it('Befehle aus dem Tick (z.B. Leutnants) laufen über dispatch und tragen den Akteur', () => {
    const actors: string[] = [];
    const boss = defineModule({
      id: 'testBoss',
      version: 1,
      tickEvery: 10,
      tick: (ctx) => {
        ctx.dispatch({ type: 'testCounter.add', payload: { by: 100 } }, { actor: 'staff:s1' });
      },
    });
    const spy = defineModule({
      id: 'testSpy',
      version: 1,
      commands: {
        'testCounter.roll': (_ctx, _payload, meta) => {
          actors.push(meta.actor);
          return undefined;
        },
      },
    });
    const sim = Simulation.create([counter, boss], { seed: 1 });
    sim.advance(10);
    expect(sim.state.modules.testCounter.count).toBe(10 + 100);

    const spySim = Simulation.create([spy], { seed: 1 });
    spySim.dispatch({ type: 'testCounter.roll', payload: {} });
    spySim.ctx('x').dispatch({ type: 'testCounter.roll', payload: {} });
    spySim.ctx('x').dispatch({ type: 'testCounter.roll', payload: {} }, { actor: 'staff:s7' });
    expect(actors).toEqual(['player', 'system', 'staff:s7']);
  });
});

describe('Simulation: Ereignisse', () => {
  it('werden in fester Reihenfolge zugestellt, Folge-Ereignisse hinten angehängt', () => {
    const sim = create();
    const events = recordEvents(sim);
    sim.dispatch({ type: 'testCounter.chain', payload: {} });
    sim.dispatch({ type: 'testCounter.add', payload: { by: 2 } });
    expect(sim.state.modules.testCounter.seen).toEqual(['added:0', 'second:handler', 'added:2']);
    expect(events.map((e: GameEvent) => e.type)).toEqual([
      'testCounter.added',
      'testCounter.second',
      'testCounter.added',
    ]);
  });

  it('Zuhörer bekommen die Ereignisse eines Schritts erst nach dem Schritt', () => {
    const sim = create();
    let timeWhenHeard = 0;
    sim.on('clock.hourStarted', () => {
      timeWhenHeard = sim.state.time;
    });
    sim.advance(60);
    expect(timeWhenHeard).toBe(START_TIME + 60);
  });
});

describe('Spielende', () => {
  const stock = defineModule({
    id: 'testStock',
    version: 1,
    solvency: (state) => wallet.balance(state) > 0,
  });

  it('Pleite, wenn kein Modul mehr Solvenz meldet', () => {
    const sim = Simulation.create([counter, stock], { seed: 1 });
    const events = recordEvents(sim);
    sim.advance(5);
    expect(sim.isOver).toBe(false);
    wallet.lose(sim.ctx('test'), 10_000);
    sim.step();
    expect(sim.state.outcome.gameOver?.reason).toBe('bankrupt');
    expect(events.some((e) => e.type === 'game.over')).toBe(true);
  });

  it('nach Game Over laufen keine Schritte und Befehle mehr', () => {
    const sim = create();
    outcome.gameOver(sim.ctx('encounters'), 'killed');
    const time = sim.state.time;
    sim.advance(100);
    expect(sim.state.time).toBe(time);
    expect(sim.dispatch({ type: 'testCounter.add', payload: { by: 1 } }).ok).toBe(false);
    expect(sim.state.outcome.gameOver?.reason).toBe('killed');
    expect(sim.state.journal[0].text).toContain('Game Over');
  });

  it('ohne solvency-Prüfung gibt es keine Pleite', () => {
    const sim = create();
    wallet.lose(sim.ctx('test'), 10_000);
    sim.advance(10);
    expect(sim.isOver).toBe(false);
  });

  it('Sieg wird einmal gemeldet, danach läuft das Spiel weiter', () => {
    const sim = create();
    const events = recordEvents(sim);
    outcome.win(sim.ctx('territory'));
    outcome.win(sim.ctx('territory'));
    sim.advance(10);
    expect(events.filter((e) => e.type === 'campaign.won')).toHaveLength(1);
    expect(sim.state.outcome.won).not.toBeNull();
    expect(sim.state.modules.testCounter.count).toBe(10);
  });
});

describe('Geld', () => {
  it('trennt Schwarzgeld und sauberes Geld', () => {
    const sim = create();
    const ctx = sim.ctx('test');
    expect(wallet.pay(ctx, 100, 'clean')).toBe(false);
    expect(wallet.pay(ctx, 100)).toBe(true);
    wallet.earn(ctx, 50, 'clean');
    expect(wallet.balance(sim.state, 'dirty')).toBe(START_DIRTY_MONEY - 100);
    expect(wallet.balance(sim.state, 'clean')).toBe(50);
    expect(wallet.lose(ctx, 1_000_000)).toBe(START_DIRTY_MONEY - 100);
    expect(wallet.balance(sim.state, 'dirty')).toBe(0);
    wallet.earn(ctx, 1000);
    expect(wallet.convert(ctx, 'dirty', 'clean', 1000, 200)).toBe(true);
    expect(sim.state.wallet).toEqual({ dirty: 0, clean: 850 });
  });

  it('lässt keine Beträge ins Konto, die es verseuchen würden (NaN, Infinity, negativ, Gebühr über Betrag)', () => {
    const sim = create();
    const ctx = sim.ctx('test');
    const before = { ...sim.state.wallet };
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(() => wallet.earn(ctx, bad)).toThrow();
      expect(() => wallet.pay(ctx, bad)).toThrow();
      expect(() => wallet.convert(ctx, 'dirty', 'clean', bad)).toThrow();
    }
    expect(() => wallet.lose(ctx, Number.NaN)).toThrow();
    expect(() => wallet.convert(ctx, 'dirty', 'clean', 500, Number.NaN)).toThrow();
    expect(() => wallet.convert(ctx, 'dirty', 'clean', 500, -1)).toThrow();
    // Eine Gebühr über dem Betrag würde Geld erzeugen: abgelehnt, ohne etwas zu buchen.
    expect(wallet.convert(ctx, 'dirty', 'clean', 500, 600)).toBe(false);
    expect(sim.state.wallet).toEqual(before);
    // Ein negativer Verlust verliert nichts, "unendlich" verliert alles, was da ist.
    expect(wallet.lose(ctx, -50)).toBe(0);
    expect(wallet.lose(ctx, Number.POSITIVE_INFINITY)).toBe(before.dirty);
    expect(sim.state.wallet).toEqual({ dirty: 0, clean: before.clean });
  });

  it('jede Kontobewegung trägt ihre Kategorie, Geldwäsche bucht Gebühr und Umbuchung getrennt', () => {
    const sim = create();
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    wallet.pay(ctx, 80, 'dirty', 'Lohn Murat K.', { category: 'wages.runner', staffId: 's1' });
    wallet.convert(ctx, 'dirty', 'clean', 500, 100);
    sim.advance(1);
    const changes = eventsOfType(events, 'wallet.changed').map((e) => e.payload);
    expect(changes[0]).toMatchObject({ amount: -80, category: 'wages.runner', staffId: 's1' });
    expect(changes.slice(1).map((c) => [c.kind, c.amount, c.category])).toEqual([
      ['dirty', -400, 'transfer'],
      ['dirty', -100, 'laundering'],
      ['clean', 400, 'transfer'],
    ]);
    expect(MONEY_CATEGORIES['wages.jail'].group).toBe('expense');
  });
});

describe('Nachrichten', () => {
  const contact = { id: 'other:test', name: 'Testfigur', kind: 'other' as const };

  it('Antwort-Optionen lösen Befehle aus', () => {
    const sim = create();
    const events = recordEvents(sim);
    const id = messages.send(sim.ctx('testCounter'), {
      contact,
      text: 'Willst du 3?',
      options: [
        { id: 'yes', label: 'Ja', command: { type: 'testCounter.add', payload: { by: 3 } } },
        { id: 'no', label: 'Nein' },
      ],
    });
    expect(messages.unreadCount(sim.state)).toBe(1);
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'yes' } })).toEqual({
      ok: true,
    });
    expect(sim.state.modules.testCounter.count).toBe(3);
    expect(messages.thread(sim.state, contact.id).map((m) => m.text)).toEqual(['Willst du 3?', 'Ja']);
    expect(messages.unreadCount(sim.state)).toBe(0);
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'no' } }).ok).toBe(false);
    expect(events.map((e) => e.type)).toContain('message.answered');
  });

  it('Routine-Fragen kann jemand im Namen des Spielers beantworten (answerAs), ohne den Befehl erneut auszuführen', () => {
    const sim = create();
    const events = recordEvents(sim);
    const routine = messages.send(sim.ctx('testCounter'), {
      contact,
      text: 'Lieferung?',
      options: [
        { id: 'yes', label: 'Ja', reply: 'Bin unterwegs.', command: { type: 'testCounter.add', payload: { by: 1 } } },
      ],
      routine: true,
    });
    const boss = messages.send(sim.ctx('testCounter'), {
      contact,
      text: 'Krieg?',
      options: [{ id: 'no', label: 'Nein' }],
    });
    expect(messages.openRoutine(sim.state).map((m) => m.id)).toEqual([routine]);
    expect(messages.get(sim.state, boss)?.routine).toBeUndefined();
    expect(messages.answerAs(sim.ctx('testCounter'), { messageId: routine, optionId: 'yes', via: 'Rechte Hand' })).toBe(
      true,
    );
    // Der Befehl der Option läuft nicht noch einmal (der Aufrufer hat ihn selbst ausgeführt).
    expect(sim.state.modules.testCounter.count).toBe(0);
    const thread = messages.thread(sim.state, contact.id);
    expect(thread.at(-1)).toMatchObject({ from: 'player', text: 'Bin unterwegs.', via: 'Rechte Hand', read: true });
    expect(messages.get(sim.state, routine)?.answer).toBe('yes');
    expect(messages.openRoutine(sim.state)).toHaveLength(0);
    sim.step(); // Ereignisse kommen am Ende des Schritts an.
    expect(eventsOfType(events, 'message.answered')[0].payload).toMatchObject({
      messageId: routine,
      via: 'Rechte Hand',
    });
    // Beantwortet ist beantwortet, unbekannte Optionen gehen nicht.
    expect(messages.answerAs(sim.ctx('testCounter'), { messageId: routine, optionId: 'yes', via: 'x' })).toBe(false);
    expect(messages.answerAs(sim.ctx('testCounter'), { messageId: boss, optionId: 'gibt-es-nicht', via: 'x' })).toBe(
      false,
    );
  });

  it('schlägt der Befehl fehl, bleibt die Nachricht offen', () => {
    const sim = create();
    const id = messages.send(sim.ctx('testCounter'), {
      contact,
      text: 'Kaputt',
      options: [{ id: 'bad', label: 'Minus', command: { type: 'testCounter.add', payload: { by: -1 } } }],
    });
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'bad' } }).ok).toBe(false);
    expect(messages.get(sim.state, id)?.answer).toBeUndefined();
  });

  it('alle gelesen, Chat löschen, alle löschen; gelöschte Chats tauchen mit neuen Nachrichten wieder auf', () => {
    const sim = create();
    const other = { id: 'other:zwei', name: 'Zweite', kind: 'other' as const };
    const first = messages.send(sim.ctx('testCounter'), { contact, text: 'Eins' });
    messages.send(sim.ctx('testCounter'), { contact: other, text: 'Zwei', options: [{ id: 'ok', label: 'Ok' }] });
    expect(messages.unreadCount(sim.state)).toBe(2);
    expect(sim.dispatch({ type: 'messages.markAllRead', payload: {} }).ok).toBe(true);
    expect(messages.unreadCount(sim.state)).toBe(0);
    expect(messages.threads(sim.state)).toHaveLength(2);

    expect(sim.dispatch({ type: 'messages.delete', payload: { contactId: contact.id } }).ok).toBe(true);
    expect(messages.threads(sim.state).map((t) => t.contact.id)).toEqual([other.id]);
    expect(messages.thread(sim.state, contact.id)).toEqual([]);
    // Die Nachricht bleibt im Zustand (nur ausgeblendet), unbekannte Chats lassen sich nicht löschen.
    expect(messages.get(sim.state, first)?.text).toBe('Eins');
    expect(sim.dispatch({ type: 'messages.delete', payload: { contactId: 'other:nix' } }).ok).toBe(false);

    // Schreibt die Figur neu, ist der Chat wieder da, nur mit der neuen Nachricht.
    messages.send(sim.ctx('testCounter'), { contact, text: 'Drei' });
    expect(messages.thread(sim.state, contact.id).map((m) => m.text)).toEqual(['Drei']);
    expect(messages.unreadCount(sim.state, contact.id)).toBe(1);

    expect(sim.dispatch({ type: 'messages.deleteAll', payload: {} }).ok).toBe(true);
    expect(messages.threads(sim.state)).toEqual([]);
    expect(messages.unreadCount(sim.state)).toBe(0);
    // Die offene Frage im gelöschten Chat zählt nicht mehr als offen.
    expect(messages.hasOpenDeadline(sim.state, other.id)).toBe(false);
  });

  it('erkennt offene Fragen mit Frist (Rückfrage vor dem Löschen)', () => {
    const sim = create();
    messages.send(sim.ctx('testCounter'), {
      contact,
      text: 'Schnell?',
      options: [{ id: 'ok', label: 'Ok' }],
      expiresIn: 60,
    });
    expect(messages.hasOpenDeadline(sim.state, contact.id)).toBe(true);
    sim.advance(61);
    expect(messages.hasOpenDeadline(sim.state, contact.id)).toBe(false);
  });

  it('Antwortfristen laufen ab', () => {
    const sim = create();
    const events = recordEvents(sim);
    const id = messages.send(sim.ctx('testCounter'), {
      contact,
      text: 'Bis gleich?',
      options: [{ id: 'ok', label: 'Ok' }],
      expiresIn: 30,
    });
    sim.advance(30);
    expect(messages.get(sim.state, id)?.expired).toBe(true);
    expect(events.filter((e) => e.type === 'message.expired')).toHaveLength(1);
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'ok' } }).ok).toBe(false);
  });

  it('listet Chats mit ungelesenen Nachrichten und markiert sie als gelesen', () => {
    const sim = create();
    messages.send(sim.ctx('a'), { contact, text: 'eins' });
    sim.step();
    messages.send(sim.ctx('a'), { contact: { id: 'gang:x', name: 'X', kind: 'gang' }, text: 'zwei' });
    const threads = messages.threads(sim.state);
    expect(threads.map((t) => t.contact.id)).toEqual(['gang:x', 'other:test']);
    sim.dispatch({ type: 'messages.markRead', payload: { contactId: 'gang:x' } });
    expect(messages.unreadCount(sim.state)).toBe(1);
  });
});
