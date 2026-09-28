import { describe, expect, it } from 'vitest';
import { clock, defineModule, messages, Simulation } from '../../core';
import { chatEntries, chatList, firstUnread, messageNotification, timeLabel } from './messagesModel';

// Ein Testmodul mit einem Befehl, den eine Antwort-Option auslöst.
declare module '../../core' {
  interface GameCommands {
    'phoneTest.accept': { ok: boolean };
  }
}
const phoneTest = defineModule({
  id: 'phoneTest',
  version: 1,
  commands: {
    'phoneTest.accept': (_ctx, payload) => (payload.ok ? { ok: true } : { ok: false, reason: 'Geht nicht.' }),
  },
});

const gang = { id: 'gang:nord', name: 'Nordstadt Boys', kind: 'gang' as const };
const lena = { id: 'customer:lena', name: 'Lena', kind: 'customer' as const, avatar: '🎓' };

function game() {
  const sim = Simulation.create([phoneTest], { seed: 1 });
  return { sim, ctx: sim.ctx('phoneTest') };
}

describe('Nachrichten-App: Chat-Liste', () => {
  it('zeigt Chats pro Figur, neueste zuerst, mit ungelesenen Nachrichten', () => {
    const { sim, ctx } = game();
    messages.send(ctx, { contact: gang, text: 'Das ist unser Revier.' });
    sim.advance(10);
    messages.send(ctx, { contact: lena, text: 'Hast du was da?' });
    messages.send(ctx, { contact: lena, text: 'Bin am Zülpicher Platz.' });
    const list = chatList(sim.state);
    expect(list.map((c) => c.name)).toEqual(['Lena', 'Nordstadt Boys']);
    expect(list[0]).toMatchObject({ unread: 2, kindLabel: 'Kunde', avatar: '🎓', preview: 'Bin am Zülpicher Platz.' });
    expect(list[1]).toMatchObject({ unread: 1, kindLabel: 'Gang', awaitingAnswer: false });
    expect(list[0].timeLabel).toBe(clock.formatTime(sim.state.time));
  });

  it('markiert Chats, die auf eine Antwort warten, samt Frist', () => {
    const { sim, ctx } = game();
    messages.send(ctx, {
      contact: gang,
      text: 'Zahl oder verschwinde.',
      options: [{ id: 'pay', label: 'Zahlen', command: { type: 'phoneTest.accept', payload: { ok: true } } }],
      expiresIn: 60,
    });
    const [item] = chatList(sim.state);
    expect(item.awaitingAnswer).toBe(true);
    expect(item.deadline).toBe(sim.state.time + 60);
  });

  it('zeigt eigene Antworten mit "Du:" und formatiert ältere Zeiten', () => {
    const { sim, ctx } = game();
    const id = messages.send(ctx, {
      contact: lena,
      text: 'Kommst du?',
      options: [{ id: 'yes', label: 'Bin unterwegs' }],
    });
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'yes' } })).toEqual({
      ok: true,
    });
    expect(chatList(sim.state)[0].preview).toBe('Du: Bin unterwegs');
    const now = clock.at(5, 12);
    expect(timeLabel(clock.at(5, 9, 5), now)).toBe('09:05');
    expect(timeLabel(clock.at(4, 23), now)).toBe('Gestern');
    expect(timeLabel(clock.at(2, 10), now)).toBe(clock.weekdayName(clock.at(2, 10), true));
    expect(timeLabel(clock.at(1, 10), clock.at(12, 10))).toBe('Tag 1');
  });
});

describe('Nachrichten-App: Chat', () => {
  it('zeigt Verlauf mit Tagestrennern und "Neu"-Trenner', () => {
    const { sim, ctx } = game();
    messages.send(ctx, { contact: lena, text: 'Heute Abend?' });
    sim.dispatch({ type: 'messages.markRead', payload: { contactId: lena.id } });
    sim.advance(24 * 60);
    messages.send(ctx, { contact: lena, text: 'Hallo?' });
    const unread = firstUnread(sim.state, lena.id);
    const entries = chatEntries(sim.state, lena.id, unread);
    expect(entries.map((e) => e.type)).toEqual(['day', 'message', 'day', 'unread', 'message']);
    const days = entries.filter((e) => e.type === 'day').map((e) => (e.type === 'day' ? e.label : ''));
    expect(days).toEqual(['Freitag · Tag 1', 'Samstag · Tag 2']);
  });

  it('bietet Antwort-Optionen als Knöpfe an, bis geantwortet wurde oder die Frist um ist', () => {
    const { sim, ctx } = game();
    const id = messages.send(ctx, {
      contact: gang,
      text: 'Deal?',
      options: [
        { id: 'yes', label: 'Deal', command: { type: 'phoneTest.accept', payload: { ok: true } } },
        { id: 'no', label: 'Vergiss es' },
      ],
      expiresIn: 90,
    });
    const message = () => chatEntries(sim.state, gang.id).find((e) => e.type === 'message');
    let entry = message();
    expect(entry?.type === 'message' && entry.options.map((o) => o.label)).toEqual(['Deal', 'Vergiss es']);
    expect(entry?.type === 'message' && entry.deadlineLabel).toContain('noch 1 Std. 30 Min.');
    expect(entry?.type === 'message' && entry.urgent).toBe(false);
    sim.advance(70);
    entry = message();
    expect(entry?.type === 'message' && entry.urgent).toBe(true);

    sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'yes' } });
    const entries = chatEntries(sim.state, gang.id).filter((e) => e.type === 'message');
    expect(entries).toHaveLength(2);
    const [question, reply] = entries;
    expect(question.type === 'message' && question.options).toEqual([]);
    expect(question.type === 'message' && question.answeredWith).toBe('Deal');
    expect(reply.type === 'message' && reply.from).toBe('player');
  });

  it('abgelaufene Fristen: keine Knöpfe mehr, Hinweis', () => {
    const { sim, ctx } = game();
    messages.send(ctx, {
      contact: gang,
      text: 'Letzte Chance.',
      options: [{ id: 'ok', label: 'Okay' }],
      expiresIn: 30,
    });
    sim.advance(31);
    const [entry] = chatEntries(sim.state, gang.id).filter((e) => e.type === 'message');
    expect(entry.type === 'message' && entry.options).toEqual([]);
    expect(entry.type === 'message' && entry.expired).toBe(true);
  });

  it('schlägt der Befehl einer Option fehl, bleibt die Frage offen', () => {
    const { sim, ctx } = game();
    const id = messages.send(ctx, {
      contact: gang,
      text: 'Zahl.',
      options: [{ id: 'pay', label: 'Zahlen', command: { type: 'phoneTest.accept', payload: { ok: false } } }],
    });
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'pay' } }).ok).toBe(false);
    const [entry] = chatEntries(sim.state, gang.id).filter((e) => e.type === 'message');
    expect(entry.type === 'message' && entry.options).toHaveLength(1);
  });
});

describe('Nachrichten-App: Benachrichtigung', () => {
  it('nennt Absender, Text und öffnet den passenden Chat', () => {
    const { sim, ctx } = game();
    const id = messages.send(ctx, { contact: gang, text: 'Wir müssen reden.', options: [{ id: 'ok', label: 'Okay' }] });
    expect(messageNotification(sim.state, id)).toEqual({
      title: 'Nordstadt Boys · Antwort erwartet',
      text: 'Wir müssen reden.',
      icon: 'skull',
      appId: 'core.messages',
      params: { contactId: 'gang:nord' },
    });
    expect(messageNotification(sim.state, 9999)).toBeNull();
  });
});
