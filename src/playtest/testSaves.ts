// Test-Spielstände zum Laden (Spielstände › Test-Spielstände, oder ?spielstand=<id> in der Adresse): Der Bot spielt
// echte Durchgänge, und an den Abschnitten des Bogens wird ein Stand festgehalten (manche danach für einen Moment
// zurechtgerückt). Drei Läufe pro Seed reichen für alle: Köln (bis kurz vor komplett), Deutschland (alle Städte in der
// festen Reihenfolge ARRIVAL_CITIES, in jeder die Ankunft, die Mehrheit und „fast komplett“) und der Hafen (Verkauf bis
// zum Titel Europa). Dazu ein Stand je Minispiel (minigameSaves.ts, aus „Boss von Köln“ bzw. der Hafen-Phase). Die
// fertigen Dateien liegen in
// public/spielstaende/ (neu erzeugen mit `npm run saves:build`, scripts/build-test-saves.mjs); testSaves.test.ts prüft,
// dass sie sich laden lassen und tun, was sie sollen. Test-Spielstände tragen meta.scenario und kommen nicht in die
// Bestenliste.

import { clock, formatEuro, type GameState, loadSimulation, MINUTES_PER_HOUR, Simulation } from '../core';
import { discoverModules } from '../core/discover';
import { cityName, isPlayerTraveling, playerRank, presentCity } from '../modules/city';
import { activeEncounters, autoResolveEncounter } from '../modules/encounters';
import { getShips } from '../modules/fleet';
import { getFincas, growGoals } from '../modules/grow';
import { campaignProgress, controllerOf, PLAYER_FACTION } from '../modules/territory';
import { getCustomers, OWN_ORIGINS, originStock } from '../modules/trade';
import { allVeedel } from '../modules/veedel';
import { DEFAULT_BOT, newBotStats, playFor } from './bot';
import { type MinigameBases, minigameSaves } from './minigameSaves';
import { playToGermany, rightHandReady, sellAndArrive } from './scenario';

/** Ein Test-Spielstand: Kennung (Dateiname), Name im Spielstände-Dialog und wie er entsteht. */
export interface TestSave {
  id: string;
  label: string;
  build: () => GameState;
}

/** Schwarzgeld im Test-Spielstand "Köln fast komplett". */
export const KOELN_KOMPLETT_DIRTY = 50_000;
/** So viel Einfluss hat der Spieler in jedem Kölner Veedel mindestens, die Gangs dort höchstens GANG_INFLUENCE_CAP. */
const PLAYER_INFLUENCE = 62;
const GANG_INFLUENCE_CAP = 30;
/** So lange gibt es in "Köln fast komplett" nach dem Laden keine Polizeikontrolle (Spielminuten). */
const KOELN_KOMPLETT_QUIET = 3 * MINUTES_PER_HOUR;
/** "Köln: die ersten Tage" nach so vielen Spielstunden. */
export const KOELN_START_HOURS = 48;
/**
 * Städte nach Köln in der Reihenfolge der Test-Spielstände (Auftrag 43: Hamburg direkt nach Köln). Für jede gibt es
 * drei Stände: Ankunft (ankunft-<stadt>), Mehrheit (boss-von-<stadt>) und fast komplett (<stadt>-komplett).
 */
export const ARRIVAL_CITIES = ['hamburg', 'berlin', 'muenchen', 'frankfurt'] as const;
/** "Hafen: Schiff und Europa": ein eigenes Schiff und mindestens so viele Kunden in Europa. */
export const HARBOR_EUROPE_CUSTOMERS = 3;
/** So lange spielt der Bot die Hafen-Phase höchstens, bis alle Abschnitte erreicht sind (Spieltage). */
const HARBOR_MAX_DAYS = 240;

/** Veedel einer Stadt, die der Spieler kontrolliert. */
export function ownedIn(state: GameState, cityId: string): string[] {
  return allVeedel(cityId)
    .filter((v) => controllerOf(state, v.id) === PLAYER_FACTION)
    .map((v) => v.id);
}

/** Kölner Veedel, die der Spieler kontrolliert. */
export function ownedInKoeln(state: GameState): string[] {
  return ownedIn(state, 'koeln');
}

/** Kunden in Europa (Auftrag 41). */
export function europeCustomers(state: GameState): number {
  return getCustomers(state).filter((c) => c.europeId !== undefined).length;
}

/** Ware in den Ausfuhrlagern der eigenen Fincas (Gramm). */
function exportGrams(state: GameState): number {
  return OWN_ORIGINS.reduce(
    (sum, o) => sum + Object.values(originStock(state, o.id)).reduce((g, lot) => g + lot.amount, 0),
    0,
  );
}

/** Eine Zeile zu einem Stand (für scripts/build-test-saves.mjs). */
export function saveSummary(state: GameState): string {
  const where = isPlayerTraveling(state) ? 'unterwegs' : `in ${cityName(presentCity(state))}`;
  return `${clock.formatLong(state.time)}, ${where}, ${playerRank(state).title}, ${formatEuro(state.wallet.dirty)} schwarz, ${formatEuro(state.wallet.clean)} sauber`;
}

/** Ein festgehaltener Stand: Kopie mit meta.scenario und eigenem Lauf (ein Game Over löscht nur dessen Spielstände). */
function keep(state: GameState, id: string, seed: number): GameState {
  const copy = structuredClone(state);
  copy.meta.scenario = id;
  copy.meta.runId = `test-${id}-${seed}`;
  return copy;
}

/** Stände eines Laufs nach Kennung; jeder Lauf wird pro Seed nur einmal gespielt. */
type Kept = Map<string, GameState>;

function cached(cache: Map<number, Kept>, seed: number, play: (kept: Kept) => void): Kept {
  const known = cache.get(seed);
  if (known) return known;
  const kept: Kept = new Map();
  play(kept);
  cache.set(seed, kept);
  return kept;
}

function take(kept: Kept, id: string, seed: number): GameState {
  const state = kept.get(id);
  if (!state) throw new Error(`Seed ${seed}: „${id}“ nicht erreicht.`);
  return structuredClone(state);
}

const koelnRuns = new Map<number, Kept>();

/**
 * Köln: Der Bot spielt stundenweise, bis 11 von 12 Veedeln dir gehören. Unterwegs festgehalten: die ersten Tage
 * (KOELN_START_HOURS), das erste eigene Veedel und die Mehrheit (Boss von Köln). Am Ende "Köln fast komplett": 50.000 €
 * Schwarzgeld und eine Rechte Hand auf höchster Stufe mit allen Aufgaben außer der Geldwäsche (sonst gäbe sie gleich
 * einen Teil der 50.000 € in die Wäsche; für die Vollmacht schaltet man sie ein). Gespeichert um xx:59 Uhr; im zwölften
 * Veedel hast du schon die Mehrheit, mit der nächsten vollen Stunde (eine Spielminute nach dem Laden) gehört es dir:
 * Übernahme, Sieg-Bildschirm "Köln komplett", eine halbe Stunde später ruft Fiete aus Hamburg an (die ersten Stunden
 * ohne Polizeikontrolle, damit der Anruf nicht in eine Verfolgung fällt).
 */
function koelnRun(seed: number): Kept {
  return cached(koelnRuns, seed, (kept) => {
    const sim = Simulation.create(discoverModules(), { seed, mode: 'normal', runId: `test-koeln-komplett-${seed}` });
    const stats = newBotStats();
    const start = sim.state.time;
    const reached = (id: string, now: boolean) => {
      if (now && !kept.has(id)) kept.set(id, keep(sim.state, id, seed));
    };
    // Die Mehrheit genau im Schritt, in dem sie fällt (eine Stunde später kann ein Veedel schon wieder weg sein).
    sim.on('campaign.milestone', ({ kind, cityId }) =>
      reached('boss-von-koeln', kind === 'majority' && cityId === 'koeln'),
    );
    for (let hour = 0; hour < 60 * 24 && ownedInKoeln(sim.state).length < 11; hour++) {
      playFor(sim, MINUTES_PER_HOUR, stats);
      if (sim.state.outcome.gameOver)
        throw new Error(`Seed ${seed}: Game Over (${sim.state.outcome.gameOver.reason}).`);
      reached('koeln-anfang', sim.state.time - start >= KOELN_START_HOURS * MINUTES_PER_HOUR);
      reached('koeln-veedel', ownedInKoeln(sim.state).length > 0);
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
    lastVeedelFalls(sim, 'koeln');
    kept.set('koeln-komplett', keep(sim.state, 'koeln-komplett', seed));
  });
}

/**
 * Im letzten Veedel der Stadt die Mehrheit, in den übrigen ein sicherer Vorsprung: Ohne Bot soll in den ersten Stunden
 * nach dem Laden kein Veedel kippen (sonst fehlt für den Anruf der nächsten Stadt wieder eins). Dazu die ersten Stunden
 * ohne Polizeikontrolle: Der Anruf soll nicht in eine Verfolgung fallen.
 */
function lastVeedelFalls(sim: Simulation, cityId: string): void {
  const owned = ownedIn(sim.state, cityId);
  if (!allVeedel(cityId).some((v) => !owned.includes(v.id))) throw new Error(`Kein letztes Veedel in ${cityId}.`);
  for (const v of allVeedel(cityId)) {
    const row = sim.state.modules.territory.influence[v.id];
    for (const faction of Object.keys(row)) {
      if (faction !== PLAYER_FACTION) row[faction] = Math.min(row[faction], GANG_INFLUENCE_CAP);
    }
    row[PLAYER_FACTION] = Math.max(row[PLAYER_FACTION] ?? 0, PLAYER_INFLUENCE);
  }
  const police = sim.state.modules.police;
  for (const v of allVeedel(cityId)) {
    police.checkReadyAt[v.id] = Math.max(police.checkReadyAt[v.id] ?? 0, sim.state.time + KOELN_KOMPLETT_QUIET);
  }
}

/**
 * „<Stadt> fast komplett“ aus dem Stand, in dem der Bot das vorletzte Veedel genommen hat (Auftrag 43): ohne Bot bis kurz
 * vor die nächste volle Stunde, offene Konfrontationen würfeln die Leute aus, die Rechte Hand ist bereit für die
 * Vollmacht (alle Aufgaben an), und das letzte Veedel fällt eine Spielminute nach dem Laden. Danach meldet sich die
 * nächste Stadt (nach der letzten ruft Jansen an).
 */
function nearlyComplete(raw: GameState, cityId: string, seed: number): GameState {
  const sim = loadSimulation(structuredClone(raw), discoverModules());
  while (clock.minute(sim.state.time) !== MINUTES_PER_HOUR - 1) sim.step();
  const ctx = sim.ctx('scenario');
  for (const encounter of [...activeEncounters(sim.state)]) autoResolveEncounter(ctx, encounter.id);
  const total = allVeedel(cityId).length;
  const owned = ownedIn(sim.state, cityId).length;
  if (owned !== total - 1) throw new Error(`Seed ${seed}: ${owned} statt ${total - 1} Veedel in ${cityId}.`);
  rightHandReady(sim, cityId);
  lastVeedelFalls(sim, cityId);
  return keep(sim.state, `${cityId}-komplett`, seed);
}

const germanyRuns = new Map<number, Kept>();

/**
 * Deutschland (Auftrag 40, 43): Der Bot spielt alle fünf Städte in der Reihenfolge ARRIVAL_CITIES, bis er Boss von
 * Deutschland ist. Festgehalten wird in jeder Stadt nach Köln die Ankunft (ankunft-<stadt>, gleich nach dem Aussteigen,
 * bevor der Bot dort etwas tut: keine Leute, keine Rechte Hand, keine Routen), die Mehrheit (boss-von-<stadt>, im Schritt,
 * in dem sie fällt) und das vorletzte Veedel (Rohstand für <stadt>-komplett, siehe nearlyComplete), dazu das Ende
 * ("deutschland", vor dem Anruf von Jansen; er ruft ein paar Stunden später an: Verkauf, Rechnung, „Verkauft“).
 */
function germanyRun(seed: number): Kept {
  return cached(germanyRuns, seed, (kept) => {
    const sim = Simulation.create(discoverModules(), { seed, mode: 'normal', runId: `test-deutschland-${seed}` });
    const later = (cityId: string) => (ARRIVAL_CITIES as readonly string[]).includes(cityId);
    const reached = (id: string) => {
      if (!kept.has(id)) kept.set(id, keep(sim.state, id, seed));
    };
    sim.on('city.arrived', ({ cityId, first }) => {
      if (first && later(cityId)) reached(`ankunft-${cityId}`);
    });
    sim.on('campaign.milestone', ({ kind, cityId }) => {
      if (kind === 'majority' && later(cityId)) reached(`boss-von-${cityId}`);
    });
    sim.on('territory.controlChanged', () => {
      for (const cityId of ARRIVAL_CITIES) {
        const progress = campaignProgress(sim.state, cityId);
        if (progress.controlled === progress.total - 1) reached(`vor-${cityId}-komplett`);
      }
    });
    const day = playToGermany(sim, newBotStats(), { ...DEFAULT_BOT, cityOrder: ARRIVAL_CITIES });
    if (day === null) throw new Error(`Seed ${seed}: nicht Boss von Deutschland geworden.`);
    kept.set('deutschland', keep(sim.state, 'deutschland', seed));
  });
}

const harborRuns = new Map<number, Kept>();

/**
 * Hafen und Produktion (Auftrag 40 bis 42): wie „Deutschland“, dann verkauft der Bot, fährt nach Rotterdam und spielt
 * weiter, bis er den Titel Europa hat (höchstens HARBOR_MAX_DAYS Tage). Festgehalten: die Ankunft in Rotterdam ("hafen":
 * die ersten Bestellungen, Jansens Halle), das erste eigene Schiff mit Kunden in Europa ("hafen-europa"), zwei Fincas
 * mit der ersten Ernte verpackt im Ausfuhrlager ("produktion"), der Rang Produzent ("produzent") und der Titel Europa
 * ("europa", das Ende des Bogens; danach geht es offen weiter).
 */
function harborRun(seed: number): Kept {
  return cached(harborRuns, seed, (kept) => {
    const sim = loadSimulation(take(germanyRun(seed), 'deutschland', seed), discoverModules());
    const stats = newBotStats();
    // Gleich bei der Ankunft, bevor der Bot dort etwas tut: die erste Runde Bestellungen, Jansens erster Schritt.
    sim.on('city.arrived', ({ cityId }) => {
      if (cityId === 'rotterdam' && !kept.has('hafen')) kept.set('hafen', keep(sim.state, 'hafen', seed));
    });
    if (!sellAndArrive(sim, stats)) throw new Error(`Seed ${seed}: kein Verkauf.`);
    const sections: [string, (state: GameState) => boolean][] = [
      ['hafen-europa', (s) => getShips(s).length > 0 && europeCustomers(s) >= HARBOR_EUROPE_CUSTOMERS],
      ['produktion', (s) => getFincas(s).length >= 2 && exportGrams(s) > 0],
      ['produzent', (s) => growGoals(s).producer],
      ['europa', (s) => growGoals(s).europe],
    ];
    const start = sim.state.time;
    while (sections.some(([id]) => !kept.has(id)) && sim.state.time - start < HARBOR_MAX_DAYS * 1440) {
      playFor(sim, 6 * MINUTES_PER_HOUR, stats);
      if (sim.state.outcome.gameOver)
        throw new Error(`Seed ${seed}: Game Over (${sim.state.outcome.gameOver.reason}).`);
      for (const [id, reached] of sections) {
        if (!kept.has(id) && reached(sim.state)) kept.set(id, keep(sim.state, id, seed));
      }
    }
  });
}

/** Köln: die ersten Tage (ein paar Spots, die ersten Läufer). */
export const buildKoelnAnfang = (seed = 1) => take(koelnRun(seed), 'koeln-anfang', seed);
/** Köln: das erste eigene Veedel. */
export const buildKoelnVeedel = (seed = 1) => take(koelnRun(seed), 'koeln-veedel', seed);
/** Boss von Köln: die Mehrheit der Kölner Veedel. */
export const buildBossVonKoeln = (seed = 1) => take(koelnRun(seed), 'boss-von-koeln', seed);
/** Köln fast komplett (siehe koelnRun). */
export const buildKoelnKomplett = (seed = 1) => take(koelnRun(seed), 'koeln-komplett', seed);
/** Gerade in einer neuen Stadt angekommen. */
export const buildArrival = (cityId: string, seed = 1) => take(germanyRun(seed), `ankunft-${cityId}`, seed);
/** Boss einer Stadt nach Köln: gerade die Mehrheit. */
export const buildCityBoss = (cityId: string, seed = 1) => take(germanyRun(seed), `boss-von-${cityId}`, seed);
/** Eine Stadt nach Köln fast komplett (siehe nearlyComplete). */
export const buildCityNearlyComplete = (cityId: string, seed = 1) =>
  nearlyComplete(take(germanyRun(seed), `vor-${cityId}-komplett`, seed), cityId, seed);
/** Boss von Deutschland, kurz vor dem Anruf von Jansen. */
export const buildDeutschland = (seed = 1) => take(germanyRun(seed), 'deutschland', seed);
/** Abschnitte der Hafen-Phase und der Produktion (siehe harborRun). */
export const buildHarbor = (id: string, seed = 1) => take(harborRun(seed), id, seed);
/** Ausgangsstände der Minispiel-Stände (minigameSaves.ts): Boss von Köln und die Hafen-Phase. */
const MINIGAME_BASES: MinigameBases = { koeln: () => buildBossVonKoeln(), harbor: () => buildHarbor('hafen') };

export const TEST_SAVES: readonly TestSave[] = [
  { id: 'koeln-anfang', label: 'Test: Köln, die ersten Tage', build: () => buildKoelnAnfang() },
  { id: 'koeln-veedel', label: 'Test: Köln, das erste Veedel', build: () => buildKoelnVeedel() },
  { id: 'boss-von-koeln', label: 'Test: Boss von Köln', build: () => buildBossVonKoeln() },
  { id: 'koeln-komplett', label: 'Test: Köln fast komplett', build: () => buildKoelnKomplett() },
  ...ARRIVAL_CITIES.flatMap((cityId) => [
    { id: `ankunft-${cityId}`, label: `Test: Ankunft in ${cityName(cityId)}`, build: () => buildArrival(cityId) },
    { id: `boss-von-${cityId}`, label: `Test: Boss von ${cityName(cityId)}`, build: () => buildCityBoss(cityId) },
    {
      id: `${cityId}-komplett`,
      label: `Test: ${cityName(cityId)} fast komplett`,
      build: () => buildCityNearlyComplete(cityId),
    },
  ]),
  { id: 'deutschland', label: 'Test: Boss von Deutschland', build: () => buildDeutschland() },
  { id: 'hafen', label: 'Test: Hafen-Phase', build: () => buildHarbor('hafen') },
  { id: 'hafen-europa', label: 'Test: Hafen, Schiff und Europa', build: () => buildHarbor('hafen-europa') },
  { id: 'produktion', label: 'Test: Produktion', build: () => buildHarbor('produktion') },
  { id: 'produzent', label: 'Test: Produzent', build: () => buildHarbor('produzent') },
  { id: 'europa', label: 'Test: Europa', build: () => buildHarbor('europa') },
  // Auftrag 46: ein Stand je Minispiel (minispiel-<art>), siehe minigameSaves.ts.
  ...minigameSaves(MINIGAME_BASES),
];
