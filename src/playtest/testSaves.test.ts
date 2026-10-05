// Test-Spielstände (testSaves.ts): Die Dateien in public/spielstaende/ lassen sich laden (auch nach künftigen
// Migrationen) und zeigen den Moment, für den sie gemacht sind.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSimulation, parseSaveFile } from '../core';
import { discoverModules } from '../core/discover';
import { eventsOfType, recordEvents } from '../core/testing';
import { hamburgMissing, isBossOfGermany, isBusinessSold, offerStatus, presentCity, saleStatus } from '../modules/city';
import { fullPowerMissing, getRightHand } from '../modules/hierarchy';
import { isTradeActive, openOrders } from '../modules/trade';
import { TEST_SAVE_FILES } from '../ui/builtin/testSaves';
import { KOELN_KOMPLETT_DIRTY, ownedInKoeln, TEST_SAVES } from './testSaves';

const loadFile = (id: string) => {
  const file = parseSaveFile(readFileSync(`public/spielstaende/${id}.json`, 'utf8'));
  return loadSimulation(file.state, discoverModules());
};

describe('Test-Spielstände', () => {
  it('zu jedem Test-Spielstand gibt es die Datei, und der Spielstände-Dialog kennt alle', () => {
    for (const save of TEST_SAVES) expect(() => loadFile(save.id), save.id).not.toThrow();
    expect(TEST_SAVE_FILES.map((t) => t.id)).toEqual(TEST_SAVES.map((t) => t.id));
  });

  it('Köln fast komplett: 50.000 € schwarz, 11 Veedel, das zwölfte fällt gleich, dann ruft Hamburg an', () => {
    const sim = loadFile('koeln-komplett');
    const events = recordEvents(sim);
    expect(sim.state.meta.scenario).toBe('koeln-komplett');
    expect(sim.state.wallet.dirty).toBe(KOELN_KOMPLETT_DIRTY);
    expect(ownedInKoeln(sim.state)).toHaveLength(11);
    expect(sim.state.outcome.won).toBeNull();
    expect(getRightHand(sim.state, 'koeln')).not.toBeNull();

    // Die erste Spielminute nach dem Laden ist die volle Stunde: Das zwölfte Veedel fällt, Köln ist komplett.
    sim.step();
    expect(ownedInKoeln(sim.state)).toHaveLength(12);
    expect(events.some((e) => e.type === 'campaign.won')).toBe(true);
    expect(sim.state.outcome.gameOver).toBeNull();
    // Für die Vollmacht fehlt nur noch die Geldwäsche (aus, damit die 50.000 € stehen bleiben).
    expect(fullPowerMissing(sim.state, 'koeln')).toEqual(['Diese Aufgaben sind aus: Geldwäsche.']);
    expect(sim.state.wallet.dirty).toBeGreaterThan(KOELN_KOMPLETT_DIRTY - 1000);

    // Eine halbe Stunde später ruft Fiete aus Hamburg an.
    sim.advance(40);
    expect(events.some((e) => e.type === 'call.ringing')).toBe(true);
  });

  it('Köln fast komplett: Zusagen, Geldwäsche einschalten, Fiete ruft wieder an, dann ist Köln zu übergeben', () => {
    const sim = loadFile('koeln-komplett');
    const events = recordEvents(sim);
    const answerCall = () => {
      const ring = eventsOfType(events, 'call.ringing').at(-1);
      if (!ring) throw new Error('Kein Anruf.');
      const messageId = ring.payload.messageId;
      expect(sim.dispatch({ type: 'messages.acceptCall', payload: { messageId } }).ok).toBe(true);
      sim.advance(2);
      expect(sim.dispatch({ type: 'messages.answer', payload: { messageId, optionId: 'come' } }).ok).toBe(true);
    };
    sim.advance(40);
    answerCall();
    // Erst das Haus in Ordnung bringen: Es fehlt nur die Geldwäsche (die Karte "Hamburg wartet" führt zur Rechten Hand).
    expect(offerStatus(sim.state)).toBe('house');
    expect(hamburgMissing(sim.state)).toEqual(['Diese Aufgaben sind aus: Geldwäsche.']);
    const rings = eventsOfType(events, 'call.ringing').length;
    expect(sim.dispatch({ type: 'hierarchy.configureRightHand', payload: { settings: { laundering: true } } }).ok).toBe(
      true,
    );
    expect(hamburgMissing(sim.state)).toEqual([]);
    // Zur nächsten vollen Stunde meldet er sich, eine halbe Stunde später klingelt es.
    sim.advance(60 + 35);
    expect(eventsOfType(events, 'call.ringing').length).toBe(rings + 1);
    answerCall();
    expect(offerStatus(sim.state)).toBe('accepted');
    expect(eventsOfType(events, 'city.offerAccepted')).toHaveLength(1);
  });

  it('Boss von Deutschland: alle Städte komplett, ein paar Stunden später ruft Jansen an (Auftrag 40)', () => {
    const sim = loadFile('deutschland');
    expect(sim.state.meta.scenario).toBe('deutschland');
    expect(isBossOfGermany(sim.state)).toBe(true);
    expect(isBusinessSold(sim.state)).toBe(false);
    sim.advance(12 * 60);
    expect(saleStatus(sim.state)).toBe('calling');
    expect(sim.dispatch({ type: 'city.sell', payload: {} }).ok).toBe(true);
    expect(isBusinessSold(sim.state)).toBe(true);
  });

  it('Hafen-Phase: verkauft, in Rotterdam, die ersten Bestellungen warten (Auftrag 40)', () => {
    const sim = loadFile('hafen');
    expect(sim.state.meta.scenario).toBe('hafen');
    expect(isBusinessSold(sim.state)).toBe(true);
    expect(presentCity(sim.state)).toBe('rotterdam');
    expect(isTradeActive(sim.state)).toBe(true);
    expect(openOrders(sim.state).length).toBeGreaterThan(0);
    sim.advance(24 * 60);
    expect(sim.state.outcome.gameOver).toBeNull();
  });
});
