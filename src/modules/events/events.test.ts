// Stadt-Events (Auftrag 30, Etappe 7): Kalender, Ankündigung, Faktoren, nur in der eigenen Stadt.

import { describe, expect, it } from 'vitest';
import { clock, MINUTES_PER_DAY, messages } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getSpot } from '../spots';
import { EVENT_CONTACTS } from './config';
import {
  activeEvents,
  CITY_EVENTS,
  eventFactor,
  getEventDef,
  isEventActive,
  nextEventStart,
  raidsAllowed,
  upcomingEvents,
} from './index';

const DAY = MINUTES_PER_DAY;

function def(id: string) {
  const found = getEventDef(id);
  if (!found) throw new Error(id);
  return found;
}

describe('Stadt-Events (Auftrag 30)', () => {
  it('Kalender: Karneval ab Tag 30 alle 90 Tage sechs Tage, danach zwei Tage Kater, Lichter an Tag 60', () => {
    const karneval = def('karneval');
    expect(isEventActive(karneval, clock.at(29, 23, 59))).toBe(false);
    expect(isEventActive(karneval, clock.at(30))).toBe(true);
    expect(isEventActive(karneval, clock.at(35, 23))).toBe(true);
    expect(isEventActive(karneval, clock.at(36))).toBe(false);
    expect(isEventActive(def('kater'), clock.at(36))).toBe(true);
    expect(isEventActive(def('kater'), clock.at(38))).toBe(false);
    expect(isEventActive(karneval, clock.at(120, 12))).toBe(true);
    expect(nextEventStart(karneval, clock.at(1))).toBe(clock.at(30));
    expect(nextEventStart(karneval, clock.at(30))).toBe(clock.at(120));
    expect(isEventActive(def('lichter'), clock.at(60, 20))).toBe(true);
    expect(isEventActive(def('lichter'), clock.at(61))).toBe(false);
  });

  it('FC-Heimspiel: jeden zweiten Samstag von 15 bis 22 Uhr', () => {
    const fc = def('fc');
    const saturdays: number[] = [];
    for (let day = 1; day <= 42; day++) {
      const at = clock.at(day, 16);
      if (clock.weekday(at) === 5) saturdays.push(day);
    }
    const playing = saturdays.filter((day) => isEventActive(fc, clock.at(day, 16)));
    expect(playing.length).toBe(3);
    expect(playing[1] - playing[0]).toBe(14);
    expect(isEventActive(fc, clock.at(playing[0], 14, 59))).toBe(false);
    expect(isEventActive(fc, clock.at(playing[0], 22))).toBe(false);
    expect(nextEventStart(fc, clock.at(playing[0], 10))).toBe(clock.at(playing[0], 15));
  });

  it('wirkt nur im Gebiet und nur in der eigenen Stadt', () => {
    const sim = createTestGame();
    sim.state.time = clock.at(31, 12);
    expect(activeEvents(sim.state, 'koeln').map((e) => e.id)).toContain('karneval');
    expect(eventFactor(sim.state, 'demand', { veedelId: 'altstadt-nord' })).toBe(2);
    expect(eventFactor(sim.state, 'demand', { veedelId: 'kalk' })).toBe(1);
    expect(eventFactor(sim.state, 'checks', { veedelId: 'neustadt-sued' })).toBe(0.5);
    expect(eventFactor(sim.state, 'heatPerSale', { veedelId: 'altstadt-sued' })).toBe(0.7);
    expect(raidsAllowed(sim.state, 'koeln')).toBe(false);
    expect(raidsAllowed(sim.state, 'hamburg')).toBe(true);
    // Der Dom läuft an Tag 31 nicht; an Tag 12 schon, aber nur in St. Pauli.
    sim.state.time = clock.at(12, 20);
    expect(eventFactor(sim.state, 'demand', { veedelId: 'st-pauli' })).toBe(1.4);
    expect(eventFactor(sim.state, 'demand', { veedelId: 'altstadt-nord' })).toBe(1);
    // Hamburg ist noch nicht frei: keine laufenden Events dort.
    expect(activeEvents(sim.state).map((e) => e.cityId)).not.toContain('hamburg');
  });

  it('Kölner Lichter und Hafengeburtstag treffen Spots am Wasser', () => {
    const lichter = def('lichter');
    const hafen = def('hafengeburtstag');
    expect(lichter.area.spots?.length).toBeGreaterThanOrEqual(2);
    expect(hafen.area.spots?.length).toBeGreaterThanOrEqual(1);
    const sim = createTestGame();
    sim.state.time = clock.at(60, 21);
    const spot = lichter.area.spots?.[0] ?? '';
    expect(eventFactor(sim.state, 'demand', { spotId: spot })).toBe(2.5);
    expect(eventFactor(sim.state, 'checks', { veedelId: getSpot(sim.state, spot)?.veedelId })).toBe(1.5);
  });

  it('kündigt einen Tag vorher per Handy an und meldet Start und Ende', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    sim.advance(clock.at(29, 1) - sim.state.time);
    const thread = messages.thread(sim.state, EVENT_CONTACTS.koeln.id).map((m) => m.text);
    expect(thread).toContain(def('karneval').announce);
    sim.advance(clock.at(30, 1) - sim.state.time);
    expect(eventsOfType(events, 'events.started').map((e) => e.payload.eventId)).toContain('karneval');
    sim.advance(clock.at(36, 1) - sim.state.time);
    expect(eventsOfType(events, 'events.ended').map((e) => e.payload.eventId)).toContain('karneval');
    // Angekündigt wird jeder Termin nur einmal.
    expect(
      messages.thread(sim.state, EVENT_CONTACTS.koeln.id).filter((m) => m.text === def('karneval').announce),
    ).toHaveLength(1);
  });

  it('kommende Termine für die Reviere', () => {
    const sim = createTestGame();
    sim.state.time = clock.at(28, 12);
    const next = upcomingEvents(sim.state, 'koeln', 14);
    expect(next.map((e) => e.def.id)).toContain('karneval');
    expect(next.every((e) => e.def.cityId === 'koeln')).toBe(true);
    expect(CITY_EVENTS.filter((e) => e.cityId === 'hamburg').length).toBeGreaterThanOrEqual(3);
    expect(DAY).toBe(1440);
  });
});
