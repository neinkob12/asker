// Anrufe im Handy (Auftrag 30): klingeln, annehmen, ablehnen, verpassen, Rückruf, Antworten, Speichern und Laden.

import { describe, expect, it } from 'vitest';
import { CALL_MAX_ATTEMPTS, CALL_RETRY_MINUTES, CALL_RING_MINUTES } from './config';
import { messages, type PlaceCall } from './messages';
import { defineModule } from './module';
import { loadSimulation } from './persistence';
import { Simulation } from './sim';
import { eventsOfType, recordEvents } from './testing';

declare module './types' {
  interface ModuleStates {
    callTest: { notes: string[] };
  }
  interface GameCommands {
    'callTest.note': { text: string };
    'callTest.retract': Record<string, never>;
    'callTest.fail': Record<string, never>;
  }
}

/** Kleines Testmodul: ein Befehl, den eine Antwort auslöst. */
const callTest = defineModule({
  id: 'callTest',
  version: 1,
  init: () => ({ notes: [] }),
  commands: {
    'callTest.note': (ctx, payload) => {
      ctx.state.modules.callTest.notes.push(payload.text);
      return { ok: true };
    },
    'callTest.fail': () => ({ ok: false, reason: 'Geht nicht.' }),
    // Wie recruiting.hire: Die Sache ist erledigt, alle offenen Fragen dazu werden zurückgezogen.
    'callTest.retract': (ctx) => {
      messages.retractWhere(ctx, () => true);
      return { ok: true };
    },
  },
});

const CALL: PlaceCall = {
  contact: { id: 'other:test', name: 'Fiete', kind: 'other' },
  lines: ['Moin.', 'Ich hab was für dich.'],
  options: [
    { id: 'yes', label: 'Ich bin dabei', command: { type: 'callTest.note', payload: { text: 'ja' } } },
    { id: 'no', label: 'Nein' },
  ],
  summary: 'Anruf aus Hamburg',
};

function game(): Simulation {
  return Simulation.create([callTest], { seed: 3 });
}

const notes = (sim: Simulation) => sim.state.modules.callTest.notes;

describe('Anrufe', () => {
  it('klingelt, angenommen kommen die Antworten, die Antwort löst den Befehl aus', () => {
    const sim = game();
    const events = recordEvents(sim);
    const id = messages.call(sim.ctx('callTest'), CALL);
    const message = messages.get(sim.state, id);
    expect(message?.call).toMatchObject({ state: 'ringing', attempt: 1, lines: CALL.lines });
    expect(messages.ringingCalls(sim.state).map((m) => m.id)).toEqual([id]);
    // Solange es klingelt, gibt es keine Antworten.
    expect(messages.canAnswer(sim.state, message as never)).toBe(false);
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'yes' } }).ok).toBe(false);

    expect(sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: id } }).ok).toBe(true);
    expect(messages.get(sim.state, id)?.call?.state).toBe('accepted');
    expect(messages.ringingCalls(sim.state)).toEqual([]);
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'yes' } }).ok).toBe(true);
    expect(notes(sim)).toEqual(['ja']);
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(1);
    expect(eventsOfType(events, 'call.accepted')).toHaveLength(1);
    // Kein Rückruf mehr.
    sim.advance(CALL_RING_MINUTES + CALL_RETRY_MINUTES + 10);
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(1);
  });

  it('verpasst: Die Figur schreibt, ruft später wieder an, nach dem letzten Versuch bleibt der Chat', () => {
    const sim = game();
    const events = recordEvents(sim);
    messages.call(sim.ctx('callTest'), CALL);
    for (let attempt = 1; attempt <= CALL_MAX_ATTEMPTS; attempt++) {
      sim.advance(CALL_RING_MINUTES);
      expect(eventsOfType(events, 'call.missed')).toHaveLength(attempt);
      if (attempt < CALL_MAX_ATTEMPTS) sim.advance(CALL_RETRY_MINUTES);
    }
    expect(eventsOfType(events, 'call.ringing').map((e) => e.payload.attempt)).toEqual([1, 2, 3]);
    expect(eventsOfType(events, 'call.missed').map((e) => e.payload.final)).toEqual([false, false, true]);
    const thread = messages.thread(sim.state, 'other:test');
    // Drei Anrufe, zweimal "Hab versucht …", einmal "Ich erreich dich nicht".
    expect(thread.filter((m) => m.call)).toHaveLength(3);
    expect(thread.filter((m) => m.text.includes('versucht'))).toHaveLength(2);
    expect(thread.at(-1)?.text).toContain('erreich dich nicht');
    // Nur der letzte Anruf ist im Chat beantwortbar.
    const answerable = thread.filter((m) => messages.canAnswer(sim.state, m));
    expect(answerable).toHaveLength(1);
    expect(answerable[0].call?.final).toBe(true);
    expect(
      sim.dispatch({ type: 'messages.answer', payload: { messageId: answerable[0].id, optionId: 'yes' } }).ok,
    ).toBe(true);
    expect(notes(sim)).toEqual(['ja']);
    sim.advance(CALL_RETRY_MINUTES * 2);
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(3);
  });

  it('abgelehnt: kein Rückruf, die Antworten stehen im Chat, mit Frist ab dem Ablehnen', () => {
    const sim = game();
    const events = recordEvents(sim);
    const id = messages.call(sim.ctx('callTest'), { ...CALL, expiresIn: 60 });
    sim.advance(10);
    expect(sim.dispatch({ type: 'messages.declineCall', payload: { messageId: id } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: id } }).ok).toBe(false);
    const message = messages.get(sim.state, id);
    expect(message?.call?.state).toBe('declined');
    expect(message?.expiresAt).toBe(sim.state.time + 60);
    expect(messages.canAnswer(sim.state, message as never)).toBe(true);
    sim.advance(CALL_RING_MINUTES + CALL_RETRY_MINUTES);
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(1);
    expect(eventsOfType(events, 'call.declined')).toHaveLength(1);
    expect(messages.canAnswer(sim.state, messages.get(sim.state, id) as never)).toBe(false);
  });

  it('deterministisch, auch über Speichern und Laden mitten im Klingeln und vor einem Rückruf', () => {
    const play = (saveAt: number | null) => {
      let sim = game();
      messages.call(sim.ctx('callTest'), { ...CALL, missedText: 'Melde dich.' });
      for (let minute = 0; minute < CALL_RING_MINUTES * 3 + CALL_RETRY_MINUTES * 2; minute++) {
        if (minute === saveAt) sim = loadSimulation(JSON.parse(JSON.stringify(sim.state)), [callTest]);
        sim.step();
      }
      return sim.state;
    };
    const straight = play(null);
    expect(play(CALL_RING_MINUTES / 2)).toEqual(straight);
    expect(play(CALL_RING_MINUTES + 5)).toEqual(straight);
    expect(messages.thread(straight, 'other:test').filter((m) => m.text === 'Melde dich.')).toHaveLength(2);
  });

  it('Chat löschen beendet einen klingelnden Anruf: kein Klingeln mehr, kein Rückruf', () => {
    const sim = game();
    const events = recordEvents(sim);
    const id = messages.call(sim.ctx('callTest'), CALL);
    expect(sim.dispatch({ type: 'messages.delete', payload: { contactId: 'other:test' } }).ok).toBe(true);
    expect(messages.ringingCalls(sim.state)).toEqual([]);
    expect(messages.get(sim.state, id)?.call?.state).toBe('declined');
    expect(eventsOfType(events, 'call.declined')).toHaveLength(1);
    sim.advance(CALL_RING_MINUTES + CALL_RETRY_MINUTES * 2);
    expect(eventsOfType(events, 'call.missed')).toHaveLength(0);
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(1);
    expect(sim.state.messages.calls.retries).toEqual([]);
    // Die Antworten des Anrufs sind erledigt wie bei jeder gelöschten Frage.
    expect(messages.canAnswer(sim.state, messages.get(sim.state, id) as never)).toBe(false);
  });

  it('Chat löschen streicht einen ausstehenden Rückruf nach einem verpassten Anruf', () => {
    const sim = game();
    const events = recordEvents(sim);
    messages.call(sim.ctx('callTest'), CALL);
    sim.advance(CALL_RING_MINUTES);
    expect(eventsOfType(events, 'call.missed')).toHaveLength(1);
    expect(sim.state.messages.calls.retries).toHaveLength(1);
    sim.dispatch({ type: 'messages.delete', payload: { contactId: 'other:test' } });
    expect(sim.state.messages.calls.retries).toEqual([]);
    sim.advance(CALL_RETRY_MINUTES * 3);
    expect(eventsOfType(events, 'call.ringing')).toHaveLength(1);
  });

  it('Alle löschen beendet ebenfalls klingelnde Anrufe; der Rückruf anderer Figuren bleibt', () => {
    const sim = game();
    const other: PlaceCall = { ...CALL, contact: { id: 'other:second', name: 'Anna', kind: 'other' } };
    messages.call(sim.ctx('callTest'), CALL);
    messages.call(sim.ctx('callTest'), other);
    sim.advance(CALL_RING_MINUTES);
    expect(sim.state.messages.calls.retries).toHaveLength(2);
    sim.dispatch({ type: 'messages.delete', payload: { contactId: 'other:second' } });
    expect(sim.state.messages.calls.retries.map((r) => r.call.contact.id)).toEqual(['other:test']);
    sim.dispatch({ type: 'messages.deleteAll', payload: {} });
    expect(sim.state.messages.calls.retries).toEqual([]);
  });

  it('eine Frist, die erst beim Annehmen gesetzt wird, läuft pünktlich ab (auch nach einer späteren Frist im Cache)', () => {
    const sim = game();
    const events = recordEvents(sim);
    // Eine Frage mit weit entfernter Frist, damit expireMessages sich "nächste Frist in 1000 Minuten" merkt.
    messages.send(sim.ctx('callTest'), {
      contact: { id: 'other:late', name: 'Spät', kind: 'other' },
      text: 'Irgendwann',
      options: [{ id: 'ok', label: 'Ok' }],
      expiresIn: 1000,
    });
    const id = messages.call(sim.ctx('callTest'), { ...CALL, expiresIn: 5 });
    sim.advance(2);
    expect(sim.dispatch({ type: 'messages.acceptCall', payload: { messageId: id } }).ok).toBe(true);
    const deadline = messages.get(sim.state, id)?.expiresAt as number;
    expect(deadline).toBe(sim.state.time + 5);
    sim.advance(4);
    expect(messages.get(sim.state, id)?.expired).toBeUndefined();
    sim.step();
    expect(sim.state.time).toBe(deadline);
    expect(messages.get(sim.state, id)?.expired).toBe(true);
    expect(eventsOfType(events, 'message.expired').filter((e) => e.payload.messageId === id)).toHaveLength(1);
  });

  it('dasselbe beim Ablehnen', () => {
    const sim = game();
    messages.send(sim.ctx('callTest'), {
      contact: { id: 'other:late', name: 'Spät', kind: 'other' },
      text: 'Irgendwann',
      options: [{ id: 'ok', label: 'Ok' }],
      expiresIn: 1000,
    });
    const id = messages.call(sim.ctx('callTest'), { ...CALL, expiresIn: 3 });
    sim.step();
    sim.dispatch({ type: 'messages.declineCall', payload: { messageId: id } });
    sim.advance(3);
    expect(messages.get(sim.state, id)?.expired).toBe(true);
  });

  it('zieht der Befehl einer Antwort die Frage selbst zurück, ist sie beantwortet und nicht zugleich abgelaufen', () => {
    const sim = game();
    const id = messages.send(sim.ctx('callTest'), {
      contact: CALL.contact,
      text: 'Einstellen?',
      options: [{ id: 'hire', label: 'Ja', command: { type: 'callTest.retract', payload: {} } }],
    });
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'hire' } }).ok).toBe(true);
    const message = messages.get(sim.state, id);
    expect(message?.answer).toBe('hire');
    expect(message?.expired).toBeUndefined();
  });

  it('scheitert der Befehl der Antwort, bleibt die Frage unbeantwortet und offen', () => {
    const sim = game();
    const id = messages.send(sim.ctx('callTest'), {
      contact: CALL.contact,
      text: 'Los?',
      options: [{ id: 'go', label: 'Los', command: { type: 'callTest.fail', payload: {} } }],
    });
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: id, optionId: 'go' } })).toEqual({
      ok: false,
      reason: 'Geht nicht.',
    });
    const message = messages.get(sim.state, id);
    expect(message?.answer).toBeUndefined();
    expect(messages.canAnswer(sim.state, message as never)).toBe(true);
    expect(messages.thread(sim.state, CALL.contact.id)).toHaveLength(1);
  });
});
