// Einstellbare Werte des Tutorials (Auftrag 46b): Peter als Stimme, die zwölf Stufen, welche Stufe welches Feature
// freischaltet, welche Spots und Lieferanten wann zu haben sind, und die Belohnungsregel.

import type { Contact, GameEvents } from '../../core';

/** Peter, die Stimme der Tour und der Missionen (dieselbe Kontakt-ID wie bei den Quests, damit der Chat einer bleibt). */
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

/** Alle so viele Spielminuten prüft das Modul die Mission (wie die Quests). */
export const TUTORIAL_CHECK_EVERY = 5;

/** Letzte Stufe: ab hier ist alles frei (tutorialActive ist dann falsch), die letzte Mission läuft noch. */
export const LAST_STAGE = 12;

/** Schwarzgeld, das es mit dem Tutorial zusätzlich gibt (mit den 1.500 € aus dem Kern 2.200 €). */
export const TUTORIAL_START_MONEY = 700;

/** Der einzige Spot am Anfang; alle anderen offenen Kölner Spots sperrt das Tutorial beim Start (lockedAtStart). */
export const TUTORIAL_START_SPOT = 'neumarkt';
/** Stufe 2: Diese beiden stehen zum Verkauf, je TUTORIAL_SPOT_COST. */
export const TUTORIAL_STAGE2_SPOTS: readonly string[] = ['zuelpicher', 'rudolfplatz'];
export const TUTORIAL_SPOT_COST = 350;
/** Ab dieser Stufe gibt es Spots im eigenen Veedel und den Nachbarveedeln, ab der nächsten alle. */
export const SPOTS_NEARBY_STAGE = 6;
export const SPOTS_ALL_STAGE = 7;
/** Ohne eigenes Veedel zählen Spots in Luftlinie bis hierhin (Meter) als Nachbarschaft. */
export const SPOTS_NEARBY_METERS = 2000;

/** Lieferanten pro Stufe: Kalle und Toni ab 5, Hein ab 6; alle anderen wie heute über ihre Bedingungen. */
export const SUPPLIER_STAGE: Readonly<Record<string, number>> = { koeln: 5, frankfurt: 5, hamburg: 6 };

export type TutorialFeature =
  | 'hud.cleanMoney'
  | 'hud.stock'
  | 'hud.reputation'
  | 'hud.rank'
  | 'app.territory'
  | 'app.gangs'
  | 'app.suppliers'
  | 'app.laundering'
  | 'app.goods'
  | 'app.finance'
  | 'staff.lieutenants'
  | 'staff.security'
  | 'staff.driver'
  | 'staff.specialist'
  | 'staff.accountant'
  | 'staff.rightHand'
  | 'gangs.threats'
  | 'gangs.attacks'
  | 'gangs.protection'
  | 'gangs.takeover'
  | 'police.undercover'
  | 'police.checks'
  | 'police.raids'
  | 'spots.found'
  | 'laundering.allWays'
  | 'suppliers.groupOrder';

/** Nie, solange das Tutorial läuft (danach wie immer). */
export const NEVER = Number.POSITIVE_INFINITY;

/**
 * Ab welcher Stufe ein Feature frei ist (Auftrag 46, „Der Flow“). NEVER: erst nach dem Tutorial (Spot gründen kommt
 * als Shop in 46e; der Spot-Ausbau ist mit 46d weg) oder über ein Ereignis (EVENT_FEATURES: Ruf beim ersten Stammkunden, Rang
 * beim ersten Aufstieg).
 */
export const FEATURE_STAGE: Readonly<Record<TutorialFeature, number>> = {
  'hud.cleanMoney': 8,
  'hud.stock': 5,
  'hud.reputation': NEVER,
  'hud.rank': NEVER,
  'app.territory': 3,
  'app.gangs': 4,
  'app.suppliers': 5,
  'app.laundering': 8,
  'app.goods': 8,
  'app.finance': 10,
  'staff.lieutenants': 7,
  'staff.security': 7,
  'staff.driver': 8,
  'staff.specialist': 9,
  'staff.accountant': 10,
  'staff.rightHand': 11,
  'gangs.threats': 4,
  'gangs.attacks': 7,
  'gangs.protection': 7,
  'gangs.takeover': 7,
  'police.undercover': 0,
  'police.checks': 9,
  'police.raids': 9,
  'spots.found': NEVER,
  'laundering.allWays': 9,
  'suppliers.groupOrder': 9,
};

/** Features, die ein Ereignis freischaltet (Stufe egal). */
export const EVENT_FEATURES: Readonly<Partial<Record<TutorialFeature, keyof GameEvents>>> = {
  'hud.reputation': 'customer.regularGained',
  'hud.rank': 'player.rankUp',
};

/** Welche Rolle beim Personal an welchem Feature hängt (Läufer, Arbeiter und Gärtner sind immer frei). */
export const ROLE_FEATURE: Readonly<Record<string, TutorialFeature>> = {
  driver: 'staff.driver',
  security: 'staff.security',
  lawyer: 'staff.specialist',
  policeContact: 'staff.specialist',
  accountant: 'staff.accountant',
};

/** Eine Stufe: Titel und ein Satz für die Karte (die Tour selbst kommt mit 46c). */
export interface StageDef {
  title: string;
  text: string;
}

/** Die Stufen 0 bis 12 aus Auftrag 46, Abschnitt „Der Flow“. */
export const STAGES: readonly StageDef[] = [
  { title: 'Willkommen in Kölle', text: 'Du bist Dealer am Neumarkt. Schau dich kurz um, dann geht es los.' },
  { title: 'Der Neumarkt', text: 'Hier kommen deine Kunden. Steht einer da, bedien ihn selbst.' },
  { title: 'Zwei Spots dazu', text: 'Zülpicher Platz und Rudolfplatz stehen zum Verkauf, je 350 €.' },
  { title: 'Reviere', text: 'Jedes Veedel hat Nachfrage, Kaufkraft, Polizei und eine Gang, die das Sagen hat.' },
  { title: 'Gangs', text: 'Wer stärker ist, bestimmt. Bis zum ersten Angriff drohen sie nur per SMS.' },
  { title: 'Lieferanten und Lager', text: 'Kalle und Toni liefern. Mehr Produkte bringen mehr Kunden.' },
  { title: 'Geld verdienen', text: 'Alle Spots in deinem Veedel und den Nachbarveedeln stehen zum Verkauf.' },
  { title: 'Leutnants', text: 'Ein Leutnant führt bis zu drei Spots mit eigenen Leuten. Ernenn einen.' },
  { title: 'Geldwäsche und Hafen', text: 'Sauberes Geld zahlt alles Legale: Liegeplatz, Lager, Fahrer.' },
  { title: 'Vier Leutnants', text: 'Ab jetzt kontrolliert die Polizei und es gibt Razzien. Heat unter 40 lohnt sich.' },
  { title: 'Buchhalter und Kasse', text: 'Ein Buchhalter bringt mehr Gewinn, mit ihm geht die Kasse auf.' },
  { title: 'Boss von Köln', text: 'Sieben Veedel, dann die Rechte Hand: Sie fährt aus und übernimmt Aufgaben.' },
  { title: 'Köln fertig', text: 'Alles läuft von allein, dann wird Hamburg frei.' },
];

/** Belohnungsregel (Auftrag 46, „Belohnungen“): Anteil, Rundung und Untergrenzen. */
export const REWARD = {
  /** Anteil des Umsatzes der letzten 24 Stunden als Schwarzgeld und der verkauften Gramm als Ware. */
  share: 0.2,
  /** Stunden, die zählen. */
  hours: 24,
  /** Geld: unter smallBelow auf smallStep, sonst auf bigStep aufgerundet, mindestens min. */
  money: { smallBelow: 1000, smallStep: 50, bigStep: 100, min: 100 },
  /** Ware in Gramm ebenso. */
  goods: { smallBelow: 100, smallStep: 5, bigStep: 10, min: 10 },
} as const;
