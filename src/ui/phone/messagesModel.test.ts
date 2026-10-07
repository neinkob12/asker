import { describe, expect, it } from 'vitest';
import { clock, defineModule, type Look, messages, Simulation } from '../../core';
import {
  CONTACT_KIND_ORDER,
  CONTACT_KIND_TONES,
  chatEntries,
  chatList,
  firstUnread,
  groupChats,
  recentContacts,
  shortContactName,
  timeLabel,
} from './messagesModel';

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
    // Antwort im Namen der Rechten Hand: Vorschau und Blase nennen sie, die Frage ist Routine.
    const routine = messages.send(ctx, {
      contact: lena,
      text: 'Und morgen?',
      options: [{ id: 'yes', label: 'Klar', reply: 'Meine Rechte Hand kommt.' }],
      routine: true,
    });
    const openEntry = chatEntries(sim.state, lena.id).find((e) => e.type === 'message' && e.message.id === routine);
    expect(openEntry).toMatchObject({ type: 'message', routine: true });
    messages.answerAs(ctx, { messageId: routine, optionId: 'yes', via: 'Rechte Hand' });
    expect(chatList(sim.state)[0].preview).toBe('Rechte Hand: Meine Rechte Hand kommt.');
    const last = chatEntries(sim.state, lena.id).at(-1);
    expect(last).toMatchObject({ type: 'message', from: 'player', via: 'Rechte Hand' });
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

describe('Nachrichten-App: Gruppen nach Kontaktart', () => {
  const police = { id: 'staff:cop', name: 'Kommissar K.', kind: 'police' as const };
  const dealer = { id: 'supplier:jansen', name: 'Jansen', kind: 'supplier' as const };

  it('gruppiert in fester Reihenfolge und lässt leere Gruppen weg', () => {
    const { sim, ctx } = game();
    messages.send(ctx, { contact: lena, text: 'Hast du was da?' });
    messages.send(ctx, { contact: dealer, text: 'Nachschub?' });
    messages.send(ctx, { contact: gang, text: 'Das ist unser Revier.' });
    messages.send(ctx, { contact: police, text: 'Heute Abend Razzia.' });
    const groups = groupChats(chatList(sim.state));
    expect(groups.map((g) => g.kind)).toEqual(['gang', 'police', 'supplier', 'customer']);
    expect(groups.map((g) => g.label)).toEqual(['Gangs', 'Polizei', 'Lieferanten', 'Kunden']);
  });

  it('zählt offene Antworten und Ungelesenes je Gruppe', () => {
    const { sim, ctx } = game();
    messages.send(ctx, { contact: lena, text: 'Eins.' });
    messages.send(ctx, { contact: lena, text: 'Zwei.' });
    messages.send(ctx, {
      contact: gang,
      text: 'Zahl oder es knallt.',
      options: [{ id: 'yes', label: 'Zahlen' }],
      expiresIn: 45,
    });
    const groups = groupChats(chatList(sim.state));
    const gangs = groups.find((g) => g.kind === 'gang');
    const customers = groups.find((g) => g.kind === 'customer');
    expect(gangs).toMatchObject({ open: 1, unread: 1 });
    expect(customers).toMatchObject({ open: 0, unread: 2 });
    expect(gangs?.items[0].deadlineIn).toBe(45);
  });

  it('hat für jede Kontaktart eine Reihenfolge und eine Bedeutungsfarbe', () => {
    const kinds = ['customer', 'supplier', 'gang', 'staff', 'police', 'other'] as const;
    expect([...CONTACT_KIND_ORDER].sort()).toEqual([...kinds].sort());
    for (const kind of kinds) expect(CONTACT_KIND_TONES[kind]).toBeTruthy();
    // Eine Farbe, eine Bedeutung: keine zwei Kontaktarten teilen sich eine Farbe.
    expect(new Set(kinds.map((k) => CONTACT_KIND_TONES[k])).size).toBe(kinds.length);
  });

  it('zeigt oben die zuletzt aktiven Kontakte, neueste zuerst, höchstens fünf', () => {
    const sim = Simulation.create([phoneTest], { seed: 1 });
    for (let i = 0; i < 7; i++) {
      messages.send(sim.ctx('phoneTest'), {
        contact: { id: `other:${i}`, name: `Kontakt ${i}`, kind: 'other' },
        text: 'Hi',
      });
      sim.advance(1);
    }
    const recent = recentContacts(chatList(sim.state));
    expect(recent.map((c) => c.contactId)).toEqual(['other:6', 'other:5', 'other:4', 'other:3', 'other:2']);
    expect(recentContacts(chatList(sim.state), 2)).toHaveLength(2);
  });

  it('kürzt oben nur Personen aufs erste Wort, Gangs und Orte behalten den ganzen Namen (J8)', () => {
    const face = {} as Look;
    expect(shortContactName({ name: 'Jansen (Hafen Rotterdam)', kind: 'supplier' })).toBe('Jansen');
    expect(shortContactName({ name: 'Fiete Lührs', kind: 'other', look: face })).toBe('Fiete');
    expect(shortContactName({ name: 'Der Holländer', kind: 'customer' })).toBe('Holländer');
    expect(shortContactName({ name: 'Frau Schrader', kind: 'other', look: face })).toBe('Schrader');
    expect(shortContactName({ name: 'Marienburger Kreis', kind: 'gang' })).toBe('Marienburger Kreis');
    expect(shortContactName({ name: 'Nordstadt Boys', kind: 'gang', look: face })).toBe('Nordstadt Boys');
    expect(shortContactName({ name: 'Kölner Express', kind: 'other' })).toBe('Kölner Express');
  });
});

describe('Nachrichten-App: abgelegte Chats (Auftrag 43)', () => {
  it('abgelegte Chats stehen nicht in den Gruppen und nicht oben; schreibt die Figur neu, ist der Chat zurück', () => {
    const { sim, ctx } = game();
    messages.send(ctx, { contact: gang, text: 'Das ist unser Revier.' });
    messages.send(ctx, { contact: lena, text: 'Hast du was?' });
    messages.archive(ctx, 'Frühere Städte');
    const before = chatList(sim.state);
    expect(before.every((c) => c.archived)).toBe(true);
    expect(groupChats(before)).toEqual([]);
    expect(recentContacts(before)).toEqual([]);
    messages.send(ctx, { contact: lena, text: 'Noch da?' });
    const after = chatList(sim.state);
    expect(after.find((c) => c.contactId === lena.id)?.archived).toBeUndefined();
    expect(groupChats(after).map((g) => g.kind)).toEqual(['customer']);
  });
});
