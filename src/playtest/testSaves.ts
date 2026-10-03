// Test-Spielstände zum Laden (Spielstände › Test-Spielstände, oder ?spielstand=<id> in der Adresse): Der Bot spielt
// einen echten Durchgang, dann wird der Stand für den Moment zurechtgerückt, den man ausprobieren will. Die fertigen
// Dateien liegen in public/spielstaende/ (neu erzeugen mit `npm run saves:build`, scripts/build-test-saves.mjs);
// testSaves.test.ts prüft, dass sie sich laden lassen und tun, was sie sollen. Test-Spielstände tragen
// meta.scenario und kommen nicht in die Bestenliste.

import { clock, type GameState, MINUTES_PER_HOUR, Simulation } from '../core';
import { discoverModules } from '../core/discover';
import { activeEncounters, autoResolveEncounter } from '../modules/encounters';
import { controllerOf, PLAYER_FACTION } from '../modules/territory';
import { allVeedel } from '../modules/veedel';
import { newBotStats, playFor } from './bot';
import { rightHandReady } from './scenario';

/** Ein Test-Spielstand: Kennung (Dateiname), Name im Spielstände-Dialog und wie er entsteht. */
export interface TestSave {
  id: string;
  label: string;
  build: () => GameState;
}

/** Schwarzgeld im Test-Spielstand "Köln fast komplett". */
export const KOELN_KOMPLETT_DIRTY = 50_000;
/** So viel Einfluss hat der Spieler im zwölften Veedel, die Gangs dort höchstens GANG_INFLUENCE_CAP. */
const PLAYER_INFLUENCE = 62;
const GANG_INFLUENCE_CAP = 30;

/** Kölner Veedel, die der Spieler kontrolliert. */
export function ownedInKoeln(state: GameState): string[] {
  return allVeedel('koeln')
    .filter((v) => controllerOf(state, v.id) === PLAYER_FACTION)
    .map((v) => v.id);
}

/**
 * Köln fast komplett: Der Bot spielt Köln, bis 11 von 12 Veedeln dir gehören. Dazu 50.000 € Schwarzgeld und eine Rechte
 * Hand auf höchster Stufe mit allen Aufgaben außer der Geldwäsche (sonst gäbe sie gleich einen Teil der 50.000 € in die
 * Wäsche; für die Vollmacht schaltet man sie ein). Gespeichert um xx:59 Uhr; im zwölften Veedel hast du schon die
 * Mehrheit, mit der nächsten vollen Stunde (eine Spielminute nach dem Laden) gehört es dir: Übernahme, Sieg-Bildschirm
 * "Köln komplett", eine halbe Stunde später ruft Fiete aus Hamburg an.
 */
export function buildKoelnKomplett(seed = 1): GameState {
  const sim = Simulation.create(discoverModules(), { seed, mode: 'normal', runId: `test-koeln-komplett-${seed}` });
  sim.state.meta.scenario = 'koeln-komplett';
  const stats = newBotStats();
  for (let hour = 0; hour < 60 * 24 && ownedInKoeln(sim.state).length < 11; hour++) {
    playFor(sim, MINUTES_PER_HOUR, stats);
    if (sim.state.outcome.gameOver) throw new Error(`Seed ${seed}: Game Over (${sim.state.outcome.gameOver.reason}).`);
  }
  // Ohne Bot bis kurz vor die nächste volle Stunde; offene Konfrontationen würfeln die Leute aus.
  while (clock.minute(sim.state.time) !== MINUTES_PER_HOUR - 1) sim.step();
  const ctx = sim.ctx('scenario');
  for (const encounter of [...activeEncounters(sim.state)]) autoResolveEncounter(ctx, encounter.id);
  const owned = ownedInKoeln(sim.state);
  if (owned.length !== 11) throw new Error(`Seed ${seed}: ${owned.length} Veedel statt 11.`);

  rightHandReady(sim, 'koeln');
  sim.dispatch({
    type: 'hierarchy.configureRightHand',
    payload: {
      settings: { orders: true, pickup: true, restock: true, staffing: true, wholesale: true, laundering: false },
      cityId: 'koeln',
    },
  });
  sim.state.wallet.dirty = KOELN_KOMPLETT_DIRTY;
  const last = allVeedel('koeln').find((v) => !owned.includes(v.id));
  if (!last) throw new Error('Kein zwölftes Veedel.');
  const row = sim.state.modules.territory.influence[last.id];
  for (const faction of Object.keys(row)) {
    if (faction !== PLAYER_FACTION) row[faction] = Math.min(row[faction], GANG_INFLUENCE_CAP);
  }
  row[PLAYER_FACTION] = Math.max(row[PLAYER_FACTION] ?? 0, PLAYER_INFLUENCE);
  return sim.state;
}

export const TEST_SAVES: readonly TestSave[] = [
  { id: 'koeln-komplett', label: 'Test: Köln fast komplett', build: () => buildKoelnKomplett() },
];
