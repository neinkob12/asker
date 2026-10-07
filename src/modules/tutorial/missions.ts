// Die Missionen des Tutorials als Daten (Auftrag 46b): eine pro Stufe mit Mission, jede mit Teilzielen (parts). Ein
// Teilziel misst am Zustand (measure) oder zählt Ereignisse (ohne measure: der Zähler progress der Mission; count
// liefert pro Ereignis einen Zuwachs oder Schlüssel, die nur einmal zählen, z.B. Produkte). Mit once bleibt ein
// Teilziel erreicht, auch wenn der Wert wieder sinkt (Geld, das man gleich ausgibt).

import type { GameEvents, GameState } from '../../core';
import { wallet } from '../../core';
import { warehouseSite } from '../goods';
import { getLieutenants, getRightHand, isTaskActive, isTaskUnlocked, type RightHandTaskKey } from '../hierarchy';
import { getLaunderingStats } from '../laundering';
import { getRoutes, hasBerth } from '../logistics';
import { getSpots, isSpotActive, lockedSpots, spotCity } from '../spots';
import { activeRunnerAt, getStaff, getStaffMember } from '../staff';
import { deliversTo, getRelation, getSuppliers, isUnlocked, shipmentItems, shipmentsInTransit } from '../suppliers';
import { controlledBy, PLAYER_FACTION } from '../territory';
import { veedelCity } from '../veedel';

/** Laufende Mission im Zustand. */
export interface MissionState {
  id: string;
  /** Zähler der Mission (Teilziele ohne measure). */
  progress: number;
  startedAt: number;
  /** Schlüssel, die schon gezählt wurden (z.B. bestellte Produkte): progress = seen.length. */
  seen: string[];
  /** Teilziele mit once, die schon einmal erreicht waren. */
  reached: string[];
}

export interface MissionPart {
  id: string;
  /** Kurz, für die Liste mit Haken. */
  label: string;
  target: number;
  /** Wert aus dem Zustand; ohne: der Zähler der Mission. */
  measure?: (state: GameState) => number;
  /** Als Euro anzeigen. */
  euro?: boolean;
  /** Einmal erreicht bleibt erreicht. */
  once?: boolean;
}

/** Wohin die Karte springt (die Oberfläche setzt das um). */
export type MissionGoTo = 'spot' | 'spots' | 'suppliers' | 'staff' | 'territory' | 'laundering' | 'port' | 'rightHand';

export type MissionCounter = {
  [K in keyof GameEvents]?: (payload: GameEvents[K], state: GameState) => number | readonly string[];
};

export interface MissionDef {
  id: string;
  /** Stufe, zu der die Mission gehört (eine pro Stufe). */
  stage: number;
  icon: string;
  title: string;
  /** Was Peter schreibt, wenn die Mission beginnt. */
  task: string;
  /** Ein Satz Tipp auf der Karte. */
  hint: string;
  /** Was Peter schreibt, wenn sie erledigt ist. */
  doneText: string;
  goTo: MissionGoTo;
  parts: MissionPart[];
  count?: MissionCounter;
}

const CITY = 'koeln';

/** Spots in Köln nach Stufe 2 (Neumarkt, Zülpicher Platz, Rudolfplatz); „weitere Spots“ zählen darüber hinaus. */
const SPOTS_AFTER_STAGE_2 = 3;

function koelnSpots(state: GameState): number {
  return getSpots(state, CITY).length;
}

function koelnVeedel(state: GameState): number {
  return controlledBy(state, PLAYER_FACTION).filter((id) => veedelCity(id) === CITY).length;
}

function koelnRunners(state: GameState): number {
  return getStaff(state, { role: 'runner', cityId: CITY }).length;
}

function koelnLieutenants(state: GameState): number {
  return getLieutenants(state).filter((p) => (getStaffMember(state, p.staffId)?.cityId ?? CITY) === CITY).length;
}

/** Produkte einer Bestellung (Sammelbestellung: alle Pakete). */
function orderedProducts(payload: GameEvents['shipment.ordered'], state: GameState): readonly string[] {
  const shipment = shipmentsInTransit(state).find((s) => s.id === payload.shipmentId);
  if (shipment) return [...new Set(shipmentItems(shipment).map((i) => i.productId))];
  return payload.productId ? [payload.productId] : [];
}

/** Jeder freigeschaltete Lieferant, der nach Köln liefert, hat eine Bestellregel (Rechte Hand oder ein Leutnant). */
function suppliersWithRule(state: GameState): [number, number] {
  const suppliers = getSuppliers(state).filter((s) => isUnlocked(state, s.id) && deliversTo(s, CITY));
  const rules = [
    ...(getRightHand(state, CITY)?.settings.restockRules ?? []),
    ...getLieutenants(state).flatMap((p) => p.settings.orderRules),
  ];
  const covered = suppliers.filter((s) => rules.some((r) => r.supplierId === s.id)).length;
  return [covered, suppliers.length];
}

/** Routen innerhalb Kölns mit festem Fahrer. */
function koelnRoutesWithDriver(state: GameState): [number, number] {
  const routes = getRoutes(state).filter(
    (r) => warehouseSite(r.fromId)?.cityId === CITY && warehouseSite(r.toId)?.cityId === CITY,
  );
  return [routes.filter((r) => r.driverId !== null).length, routes.length];
}

const TASKS: readonly RightHandTaskKey[] = ['orders', 'pickup', 'restock', 'staffing', 'wholesale', 'laundering'];

/** Rechte Hand da und jede Aufgabe, die ihre Stufe erlaubt, an. */
function rightHandTasksOn(state: GameState): number {
  if (!getRightHand(state, CITY)) return 0;
  const unlocked = TASKS.filter((k) => isTaskUnlocked(state, k));
  return unlocked.length > 0 && unlocked.every((k) => isTaskActive(state, k)) ? 1 : 0;
}

export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'serve3',
    stage: 1,
    icon: 'smile',
    title: 'Drei Kunden bedienen',
    task: 'Am Neumarkt warten Leute auf dich. Bedien drei davon selbst, dann weißt du, wie das läuft.',
    hint: 'Tipp auf den Neumarkt, dann auf „Verkaufen“.',
    doneText: 'Drei Kunden, drei Scheine. Jetzt holen wir uns mehr Ecken.',
    goTo: 'spot',
    parts: [{ id: 'served', label: 'Kunden selbst bedient', target: 3 }],
    count: {
      'sale.completed': (p) => (p.sellerId === null && p.channel === 'street' ? 1 : 0),
    },
  },
  {
    id: 'buySpots',
    stage: 2,
    icon: 'pin',
    title: 'Zwei Spots kaufen',
    task: 'Zülpicher Platz und Rudolfplatz stehen zum Verkauf, je 350 €. Hol dir beide.',
    hint: 'Graue Spots auf der Karte kannst du freischalten.',
    doneText: 'Drei Ecken in der Stadt. Ich leg dir noch was Ware drauf, bis die erste Bestellung kommt.',
    goTo: 'spots',
    parts: [
      {
        id: 'zuelpicher',
        label: 'Zülpicher Platz',
        target: 1,
        measure: (s) => (isSpotActive(s, 'zuelpicher') ? 1 : 0),
      },
      { id: 'rudolfplatz', label: 'Rudolfplatz', target: 1, measure: (s) => (isSpotActive(s, 'rudolfplatz') ? 1 : 0) },
    ],
  },
  {
    id: 'threeProducts',
    stage: 5,
    icon: 'package',
    title: 'Drei Produkte bestellen',
    task: 'Kalle und Toni liefern. Bestell drei verschiedene Produkte, mehr Auswahl bringt mehr Kunden.',
    hint: 'Ware auf Lager lohnt sich: Leere Spots verkaufen nichts.',
    doneText: 'Sortiment steht. Jetzt verdienen wir richtig Geld.',
    goTo: 'suppliers',
    parts: [{ id: 'products', label: 'Verschiedene Produkte bestellt', target: 3 }],
    count: { 'shipment.ordered': orderedProducts },
  },
  {
    id: 'earn4k',
    stage: 6,
    icon: 'money',
    title: 'Geld verdienen',
    task: 'Alle Spots in deinem Veedel und drumherum stehen zum Verkauf. Hol dir vier, stell drei Läufer ein und bring es auf 4.000 € schwarz.',
    hint: 'Läufer verkaufen für dich, auch wenn du nicht da bist.',
    doneText: 'Vier Spots, drei Läufer, viertausend Euro. Du brauchst Leute, die das für dich führen.',
    goTo: 'spots',
    parts: [
      {
        id: 'money',
        label: 'Schwarzgeld',
        target: 4000,
        euro: true,
        once: true,
        measure: (s) => wallet.balance(s, 'dirty'),
      },
      {
        id: 'spots',
        label: 'Weitere Spots',
        target: 4,
        measure: (s) => Math.max(0, koelnSpots(s) - SPOTS_AFTER_STAGE_2),
      },
      { id: 'runners', label: 'Läufer', target: 3, measure: koelnRunners },
    ],
  },
  {
    id: 'earn10k',
    stage: 7,
    icon: 'trendUp',
    title: 'Dein Veedel',
    task: 'Übernimm dein Veedel, hol dir fünf weitere Spots und bring es einmal auf 10.000 € schwarz.',
    hint: 'Verkäufe und Leute im Veedel bringen Einfluss, ab 50 gehört es dir.',
    doneText: 'Dein eigenes Veedel. Jetzt wird es Zeit, das Geld sauber zu kriegen.',
    goTo: 'territory',
    parts: [
      {
        id: 'money',
        label: 'Einmal Schwarzgeld',
        target: 10000,
        euro: true,
        once: true,
        measure: (s) => wallet.balance(s, 'dirty'),
      },
      { id: 'veedel', label: 'Eigenes Veedel', target: 1, measure: koelnVeedel },
      {
        id: 'spots',
        label: 'Weitere Spots',
        target: 5,
        measure: (s) => Math.max(0, koelnSpots(s) - SPOTS_AFTER_STAGE_2 - 4),
      },
    ],
  },
  {
    id: 'harbor',
    stage: 8,
    icon: 'anchor',
    title: 'Geldwäsche und Hafen',
    task: 'Wasch 4.000 €, miet den Liegeplatz im Niehler Hafen und bestell einmal bei Jansen in Rotterdam. Der Preis dort ist gut.',
    hint: 'Der Liegeplatz kostet sauberes Geld.',
    doneText: 'Hafen läuft. Mit einem Fahrer holst du die Ware ab, ohne selbst zu fahren.',
    goTo: 'laundering',
    parts: [
      {
        id: 'laundered',
        label: 'Gewaschen',
        target: 4000,
        euro: true,
        measure: (s) => getLaunderingStats(s).totalLaundered,
      },
      { id: 'berth', label: 'Liegeplatz gemietet', target: 1, measure: (s) => (hasBerth(s, CITY) ? 1 : 0) },
      {
        id: 'jansen',
        label: 'Bei Jansen bestellt',
        target: 1,
        measure: (s) => (getRelation(s, 'rotterdam').orders > 0 ? 1 : 0),
      },
    ],
  },
  {
    id: 'lieutenants4',
    stage: 9,
    icon: 'crew',
    title: 'Vier Leutnants',
    task: 'Hol dir zwei weitere Veedel und stell vier Leutnants auf.',
    hint: 'Ein Leutnant führt bis zu drei Spots und bestellt nach seinen Regeln.',
    doneText: 'Drei Veedel, vier Leutnants. Ein Buchhalter holt dir jetzt mehr aus dem Laden.',
    goTo: 'territory',
    parts: [
      { id: 'veedel', label: 'Veedel', target: 3, measure: koelnVeedel },
      { id: 'lieutenants', label: 'Leutnants', target: 4, measure: koelnLieutenants },
    ],
  },
  {
    id: 'boss',
    stage: 11,
    icon: 'crown',
    title: 'Boss von Köln',
    task: 'Sieben Veedel, dann nennen sie dich Boss von Köln.',
    hint: 'Die Gangs schlafen nicht: Stärke und Sicherheit halten dein Revier.',
    doneText: 'Boss von Köln. Jetzt brauchst du eine Rechte Hand, die den Laden führt.',
    goTo: 'territory',
    parts: [{ id: 'veedel', label: 'Veedel', target: 7, measure: koelnVeedel }],
  },
  {
    id: 'koelnDone',
    stage: 12,
    icon: 'flag',
    title: 'Köln komplett',
    task: 'Alle zwölf Veedel, alle Spots, überall ein Läufer, Bestellregeln bei allen Lieferanten, Fahrer auf allen Routen, die Rechte Hand mit allen Aufgaben, 50.000 € schwarz und 12.000 € sauber. Dann läuft Köln ohne dich.',
    hint: 'Alles automatisiert: Dann kannst du nach Hamburg.',
    doneText: 'Köln läuft ohne dich. Hamburg wartet.',
    goTo: 'rightHand',
    parts: [
      {
        id: 'money',
        label: 'Schwarzgeld',
        target: 50000,
        euro: true,
        once: true,
        measure: (s) => wallet.balance(s, 'dirty'),
      },
      {
        id: 'clean',
        label: 'Sauberes Geld',
        target: 12000,
        euro: true,
        once: true,
        measure: (s) => wallet.balance(s, 'clean'),
      },
      {
        id: 'spots',
        label: 'Alle Spots',
        target: 1,
        measure: (s) => (lockedSpots(s).some((spot) => spotCity(spot) === CITY) ? 0 : 1),
      },
      { id: 'veedel', label: 'Alle zwölf Veedel', target: 12, measure: koelnVeedel },
      {
        id: 'runners',
        label: 'Überall ein Läufer',
        target: 1,
        measure: (s) => (getSpots(s, CITY).every((spot) => activeRunnerAt(s, spot.id)) ? 1 : 0),
      },
      {
        id: 'rules',
        label: 'Bestellregeln bei allen Lieferanten',
        target: 1,
        measure: (s) => {
          const [covered, total] = suppliersWithRule(s);
          return total > 0 && covered === total ? 1 : 0;
        },
      },
      {
        id: 'drivers',
        label: 'Fahrer auf allen Kölner Routen',
        target: 1,
        measure: (s) => {
          const [withDriver, total] = koelnRoutesWithDriver(s);
          return total > 0 && withDriver === total ? 1 : 0;
        },
      },
      { id: 'tasks', label: 'Aufgaben der Rechten Hand an', target: 1, measure: rightHandTasksOn },
    ],
  },
];

export function missionById(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export function missionForStage(stage: number): MissionDef | undefined {
  return MISSIONS.find((m) => m.stage === stage);
}
