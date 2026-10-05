// Test-Spielstände (testSaves.ts): Die Dateien in public/spielstaende/ lassen sich laden (auch nach künftigen
// Migrationen) und zeigen den Moment, für den sie gemacht sind.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type GameState, loadSimulation, parseSaveFile } from '../core';
import { discoverModules } from '../core/discover';
import { eventsOfType, recordEvents } from '../core/testing';
import {
  hamburgMissing,
  isBossOfGermany,
  isBusinessSold,
  isPlayerTraveling,
  offerStatus,
  playableCities,
  playerRank,
  presentCity,
  saleStatus,
} from '../modules/city';
import { getShips } from '../modules/fleet';
import { getFincas, growGoals } from '../modules/grow';
import { fullPowerMissing, getLieutenants, getRightHand } from '../modules/hierarchy';
import { getRoutes } from '../modules/logistics';
import { getSpots } from '../modules/spots';
import { getStaff } from '../modules/staff';
import { campaignProgress, cityMilestones } from '../modules/territory';
import { isTradeActive, OWN_ORIGINS, openOrders, originStock } from '../modules/trade';
import { TEST_SAVE_FILES, TEST_SAVE_PHASES } from '../ui/builtin/testSaves';
import {
  ARRIVAL_CITIES,
  europeCustomers,
  HARBOR_EUROPE_CUSTOMERS,
  KOELN_KOMPLETT_DIRTY,
  ownedInKoeln,
  TEST_SAVES,
} from './testSaves';

const loadFile = (id: string) => {
  const file = parseSaveFile(readFileSync(`public/spielstaende/${id}.json`, 'utf8'));
  return loadSimulation(file.state, discoverModules());
};

/** Städte, die komplett sind. */
const completeCities = (state: GameState) => playableCities().filter((c) => campaignProgress(state, c.id).complete);

describe('Test-Spielstände', () => {
  it('zu jedem Test-Spielstand gibt es die Datei, und der Spielstände-Dialog kennt alle', () => {
    for (const save of TEST_SAVES) expect(() => loadFile(save.id), save.id).not.toThrow();
    expect(TEST_SAVE_FILES.map((t) => t.id)).toEqual(TEST_SAVES.map((t) => t.id));
    // Jede Phase im Dialog hat Spielstände, und sie stehen in der Reihenfolge des Bogens.
    const phases = TEST_SAVE_PHASES.map((p) => p.id);
    for (const phase of phases)
      expect(
        TEST_SAVE_FILES.some((t) => t.phase === phase),
        phase,
      ).toBe(true);
    const order = TEST_SAVE_FILES.map((t) => phases.indexOf(t.phase));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('jeder Test-Spielstand trägt seine Kennung und läuft einen Tag ohne Game Over', { timeout: 120_000 }, () => {
    for (const save of TEST_SAVES) {
      const sim = loadFile(save.id);
      expect(sim.state.meta.scenario, save.id).toBe(save.id);
      expect(sim.state.outcome.gameOver, save.id).toBeNull();
      sim.advance(24 * 60);
      expect(sim.state.outcome.gameOver, save.id).toBeNull();
    }
  });

  it('Köln, die ersten Tage: Spots und Läufer, noch kein Veedel und kein Leutnant', () => {
    const sim = loadFile('koeln-anfang');
    expect(presentCity(sim.state)).toBe('koeln');
    expect(playerRank(sim.state).id).toBe('smallDealer');
    expect(getSpots(sim.state, 'koeln').length).toBeGreaterThan(0);
    expect(getStaff(sim.state, { cityId: 'koeln' }).length).toBeGreaterThan(0);
    expect(ownedInKoeln(sim.state)).toHaveLength(0);
    expect(getLieutenants(sim.state)).toHaveLength(0);
  });

  it('Köln, das erste Veedel: ein Veedel, ein Leutnant', () => {
    const sim = loadFile('koeln-veedel');
    expect(ownedInKoeln(sim.state)).toHaveLength(1);
    expect(getLieutenants(sim.state).length).toBeGreaterThan(0);
    expect(playerRank(sim.state).id).toBe('dealer');
  });

  it('Boss von Köln: gerade die Mehrheit, 7 von 12 Veedeln, noch nicht komplett', () => {
    const sim = loadFile('boss-von-koeln');
    expect(cityMilestones(sim.state, 'koeln').majority).not.toBeNull();
    expect(playerRank(sim.state).id).toBe('bossKoeln');
    expect(ownedInKoeln(sim.state)).toHaveLength(7);
    expect(getRightHand(sim.state, 'koeln')).not.toBeNull();
  });

  it('Ankunft in jeder Stadt: gerade ausgestiegen, die Städte davor sind komplett, keine Leute, keine Routen', () => {
    ARRIVAL_CITIES.forEach((cityId, i) => {
      const sim = loadFile(`ankunft-${cityId}`);
      expect(presentCity(sim.state), cityId).toBe(cityId);
      expect(isPlayerTraveling(sim.state), cityId).toBe(false);
      expect(campaignProgress(sim.state, cityId).controlled, cityId).toBe(0);
      expect(getSpots(sim.state, cityId), cityId).toHaveLength(0);
      // Köln und die Städte davor (die Texte im Dialog nennen sie).
      expect(
        completeCities(sim.state)
          .map((c) => c.id)
          .sort(),
        cityId,
      ).toEqual(['koeln', ...ARRIVAL_CITIES.slice(0, i)].sort());
      // Leute bleiben in ihrer Stadt (Auftrag 43): Hier fängst du ohne Leute, Rechte Hand und Routen an.
      expect(getStaff(sim.state, { cityId }), cityId).toHaveLength(0);
      expect(getRightHand(sim.state, cityId), cityId).toBeNull();
      expect(getRoutes(sim.state), cityId).toHaveLength(0);
    });
  });

  it('Boss jeder Stadt: gerade die Mehrheit, noch nicht komplett', () => {
    for (const cityId of ARRIVAL_CITIES) {
      const sim = loadFile(`boss-von-${cityId}`);
      expect(presentCity(sim.state), cityId).toBe(cityId);
      expect(cityMilestones(sim.state, cityId).majority, cityId).not.toBeNull();
      const progress = campaignProgress(sim.state, cityId);
      expect(progress.controlled * 2, cityId).toBeGreaterThan(progress.total);
      expect(progress.complete, cityId).toBe(false);
    }
  });

  it('jede Stadt fast komplett: das letzte Veedel fällt gleich, die Vollmacht geht, dann geht es weiter', () => {
    ARRIVAL_CITIES.forEach((cityId, i) => {
      const sim = loadFile(`${cityId}-komplett`);
      const events = recordEvents(sim);
      expect(presentCity(sim.state), cityId).toBe(cityId);
      const total = campaignProgress(sim.state, cityId).total;
      expect(campaignProgress(sim.state, cityId).controlled, cityId).toBe(total - 1);
      // Die erste Spielminute nach dem Laden ist die volle Stunde: Das letzte Veedel fällt.
      sim.step();
      expect(campaignProgress(sim.state, cityId).complete, cityId).toBe(true);
      expect(
        eventsOfType(events, 'campaign.won').some((e) => e.payload.cityId === cityId),
        cityId,
      ).toBe(true);
      expect(fullPowerMissing(sim.state, cityId), cityId).toEqual([]);
      if (i === ARRIVAL_CITIES.length - 1) {
        // Die letzte Stadt: Boss von Deutschland, Jansen ruft an.
        expect(isBossOfGermany(sim.state), cityId).toBe(true);
      } else {
        // Die nächste Stadt meldet sich.
        expect(offerStatus(sim.state, ARRIVAL_CITIES[i + 1]), cityId).not.toBe('none');
      }
      sim.advance(6 * 60);
      expect(sim.state.outcome.gameOver, cityId).toBeNull();
    });
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

  it('Hafen, Schiff und Europa: ein eigenes Schiff, zwei Häfen, die ersten Kunden in Europa (Auftrag 41)', () => {
    const sim = loadFile('hafen-europa');
    expect(getShips(sim.state).length).toBeGreaterThan(0);
    expect(europeCustomers(sim.state)).toBeGreaterThanOrEqual(HARBOR_EUROPE_CUSTOMERS);
    expect(playerRank(sim.state).id).toBe('importer');
  });

  it('Produktion: zwei Fincas, die erste Ernte im Ausfuhrlager, verschiffen geht (Auftrag 42)', () => {
    const sim = loadFile('produktion');
    expect(sim.state.meta.scenario).toBe('produktion');
    expect(getFincas(sim.state).length).toBeGreaterThanOrEqual(2);
    const origin = OWN_ORIGINS.find((o) => Object.keys(originStock(sim.state, o.id)).length > 0);
    expect(origin).toBeDefined();
    const [productId] = Object.keys(originStock(sim.state, origin?.id ?? ''));
    sim.state.wallet.dirty += 100_000;
    expect(
      sim.dispatch({ type: 'trade.buy', payload: { producerId: origin?.id ?? '', productId, size: 'small' } }).ok,
    ).toBe(true);
    sim.advance(24 * 60);
    expect(sim.state.outcome.gameOver).toBeNull();
  });

  it('Produzent und Europa: die Ränge am Ende des Bogens (Auftrag 42)', () => {
    const producer = loadFile('produzent');
    expect(playerRank(producer.state).id).toBe('producer');
    expect(growGoals(producer.state)).toEqual({ producer: true, europe: false });
    const europe = loadFile('europa');
    expect(playerRank(europe.state).id).toBe('europe');
    expect(growGoals(europe.state).europe).toBe(true);
  });
});
