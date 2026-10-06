// Einstellbare Werte der Quests: Kapitel, die Quests der Reihe nach und ihre Belohnungen.
// Peter (dein alter Kontakt) schickt jede Quest per Handy und meldet sich, wenn sie erledigt ist. Im Kapitel
// „Rotterdam“ (Auftrag 43) führt Jansen durch den neuen Job (voice: 'jansen').

import type { Contact, GameEvents, GameState, MoneyKind } from '../../core';
import { HARBOR_CITY, isPlayerTraveling, presentCity } from '../city';
import { getVehicles, isShip } from '../fleet';
import { getWarehouses } from '../goods';
import { fincaWorkers, getFincas, isGrowStarted, openRegions, workersNeeded } from '../grow';
import { getLieutenants, getRightHand } from '../hierarchy';
import { netWorth } from '../leaderboard';
import { hasBerth } from '../logistics';
import { hottestVeedel } from '../police';
import { getSpots } from '../spots';
import { getStaff } from '../staff';
import { shipmentsInTransit } from '../suppliers';
import { controlledBy, PLAYER_FACTION } from '../territory';
import { getDeliveries, getOrders, getShipments, tradeStats } from '../trade';
import { veedelCity } from '../veedel';

/**
 * Fortschritt einer Bestell-Quest (Auftrag 43, G6): bestellt nach dem Start (Zähler) oder schon vorher, solange die
 * Lieferung für die Stadt noch unterwegs ist. Vorher blieb die Quest auf 0/1, wer zuerst bestellt hatte.
 */
function orderedFor(cityId: string): (state: GameState) => number {
  return (state) => Math.max(state.modules.quests.progress, shipmentsInTransit(state, cityId).length > 0 ? 1 : 0);
}

export const PETER: Contact = {
  id: 'quest:peter',
  name: 'Peter',
  kind: 'other',
  role: 'Dein alter Kontakt',
  about:
    'Kennt dich noch von früher aus Kalk. Hat selbst lange vertickt, heute zieht er lieber die Fäden und sagt dir, was als Nächstes dran ist.',
  look: {
    feminine: false,
    age: 41,
    skin: 2,
    hair: 'short',
    hairColor: 1,
    beard: 'stubble',
    glasses: 'none',
    hat: 'cap',
    top: 'tracksuit',
    topColor: 1,
    face: 'square',
    brows: 'hard',
    eyes: 'rings',
    mouth: 'smirk',
    teeth: 'gold',
    mouthItem: 'toothpick',
    chain: 'thick',
    extra: 'chain',
  },
  voice: { pitch: 0.92, rate: 1.06 },
};

/** Alle so viele Spielminuten prüft das Modul Quests, die am Zustand hängen. */
export const QUEST_CHECK_EVERY = 5;

export type QuestReward =
  | { kind: 'goods'; productId: string; amount: number; quality?: number }
  | { kind: 'money'; money: MoneyKind; amount: number }
  | { kind: 'reputation'; amount: number }
  /** Senkt die Heat in allen Veedeln. */
  | { kind: 'heat'; amount: number }
  /** Erfahrung für alle aktiven Leute im Team. */
  | { kind: 'teamXp'; amount: number }
  /** Loyalität für alle aktiven Leute im Team. */
  | { kind: 'loyalty'; amount: number }
  /** Einfluss in allen Veedeln, in denen du schon präsent bist. */
  | { kind: 'influence'; amount: number }
  /** Titel für die Bestenliste. */
  | { kind: 'title'; title: string }
  /** Vertrauen bei einem Lieferanten (Wochenverträge, Auftrag 32). */
  | { kind: 'trust'; supplierId: string; amount: number };

/** Zuwachs pro Ereignis (0 = zählt nicht). */
export type QuestCounter = { [K in keyof GameEvents]?: (payload: GameEvents[K], state: GameState) => number };

/** Wohin die Quest-Karte springt (die Oberfläche setzt das um). */
export type QuestGoTo =
  | 'spot'
  | 'suppliers'
  | 'port'
  | 'warehouse'
  | 'staff'
  | 'rightHand'
  | 'territory'
  | 'gangs'
  | 'laundering'
  | 'finance'
  /** Auftrag 43: App Handel (Bestellungen) bzw. ihr Bereich Hafen, Anbau. */
  | 'trade'
  | 'tradeHarbor'
  | 'grow';

export interface QuestDef {
  id: string;
  chapter: number;
  icon: string;
  /** Kurz, für die Karte im HUD. */
  title: string;
  /** Was Peter schreibt, wenn die Quest beginnt. */
  task: string;
  /** Ein Satz Tipp auf der Karte. */
  hint: string;
  target: number;
  /** Fortschritt aus dem Zustand (z.B. "Rechte Hand vorhanden" = 1). */
  measure?: (state: GameState) => number;
  /** Fortschritt über Ereignisse, gezählt ab Beginn der Quest. */
  count?: QuestCounter;
  /** Serie: Jede volle Spielstunde, in der das gilt, zählt 1, sonst geht es von vorn los. */
  streak?: (state: GameState) => boolean;
  /** Fortschritt als Geld anzeigen. */
  euro?: boolean;
  goTo?: QuestGoTo;
  /**
   * Stadt des Kapitels (Auftrag 36): Die Quest kommt erst dran, wenn die Stadt frei ist. Nach Köln ist die Reihenfolge
   * frei, also nimmt Peter das Kapitel der Stadt, in die du gehst.
   */
  cityId?: string;
  /** Weitere Bedingung, bevor die Quest dran sein kann (Auftrag 43: Rotterdam erst nach der Ankunft). */
  requires?: (state: GameState) => boolean;
  /** Wer die Quest schickt (Auftrag 43): Jansen statt Peter, in der Produktion der Anrufer der Region. */
  voice?: 'jansen' | 'grow';
  reward: QuestReward[];
  /** Was Peter schreibt, wenn die Quest erledigt ist (sonst nur der Kapitel-Abschluss). */
  doneText?: string;
}

export const CHAPTERS: readonly string[] = [
  'Ankommen',
  'Dein Team',
  'Wachsen',
  'Die Straße',
  'Boss von Köln',
  'Ganz Köln',
  'Moin Hamburg',
  'Berliner Nächte',
  'Servus München',
  'Mainhattan',
  'Rotterdam',
  'Produktion',
];

/** Quests, die Auftrag 43 eingefügt hat (Migration 5 rechnet den Index um). */
export const QUESTS_ADDED_IN_43: readonly string[] = [
  'hhRunner',
  'hhOrder',
  'beRunner',
  'beOrder',
  'muRunner',
  'muOrder',
  'ffRunner',
  'ffOrder',
  'rtAnswer',
  'rtDeliver',
  'rtBuy',
  'rtTruck',
  'rtOnTime',
  'pdOffer',
  'pdFinca',
  'pdWorkers',
  'pdHarvest',
  'pdShip',
  'pdDeliver',
];

/**
 * Umsatz bis zum Anruf der Produzenten, wie grow.CALL_MIN_REVENUE (als Zahl, weil das Kapitel beim Laden gebaut wird;
 * quests.test.ts prüft, dass beide gleich sind).
 */
export const HARBOR_NAME_REVENUE = 1_500_000;

/** Später dazugekommen (Auftrag 43, H15): Migration 6 schiebt den Index alter Stände darüber. */
export const QUESTS_ADDED_IN_43_H = ['rtRevenue'] as const;

/** So viele Quests gab es vor Auftrag 36 (alte Spielstände mit allem erledigt: index = diese Zahl). */
export const QUEST_COUNT_BEFORE_36 = 32;

/** Titel für die Bestenliste, sobald die Mehrheit der Kölner Veedel dir gehört (Meilenstein, Auftrag 30). */
export const MILESTONE_TITLE = 'Boss von Köln';

const one = () => 1;
/** Kontrollierte Veedel in Köln (Hamburg zählt für die Kölner Quests nicht mit). */
const koelnVeedel = (state: GameState) =>
  controlledBy(state, PLAYER_FACTION).filter((id) => veedelCity(id) === 'koeln').length;
const activeStaff = (state: GameState) => getStaff(state, { status: 'active' }).length;

export const QUESTS: readonly QuestDef[] = [
  // --- Kapitel 1: Ankommen ---
  {
    id: 'firstSales',
    chapter: 0,
    icon: 'smile',
    title: 'Bediene 3 Kunden selbst',
    task: 'Na, auch wieder in Köln? Erst mal klein anfangen: Stell dich an einen Spot und bedien drei Kunden selbst.',
    hint: 'Tipp auf einen Spot auf der Karte und stell dich hin.',
    target: 3,
    count: { 'sale.completed': (p) => (p.sellerId === null && p.channel === 'street' ? 1 : 0) },
    goTo: 'spot',
    reward: [{ kind: 'goods', productId: 'weed', amount: 10 }],
  },
  {
    id: 'setPrice',
    chapter: 0,
    icon: 'tag',
    title: 'Setz einen eigenen Preis',
    task: 'Du verkaufst zum Richtpreis. Probier mal an einem Spot einen eigenen Preis, teurer oder billiger.',
    hint: 'Im Spot-Fenster findest du die Preise.',
    target: 1,
    count: { 'market.priceSet': (p) => (p.price !== null ? 1 : 0) },
    goTo: 'spot',
    reward: [{ kind: 'reputation', amount: 3 }],
  },
  {
    id: 'order',
    chapter: 0,
    icon: 'truck',
    title: 'Bestell Ware beim Lieferanten',
    task: 'Dein Vorrat hält nicht ewig. Bestell ein Paket bei einem Lieferanten, die Ware kommt dann ins Lager.',
    hint: 'Lieferanten-App im Handy.',
    target: 1,
    count: { 'shipment.ordered': one },
    goTo: 'suppliers',
    reward: [{ kind: 'money', money: 'dirty', amount: 300 }],
  },
  {
    id: 'revenue1k',
    chapter: 0,
    icon: 'coinEuro',
    title: 'Mach 1.000 € Umsatz',
    task: 'Läuft. Jetzt zeig mir, dass da Geld bei rumkommt: 1.000 € Umsatz.',
    hint: 'Mehr Spots und faire Preise bringen mehr Kunden.',
    target: 1000,
    euro: true,
    count: { 'sale.completed': (p) => p.revenue },
    goTo: 'finance',
    reward: [{ kind: 'goods', productId: 'haze', amount: 10, quality: 0.88 }],
  },

  // --- Kapitel 2: Dein Team ---
  {
    id: 'runner',
    chapter: 1,
    icon: 'runner',
    title: 'Heuere einen Läufer an',
    task: 'Du kannst nicht überall gleichzeitig stehen. Stell einen Läufer an einen Spot, der verkauft für dich.',
    hint: 'Im Spot-Fenster: Läufer anheuern.',
    target: 1,
    count: { 'staff.hired': (p) => (p.role === 'runner' ? 1 : 0) },
    goTo: 'spot',
    reward: [{ kind: 'money', money: 'dirty', amount: 250 }],
  },
  {
    id: 'recruit',
    chapter: 1,
    icon: 'userPlus',
    title: 'Stell jemanden über "Leute finden" ein',
    task: 'Gute Leute findest du nicht an jeder Ecke. Hör dich um und stell jemanden aus den Bewerbern ein.',
    hint: 'Personal-App, Leute finden.',
    target: 1,
    count: { 'recruiting.hired': one },
    goTo: 'staff',
    reward: [{ kind: 'teamXp', amount: 80 }],
  },
  {
    id: 'regular',
    chapter: 1,
    icon: 'heart',
    title: 'Gewinne einen Stammkunden',
    task: 'Stammkunden kommen immer wieder. Gute Ware und faire Preise, dann bleiben die Leute.',
    hint: 'Gute Qualität und nicht zu teuer verkaufen.',
    target: 1,
    count: { 'customer.regularGained': one },
    goTo: 'spot',
    reward: [{ kind: 'reputation', amount: 5 }],
  },
  {
    id: 'driver',
    chapter: 1,
    icon: 'truck',
    title: 'Stell einen Fahrer ein',
    task: 'Ständig selbst Ware herumzufahren nervt. Ein Fahrer holt sie später am Hafen ab und bringt sie zwischen deinen Lagern hin und her.',
    hint: 'Am Hafen oder in der Personal-App.',
    target: 1,
    count: { 'staff.hired': (p) => (p.role === 'driver' ? 1 : 0) },
    goTo: 'port',
    reward: [{ kind: 'goods', productId: 'weed', amount: 20 }],
  },
  {
    id: 'lieutenant',
    chapter: 1,
    icon: 'shield',
    title: 'Ernenne zwei Leutnants',
    task: 'Ein Leutnant führt bis zu drei Spots für dich, mit eigenen Leuten. Mit zwei davon wächst du, ohne überall zu sein, und kannst dir eine Rechte Hand leisten.',
    hint: 'Personal-App: Profil, zum Leutnant machen (ab Level 2).',
    target: 2,
    measure: (state) => getLieutenants(state).length,
    goTo: 'staff',
    reward: [{ kind: 'teamXp', amount: 150 }],
  },
  {
    id: 'rightHand',
    chapter: 1,
    icon: 'crown',
    title: 'Ernenne eine Rechte Hand',
    task: 'Du brauchst jemanden, dem du vertraust. Eine Rechte Hand fährt Lieferungen und nimmt dir Kleinkram ab. Sie braucht Level 4 und Loyalität, und du zwei Leutnants.',
    hint: 'Personal-App: Profil eines Mitarbeiters, zur Rechten Hand machen.',
    target: 1,
    measure: (state) => (getRightHand(state) ? 1 : 0),
    goTo: 'staff',
    reward: [{ kind: 'money', money: 'dirty', amount: 500 }],
  },
  {
    id: 'rightHandDelivery',
    chapter: 1,
    icon: 'bike',
    title: 'Lass die Rechte Hand ausliefern',
    task: 'Jetzt lass sie mal machen. Gib ihr einen Lieferauftrag, oder schalte die Aufgabe "Aufträge und Handy" an.',
    hint: 'Aufgaben stellst du auf der Seite der Rechten Hand ein.',
    target: 1,
    count: { 'order.accepted': (p) => (p.by === 'rightHand' ? 1 : 0) },
    goTo: 'rightHand',
    reward: [{ kind: 'loyalty', amount: 5 }],
  },

  // --- Kapitel 3: Wachsen ---
  {
    id: 'newSpot',
    chapter: 2,
    icon: 'pin',
    title: 'Mach einen neuen Spot auf',
    task: 'Ein Spot reicht nicht. Schalte einen neuen frei oder gründe einen, gern auch in einem anderen Veedel.',
    hint: 'Graue Spots auf der Karte lassen sich freischalten.',
    target: 1,
    count: { 'spots.unlocked': one, 'spots.founded': one },
    goTo: 'territory',
    reward: [{ kind: 'goods', productId: 'kush', amount: 20 }],
  },
  {
    id: 'launder',
    chapter: 2,
    icon: 'washing',
    title: 'Wasch 500 € Schwarzgeld',
    task: 'Lager und Liegeplatz kosten sauberes Geld. Wasch was von deinem Schwarzgeld.',
    hint: 'Geldwäsche-App, der Kumpel mit dem Kiosk fängt klein an.',
    target: 500,
    euro: true,
    count: { 'laundering.completed': (p) => p.amount },
    goTo: 'laundering',
    reward: [{ kind: 'heat', amount: 10 }],
  },
  {
    id: 'warehouse',
    chapter: 2,
    icon: 'warehouse',
    title: 'Kauf ein zweites Lager',
    task: 'Alles an einem Ort zu lagern ist gefährlich. Kauf ein zweites Lager in einem anderen Viertel.',
    hint: 'Lager-Seite: weitere Standorte.',
    target: 1,
    count: { 'goods.warehouseBought': one },
    goTo: 'warehouse',
    reward: [{ kind: 'money', money: 'clean', amount: 500 }],
  },
  {
    id: 'pickup',
    chapter: 2,
    icon: 'warehouse',
    title: 'Hol eine Schiffslieferung ins Lager',
    task: 'Jansen aus Rotterdam liefert billig und viel, aber nur an einen eigenen Liegeplatz im Niehler Hafen (4.000 € sauber, das Waschen hast du schon geübt). Miete ihn, bestell dort und hol den Container ab, bevor der Zoll kommt.',
    hint: 'Hafen-Seite: Liegeplatz mieten. Dann Jansen in der Lieferanten-App, am Kai "Abholen".',
    target: 1,
    count: { 'transport.arrived': (p) => (p.kind === 'pickup' ? 1 : 0) },
    goTo: 'port',
    reward: [{ kind: 'goods', productId: 'weed', amount: 40 }],
  },
  {
    id: 'cut',
    chapter: 2,
    icon: 'scale',
    title: 'Streck einmal Ware',
    task: 'Kleiner Trick aus der Szene: Gestreckte Ware bringt mehr, aber Kunden merken das. Probier es einmal aus.',
    hint: 'Lager-Seite: Ware strecken.',
    target: 1,
    count: { 'goods.cut': one },
    goTo: 'warehouse',
    reward: [{ kind: 'money', money: 'dirty', amount: 300 }],
  },
  {
    id: 'revenue10k',
    chapter: 2,
    icon: 'trendUp',
    title: 'Mach 10.000 € Umsatz',
    task: 'Jetzt wird es ernst. 10.000 € Umsatz, dann reden wir über die großen Sachen.',
    hint: 'Mehr Spots, mehr Läufer, nie ohne Ware dastehen.',
    target: 10000,
    euro: true,
    count: { 'sale.completed': (p) => p.revenue },
    goTo: 'finance',
    reward: [{ kind: 'goods', productId: 'haze', amount: 40, quality: 0.9 }],
  },

  // --- Kapitel 4: Die Straße ---
  {
    id: 'encounter',
    chapter: 3,
    icon: 'swords',
    title: 'Gewinne eine Konfrontation',
    task: 'Früher oder später wollen dir Leute ans Leder. Wenn es so weit ist: Steh es durch.',
    hint: 'Kommt von allein, wenn Gangs oder Räuber auftauchen.',
    target: 1,
    count: { 'encounter.resolved': (p) => (p.outcome === 'success' ? 1 : 0) },
    goTo: 'gangs',
    reward: [{ kind: 'loyalty', amount: 8 }],
  },
  {
    id: 'lowHeat',
    chapter: 3,
    icon: 'snow',
    title: 'Halte 24 Stunden die Heat unter 40',
    task: 'Die Bullen schauen genauer hin. Bleib einen ganzen Tag unter dem Radar, überall Heat unter 40.',
    hint: 'Weniger Gewalt, Läufer mal abziehen, nicht zu viel an einem Ort.',
    target: 24,
    streak: (state) => hottestVeedel(state).heat < 40,
    goTo: 'territory',
    reward: [
      { kind: 'reputation', amount: 5 },
      { kind: 'money', money: 'clean', amount: 800 },
    ],
  },
  {
    id: 'supplier',
    chapter: 3,
    icon: 'handshake',
    title: 'Schalte einen neuen Lieferanten frei',
    task: 'Ich kenn da wen in Amsterdam. Schalte einen weiteren Lieferanten frei, dann hast du mehr Auswahl.',
    hint: 'Lieferanten-App: gesperrte Kontakte.',
    target: 1,
    count: { 'supplier.unlocked': one },
    goTo: 'suppliers',
    reward: [{ kind: 'goods', productId: 'hash', amount: 30, quality: 0.8 }],
  },
  {
    id: 'gangDeal',
    chapter: 3,
    icon: 'handshake',
    title: 'Mach einen Deal mit einer Gang',
    task: 'Nicht jeder Streit muss blutig enden. Waffenstillstand, Tribut oder Bündnis, Hauptsache ein Deal.',
    hint: 'Gangs-App: Gang antippen.',
    target: 1,
    count: { 'gang.diplomacyChanged': (p) => (p.active ? 1 : 0) },
    goTo: 'gangs',
    reward: [{ kind: 'influence', amount: 8 }],
  },
  {
    id: 'rightHandRank',
    chapter: 3,
    icon: 'star',
    title: 'Bring die Rechte Hand auf Stufe 2',
    task: 'Deine Rechte Hand lernt mit jeder Aufgabe dazu. Lass sie arbeiten, bis sie Stufe 2 erreicht.',
    hint: 'Je mehr Aufgaben sie erledigt, desto schneller.',
    target: 1,
    count: { 'hierarchy.rightHandRankUp': (p) => (p.rank >= 2 ? 1 : 0) },
    goTo: 'rightHand',
    reward: [{ kind: 'money', money: 'clean', amount: 1000 }],
  },

  // --- Kapitel 5: Boss von Köln ---
  {
    id: 'firstVeedel',
    chapter: 4,
    icon: 'flag',
    title: 'Übernimm dein erstes Veedel',
    task: 'Jetzt holst du dir ein ganzes Veedel. Mehr Einfluss als alle anderen, dann gehört es dir.',
    hint: 'Reviere-App zeigt, wo du kurz davor bist.',
    target: 1,
    measure: koelnVeedel,
    goTo: 'territory',
    reward: [
      { kind: 'goods', productId: 'weed', amount: 100 },
      { kind: 'reputation', amount: 8 },
    ],
  },
  {
    id: 'team10',
    chapter: 4,
    icon: 'crew',
    title: 'Bau ein Team aus 10 Leuten auf',
    task: 'Ein Boss braucht eine Truppe. Zehn Leute, die gleichzeitig für dich arbeiten.',
    hint: 'Leutnants heuern auch selbst an.',
    target: 10,
    measure: activeStaff,
    goTo: 'staff',
    reward: [{ kind: 'teamXp', amount: 200 }],
  },
  {
    id: 'threeVeedel',
    chapter: 4,
    icon: 'map',
    title: 'Kontrolliere 3 Veedel',
    task: 'Drei Veedel, dann nimmt dich in Köln jeder ernst.',
    hint: 'Einfluss wächst mit Spots, Leutnants und Verkäufen.',
    target: 3,
    measure: koelnVeedel,
    goTo: 'territory',
    reward: [
      { kind: 'heat', amount: 20 },
      { kind: 'money', money: 'dirty', amount: 5000 },
    ],
  },
  {
    id: 'worth50k',
    chapter: 4,
    icon: 'moneyBag',
    title: 'Komm auf 50.000 € Vermögen',
    task: 'Letzte Sache von mir: 50.000 € Vermögen. Dann bist du kein Kleindealer mehr, dann bist du der Boss.',
    hint: 'Zählt Schwarzgeld, sauberes Geld und Ware im Lager.',
    target: 50000,
    euro: true,
    measure: netWorth,
    goTo: 'finance',
    // Der Titel "Boss von Köln" kommt seit Auftrag 30 mit der Mehrheit der Veedel (Meilenstein), nicht mehr hier.
    reward: [{ kind: 'money', money: 'clean', amount: 2500 }],
  },

  // --- Kapitel 6: Ganz Köln ---
  {
    id: 'nineVeedel',
    chapter: 5,
    icon: 'map',
    title: 'Kontrolliere 9 Veedel',
    task: 'Die Mehrheit hast du. Jetzt wird es zäh: Die Gangs halten ihre letzten Veedel mit allem, was sie haben. Hol dir neun.',
    hint: 'Leutnants mit mehreren Spots in einem Veedel bringen am meisten Einfluss.',
    target: 9,
    measure: koelnVeedel,
    goTo: 'territory',
    reward: [
      { kind: 'influence', amount: 10 },
      { kind: 'money', money: 'dirty', amount: 15000 },
    ],
  },
  {
    id: 'allVeedel',
    chapter: 5,
    icon: 'crown',
    title: 'Übernimm alle 12 Veedel',
    task: 'Alle zwölf. Erst dann gehört dir Köln wirklich. Und wer Köln hat, auf den werden andere aufmerksam.',
    hint: 'Reviere-App: Wo fehlt dir noch Einfluss?',
    target: 12,
    measure: koelnVeedel,
    goTo: 'territory',
    reward: [],
    doneText: 'Ganz Köln. Hätte ich nicht gedacht, ehrlich. Pass auf dein Telefon auf, das klingelt gleich.',
  },
  // --- Kapitel 7: Moin Hamburg (Auftrag 30) ---
  {
    id: 'hhWarehouse',
    chapter: 6,
    cityId: 'hamburg',
    icon: 'warehouse',
    title: 'Kauf ein Lager in Hamburg',
    task:
      'Hamburg also. Ich war da nie, ehrlich gesagt. Aber eins weiß ich: Ohne Lager geht nichts. Wenn du da bist, kauf ' +
      'dir eins. Ist teurer als bei uns, gezahlt wird sauber.',
    hint: 'Lager-Seite in Hamburg: Werkstatt Ottensen, Keller St. Georg, Garage Barmbek …',
    target: 1,
    measure: (state) => (getWarehouses(state, 'hamburg').length > 0 ? 1 : 0),
    goTo: 'warehouse',
    reward: [{ kind: 'goods', productId: 'weed', amount: 50, quality: 0.7 }],
  },
  {
    id: 'hhSpot',
    chapter: 6,
    cityId: 'hamburg',
    icon: 'pin',
    title: 'Schalte einen Spot in Hamburg frei',
    task: 'Jetzt brauchst du eine Ecke. Auf dem Kiez ist am meisten los, aber da guckt jeder hin.',
    hint: 'Tipp auf einen gesperrten Spot auf der Karte.',
    target: 1,
    measure: (state) => (getSpots(state, 'hamburg').length > 0 ? 1 : 0),
    goTo: 'spot',
    reward: [{ kind: 'money', money: 'dirty', amount: 1500 }],
  },
  {
    id: 'hhFirstSale',
    chapter: 6,
    cityId: 'hamburg',
    icon: 'cart',
    title: 'Verkauf in Hamburg',
    task: 'Und dann: verkaufen. Der erste Kunde an der Elbe. Die zahlen da mehr, sagt man.',
    hint: 'Stell dich an deinen Spot oder schick einen Läufer hin.',
    target: 1,
    count: { 'sale.completed': (p) => (veedelCity(p.veedelId) === 'hamburg' ? 1 : 0) },
    goTo: 'spot',
    reward: [{ kind: 'reputation', amount: 3 }],
  },
  {
    id: 'hhRunner',
    chapter: 6,
    cityId: 'hamburg',
    icon: 'runner',
    title: 'Heuere in Hamburg einen Läufer an',
    task:
      'Deine alten Leute bleiben, wo sie sind, die braucht dein Statthalter. In Hamburg fängst du bei null an: Heuer ' +
      'einen Läufer an.',
    hint: 'Personal-App: Leute finden, oder im Spot-Fenster einen Läufer anheuern.',
    target: 1,
    measure: (state) => (getStaff(state, { cityId: 'hamburg' }).length > 0 ? 1 : 0),
    goTo: 'staff',
    reward: [{ kind: 'money', money: 'dirty', amount: 1000 }],
  },
  {
    id: 'hhOrder',
    chapter: 6,
    cityId: 'hamburg',
    icon: 'truck',
    title: 'Bestell Ware für Hamburg',
    task: 'Und Nachschub bestellt dir hier keiner. Bestell selbst Ware für dein Hamburger Lager, Toni liefert auch an die Elbe.',
    hint: 'Lieferanten-App: Paket bestellen, die Ware kommt in dein Lager in Hamburg.',
    target: 1,
    count: { 'shipment.ordered': (p) => (p.cityId === 'hamburg' ? 1 : 0) },
    measure: orderedFor('hamburg'),
    goTo: 'suppliers',
    reward: [{ kind: 'money', money: 'dirty', amount: 500 }],
  },
  {
    id: 'hhBerth',
    chapter: 6,
    cityId: 'hamburg',
    icon: 'ship',
    title: 'Liegeplatz im Hamburger Hafen',
    task:
      'Fiete sagt, ohne Platz am Kai bist du in Hamburg nur ein Tourist. Miet dir einen Liegeplatz, dann liefert Hein ' +
      'Container, kiloweise.',
    hint: 'Logistik-App, Hafen: Liegeplatz mieten (12.000 € sauber).',
    target: 1,
    measure: (state) => (hasBerth(state, 'hamburg') ? 1 : 0),
    goTo: 'port',
    reward: [{ kind: 'money', money: 'clean', amount: 3000 }],
    doneText: 'Moin Hamburg. Du hast es echt geschafft, noch eine Stadt. Ab jetzt brauchst du mich kaum noch.',
  },
  // --- Kapitel 8 bis 10 (Auftrag 36): je ein Kapitel pro weiterer Stadt, nach dem Muster von "Moin Hamburg" ---
  ...cityChapter({
    cityId: 'berlin',
    prefix: 'be',
    chapter: 7,
    name: 'Berlin',
    warehouse: 'Berlin also. Da schläft keiner, sagen sie. Erst mal ein Lager, sonst hast du nichts zu verkaufen.',
    spot: 'Jetzt eine Ecke. Vor den Clubs ist am meisten los, freitags bis montags.',
    sale: 'Und los. Der erste Kunde in Berlin, und dann der nächste. Die hören da nicht auf.',
    runner:
      'Deine Leute sind nicht mitgekommen, die bleiben beim Statthalter. In Berlin heuerst du neu an, fang mit einem ' +
      'Läufer an.',
    order: 'Bestellen musst du hier selbst, bis du wieder eine Rechte Hand hast. Mirko liefert in Berlin.',
    veedel: 'Ein Kiez, der auf dich hört. Die Gangs da sind stark, pass auf.',
    done: 'Berlin läuft. Ehrlich, ich komm nicht mehr mit, wo du überall bist.',
  }),
  ...cityChapter({
    cityId: 'muenchen',
    prefix: 'mu',
    chapter: 8,
    name: 'München',
    warehouse: 'München. Teuer, sagen alle. Ein Lager kostet da ein Vermögen, aber ohne geht es nicht.',
    spot: 'Jetzt eine ruhige Ecke. Die Polizei da schaut genau hin.',
    sale: 'Und verkaufen. Die zahlen da jeden Preis, wenn die Ware gut ist.',
    runner: 'Neue Stadt, neue Leute. Deine alten bleiben beim Statthalter. Heuer in München einen Läufer an.',
    order: 'Und bestell selbst Ware für München. Toni liefert, und der aus Verona meldet sich bestimmt.',
    veedel: 'Ein Viertel, das dir gehört. In München zählt jeder Schritt.',
    done: 'Servus, Boss. München ist deins.',
  }),
  ...cityChapter({
    cityId: 'frankfurt',
    prefix: 'ff',
    chapter: 9,
    name: 'Frankfurt',
    warehouse: 'Frankfurt. Banker, Flughafen, Bahnhofsviertel. Erst ein Lager.',
    spot: 'Jetzt eine Ecke. Im Bahnhofsviertel ist am meisten los, aber da guckt jeder hin.',
    sale: 'Und verkaufen. Die Anzugträger zahlen gut.',
    runner: 'Deine Leute bleiben, wo sie sind. In Frankfurt heuerst du neu an: erst mal ein Läufer.',
    order: 'Bestell selbst Ware für dein Frankfurter Lager. Toni ist da zu Hause.',
    veedel: 'Ein Viertel, das auf dich hört. Dann gehört dir auch Frankfurt bald.',
    done: 'Mainhattan. Du bist überall, Boss.',
  }),
  // --- Kapitel 11 (Auftrag 43): Rotterdam. Jansen zeigt dir den neuen Job, erst wenn du angekommen bist. ---
  ...harborChapter(),
  // --- Kapitel 12 (Auftrag 43): Produktion. Der Anrufer aus Kolumbien bzw. Marokko führt durch die Kette. ---
  ...growChapter(),
];

/** In Rotterdam angekommen (nach dem Verkauf). */
function inRotterdam(state: GameState): boolean {
  return presentCity(state) === HARBOR_CITY && !isPlayerTraveling(state);
}

/**
 * Das Kapitel „Rotterdam“ (Auftrag 43): Jansen führt Schritt für Schritt durch die Woche als Lieferant (annehmen,
 * ausliefern, einkaufen, Lkw, pünktlich sein). Jeder Schritt misst den Zustand, damit er auch abgehakt wird, wenn du
 * schneller warst als Jansen.
 */
function harborChapter(): QuestDef[] {
  // Die Stadt als Text (wie city.HARBOR_CITY): Das Kapitel wird beim Laden gebaut, da darf kein fremdes Modul ran.
  const base = { chapter: 10, cityId: 'rotterdam', requires: inRotterdam, voice: 'jansen' as const, target: 1 };
  return [
    {
      ...base,
      id: 'rtAnswer',
      icon: 'inbox',
      title: 'Nimm eine Bestellung an',
      task:
        'Das ist die Halle. Hier kommt die Ware an, von hier geht sie raus. Montags rufen die Kunden an: wer, was, wie ' +
        'viel. Fenna hat dir die erste Liste geschickt. Nimm eine Bestellung an, für die die Ware schon da ist, da steht ' +
        '„Ware da“ dran.',
      hint: 'Handel › Bestellungen: Tipp auf eine Bestellung mit „Ware da“.',
      measure: (state) =>
        getOrders(state).some((o) => o.status === 'accepted' || o.status === 'delivering' || o.status === 'delivered')
          ? 1
          : 0,
      goTo: 'trade',
      reward: [{ kind: 'money', money: 'clean', amount: 5000 }],
    },
    {
      ...base,
      id: 'rtDeliver',
      icon: 'truck',
      title: 'Liefere die Bestellung aus',
      task:
        'Angenommen ist noch nicht geliefert. Unter „Zu liefern“ schickst du die Ware los. Die Spedition kostet, wird ' +
        'aber selten kontrolliert. Bezahlt wird bei Ankunft.',
      hint: 'Handel › Bestellungen › Zu liefern: Tipp auf den Kunden.',
      measure: (state) => (tradeStats(state).delivered > 0 || getDeliveries(state).length > 0 ? 1 : 0),
      goTo: 'trade',
      reward: [{ kind: 'money', money: 'clean', amount: 5000 }],
    },
    {
      ...base,
      id: 'rtBuy',
      icon: 'ship',
      title: 'Kauf einen Container',
      task:
        'Die Halle ist schneller leer, als du denkst. Ware kaufst du bei Produzenten im Ausland: Marokko für Hasch, ' +
        'Spanien und Albanien für Gras. Das Schiff braucht ein paar Tage, also bestell, bevor es knapp wird.',
      hint: 'Handel › Hafen › Einkauf im Ausland: Produzent wählen, Container bestellen.',
      measure: (state) => (tradeStats(state).containers > 0 || getShipments(state).length > 0 ? 1 : 0),
      goTo: 'tradeHarbor',
      reward: [{ kind: 'money', money: 'clean', amount: 10000 }],
    },
    {
      ...base,
      id: 'rtOnTime',
      icon: 'clock',
      title: 'Liefere fünfmal pünktlich',
      task:
        'Ruf ist alles in diesem Geschäft. Wer pünktlich liefert, bekommt mehr Bestellungen, und irgendwann rufen auch ' +
        'die Städte in Europa an. Fünf pünktliche Lieferungen, dann reden sie bis nach Amsterdam von dir.',
      hint: 'Liefere vor der Frist, die an jeder Bestellung steht.',
      target: 5,
      measure: (state) => tradeStats(state).onTime,
      goTo: 'trade',
      reward: [{ kind: 'money', money: 'clean', amount: 20000 }],
    },
    {
      ...base,
      id: 'rtTruck',
      icon: 'truck',
      title: 'Eigener Lkw, wenn es sich lohnt',
      task:
        'Lieferst du viel und oft, frisst die Fracht der Spedition einen Teil der Marge. Ein eigener Lkw fährt ohne ' +
        'Fracht, aber der Zoll winkt ihn doppelt so oft raus. Er kostet sauberes Geld: Wasch vorher Schwarzgeld über ' +
        'meine Reederei.',
      hint: 'Geldwäsche › Jansens Reederei, dann Handel › Hafen › Lkw kaufen.',
      measure: (state) => (getVehicles(state, HARBOR_CITY).some((v) => !isShip(v)) ? 1 : 0),
      goTo: 'tradeHarbor',
      reward: [{ kind: 'money', money: 'clean', amount: 10000 }],
    },
    {
      // Brücke bis zum Anruf der Produzenten (Auftrag 43, H15): sonst stand nach dem Lkw wochenlang kein Ziel da.
      ...base,
      id: 'rtRevenue',
      icon: 'chart',
      title: 'Mach dir einen Namen',
      task:
        'Wer im Hafen Umsatz macht, von dem hört man bis Südamerika. Bei anderthalb Millionen und nach drei Wochen ' +
        'als Lieferant meldet sich dort jemand, der selbst anbaut. Bis dahin: liefern, liefern, liefern.',
      hint: 'Umsatz als Lieferant, alle Kunden zusammen.',
      target: HARBOR_NAME_REVENUE,
      euro: true,
      measure: (state) => (isGrowStarted(state) ? HARBOR_NAME_REVENUE : tradeStats(state).revenue),
      goTo: 'trade',
      reward: [{ kind: 'money', money: 'clean', amount: 25000 }],
      doneText:
        'Du hast es drauf. Der Hafen läuft über dich, ich bin raus. Pass auf den Zoll auf, der vergisst nichts. Und ' +
        'wenn mal einer aus Südamerika anruft: Geh ran.',
    },
  ];
}

/** Texte eines Stadt-Kapitels (Auftrag 36). */
interface CityChapterTexts {
  cityId: string;
  /** Kürzel für die IDs der Quests. */
  prefix: string;
  chapter: number;
  name: string;
  warehouse: string;
  spot: string;
  sale: string;
  /** Neue Leute anheuern (Auftrag 43: die alten bleiben in ihrer Stadt). */
  runner: string;
  /** Selbst bestellen (Auftrag 43: keine Rechte Hand aus der alten Stadt). */
  order: string;
  veedel: string;
  done: string;
}

/**
 * Ein Kapitel für eine Stadt nach dem Muster von "Moin Hamburg": Lager, Spot, erster Verkauf, Läufer, Bestellung, erstes
 * Veedel.
 */
function cityChapter(t: CityChapterTexts): QuestDef[] {
  const city = t.cityId;
  return [
    {
      id: `${t.prefix}Warehouse`,
      chapter: t.chapter,
      cityId: city,
      icon: 'warehouse',
      title: `Kauf ein Lager in ${t.name}`,
      task: t.warehouse,
      hint: `Lager-Seite in ${t.name}: Standorte kaufen.`,
      target: 1,
      measure: (state) => (getWarehouses(state, city).length > 0 ? 1 : 0),
      goTo: 'warehouse',
      reward: [{ kind: 'goods', productId: 'weed', amount: 50, quality: 0.7 }],
    },
    {
      id: `${t.prefix}Spot`,
      chapter: t.chapter,
      cityId: city,
      icon: 'pin',
      title: `Schalte einen Spot in ${t.name} frei`,
      task: t.spot,
      hint: 'Tipp auf einen gesperrten Spot auf der Karte.',
      target: 1,
      measure: (state) => (getSpots(state, city).length > 0 ? 1 : 0),
      goTo: 'spot',
      reward: [{ kind: 'money', money: 'dirty', amount: 1500 }],
    },
    {
      id: `${t.prefix}FirstSale`,
      chapter: t.chapter,
      cityId: city,
      icon: 'cart',
      title: `Verkauf in ${t.name}`,
      task: t.sale,
      hint: 'Stell dich an deinen Spot oder schick einen Läufer hin.',
      target: 1,
      count: { 'sale.completed': (p) => (veedelCity(p.veedelId) === city ? 1 : 0) },
      goTo: 'spot',
      reward: [{ kind: 'reputation', amount: 3 }],
    },
    {
      id: `${t.prefix}Runner`,
      chapter: t.chapter,
      cityId: city,
      icon: 'runner',
      title: `Heuere in ${t.name} einen Läufer an`,
      task: t.runner,
      hint: 'Personal-App: Leute finden, oder im Spot-Fenster einen Läufer anheuern.',
      target: 1,
      measure: (state) => (getStaff(state, { cityId: city }).length > 0 ? 1 : 0),
      goTo: 'staff',
      reward: [{ kind: 'money', money: 'dirty', amount: 1000 }],
    },
    {
      id: `${t.prefix}Order`,
      chapter: t.chapter,
      cityId: city,
      icon: 'truck',
      title: `Bestell Ware für ${t.name}`,
      task: t.order,
      hint: `Lieferanten-App: Paket bestellen, die Ware kommt in dein Lager in ${t.name}.`,
      target: 1,
      count: { 'shipment.ordered': (p) => (p.cityId === city ? 1 : 0) },
      measure: orderedFor(city),
      goTo: 'suppliers',
      reward: [{ kind: 'money', money: 'dirty', amount: 500 }],
    },
    {
      id: `${t.prefix}Veedel`,
      chapter: t.chapter,
      cityId: city,
      icon: 'flag',
      title: `Dein erstes Viertel in ${t.name}`,
      task: t.veedel,
      hint: 'Reviere-App: Wo hast du schon Einfluss?',
      target: 1,
      measure: (state) => controlledBy(state, PLAYER_FACTION).filter((id) => veedelCity(id) === city).length,
      goTo: 'territory',
      reward: [{ kind: 'money', money: 'clean', amount: 3000 }],
      doneText: t.done,
    },
  ];
}

/** Die Anrufe aus Kolumbien bzw. Marokko sind gekommen (Produktion, Auftrag 42). */
function growing(state: GameState): boolean {
  return isGrowStarted(state);
}

/**
 * Das Kapitel „Produktion“ (Auftrag 43): Der Anrufer der Region führt durch die Kette vom Angebot bis zur ersten eigenen
 * Lieferung. Jeder Schritt misst den Zustand und führt mit „Hinführen“ in den Anbau der App Handel.
 */
function growChapter(): QuestDef[] {
  const base = { chapter: 11, requires: growing, voice: 'grow' as const, target: 1 };
  return [
    {
      ...base,
      id: 'pdOffer',
      icon: 'leaf',
      title: 'Nimm ein Angebot an',
      task:
        'Wir bauen an, du verkaufst. Eigene Ware kostet dich einen Bruchteil vom Einkauf. Nimm unser Angebot an, dann ' +
        'zeig ich dir das Land.',
      hint: 'Handel › Anbau: Angebot annehmen.',
      measure: (state) => (openRegions(state).length > 0 ? 1 : 0),
      goTo: 'grow',
      reward: [{ kind: 'money', money: 'clean', amount: 20000 }],
    },
    {
      ...base,
      id: 'pdFinca',
      icon: 'home',
      title: 'Pachte eine Finca',
      task:
        'Erst Land. Pachten ist zum Anfang günstiger, kaufen rechnet sich erst nach einem Jahr. Auf der ersten Finca ' +
        'steht schon was im Feld, die Ernte kommt bald.',
      hint: 'Handel › Anbau › Region: Land kaufen oder pachten (sauberes Geld).',
      measure: (state) => (getFincas(state).length > 0 ? 1 : 0),
      goTo: 'grow',
      reward: [{ kind: 'money', money: 'clean', amount: 20000 }],
    },
    {
      ...base,
      id: 'pdWorkers',
      icon: 'users',
      title: 'Stell Arbeiter ein',
      task:
        'Ohne Leute auf dem Feld gibt es keine Ernte. Stell so viele Arbeiter ein, wie die Finca braucht, und am besten ' +
        'einen Gärtner, der macht die Ware besser.',
      hint: 'Finca-Seite › Leute: Arbeiter auf die Zahl stellen, die dort steht.',
      measure: (state) => (getFincas(state).some((f) => fincaWorkers(state, f) >= workersNeeded(f)) ? 1 : 0),
      goTo: 'grow',
      reward: [{ kind: 'money', money: 'clean', amount: 10000 }],
    },
    {
      ...base,
      id: 'pdHarvest',
      icon: 'package',
      title: 'Bring die erste Ernte ein',
      task:
        'Jetzt heißt es warten. Ernte, trocknen, bei Hasch pressen, verpacken: Dann liegt die Ware im Ausfuhrlager am ' +
        'Hafen. Die Verpackung entscheidet, wie oft der Zoll reinschaut.',
      hint: 'Die Finca-Seite zeigt, wie lange es noch dauert.',
      measure: (state) => (state.modules.grow.stats.harvested > 0 ? 1 : 0),
      goTo: 'grow',
      reward: [{ kind: 'money', money: 'clean', amount: 10000 }],
    },
    {
      ...base,
      id: 'pdShip',
      icon: 'ship',
      title: 'Verschiffe deine eigene Ware',
      task:
        'Die Ware liegt im Ausfuhrlager. Bring sie aufs Schiff nach Europa, ein paar Wochen ist sie unterwegs. Mit eigenem ' +
        'Schiff fällt sie weniger auf.',
      hint: 'Handel › Hafen › Einkauf: „Eigene Ernte“ ganz oben.',
      measure: (state) =>
        getShipments(state).some((x) => x.own === true) || tradeStats(state).ownDelivered > 0 ? 1 : 0,
      goTo: 'tradeHarbor',
      reward: [{ kind: 'money', money: 'clean', amount: 20000 }],
    },
    {
      ...base,
      id: 'pdDeliver',
      icon: 'truck',
      title: 'Liefere eigene Ware aus',
      task:
        'Wenn sie im Hafen ist, geht sie raus wie jede andere Ware. Nur dass sie dich fast nichts gekostet hat. Je mehr ' +
        'davon, desto näher bist du am Produzenten.',
      hint: 'Handel › Aufträge (vorher „Bestellungen“): ausliefern wie immer (oder Fenna machen lassen).',
      measure: (state) => (tradeStats(state).ownDelivered > 0 ? 1 : 0),
      goTo: 'trade',
      reward: [{ kind: 'money', money: 'clean', amount: 50000 }],
      doneText:
        'Das ist der Anfang. Wenn die Hälfte deiner Lieferungen aus eigener Ernte kommt, bist du Produzent. Und dann ganz ' +
        'Europa.',
    },
  ];
}
