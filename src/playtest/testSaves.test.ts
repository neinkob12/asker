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
import { activeEncounters } from '../modules/encounters';
import { getShips } from '../modules/fleet';
import { getFincas, growGoals } from '../modules/grow';
import { fullPowerMissing, getLieutenants, getRightHand } from '../modules/hierarchy';
import { getRoutes, getTrips } from '../modules/logistics';
import { activeChallenge, MINIGAME_KIND_IDS, type MinigameKind } from '../modules/minigames';
import { plannedRaidInfo } from '../modules/police';
import { currentQuest } from '../modules/quests';
import { getCandidate } from '../modules/recruiting';
import { getSpots } from '../modules/spots';
import { getStaff } from '../modules/staff';
import { campaignProgress, cityMilestones } from '../modules/territory';
import {
  getShipments as getTradeShipments,
  isTradeActive,
  OWN_ORIGINS,
  openOrders,
  originStock,
} from '../modules/trade';
import { TEST_SAVE_FILES, TEST_SAVE_PHASES } from '../ui/builtin/testSaves';
import { isMinigameSave, MINIGAME_SAVE_IDS, minigameSaveId } from './minigameSaves';
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
    // Die Minispiel-Stände prüft der eigene Block unten (ohne Spieler liefe ihre Konfrontation auf Würfel hinaus).
    for (const save of TEST_SAVES.filter((s) => !isMinigameSave(s.id))) {
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
    expect(fullPowerMissing(sim.state, 'koeln')).toEqual([expect.stringMatching(/ist eine Aufgabe aus: Geldwäsche\./)]);
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
    expect(hamburgMissing(sim.state)).toEqual([expect.stringMatching(/ist eine Aufgabe aus: Geldwäsche\./)]);
    // Fietes Liste führt mit einem Knopf zur Rechten Hand (Auftrag 43, M7).
    expect(sim.state.messages.list.some((m) => m.options?.some((o) => o.id === 'openRightHand'))).toBe(true);
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
    // Auftrag 43: Jansen führt durch den neuen Job, die alten Kapitel sind vorbei.
    expect(currentQuest(sim.state)?.id).toBe('rtAnswer');
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

/** Was ein gewonnenes Minispiel im Stand bewirkt haben muss (die Folgen laufen im auslösenden Modul). */
const AFTER_WIN: Record<MinigameKind, (state: GameState, before: GameState) => void> = {
  // Die Konfrontation wartet nicht mehr auf das Minispiel (abgehängt bzw. der Kampf ist entschieden).
  chase: (state) => expect(activeEncounters(state).some((e) => e.minigame)).toBe(false),
  brawl: (state) => expect(activeEncounters(state).some((e) => e.minigame)).toBe(false),
  traffic: (state) => {
    expect(activeEncounters(state).some((e) => e.minigame)).toBe(false);
    expect(getTrips(state).some((t) => t.driverId === null)).toBe(true);
  },
  // Die Razzia ist noch geplant, der versteckte Anteil steht.
  stash: (state) => {
    const raid = state.modules.police.plannedRaids;
    const veedelId = Object.keys(raid)[0];
    expect(veedelId).toBeDefined();
    expect(plannedRaidInfo(state, veedelId)?.stash).toBeGreaterThan(0);
  },
  undercover: (state) => expect(state.modules.police.undercover.shift).toBeNull(),
  // Tresor und Bude: Schwarzgeld aus der Kasse der Gang.
  safe: (state, before) => expect(state.wallet.dirty).toBeGreaterThan(before.wallet.dirty),
  search: (state, before) => expect(state.wallet.dirty).toBeGreaterThan(before.wallet.dirty),
  container: (state) => expect(getTradeShipments(state).some((x) => x.packing !== undefined)).toBe(true),
  papers: (state) => expect(state.modules.suppliers.shipments.some((x) => x.papers)).toBe(false),
  interview: (state) => {
    const candidate = state.modules.recruiting.candidates.find((c) => c.interviewed);
    expect(candidate).toBeDefined();
  },
};

describe('Test-Spielstände: Minispiele (Auftrag 46)', () => {
  it('es gibt einen Stand je Art, in der Reihenfolge der Arten, in der Gruppe „Minispiele“', () => {
    expect(MINIGAME_SAVE_IDS).toEqual(MINIGAME_KIND_IDS.map((k) => `minispiel-${k}`));
    for (const id of MINIGAME_SAVE_IDS) expect(TEST_SAVE_FILES.find((t) => t.id === id)?.phase, id).toBe('minigames');
  });

  for (const kind of MINIGAME_KIND_IDS) {
    const id = minigameSaveId(kind);
    it(`${id}: das Minispiel steht an, ein Sieg wirkt, danach läuft das Spiel einen Tag weiter`, () => {
      const sim = loadFile(id);
      const state = sim.state;
      expect(state.meta.scenario).toBe(id);
      expect(state.outcome.gameOver).toBeNull();
      const open = activeChallenge(state);
      expect(open?.kind).toBe(kind);
      if (!open) return;
      // Nur dieses eine Minispiel, mit Frist in der Zukunft, in der Stadt, in der du bist.
      expect(state.modules.minigames.active).toHaveLength(1);
      expect(open.deadline).toBeGreaterThan(state.time);
      expect(open.cityId).toBe(presentCity(state));
      expect(open.title.length).toBeGreaterThan(0);
      expect(open.situation.length).toBeGreaterThan(0);
      // Gewonnen: Die Folgen laufen im auslösenden Modul (nach dem Kampf kann gleich der Tresor anstehen).
      const before = structuredClone(state);
      expect(sim.dispatch({ type: 'minigames.finish', payload: { id: open.id, score: 0.9, picks: [] } }).ok).toBe(true);
      expect(activeChallenge(state)?.id).not.toBe(open.id);
      AFTER_WIN[kind](state, before);
      sim.advance(24 * 60);
      expect(state.outcome.gameOver).toBeNull();
    });
  }

  it('die Stände aus Köln spielen in Köln mit Rechter Hand, der Container in Rotterdam', () => {
    for (const kind of MINIGAME_KIND_IDS) {
      const sim = loadFile(minigameSaveId(kind));
      if (kind === 'container') {
        expect(presentCity(sim.state)).toBe('rotterdam');
        expect(isBusinessSold(sim.state)).toBe(true);
      } else {
        expect(presentCity(sim.state), kind).toBe('koeln');
        expect(getRightHand(sim.state, 'koeln'), kind).not.toBeNull();
      }
    }
  });

  it('Gespräch: der Bewerber steht nach dem Stand noch zur Verfügung', () => {
    const sim = loadFile(minigameSaveId('interview'));
    const open = activeChallenge(sim.state);
    const candidate = getCandidate(sim.state, String(open?.origin.ref));
    expect(candidate?.interviewed).toBe(true);
  });
});
