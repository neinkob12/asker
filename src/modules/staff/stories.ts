// Geschichten der Leute (Auftrag 34): kleine Ereignisse aus Eigenschaften und Beziehungen, per Handy im Ton der
// Figur, mit Antworten und Abklingzeit. Die Vorlagen sind Daten (STORIES): wer in Frage kommt, was sofort passiert,
// welche Antworten es gibt und was sie bewirken. Texte mit dem Text-Helfer (keine direkte Wiederholung).
//
// Ablauf: Zur vollen Stunde (tagsüber, nur in der Stadt, die live ist) kommt nach STORY_GAP mit
// STORY_CHANCE_PER_HOUR eine Geschichte. Die Antwort schickt 'staff.storyChoice'; ohne Antwort gilt `fallback`.

import {
  type CommandResult,
  type Ctx,
  clock,
  formatEuro,
  type GameState,
  journal,
  type MessageOption,
  messages,
  texts,
  wallet,
} from '../../core';
import { activeCity } from '../city';
import { getGangs } from '../gangs';
import { isLieutenant, isRightHand } from '../hierarchy';
import { addHeat, getHeat } from '../police';
import { getSpot, spotVars } from '../spots';
import { veedelName } from '../veedel';
import {
  STORY_CHANCE_PER_HOUR,
  STORY_EXPIRES,
  STORY_GAP,
  STORY_HOURS,
  STORY_MIN_TEAM,
  STORY_PERSON_GAP,
  STORY_TEMPLATE_GAP,
  STORY_WEIGHTS,
} from './config';
import {
  addCareer,
  addLoyalty,
  addXp,
  assign,
  bailCost,
  expectedWage,
  getStaff,
  getStaffMember,
  removeMember,
  staffContact,
  staffVeedel,
} from './members';
import { betray, lieLow } from './routines';
import { hasTrait, relationsOf } from './traits';
import type { RelationKind, StaffMember, StaffStories, StaffStory, StoryId } from './types';

/** Was eine Antwort (oder der Anfang einer Geschichte) bewirkt. */
export interface StoryEffect {
  /** Den Betrag der Geschichte zahlen (Schwarzgeld). Reicht es nicht, gilt die Antwort nicht. */
  pay?: boolean;
  /** Den Betrag der Geschichte bekommen. */
  earn?: boolean;
  loyalty?: number;
  /** Loyalität der zweiten Person (Beziehung). */
  otherLoyalty?: number;
  /** Lohn mal diesem Faktor (ohne die übliche Freude oder den Ärger über die Änderung). */
  wageFactor?: number;
  /** Lohn auf den erwarteten Lohn heben. */
  wageToExpected?: boolean;
  /** Anspruch plus diesen Wert. */
  demand?: number;
  /** Heat im Veedel der Person. */
  heat?: number;
  /** Chance, dass die Person kündigt. */
  quitChance?: number;
  /** Chance, dass die Person aus Frust etwas mitgehen lässt (Geld). */
  stealChance?: number;
  /** So viele Stunden nicht im Einsatz (bedient keine Kunden). */
  offHours?: number;
  /** Vom Spot abziehen. */
  unassign?: boolean;
  /** Die zweite Person aus der Haft holen (Kaution). */
  bailOther?: boolean;
  /** Das Veedel mit dem meisten Heat so viele Stunden abtauchen lassen. */
  lieLowHours?: number;
  xp?: number;
}

export interface StoryChoice {
  id: string;
  label: string;
  /** Antwort des Spielers im Chat. */
  reply: string;
  effect: StoryEffect;
  /** Was die Figur darauf sagt (Varianten), leer = nichts. */
  answer?: readonly string[];
  /** Nur anbieten, wenn das zutrifft. */
  available?: (state: GameState, story: StaffStory) => boolean;
}

export interface StoryTemplate {
  id: StoryId;
  /** Kommt die Person in Frage? */
  fits: (state: GameState, m: StaffMember) => boolean;
  /** Geschichte mit einer zweiten Person: die passende Beziehung (und optional mehr Bedingungen). */
  relation?: { kind: RelationKind; other?: (other: StaffMember) => boolean };
  /** Betrag, um den es geht. */
  amount?: (state: GameState, m: StaffMember) => number;
  /** Was sofort passiert. */
  start?: StoryEffect;
  /** Nachricht (Varianten). Platzhalter: {name}, {first}, {other}, {amount}, {spot}, {veedel}, {gang}. */
  texts: readonly string[];
  choices: readonly StoryChoice[];
  /** Ohne Antwort bis zur Frist gilt diese Wahl. */
  fallback: string;
  /** Eintrag im Journal beim Start. */
  journal?: string;
}

const round50 = (value: number): number => Math.max(50, Math.round(value / 50) * 50);
const active = (m: StaffMember): boolean => m.status === 'active';
const atSpot = (m: StaffMember): boolean => active(m) && m.assignment?.kind === 'spot';
const working = (m: StaffMember): boolean =>
  active(m) && (m.assignment?.kind === 'spot' || m.assignment?.kind === 'warehouse');
const leads = (state: GameState, m: StaffMember): boolean => isLieutenant(state, m.id) || isRightHand(state, m.id);

export const STORIES: Record<StoryId, StoryTemplate> = {
  loan: {
    id: 'loan',
    fits: (_s, m) => hasTrait(m, 'family') && active(m),
    amount: (s, m) => round50(expectedWage(s, m.id) * 5),
    texts: [
      'Chef, ich muss dich was fragen. Mein Kleiner braucht eine Zahnspange, die Kasse zahlt nix. {amount}, ich zahl’s zurück.',
      'Ist mir unangenehm, aber die Waschmaschine ist hin und das Kind hat Geburtstag. Kannst du mir {amount} leihen?',
      'Meine Mutter muss in die Reha, und die wollen {amount} vorab. Ich arbeite das ab, versprochen.',
      'Die Vermieterin macht Stress, {amount} Rückstand. Ich frag nur, weil ich nicht weiß, wohin.',
      'Chef, {amount} für die Klassenfahrt und die Brille. Sonst frag ich nie.',
    ],
    choices: [
      {
        id: 'give',
        label: 'Geld geben',
        reply: 'Hier. Kümmer dich um deine Familie.',
        effect: { pay: true, loyalty: 15 },
        answer: [
          'Das vergess ich dir nicht.',
          'Danke, Chef. Ehrlich.',
          'Du bist in Ordnung. Ich bin dir was schuldig.',
        ],
      },
      {
        id: 'work',
        label: 'Abarbeiten',
        reply: 'Kriegst du. Zahlst es über den Lohn zurück.',
        effect: { pay: true, loyalty: 6, wageFactor: 0.9 },
        answer: ['Fair. Danke.', 'Geht klar, dann wird’s halt knapper.'],
      },
      {
        id: 'refuse',
        label: 'Ablehnen',
        reply: 'Ich bin keine Bank.',
        effect: { loyalty: -10 },
        answer: ['Schon klar. Hab verstanden.', 'Okay. Merk ich mir.'],
      },
    ],
    fallback: 'refuse',
  },
  familyTime: {
    id: 'familyTime',
    fits: (_s, m) => hasTrait(m, 'family') && working(m),
    texts: [
      'Meine Tochter hat Fieber, die Kita nimmt sie nicht. Kann ich morgen frei haben?',
      'Chef, bei uns ist Einschulung. Einen Tag, dann bin ich wieder da.',
      'Meine Frau liegt flach, einer muss die Kinder holen. Ein Tag frei, geht das?',
      'Familienkram. Ich bräuchte einen Tag, sonst gibt’s zu Hause Krieg.',
    ],
    choices: [
      {
        id: 'off',
        label: 'Tag frei geben',
        reply: 'Geh. Familie geht vor.',
        effect: { offHours: 24, loyalty: 8 },
        answer: ['Danke. Übermorgen steh ich wieder da.', 'Du bist ein Guter.'],
      },
      {
        id: 'stay',
        label: 'Du arbeitest',
        reply: 'Geht nicht. Du stehst da.',
        effect: { loyalty: -8 },
        answer: ['Okay. Dann halt so.', 'Na super.'],
      },
    ],
    fallback: 'stay',
  },
  drunk: {
    id: 'drunk',
    fits: (_s, m) => hasTrait(m, 'drinker') && atSpot(m) && m.role === 'runner',
    start: { offHours: 4 },
    journal: '{name} hat getrunken und den Spot {spot} stehen lassen.',
    texts: [
      'Chef … hicks. Bin ein paar Stunden nicht {atSpot}. Ist nix.',
      'Sorry, ich war mit Jungs im Brauhaus, ich kann grad nicht stehen. Der Spot {spot} muss warten.',
      'Hab einen sitzen. Ich geh pennen, morgen bin ich wieder da, ehrlich.',
      'Ich weiß, ich weiß. Ein Bier zu viel. Heute Abend steht am Spot keiner: {spot}.',
    ],
    choices: [
      {
        id: 'warn',
        label: 'Abmahnen',
        reply: 'Einmal noch, und du bist raus.',
        effect: { loyalty: -3 },
        answer: ['Kommt nicht wieder vor.', 'Ja, Chef. Sorry.'],
      },
      {
        id: 'cut',
        label: 'Lohn kürzen',
        reply: 'Das geht von deinem Lohn ab.',
        effect: { wageFactor: 0.9, loyalty: -8 },
        answer: ['Ist ja gut.', 'Hart, aber okay.'],
      },
      {
        id: 'letGo',
        label: 'Lass gut sein',
        reply: 'Schlaf dich aus.',
        effect: { loyalty: 3 },
        answer: ['Du bist der Beste.', 'Danke, Chef.'],
      },
    ],
    fallback: 'letGo',
  },
  hangover: {
    id: 'hangover',
    fits: (_s, m) => hasTrait(m, 'drinker') && working(m),
    start: { offHours: 3 },
    texts: [
      'Kopf platzt. Ich komm heute später.',
      'War gestern lang. Gib mir drei Stunden, dann steh ich.',
      'Mir geht’s nicht gut. Selbst schuld, ich weiß. Ich komm nachher.',
      'Kater. Ich bin nachher da, versprochen.',
    ],
    choices: [
      {
        id: 'ok',
        label: 'Okay',
        reply: 'Trink Wasser.',
        effect: { loyalty: 2 },
        answer: ['Mach ich.', 'Danke.'],
      },
      {
        id: 'now',
        label: 'Sofort hin',
        reply: 'Ist mir egal, wie’s dir geht. Du stehst in einer Stunde da.',
        effect: { offHours: -2, loyalty: -5 },
        answer: ['Ja, ja. Bin unterwegs.', 'Boah. Okay.'],
      },
    ],
    fallback: 'ok',
  },
  debt: {
    id: 'debt',
    fits: (_s, m) => hasTrait(m, 'gambler') && active(m),
    amount: (s, m) => round50(expectedWage(s, m.id) * 8),
    texts: [
      'Chef, ich hab Mist gebaut. Pokern, {amount} Miese, und die Typen wollen das bis morgen.',
      'Sportwetten. Frag nicht. Ich brauch {amount}, sonst kommen die vorbei.',
      'Ich steck tief drin, {amount}. Wenn du mir hilfst, mach ich jede Schicht, die du willst.',
      'Das Automatencafé in {veedel} will {amount} von mir. Kannst du einspringen?',
    ],
    choices: [
      {
        id: 'pay',
        label: 'Schulden zahlen',
        reply: 'Ich zahl das. Einmal.',
        effect: { pay: true, loyalty: 12 },
        answer: ['Einmal. Versprochen.', 'Du hast mir den Arsch gerettet.'],
      },
      {
        id: 'refuse',
        label: 'Dein Problem',
        reply: 'Dein Problem.',
        effect: { loyalty: -8, stealChance: 0.35 },
        answer: ['Dann muss ich mir das Geld halt woanders holen.', 'Wie du meinst.'],
      },
    ],
    fallback: 'refuse',
  },
  gamblerWin: {
    id: 'gamblerWin',
    fits: (_s, m) => hasTrait(m, 'gambler') && active(m),
    amount: (s, m) => round50(expectedWage(s, m.id) * 3),
    texts: [
      'Chef! Hab beim Pokern abgeräumt. Ich geb einen aus, kommst du?',
      'Heute läuft’s: Der Automat hat {amount} ausgespuckt. Wer hat Durst?',
      'Hab auf den FC gewettet, und die haben gewonnen. Gibt’s auch nur alle zehn Jahre.',
    ],
    choices: [
      {
        id: 'cheer',
        label: 'Glückwunsch',
        reply: 'Glückwunsch. Verspiel’s nicht gleich wieder.',
        effect: { loyalty: 3 },
        answer: ['Niemals. Na ja, vielleicht.', 'Haha. Mal sehen.'],
      },
      {
        id: 'share',
        label: 'Hälfte abgeben',
        reply: 'Schön. Die Hälfte kommt in die Kasse, du hast noch Schulden bei mir.',
        effect: { earn: true, loyalty: -6 },
        answer: ['Echt jetzt? Na gut.', 'Du gönnst einem nix.'],
      },
    ],
    fallback: 'cheer',
  },
  promotion: {
    id: 'promotion',
    fits: (s, m) => hasTrait(m, 'ambitious') && active(m) && m.level >= 3 && !leads(s, m),
    texts: [
      'Chef, ich mach das hier jetzt lang genug. Ich will mehr Verantwortung. Sonst schau ich mich bei {gang} um.',
      'Ehrlich: Ich bin besser als das hier. Mach mich zum Leutnant, oder ich geh zu {gang}.',
      'Ich will weiter. Mehr Geld, mehr zu sagen. {gang} hat schon gefragt.',
      'Weißt du, wer mich gestern angerufen hat? {gang}. Ich hab nein gesagt. Noch.',
    ],
    choices: [
      {
        id: 'promise',
        label: 'Versprechen',
        reply: 'Du bist dran, wenn ein Posten frei wird.',
        effect: { loyalty: 6, demand: 0.1 },
        answer: ['Ich nehm dich beim Wort.', 'Gut. Ich warte. Nicht ewig.'],
      },
      {
        id: 'raise',
        label: 'Mehr Lohn (+20 %)',
        reply: 'Mehr Lohn gibt’s sofort, der Rest kommt.',
        effect: { wageFactor: 1.2, loyalty: 10 },
        answer: ['Damit kann ich leben.', 'Das ist ein Wort.'],
      },
      {
        id: 'refuse',
        label: 'Geh doch',
        reply: 'Dann geh doch.',
        effect: { loyalty: -12, quitChance: 0.3 },
        answer: ['Vielleicht mach ich das.', 'Wirst schon sehen.'],
      },
    ],
    fallback: 'promise',
  },
  raise: {
    id: 'raise',
    fits: (s, m) =>
      active(m) &&
      !hasTrait(m, 'ambitious') &&
      m.level >= 4 &&
      s.time - m.hiredAt >= 10 * 1440 &&
      m.wage < expectedWage(s, m.id) * 0.95,
    amount: (s, m) => Math.max(10, expectedWage(s, m.id) - m.wage),
    texts: [
      'Chef, ich bin jetzt lange dabei und mach meinen Job. Ich will {amount} mehr am Tag.',
      'Alle anderen kriegen mehr, ich steh seit Wochen für dasselbe Geld da. {amount} mehr, dann passt’s.',
      'Kurze Sache: Lohn. {amount} mehr am Tag. Ich find, das hab ich mir verdient.',
    ],
    choices: [
      {
        id: 'yes',
        label: 'Ja',
        reply: 'Hast du dir verdient.',
        effect: { wageToExpected: true, loyalty: 6 },
        answer: ['Danke, Chef.', 'So mag ich das.'],
      },
      {
        id: 'no',
        label: 'Nein',
        reply: 'Nein. Sei froh, dass du überhaupt was kriegst.',
        effect: { loyalty: -10 },
        answer: ['Okay. Merk ich mir.', 'Schade.'],
      },
    ],
    fallback: 'no',
  },
  bragged: {
    id: 'bragged',
    fits: (s, m) => hasTrait(m, 'braggart') && working(m) && staffVeedel(s, m) !== null,
    start: { heat: 6 },
    journal: '{name} hat in der Kneipe zu viel erzählt. Heat in {veedel}.',
    texts: [
      'Sag mal, war das schlimm, dass ich gestern in der Kneipe erzählt hab, für wen ich arbeite? Die waren alle beeindruckt.',
      'Chef, ich hab im Club ein bisschen angegeben. Mit Geld und so. Ist doch egal, oder?',
      'Gestern Abend in {veedel}: Ich hab den Jungs erzählt, wie viel wir hier umsetzen. Die haben geguckt!',
      'Da war so ein Typ an der Theke, der wollte alles wissen. Ich hab ein bisschen geplaudert. Nur ein bisschen.',
    ],
    choices: [
      {
        id: 'shut',
        label: 'Klappe halten',
        reply: 'Halt die Klappe. Kein Wort mehr, zu niemandem.',
        effect: { loyalty: -4 },
        answer: ['Ja, ist ja gut.', 'Okay, okay.'],
      },
      {
        id: 'cut',
        label: 'Lohn kürzen',
        reply: 'Das kostet dich. Zehn Prozent.',
        effect: { wageFactor: 0.9, loyalty: -8 },
        answer: ['Wegen so was?', 'Echt jetzt?'],
      },
      {
        id: 'ignore',
        label: 'Egal',
        reply: 'Hauptsache, die Kasse stimmt.',
        effect: { heat: 4 },
        answer: ['Sag ich doch.', 'Eben.'],
      },
    ],
    fallback: 'ignore',
  },
  scared: {
    id: 'scared',
    fits: (s, m) => {
      if (!hasTrait(m, 'coward') || !atSpot(m)) return false;
      const veedelId = staffVeedel(s, m);
      return !!veedelId && getHeat(s, veedelId) >= 35;
    },
    texts: [
      'Chef, ich hab Schiss. Hier in {veedel} fahren dauernd Zivis rum. Kann ich ein paar Tage weg vom Spot {spot}?',
      'Ich halt das nicht aus, die Bullen gucken mich schon so an. Lass mich bitte woanders hin.',
      'Ehrlich, ich mach mir in die Hose. {veedel} ist zu heiß gerade.',
      'Ich glaub, die beobachten den Spot {spot}. Ich will da nicht mehr stehen.',
    ],
    choices: [
      {
        id: 'pull',
        label: 'Abziehen',
        reply: 'Okay, komm runter von der Straße.',
        effect: { unassign: true, loyalty: 6 },
        answer: ['Danke, danke.', 'Puh. Danke.'],
      },
      {
        id: 'raise',
        label: 'Gefahrenzulage',
        reply: 'Du bleibst. Dafür gibt’s zehn Prozent mehr.',
        effect: { wageFactor: 1.1, loyalty: 3 },
        answer: ['Na gut. Für Geld.', 'Okay … okay.'],
      },
      {
        id: 'stay',
        label: 'Reiß dich zusammen',
        reply: 'Reiß dich zusammen und bleib da.',
        effect: { loyalty: -8, quitChance: 0.15 },
        answer: ['…', 'Wenn die mich holen, ist das deine Schuld.'],
      },
    ],
    fallback: 'stay',
  },
  loyalTip: {
    id: 'loyalTip',
    fits: (s, m) => hasTrait(m, 'loyal') && active(m) && hottestOwnVeedel(s) !== null,
    texts: [
      'Hab was gehört, Chef: In {veedel} sind gerade viele Zivis unterwegs. Soll ich den Leuten Bescheid sagen?',
      'Mein Cousin fährt Taxi. Der sagt, in {veedel} stehen seit gestern Bullen an jeder Ecke.',
      'Nur damit du’s weißt: In {veedel} wird’s eng. Die Leute sollten ein paar Stunden verschwinden.',
    ],
    choices: [
      {
        id: 'hide',
        label: 'Leute abziehen',
        reply: 'Gut, dass du aufpasst. Alle sechs Stunden runter von der Straße.',
        effect: { lieLowHours: 6, loyalty: 3, xp: 20 },
        answer: ['Mach ich sofort.', 'Geht klar.'],
      },
      {
        id: 'thanks',
        label: 'Danke',
        reply: 'Danke. Wir machen weiter.',
        effect: { loyalty: 2, xp: 20 },
        answer: ['Okay. Ich hab’s gesagt.', 'Du bist der Chef.'],
      },
    ],
    fallback: 'thanks',
  },
  hothead: {
    id: 'hothead',
    fits: (_s, m) => hasTrait(m, 'hothead') && atSpot(m),
    start: { heat: 5 },
    journal: '{name} hat {atSpot} einen Kunden geschlagen.',
    texts: [
      'Der Typ wollte nicht zahlen. Hab ihm eine verpasst. Problem gelöst.',
      '{AtSpot} hat einer rumgepöbelt. Liegt jetzt im Gebüsch. Gern geschehen.',
      'Kleine Rangelei {atSpot}. Der hat angefangen, ehrlich.',
      'Einer wollte mich verarschen. Wollte. Der kommt nicht wieder.',
    ],
    choices: [
      {
        id: 'praise',
        label: 'Gut so',
        reply: 'Richtig so. Keiner verarscht uns.',
        effect: { loyalty: 4 },
        answer: ['Sag ich doch.', 'Jawoll.'],
      },
      {
        id: 'warn',
        label: 'Abmahnen',
        reply: 'Keine Schlägereien am Spot. Das zieht die Bullen an.',
        effect: { loyalty: -3 },
        answer: ['Ja, ja.', 'Der hat’s verdient, aber okay.'],
      },
    ],
    fallback: 'praise',
  },
  rivalsFight: {
    id: 'rivalsFight',
    fits: (_s, m) => active(m),
    relation: { kind: 'rivals', other: active },
    start: { heat: 3 },
    journal: '{name} und {other} haben sich geprügelt.',
    texts: [
      'Chef, {other} hat mich vor allen blöd angemacht. Wir haben uns geprügelt. Der hat angefangen.',
      'Ich arbeite nicht mehr mit {other}. Entweder der oder ich.',
      '{other} erzählt rum, ich würd klauen. Das lass ich mir nicht gefallen.',
      'Ärger mit {other}. Ist eskaliert. Sag du, wer recht hat.',
    ],
    choices: [
      {
        id: 'both',
        label: 'Beide verwarnen',
        reply: 'Ihr vertragt euch, oder ihr fliegt beide.',
        effect: { loyalty: -3, otherLoyalty: -3 },
        answer: ['Pff. Okay.', 'Für dich, Chef.'],
      },
      {
        id: 'side',
        label: 'Recht geben',
        reply: 'Du hast recht. Ich red mit dem.',
        effect: { loyalty: 6, otherLoyalty: -12 },
        answer: ['Wusste ich’s doch.', 'Danke.'],
      },
      {
        id: 'other',
        label: 'Andere Seite',
        reply: 'Lass {other} in Ruhe. Du hast angefangen.',
        effect: { loyalty: -12, otherLoyalty: 6 },
        answer: ['Das glaub ich jetzt nicht.', 'Na toll.'],
      },
    ],
    fallback: 'both',
  },
  friendsParty: {
    id: 'friendsParty',
    fits: (_s, m) => active(m),
    relation: { kind: 'friends', other: active },
    amount: () => 150,
    texts: [
      '{other} hat Geburtstag. Gibst du eine Runde aus? {amount} reichen.',
      'Wir feiern heute, {other} und ich. Ein paar Bier auf den Chef?',
      'Kleine Feier nach Feierabend mit {other}. Wär schön, wenn du was dazugibst.',
    ],
    choices: [
      {
        id: 'pay',
        label: 'Runde ausgeben',
        reply: 'Geht auf mich. Feiert schön.',
        effect: { pay: true, loyalty: 6, otherLoyalty: 6 },
        answer: ['Auf dich!', 'Du bist eingeladen, ehrlich.'],
      },
      {
        id: 'no',
        label: 'Nein',
        reply: 'Feiert ohne mich.',
        effect: { loyalty: -2, otherLoyalty: -2 },
        answer: ['Geizhals.', 'Okay, dann nicht.'],
      },
    ],
    fallback: 'no',
  },
  coupleMoveIn: {
    id: 'coupleMoveIn',
    fits: (_s, m) => active(m),
    relation: { kind: 'couple', other: active },
    amount: (s, m) => round50(expectedWage(s, m.id) * 6),
    texts: [
      '{other} und ich ziehen zusammen. Die Kaution ist {amount}. Kannst du was vorschießen?',
      'Wir haben eine Wohnung in Aussicht, {other} und ich. Nur die Kaution, {amount}, fehlt.',
      'Chef, das wird was Festes mit {other}. Wir bräuchten {amount} für die Wohnung.',
    ],
    choices: [
      {
        id: 'pay',
        label: 'Kaution zahlen',
        reply: 'Ich zahl die Kaution. Viel Glück euch.',
        effect: { pay: true, loyalty: 10, otherLoyalty: 10 },
        answer: ['Das vergessen wir dir nie.', 'Danke! {other} freut sich auch.'],
      },
      {
        id: 'no',
        label: 'Nein',
        reply: 'Das müsst ihr selbst stemmen.',
        effect: { loyalty: -4, otherLoyalty: -4 },
        answer: ['Okay. Wir finden was.', 'Schade.'],
      },
    ],
    fallback: 'no',
  },
  siblingJailed: {
    id: 'siblingJailed',
    fits: (_s, m) => active(m),
    relation: { kind: 'siblings', other: (o) => o.status === 'jailed' },
    amount: (s, m) => {
      const sibling = relationsOf(s, m.id).find((r) => r.kind === 'siblings' && r.other.status === 'jailed');
      return sibling ? bailCost(s, sibling.other.id) : 0;
    },
    texts: [
      '{other} sitzt. Das ist meine Familie, Chef. Holst du {other} raus? Kaution {amount}.',
      'Meine Mutter ruft jede Stunde an wegen {other}. Bitte, zahl die Kaution.',
      'Ich kann nicht arbeiten, solange {other} drin ist. {amount}, dann ist das erledigt.',
    ],
    choices: [
      {
        id: 'bail',
        label: 'Kaution zahlen',
        reply: 'Ich hol {other} raus.',
        effect: { bailOther: true, loyalty: 12 },
        answer: ['Danke. Das ist mehr wert als Geld.', 'Du hältst zu uns. Das zählt.'],
        available: (s, story) => !!story.otherId && s.wallet.dirty >= bailCost(s, story.otherId),
      },
      {
        id: 'wait',
        label: 'Abwarten',
        reply: 'Das sitzt {other} ab.',
        effect: { loyalty: -8 },
        answer: ['Hätte ich nicht gedacht von dir.', 'Okay.'],
      },
    ],
    fallback: 'wait',
  },
};

/** Veedel der Stadt mit dem meisten Heat, in dem Leute von dir an Spots stehen (für den Tipp), sonst null. */
function hottestOwnVeedel(state: GameState): string | null {
  let best: string | null = null;
  let heat = 30;
  for (const m of getStaff(state, { cityId: activeCity(state) })) {
    if (m.assignment?.kind !== 'spot' || m.status !== 'active') continue;
    const veedelId = staffVeedel(state, m);
    if (!veedelId) continue;
    const h = getHeat(state, veedelId);
    if (h > heat) {
      heat = h;
      best = veedelId;
    }
  }
  return best;
}

export function storiesState(state: GameState): StaffStories {
  const s = state.modules.staff;
  s.stories ??= { open: [], lastAt: {}, byPerson: {}, byStory: {}, count: 0 };
  return s.stories;
}

/** Offene Geschichten (für die Oberfläche und den Bot). */
export function openStories(state: GameState): readonly StaffStory[] {
  return state.modules.staff.stories?.open ?? [];
}

/** Antworten, die für eine Geschichte gerade gehen. */
export function storyChoices(state: GameState, story: StaffStory): StoryChoice[] {
  return STORIES[story.story].choices.filter((c) => !c.available || c.available(state, story));
}

interface Candidate {
  template: StoryTemplate;
  member: StaffMember;
  other: StaffMember | null;
}

function candidates(state: GameState, cityId: string): Candidate[] {
  const st = storiesState(state);
  const team = getStaff(state, { cityId });
  const list: Candidate[] = [];
  for (const id of Object.keys(STORIES).sort() as StoryId[]) {
    const template = STORIES[id];
    if (state.time - (st.byStory[id] ?? -Infinity) < STORY_TEMPLATE_GAP) continue;
    for (const m of team) {
      if (state.time - (st.byPerson[m.id] ?? -Infinity) < STORY_PERSON_GAP) continue;
      if (st.open.some((o) => o.staffId === m.id || o.otherId === m.id)) continue;
      if (m.assignment?.kind === 'travel') continue;
      if (!template.fits(state, m)) continue;
      let other: StaffMember | null = null;
      if (template.relation) {
        const rel = template.relation;
        other =
          relationsOf(state, m.id).find(
            (r) => r.kind === rel.kind && r.other.cityId === cityId && (!rel.other || rel.other(r.other)),
          )?.other ?? null;
        if (!other) continue;
        if (st.open.some((o) => o.staffId === other?.id || o.otherId === other?.id)) continue;
      }
      list.push({ template, member: m, other });
    }
  }
  return list;
}

/** Zur vollen Stunde: vielleicht eine neue Geschichte in der Stadt, die live ist. */
export function maybeStartStory(ctx: Ctx): void {
  const hour = clock.hour(ctx.now);
  if (hour < STORY_HOURS[0] || hour >= STORY_HOURS[1]) return;
  const cityId = activeCity(ctx.state);
  const st = storiesState(ctx.state);
  if (ctx.now - (st.lastAt[cityId] ?? -Infinity) < STORY_GAP) return;
  if (getStaff(ctx.state, { cityId }).length < STORY_MIN_TEAM) return;
  if (!ctx.chance(STORY_CHANCE_PER_HOUR)) return;
  const list = candidates(ctx.state, cityId);
  if (list.length === 0) return;
  // Erst die Vorlage nach Gewicht, dann die Person.
  const byTemplate = new Map<StoryId, Candidate[]>();
  for (const c of list) byTemplate.set(c.template.id, [...(byTemplate.get(c.template.id) ?? []), c]);
  const ids = [...byTemplate.keys()];
  let roll = ctx.random() * ids.reduce((sum, id) => sum + STORY_WEIGHTS[id], 0);
  let chosen = ids[ids.length - 1];
  for (const id of ids) {
    roll -= STORY_WEIGHTS[id];
    if (roll < 0) {
      chosen = id;
      break;
    }
  }
  const pick = ctx.pick(byTemplate.get(chosen) ?? []);
  startStory(ctx, pick.template.id, pick.member.id, pick.other?.id ?? null);
}

function storyVars(state: GameState, story: StaffStory): Record<string, string> {
  const m = getStaffMember(state, story.staffId);
  const other = story.otherId ? getStaffMember(state, story.otherId) : undefined;
  const veedelId = m ? (staffVeedel(state, m) ?? (story.story === 'loyalTip' ? hottestOwnVeedel(state) : null)) : null;
  const place = m?.assignment ?? m?.returnTo;
  const spot = place?.kind === 'spot' ? getSpot(state, place.targetId) : undefined;
  const gangs = getGangs(state, story.cityId);
  const gang = gangs.length > 0 ? gangs[(m ? m.id.length + m.name.length : 0) % gangs.length].name : 'der Konkurrenz';
  return {
    name: m?.name ?? '',
    first: m?.name.split(' ')[0] ?? '',
    other: other?.name ?? '',
    amount: formatEuro(story.amount),
    // {spot}, {atSpot} („am Ebertplatz“, „an der Uni-Wiese“), {AtSpot}: Geschichten mit Spot setzen einen voraus.
    ...spotVars(spot ?? { name: 'Spot' }),
    veedel: veedelId ? veedelName(veedelId) : 'der Stadt',
    gang,
  };
}

/** Eine Geschichte starten (auch für Tests): Nachricht mit Antworten, sofortige Wirkung. */
export function startStory(ctx: Ctx, id: StoryId, staffId: string, otherId: string | null = null): StaffStory | null {
  const template = STORIES[id];
  const m = getStaffMember(ctx.state, staffId);
  if (!m || m.leftAt !== null) return null;
  const st = storiesState(ctx.state);
  const story: StaffStory = {
    id: `st${ctx.nextId()}`,
    story: id,
    staffId,
    otherId,
    amount: template.amount ? template.amount(ctx.state, m) : 0,
    messageId: 0,
    createdAt: ctx.now,
    cityId: m.cityId,
  };
  const vars = storyVars(ctx.state, story);
  if (template.journal) journal.add(ctx, texts.fill(template.journal, vars), 'info', { staffId });
  if (template.start) applyEffect(ctx, story, template.start);
  const options: MessageOption[] = storyChoices(ctx.state, story).map((c) => ({
    id: c.id,
    label: texts.fill(c.label, vars),
    reply: texts.fill(c.reply, vars),
    command: { type: 'staff.storyChoice', payload: { storyId: story.id, choice: c.id } },
  }));
  story.messageId = messages.send(ctx, {
    contact: staffContact(m),
    text: texts.pick(ctx, `staff:story:${id}`, template.texts, vars),
    options,
    expiresIn: STORY_EXPIRES,
    silent: true,
  });
  st.open.push(story);
  st.lastAt[story.cityId] = ctx.now;
  st.byPerson[staffId] = ctx.now;
  if (otherId) st.byPerson[otherId] = ctx.now;
  st.byStory[id] = ctx.now;
  st.count += 1;
  ctx.emit('staff.story', { storyId: story.id, story: id, staffId, otherId });
  return story;
}

/** Antwort auf eine Geschichte (Befehl 'staff.storyChoice'). */
export function chooseStory(ctx: Ctx, storyId: string, choiceId: string): CommandResult {
  const st = storiesState(ctx.state);
  const story = st.open.find((s) => s.id === storyId);
  if (!story) return { ok: false, reason: 'Das hat sich erledigt.' };
  const choice = storyChoices(ctx.state, story).find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'Diese Antwort geht gerade nicht.' };
  if (choice.effect.pay && ctx.state.wallet.dirty < story.amount) {
    return { ok: false, reason: `Nicht genug Geld (${formatEuro(story.amount)}).` };
  }
  return resolveStory(ctx, story, choice);
}

function resolveStory(ctx: Ctx, story: StaffStory, choice: StoryChoice): CommandResult {
  const st = storiesState(ctx.state);
  st.open = st.open.filter((s) => s.id !== story.id);
  const m = getStaffMember(ctx.state, story.staffId);
  if (!m || m.leftAt !== null) return { ok: true };
  const vars = storyVars(ctx.state, story);
  const answer = choice.answer && choice.answer.length > 0;
  applyEffect(ctx, story, choice.effect);
  const still = getStaffMember(ctx.state, story.staffId);
  if (answer && still?.leftAt === null) {
    messages.send(ctx, {
      contact: staffContact(still),
      text: texts.pick(ctx, `staff:story:${story.story}:${choice.id}`, choice.answer ?? [], vars),
      silent: true,
    });
  }
  ctx.emit('staff.storyResolved', { storyId: story.id, story: story.story, staffId: story.staffId, choice: choice.id });
  return { ok: true };
}

/** Ohne Antwort bis zur Frist: die Rückfall-Wahl. */
export function expireStory(ctx: Ctx, messageId: number): void {
  const story = storiesState(ctx.state).open.find((s) => s.messageId === messageId);
  if (!story) return;
  const template = STORIES[story.story];
  const choice = template.choices.find((c) => c.id === template.fallback);
  if (choice) resolveStory(ctx, story, { ...choice, effect: { ...choice.effect, pay: false }, answer: [] });
}

/** Geschichten mit Leuten, die gegangen sind, fallen weg. */
export function dropStoriesOf(ctx: Ctx, staffId: string): void {
  const st = ctx.state.modules.staff.stories;
  if (!st) return;
  st.open = st.open.filter((s) => s.staffId !== staffId && s.otherId !== staffId);
}

function applyEffect(ctx: Ctx, story: StaffStory, effect: StoryEffect): void {
  const m = getStaffMember(ctx.state, story.staffId);
  if (!m || m.leftAt !== null) return;
  const tag = { category: 'wages.extra' as const, staffId: m.id };
  if (effect.pay && story.amount > 0) wallet.pay(ctx, story.amount, 'dirty', `Für ${m.name}`, tag);
  if (effect.earn && story.amount > 0) {
    wallet.earn(ctx, Math.round(story.amount / 2), 'dirty', `Anteil von ${m.name}`, 'income.other');
  }
  if (effect.loyalty) addLoyalty(ctx, m.id, effect.loyalty);
  if (effect.otherLoyalty && story.otherId) addLoyalty(ctx, story.otherId, effect.otherLoyalty);
  if (effect.wageFactor) {
    m.wage = Math.max(0, Math.round((m.wage * effect.wageFactor) / 5) * 5);
    addCareer(ctx, m.id, `Lohn ${effect.wageFactor > 1 ? 'erhöht' : 'gekürzt'}: ${m.wage} € pro Tag.`);
  }
  if (effect.wageToExpected) {
    m.wage = Math.max(m.wage, expectedWage(ctx.state, m.id));
    addCareer(ctx, m.id, `Lohn erhöht: ${m.wage} € pro Tag.`);
  }
  if (effect.demand) m.demand = Math.max(0.5, m.demand + effect.demand);
  if (effect.xp) addXp(ctx, m.id, effect.xp);
  if (effect.heat) {
    const veedelId = staffVeedel(ctx.state, m);
    if (veedelId) addHeat(ctx, veedelId, effect.heat);
  }
  if (effect.offHours) {
    m.busyUntil = Math.max(ctx.now, (m.busyUntil > ctx.now ? m.busyUntil : ctx.now) + effect.offHours * 60);
  }
  if (effect.unassign && m.assignment?.kind === 'spot' && m.status === 'active') assign(ctx, m.id, null);
  if (effect.lieLowHours) {
    const veedelId = hottestOwnVeedel(ctx.state);
    if (veedelId) {
      const until = ctx.now + effect.lieLowHours * 60;
      const pulled = lieLow(ctx, veedelId, until);
      ctx.emit('staff.wentUnderground', { veedelId, until, pulled });
    }
  }
  if (effect.bailOther && story.otherId) {
    ctx.dispatch({ type: 'staff.bail', payload: { staffId: story.otherId } }, { actor: 'player' });
  }
  if (effect.stealChance && ctx.chance(effect.stealChance)) betray(ctx, m, 'money');
  if (effect.quitChance && ctx.chance(effect.quitChance)) {
    const left = getStaffMember(ctx.state, m.id);
    if (left && left.leftAt === null) {
      removeMember(ctx, m.id, 'quit');
      journal.add(ctx, `${m.name} hat hingeschmissen.`, 'bad', { staffId: m.id });
    }
  }
}
