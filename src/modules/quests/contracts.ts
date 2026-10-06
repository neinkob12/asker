// Wochenverträge (Auftrag 32): Jeden Montag um 8 Uhr bieten drei Figuren je einen Vertrag an, einer wird per Handy
// angenommen ('quests.acceptContract'), Frist Sonntag 23:59. Fortschritt wie bei Peters Quests: Zähler über Ereignisse
// (count), ein Maß am Zustand (measure) oder eine Serie voller Stunden (streak). Ziele skalieren mit der Größe des
// Geschäfts (police.operationTier: Kleindealer, Händler, Großhändler) und gelten für die Stadt, die beim Angebot aktiv
// war. Belohnungen wie bei den Quests, dazu Vertrauen bei einem Lieferanten.
//
// Hier stehen nur Daten und reine Funktionen (Vorlagen, Figuren, Werte); den Ablauf macht index.ts.

import type { Contact, GameEvents, GameState } from '../../core';
import { getProduct, QUALITY_TIERS } from '../goods';
import { hottestVeedel } from '../police';
import { controlledBy, PLAYER_FACTION } from '../territory';
import { allVeedel, veedelCity } from '../veedel';
import type { QuestReward } from './config';

/** Ein Angebot, so wie es im Spielstand liegt (nur Daten). */
export interface ContractOffer {
  id: number;
  templateId: string;
  /** Stadt, für die der Vertrag gilt (die aktive beim Angebot). */
  cityId: string;
  /** Größe des Geschäfts beim Angebot (0 Kleindealer, 1 Händler, 2 Großhändler). */
  tier: number;
  title: string;
  target: number;
  /** Ware, um die es geht (falls die Vorlage eine braucht). */
  productId?: string;
  /** Zusatzwert der Vorlage, z.B. wie viele Veedel zu halten sind. */
  param?: number;
  rewards: QuestReward[];
  contactId: string;
  /** Frist: Beginn des nächsten Montags (Sonntag 23:59 ist das letzte erlaubte). */
  deadline: number;
  /** Nachricht mit dem Angebot (zum Zurückziehen). */
  messageId: number;
}

export interface ActiveContract extends ContractOffer {
  progress: number;
  acceptedAt: number;
  /**
   * Eben angenommen, 'contract.accepted' noch nicht zugestellt: Was davor gemeldet war, zählt nicht (wie fresh bei den
   * Quests, J2). Fehlt: nicht frisch (ältere Spielstände).
   */
  fresh?: boolean;
}

/** Zuwachs pro Ereignis für einen Vertrag. */
export type ContractCounter = {
  [K in keyof GameEvents]?: (payload: GameEvents[K], state: GameState, offer: ContractOffer) => number;
};

export interface ContractTemplate {
  id: string;
  icon: string;
  /** Wer anbietet (Kontakt-ID aus CONTRACT_CONTACTS). */
  contactId: string;
  /** Ziel pro Größe des Geschäfts [Kleindealer, Händler, Großhändler]. */
  targets: readonly [number, number, number];
  /** Kurztitel für Karte und Liste, {n} = Ziel, {product} = Ware. */
  title: string;
  /** Was die Figur schreibt, {n} = Ziel, {product} = Ware. */
  pitch: string;
  /** Was sie nach Erfolg schreibt. */
  doneText: string;
  /** Fortschritt als Euro anzeigen. */
  euro?: boolean;
  /** Ware, wenn die Vorlage eine braucht (eine davon wird gewürfelt). */
  products?: readonly string[];
  /** Gibt es den Vertrag gerade? (z.B. erst ab Händler). */
  available?: (state: GameState, cityId: string, tier: number) => boolean;
  /** Zusatzwert beim Angebot (z.B. Veedel jetzt). */
  param?: (state: GameState, cityId: string) => number;
  /** Ziel aus Zusatzwert und Größe, wenn targets nicht reicht. */
  target?: (tier: number, param: number) => number;
  count?: ContractCounter;
  measure?: (state: GameState, offer: ContractOffer) => number;
  streak?: (state: GameState, offer: ContractOffer) => boolean;
  /** Art der Belohnung neben Geld und Vertrauen. */
  bonus: 'goods' | 'reputation' | 'heat' | 'teamXp' | 'loyalty' | 'influence' | 'clean';
  /** Gewicht der Belohnung (1 = normal). */
  weight: number;
}

/** Die Figuren, die Verträge anbieten (frei erfunden). */
export const CONTRACT_CONTACTS: readonly Contact[] = [
  {
    id: 'contract:ali',
    name: 'Ali (Spätkauf)',
    kind: 'other',
    role: 'Spätkauf-Besitzer',
    about: 'Hat einen Spätkauf und Ohren überall. Vermittelt, wer was braucht, und will dafür, dass es läuft.',
    look: { feminine: false, age: 46, skin: 3 },
    voice: { pitch: 0.9, rate: 1 },
  },
  {
    id: 'contract:marlene',
    name: 'Marlene (Clubbetreiberin)',
    kind: 'other',
    role: 'Betreibt einen Club',
    about: 'Führt einen Club, in dem jede Nacht was los ist. Zahlt gut, wenn ihre Gäste versorgt sind.',
    look: { feminine: true, age: 38, skin: 1 },
    voice: { pitch: 1.1, rate: 1.05 },
  },
  {
    id: 'contract:jojo',
    name: 'Jojo (WG-Partys)',
    kind: 'other',
    role: 'Student mit Kontakten',
    about: 'Organisiert die großen WG-Partys und kennt halb die Uni. Will gute Ware, nicht irgendwas.',
    look: { feminine: false, age: 23, skin: 0 },
    voice: { pitch: 1.05, rate: 1.15 },
  },
  {
    id: 'contract:bruno',
    name: 'Bruno (Türsteher)',
    kind: 'other',
    role: 'Türsteher und Mann fürs Grobe',
    about: 'Steht vor den Clubs und weiß, wer gerade Ärger macht. Bezahlt dafür, dass es ruhig bleibt.',
    look: { feminine: false, age: 41, skin: 4 },
    voice: { pitch: 0.75, rate: 0.9 },
  },
  {
    id: 'contract:svetlana',
    name: 'Svetlana (Händlerin)',
    kind: 'other',
    role: 'Zwischenhändlerin',
    about: 'Kauft und verkauft alles, was gefragt ist. Rechnet knallhart, zahlt aber pünktlich.',
    look: { feminine: true, age: 44, skin: 2 },
    voice: { pitch: 0.95, rate: 0.95 },
  },
  {
    id: 'contract:frank',
    name: 'Frank (Kneipenwirt)',
    kind: 'other',
    role: 'Wirt einer Eckkneipe',
    about: 'Steht seit dreißig Jahren hinter der Theke. Kennt alle, verrät keinen, und will, dass im Veedel Ruhe ist.',
    look: { feminine: false, age: 58, skin: 1 },
    voice: { pitch: 0.85, rate: 0.9 },
  },
];

/** Untergrenze der Stufe „Gut“ (goods.QUALITY_TIERS; zur Laufzeit gelesen, keine Top-Level-Nutzung). */
const goodQuality = () => QUALITY_TIERS.find((t) => t.id === 'good')?.min ?? 0.65;

const inCity = (veedelId: string, offer: ContractOffer) => veedelCity(veedelId) === offer.cityId;
const controlled = (state: GameState, cityId: string) =>
  controlledBy(state, PLAYER_FACTION).filter((id) => veedelCity(id) === cityId).length;

/** Mindestens zwölf Vorlagen, gemischt aus Verkaufen, Liefern, Ruhe halten, Veedel halten und Ware einer Qualität. */
export const CONTRACT_TEMPLATES: readonly ContractTemplate[] = [
  {
    id: 'revenue',
    icon: 'moneyBag',
    contactId: 'contract:svetlana',
    targets: [12000, 40000, 100000],
    title: '{n} Umsatz diese Woche',
    pitch: 'Ich will sehen, ob du liefern kannst. Mach diese Woche {n} Umsatz, dann reden wir über mehr.',
    doneText: 'Respekt. Du kannst liefern. Hier ist, was ich versprochen hab.',
    euro: true,
    count: { 'sale.completed': (p, _s, o) => (inCity(p.veedelId, o) ? p.revenue : 0) },
    bonus: 'clean',
    weight: 1,
  },
  {
    id: 'product',
    icon: 'leaf',
    contactId: 'contract:ali',
    targets: [120, 400, 1000],
    title: '{n} {product} verkaufen',
    pitch: 'Die Leute fragen bei mir nach {product}. Bring diese Woche {n} davon unter die Leute.',
    doneText: 'Läuft. Die Leute sind zufrieden, ich auch.',
    products: ['weed', 'hash', 'haze'],
    count: {
      'sale.completed': (p, _s, o) => (inCity(p.veedelId, o) && p.productId === o.productId ? p.amount : 0),
    },
    bonus: 'goods',
    weight: 1,
  },
  {
    id: 'quality',
    icon: 'gem',
    contactId: 'contract:jojo',
    targets: [60, 200, 500],
    title: '{n} Einheiten gute Ware verkaufen',
    pitch:
      'Meine Leute wollen gutes Zeug, kein gestrecktes. Verkauf diese Woche {n} Einheiten mindestens guter Qualität.',
    doneText: 'Alle begeistert. So muss das.',
    count: { 'sale.completed': (p, _s, o) => (inCity(p.veedelId, o) && p.quality >= goodQuality() ? p.amount : 0) },
    bonus: 'reputation',
    weight: 1.1,
  },
  {
    id: 'deliveries',
    icon: 'car',
    contactId: 'contract:marlene',
    targets: [2, 4, 7],
    title: '{n} Lieferungen ausfahren',
    pitch: 'Meine Gäste bestellen nach Hause. Fahr diese Woche {n} Lieferungen aus, dann gehören sie dir.',
    doneText: 'Pünktlich und diskret. Genau so.',
    count: { 'order.finished': (p) => (p.kind === 'delivery' && p.status === 'done' ? 1 : 0) },
    bonus: 'teamXp',
    weight: 1,
  },
  {
    id: 'wholesale',
    icon: 'boxes',
    contactId: 'contract:svetlana',
    targets: [1, 2, 3],
    title: '{n}× Großhandel abschließen',
    pitch: 'Ich hab Abnehmer für große Mengen. Zieh diese Woche {n}× einen Großhandels-Deal durch.',
    doneText: 'Saubere Geschäfte. Wir sehen uns.',
    available: (_s, _c, tier) => tier >= 1,
    count: { 'order.finished': (p) => (p.kind === 'wholesale' && p.status === 'done' ? 1 : 0) },
    bonus: 'clean',
    weight: 1.3,
  },
  {
    id: 'quiet',
    icon: 'shieldCheck',
    contactId: 'contract:frank',
    targets: [24, 36, 48],
    title: '{n} Stunden ohne viel Heat',
    pitch: 'Bei mir im Veedel will keiner Blaulicht. Halt die Heat {n} Stunden am Stück überall unter 35.',
    doneText: 'Ruhig war es. Danke dir.',
    streak: (state) => hottestVeedel(state).heat < 35,
    bonus: 'heat',
    weight: 0.9,
  },
  {
    id: 'hold',
    icon: 'flag',
    contactId: 'contract:bruno',
    targets: [72, 96, 120],
    title: '{param} Veedel {n} Stunden halten',
    pitch: 'Es heißt, die Gangs wollen dir ans Leder. Halt deine {param} Veedel {n} Stunden am Stück.',
    doneText: 'Keiner ist durchgekommen. Gute Arbeit.',
    available: (state, cityId) => controlled(state, cityId) >= 1,
    param: (state, cityId) => controlled(state, cityId),
    streak: (state, o) => controlled(state, o.cityId) >= (o.param ?? 1),
    bonus: 'influence',
    weight: 1.1,
  },
  {
    id: 'expand',
    icon: 'map',
    contactId: 'contract:bruno',
    targets: [1, 1, 1],
    title: 'Ein Veedel dazugewinnen',
    pitch: 'Da ist noch ein Veedel zu haben. Hol es dir diese Woche, dann bist du für mich der Richtige.',
    doneText: 'So macht man das. Hier, für dich.',
    available: (state, cityId) => controlled(state, cityId) < allVeedel(cityId).length,
    param: (state, cityId) => controlled(state, cityId),
    measure: (state, o) => controlled(state, o.cityId) - (o.param ?? 0),
    bonus: 'loyalty',
    weight: 1.4,
  },
  {
    id: 'regulars',
    icon: 'heart',
    contactId: 'contract:ali',
    targets: [3, 5, 8],
    title: '{n} neue Stammkunden',
    pitch: 'Wer bleibt, ist mehr wert als zehn Laufkunden. Gewinn diese Woche {n} neue Stammkunden.',
    doneText: 'Die kommen wieder, glaub mir.',
    count: { 'customer.regularGained': () => 1 },
    bonus: 'reputation',
    weight: 1,
  },
  {
    id: 'stock',
    icon: 'warehouse',
    contactId: 'contract:svetlana',
    targets: [300, 1000, 3000],
    title: '{n} Einheiten einkaufen',
    pitch: 'Mein Lieferant will Umsatz sehen, sonst gibt es nichts für dich. Kauf diese Woche {n} Einheiten ein.',
    doneText: 'Er ist zufrieden. Und ich auch.',
    count: { 'shipment.ordered': (p) => p.amount },
    bonus: 'goods',
    weight: 0.9,
  },
  {
    id: 'night',
    icon: 'moon',
    contactId: 'contract:marlene',
    targets: [80, 250, 700],
    title: '{n} Einheiten nachts verkaufen',
    pitch: 'Nachts ist meine Zeit. Verkauf diese Woche zwischen 22 und 6 Uhr {n} Einheiten.',
    doneText: 'Die Nacht gehört dir. Schön.',
    count: {
      'sale.completed': (p, s, o) => {
        const hour = Math.floor((s.time % 1440) / 60);
        return inCity(p.veedelId, o) && (hour >= 22 || hour < 6) ? p.amount : 0;
      },
    },
    bonus: 'goods',
    weight: 1,
  },
  {
    id: 'hire',
    icon: 'userPlus',
    contactId: 'contract:frank',
    targets: [2, 3, 5],
    title: '{n} Leute einstellen',
    pitch: 'Ein paar Jungs aus dem Veedel brauchen Arbeit. Stell diese Woche {n} Leute ein.',
    doneText: 'Die Familien danken es dir.',
    count: { 'staff.hired': () => 1 },
    bonus: 'loyalty',
    weight: 0.8,
  },
  {
    id: 'launder',
    icon: 'washing',
    contactId: 'contract:ali',
    targets: [3000, 10000, 30000],
    title: '{n} waschen',
    pitch: 'Ich kenn jemanden bei der Bank, der genau hinguckt. Wasch diese Woche {n}, dann bist du sauber.',
    doneText: 'Sauber. Im wahrsten Sinne.',
    euro: true,
    available: (_s, _c, tier) => tier >= 1,
    count: { 'laundering.completed': (p) => p.amount },
    bonus: 'heat',
    weight: 0.9,
  },
  {
    id: 'spots',
    icon: 'pinPlus',
    contactId: 'contract:jojo',
    targets: [2, 2, 3],
    title: '{n} neue Spots',
    pitch: 'Da draußen gibt es noch Ecken ohne dich. Mach diese Woche {n} neue Spots auf.',
    doneText: 'Mehr Ecken, mehr Kundschaft. Gut so.',
    count: { 'spots.unlocked': one, 'spots.founded': one },
    bonus: 'teamXp',
    weight: 1,
  },
];

function one(): number {
  return 1;
}

export function getContractTemplate(id: string): ContractTemplate | undefined {
  return CONTRACT_TEMPLATES.find((t) => t.id === id);
}

export function getContractContact(id: string): Contact | undefined {
  return CONTRACT_CONTACTS.find((c) => c.id === id);
}

/** Ziel einer Vorlage für eine Größe des Geschäfts (und einen Zusatzwert). */
export function contractTarget(template: ContractTemplate, tier: number, param = 0): number {
  if (template.target) return template.target(tier, param);
  return template.targets[Math.max(0, Math.min(2, tier))];
}

/** Text mit eingesetzten Werten ({n}, {product}, {param}). */
export function fillContractText(
  text: string,
  template: ContractTemplate,
  values: { target: number; productId?: string; param?: number },
): string {
  const n = template.euro ? `${values.target.toLocaleString('de-DE')} €` : String(values.target);
  const product = values.productId ? (getProduct(values.productId)?.name ?? values.productId) : '';
  return text
    .replaceAll('{n}', n)
    .replaceAll('{product}', product)
    .replaceAll('{param}', String(values.param ?? 0));
}

/** Geld pro Größe des Geschäfts (Grundwert der Belohnung). */
export const CONTRACT_MONEY: readonly [number, number, number] = [0, 500, 1500];
/** Vertrauen beim Lieferanten pro Größe. */
export const CONTRACT_TRUST: readonly [number, number, number] = [3, 4, 5];
/** So viele Angebote pro Woche. */
export const CONTRACT_OFFERS = 3;
/** Montag (0) um 8 Uhr kommen die Angebote. */
export const CONTRACT_WEEKDAY = 0;
export const CONTRACT_HOUR = 8;
/**
 * Verträge erst, wenn alle Quests der Kapitel davor erledigt oder übersprungen sind (J15: Am ersten Montag, Tag 4,
 * kamen sie, während Peter noch das Ankommen erklärte). 1 = nach dem Kapitel „Ankommen“ (Verkaufen, Preise, Bestellen).
 */
export const CONTRACTS_FROM_CHAPTER = 1;
/** So viele erledigte bzw. geplatzte Verträge merkt sich der Spielstand. */
export const CONTRACT_HISTORY = 8;

/** Belohnungen eines Vertrags (Geld, ein Bonus, Vertrauen bei einem Lieferanten, falls es einen gibt). */
export function contractRewards(
  template: ContractTemplate,
  tier: number,
  supplierId: string | null,
  productId?: string,
): QuestReward[] {
  const t = Math.max(0, Math.min(2, tier));
  const money = Math.round((CONTRACT_MONEY[t] * template.weight) / 50) * 50;
  const rewards: QuestReward[] = [];
  switch (template.bonus) {
    case 'clean':
      rewards.push({ kind: 'money', money: 'clean', amount: Math.round(money / 2 / 50) * 50 });
      rewards.push({ kind: 'money', money: 'dirty', amount: Math.round(money / 2 / 50) * 50 });
      break;
    case 'goods':
      rewards.push({ kind: 'money', money: 'dirty', amount: Math.round((money * 0.6) / 50) * 50 });
      rewards.push({ kind: 'goods', productId: productId ?? 'weed', amount: [25, 100, 300][t], quality: 0.85 });
      break;
    case 'reputation':
      rewards.push({ kind: 'money', money: 'dirty', amount: money });
      rewards.push({ kind: 'reputation', amount: [3, 5, 8][t] });
      break;
    case 'heat':
      rewards.push({ kind: 'money', money: 'dirty', amount: money });
      rewards.push({ kind: 'heat', amount: [10, 15, 20][t] });
      break;
    case 'teamXp':
      rewards.push({ kind: 'money', money: 'dirty', amount: money });
      rewards.push({ kind: 'teamXp', amount: [20, 40, 60][t] });
      break;
    case 'loyalty':
      rewards.push({ kind: 'money', money: 'dirty', amount: money });
      rewards.push({ kind: 'loyalty', amount: [5, 8, 10][t] });
      break;
    case 'influence':
      rewards.push({ kind: 'money', money: 'dirty', amount: money });
      rewards.push({ kind: 'influence', amount: [3, 6, 10][t] });
      break;
  }
  if (supplierId) rewards.push({ kind: 'trust', supplierId, amount: CONTRACT_TRUST[t] });
  // Kein Geld mit 0 € (Kleindealer bekommen nur Bonus und Vertrauen).
  return rewards.filter((r) => r.kind !== 'money' || r.amount > 0);
}

/** Ungefährer Wert einer Belohnung in Euro (zum Vergleichen, z.B. für den Bot). */
export function rewardValue(reward: QuestReward): number {
  switch (reward.kind) {
    case 'money':
      return reward.money === 'clean' ? reward.amount * 1.3 : reward.amount;
    case 'goods':
      return reward.amount * (getProduct(reward.productId)?.basePrice ?? 10) * 0.6;
    case 'reputation':
      return reward.amount * 150;
    case 'heat':
      return reward.amount * 40;
    case 'teamXp':
      return reward.amount * 10;
    case 'loyalty':
      return reward.amount * 60;
    case 'influence':
      return reward.amount * 80;
    case 'trust':
      return reward.amount * 120;
    case 'title':
      return 0;
  }
}
