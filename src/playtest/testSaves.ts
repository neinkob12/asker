// Test-Spielstände zum Laden (Spielstände › Test-Spielstände, oder ?spielstand=<id> in der Adresse): Der Bot spielt
// echte Durchgänge, und an den Abschnitten des Bogens wird ein Stand festgehalten (manche danach für einen Moment
// zurechtgerückt). Drei Läufe pro Seed reichen für alle: Köln (bis kurz vor komplett), Deutschland (alle Städte, mit
// der Ankunft in jeder) und der Hafen (Verkauf bis zum Titel Europa). Die fertigen Dateien liegen in
// public/spielstaende/ (neu erzeugen mit `npm run saves:build`, scripts/build-test-saves.mjs); testSaves.test.ts prüft,
// dass sie sich laden lassen und tun, was sie sollen. Test-Spielstände tragen meta.scenario und kommen nicht in die
// Bestenliste.

import { clock, formatEuro, type GameState, loadSimulation, MINUTES_PER_HOUR, Simulation } from '../core';
import { discoverModules } from '../core/discover';
import { cityName, isPlayerTraveling, playerRank, presentCity } from '../modules/city';
import { activeEncounters, autoResolveEncounter } from '../modules/encounters';
import { getShips } from '../modules/fleet';
import { getFincas, growGoals } from '../modules/grow';
import { controllerOf, PLAYER_FACTION } from '../modules/territory';
import { getCustomers, OWN_ORIGINS, originStock } from '../modules/trade';
import { allVeedel } from '../modules/veedel';
import { newBotStats, playFor } from './bot';
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
/** Städte in der Reihenfolge, in der der Bot sie mit Seed 1 spielt (je ein Test-Spielstand bei der Ankunft). */
export const ARRIVAL_CITIES = ['berlin', 'hamburg', 'frankfurt', 'muenchen'] as const;
/** "Hafen: Schiff und Europa": ein eigenes Schiff und mindestens so viele Kunden in Europa. */
export const HARBOR_EUROPE_CUSTOMERS = 3;
/** So lange spielt der Bot die Hafen-Phase höchstens, bis alle Abschnitte erreicht sind (Spieltage). */
const HARBOR_MAX_DAYS = 240;

/** Kölner Veedel, die der Spieler kontrolliert. */
export function ownedInKoeln(state: GameState): string[] {
  return allVeedel('koeln')
    .filter((v) => controllerOf(state, v.id) === PLAYER_FACTION)
    .map((v) => v.id);
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
    // Im zwölften Veedel die Mehrheit, in den übrigen ein sicherer Vorsprung: Ohne Bot soll in den ersten Stunden nach
    // dem Laden kein Veedel kippen (sonst fehlt für den Anruf aus Hamburg wieder eins).
    if (!allVeedel('koeln').some((v) => !owned.includes(v.id))) throw new Error('Kein zwölftes Veedel.');
    for (const v of allVeedel('koeln')) {
      const row = sim.state.modules.territory.influence[v.id];
      for (const faction of Object.keys(row)) {
        if (faction !== PLAYER_FACTION) row[faction] = Math.min(row[faction], GANG_INFLUENCE_CAP);
      }
      row[PLAYER_FACTION] = Math.max(row[PLAYER_FACTION] ?? 0, PLAYER_INFLUENCE);
    }
    // Die ersten Stunden nach dem Laden ohne Polizeikontrolle in Köln: Der Anruf soll nicht in eine Verfolgung fallen.
    const police = sim.state.modules.police;
    for (const v of allVeedel('koeln')) {
      police.checkReadyAt[v.id] = Math.max(police.checkReadyAt[v.id] ?? 0, sim.state.time + KOELN_KOMPLETT_QUIET);
    }
    kept.set('koeln-komplett', keep(sim.state, 'koeln-komplett', seed));
  });
}

const germanyRuns = new Map<number, Kept>();

/**
 * Deutschland (Auftrag 40): Der Bot spielt alle fünf Städte, bis er Boss von Deutschland ist. Festgehalten wird jede
 * Ankunft in einer neuen Stadt (ankunft-<stadt>, gleich nach dem Aussteigen, bevor der Bot dort etwas tut) und das Ende
 * ("deutschland", vor dem Anruf von Jansen; er ruft ein paar Stunden später an: Verkauf, Rechnung, „Verkauft“).
 */
function germanyRun(seed: number): Kept {
  return cached(germanyRuns, seed, (kept) => {
    const sim = Simulation.create(discoverModules(), { seed, mode: 'normal', runId: `test-deutschland-${seed}` });
    sim.on('city.arrived', ({ cityId, first }) => {
      if (first) kept.set(`ankunft-${cityId}`, keep(sim.state, `ankunft-${cityId}`, seed));
    });
    const day = playToGermany(sim, newBotStats());
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
    if (!sellAndArrive(sim, stats)) throw new Error(`Seed ${seed}: kein Verkauf.`);
    kept.set('hafen', keep(sim.state, 'hafen', seed));
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
/** Boss von Deutschland, kurz vor dem Anruf von Jansen. */
export const buildDeutschland = (seed = 1) => take(germanyRun(seed), 'deutschland', seed);
/** Abschnitte der Hafen-Phase und der Produktion (siehe harborRun). */
export const buildHarbor = (id: string, seed = 1) => take(harborRun(seed), id, seed);

export const TEST_SAVES: readonly TestSave[] = [
  { id: 'koeln-anfang', label: 'Test: Köln, die ersten Tage', build: () => buildKoelnAnfang() },
  { id: 'koeln-veedel', label: 'Test: Köln, das erste Veedel', build: () => buildKoelnVeedel() },
  { id: 'boss-von-koeln', label: 'Test: Boss von Köln', build: () => buildBossVonKoeln() },
  { id: 'koeln-komplett', label: 'Test: Köln fast komplett', build: () => buildKoelnKomplett() },
  ...ARRIVAL_CITIES.map((cityId) => ({
    id: `ankunft-${cityId}`,
    label: `Test: Ankunft in ${cityName(cityId)}`,
    build: () => buildArrival(cityId),
  })),
  { id: 'deutschland', label: 'Test: Boss von Deutschland', build: () => buildDeutschland() },
  { id: 'hafen', label: 'Test: Hafen-Phase', build: () => buildHarbor('hafen') },
  { id: 'hafen-europa', label: 'Test: Hafen, Schiff und Europa', build: () => buildHarbor('hafen-europa') },
  { id: 'produktion', label: 'Test: Produktion', build: () => buildHarbor('produktion') },
  { id: 'produzent', label: 'Test: Produzent', build: () => buildHarbor('produzent') },
  { id: 'europa', label: 'Test: Europa', build: () => buildHarbor('europa') },
];
