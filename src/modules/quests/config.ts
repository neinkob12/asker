// Einstellbare Werte der Quests: Kapitel, die Quests der Reihe nach und ihre Belohnungen.
// Peter (dein alter Kontakt) schickt jede Quest per Handy und meldet sich, wenn sie erledigt ist.

import type { GameEvents, GameState, MoneyKind } from '../../core';
import { getLieutenants, getRightHand } from '../hierarchy';
import { netWorth } from '../leaderboard';
import { hottestVeedel } from '../police';
import { getStaff } from '../staff';
import { controlledBy, PLAYER_FACTION } from '../territory';

export const PETER = { id: 'quest:peter', name: 'Peter', kind: 'other' as const, avatar: '🧢' };

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
  | { kind: 'title'; title: string };

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
  | 'finance';

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
  reward: QuestReward[];
}

export const CHAPTERS: readonly string[] = ['Ankommen', 'Dein Team', 'Wachsen', 'Die Straße', 'Boss von Köln'];

const one = () => 1;
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
    task: 'Dein Vorrat hält nicht ewig. Bestell ein kleines Paket, zum Beispiel bei Toni in Frankfurt. Ein Kurier bringt es dir direkt ins Lager.',
    hint: 'Lieferanten-App im Handy, ein kleines Paket reicht.',
    target: 1,
    count: { 'shipment.ordered': one },
    goTo: 'suppliers',
    reward: [{ kind: 'money', money: 'dirty', amount: 200 }],
  },
  {
    id: 'delivery',
    chapter: 0,
    icon: 'package',
    title: 'Nimm deine erste Lieferung an',
    task: 'Jetzt heißt es warten, bis der Kurier da ist. Die Ware landet von allein in deinem Lager.',
    hint: 'Kommt von allein, die Uhr läuft. Tempo hochdrehen hilft.',
    target: 1,
    count: { 'shipment.arrived': one },
    goTo: 'suppliers',
    reward: [{ kind: 'goods', productId: 'weed', amount: 15 }],
  },
  {
    id: 'revenueSmall',
    chapter: 0,
    icon: 'coinEuro',
    title: 'Mach 500 € Umsatz',
    task: 'Läuft. Jetzt zeig mir, dass da Geld bei rumkommt: 500 € Umsatz.',
    hint: 'Mehr Spots und faire Preise bringen mehr Kunden.',
    target: 500,
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
    id: 'newSpot',
    chapter: 1,
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
    id: 'revenueBig',
    chapter: 1,
    icon: 'trendUp',
    title: 'Mach 3.000 € Umsatz',
    task: 'Jetzt wird es ernst. 3.000 € Umsatz, dann reden wir über die großen Sachen.',
    hint: 'Mehr Spots, mehr Läufer, nie ohne Ware dastehen.',
    target: 3000,
    euro: true,
    count: { 'sale.completed': (p) => p.revenue },
    goTo: 'finance',
    reward: [{ kind: 'goods', productId: 'haze', amount: 30, quality: 0.9 }],
  },

  // --- Kapitel 3: Wachsen ---
  {
    id: 'lieutenant',
    chapter: 2,
    icon: 'shield',
    title: 'Ernenne einen Leutnant',
    task: 'Ein Leutnant führt bis zu drei Spots für dich, mit eigenen Leuten. So wächst du, ohne überall zu sein.',
    hint: 'Personal-App: Profil, zum Leutnant machen (ab Level 2).',
    target: 1,
    measure: (state) => (getLieutenants(state).length > 0 ? 1 : 0),
    goTo: 'staff',
    reward: [{ kind: 'teamXp', amount: 150 }],
  },
  {
    id: 'launder',
    chapter: 2,
    icon: 'washing',
    title: 'Wasch 200 € Schwarzgeld',
    task: 'Lager und Liegeplatz kosten sauberes Geld. Wasch ein bisschen von deinem Schwarzgeld.',
    hint: 'Geldwäsche-App, der Kumpel mit dem Kiosk fängt klein an.',
    target: 200,
    euro: true,
    count: { 'laundering.completed': (p) => p.amount },
    goTo: 'laundering',
    reward: [{ kind: 'heat', amount: 10 }],
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
    id: 'lieutenant2',
    chapter: 2,
    icon: 'shield',
    title: 'Ernenne einen zweiten Leutnant',
    task: 'Zwei Leutnants, dann lohnt sich auch eine Rechte Hand, die über allen steht.',
    hint: 'Personal-App: Profil, zum Leutnant machen.',
    target: 2,
    measure: (state) => Math.min(2, getLieutenants(state).length),
    goTo: 'staff',
    reward: [{ kind: 'loyalty', amount: 5 }],
  },
  {
    id: 'rightHand',
    chapter: 2,
    icon: 'crown',
    title: 'Ernenne eine Rechte Hand',
    task: 'Du brauchst jemanden, dem du vertraust. Eine Rechte Hand fährt Lieferungen und nimmt dir Kleinkram ab. Sie braucht Level 4 und Loyalität 50.',
    hint: 'Personal-App: Profil, zur Rechten Hand machen.',
    target: 1,
    measure: (state) => (getRightHand(state) ? 1 : 0),
    goTo: 'staff',
    reward: [{ kind: 'money', money: 'dirty', amount: 500 }],
  },
  {
    id: 'rightHandDelivery',
    chapter: 2,
    icon: 'bike',
    title: 'Lass die Rechte Hand ausliefern',
    task: 'Jetzt lass sie mal machen. Gib ihr einen Lieferauftrag, oder schalte die Aufgabe "Aufträge und Handy" an.',
    hint: 'Aufgaben stellst du auf der Seite der Rechten Hand ein.',
    target: 1,
    count: { 'order.accepted': (p) => (p.by === 'rightHand' ? 1 : 0) },
    goTo: 'rightHand',
    reward: [{ kind: 'loyalty', amount: 5 }],
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
    title: 'Halte 12 Stunden die Heat unter 40',
    task: 'Die Bullen schauen genauer hin. Bleib einen halben Tag unter dem Radar, überall Heat unter 40.',
    hint: 'Weniger Gewalt, Läufer mal abziehen, nicht zu viel an einem Ort.',
    target: 12,
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
    id: 'warehouse',
    chapter: 3,
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
    id: 'berth',
    chapter: 3,
    icon: 'anchor',
    title: 'Miete einen Liegeplatz am Hafen',
    task: 'Jetzt wird es groß: Mit einem Liegeplatz im Niehler Hafen kaufst du in Rotterdam ganze Container, viel billiger. Kostet sauberes Geld.',
    hint: 'Lager-Seite: Hafen. Vorher Geld waschen.',
    target: 1,
    count: { 'logistics.berthBought': one },
    goTo: 'port',
    reward: [{ kind: 'money', money: 'clean', amount: 1000 }],
  },
  {
    id: 'driver',
    chapter: 3,
    icon: 'truck',
    title: 'Stell einen Fahrer ein',
    task: 'Ständig selbst zum Hafen fahren nervt. Ein Fahrer holt die Ware für dich ab und bringt sie zwischen deinen Lagern hin und her.',
    hint: 'Am Hafen oder in der Personal-App.',
    target: 1,
    count: { 'staff.hired': (p) => (p.role === 'driver' ? 1 : 0) },
    goTo: 'port',
    reward: [{ kind: 'goods', productId: 'weed', amount: 20 }],
  },
  {
    id: 'pickup',
    chapter: 3,
    icon: 'warehouse',
    title: 'Hol Ware vom Hafen ins Lager',
    task: 'Bestell in Rotterdam. Ist das Schiff da, liegt die Ware am Kai. Lass sie nicht zu lang da liegen, hol sie selbst oder mit einem Fahrer ins Lager.',
    hint: 'Am Hafen auf "Abholen" tippen, wenn das Schiff angelegt hat.',
    target: 1,
    count: { 'transport.arrived': (p) => (p.kind === 'pickup' ? 1 : 0) },
    goTo: 'port',
    reward: [{ kind: 'goods', productId: 'weed', amount: 50 }],
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
    measure: (state) => controlledBy(state, PLAYER_FACTION).length,
    goTo: 'territory',
    reward: [
      { kind: 'goods', productId: 'weed', amount: 100 },
      { kind: 'reputation', amount: 8 },
    ],
  },
  {
    id: 'rightHandRank',
    chapter: 4,
    icon: 'star',
    title: 'Bring die Rechte Hand auf Stufe 2',
    task: 'Deine Rechte Hand lernt mit jeder Aufgabe dazu. Lass sie arbeiten, bis sie Stufe 2 erreicht.',
    hint: 'Je mehr Aufgaben sie erledigt, desto schneller.',
    target: 1,
    count: { 'hierarchy.rightHandRankUp': (p) => (p.rank >= 2 ? 1 : 0) },
    goTo: 'rightHand',
    reward: [{ kind: 'money', money: 'clean', amount: 1000 }],
  },
  {
    id: 'bigTeam',
    chapter: 4,
    icon: 'crew',
    title: 'Bau ein Team aus 8 Leuten auf',
    task: 'Ein Boss braucht eine Truppe. Acht Leute, die gleichzeitig für dich arbeiten.',
    hint: 'Leutnants heuern auch selbst an.',
    target: 8,
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
    measure: (state) => controlledBy(state, PLAYER_FACTION).length,
    goTo: 'territory',
    reward: [
      { kind: 'heat', amount: 20 },
      { kind: 'money', money: 'dirty', amount: 5000 },
    ],
  },
  {
    id: 'worth',
    chapter: 4,
    icon: 'moneyBag',
    title: 'Komm auf 30.000 € Vermögen',
    task: 'Letzte Sache von mir: 30.000 € Vermögen. Dann bist du kein Kleindealer mehr, dann bist du der Boss.',
    hint: 'Zählt Schwarzgeld, sauberes Geld und Ware im Lager.',
    target: 30000,
    euro: true,
    measure: netWorth,
    goTo: 'finance',
    reward: [
      { kind: 'title', title: 'Boss von Köln' },
      { kind: 'money', money: 'clean', amount: 2500 },
    ],
  },
];
