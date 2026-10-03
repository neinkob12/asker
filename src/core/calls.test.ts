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
});
