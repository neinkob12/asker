// Typen der Konfrontationen. Reine Daten (JSON), damit sie im Spielstand liegen können.

import type { MoneyCategory } from '../../core';

export type EncounterOutcome = 'success' | 'failure' | 'retreat';

/** briefing: Spieler entscheidet, ob er selbst hingeht. rounds: Runden laufen. done: vorbei. */
export type EncounterPhase = 'briefing' | 'rounds' | 'done';

/**
 * Wie der Spieler im Briefing vorgeht ("Wie gehst du vor?"):
 *   self     selbst hin (Tod möglich)            crew     die Leute machen lassen
 *   backup   Verstärkung schicken (kostet)       payoff   sofort freikaufen (Erfolg, Beziehung sinkt)
 *   tipoff   anonym die Bullen rufen (Rückzug, Heat, etwas Ware weg)
 *   abandon  Ware retten, Spot räumen (Rückzug, die Kasse ist weg)
 */
export type EncounterMode = 'self' | 'crew' | 'backup' | 'payoff' | 'tipoff' | 'abandon';

/** Werte, die in Konfrontationen zählen (Teilmenge der Mitarbeiter-Werte aus staff). */
export type EncounterStat = 'speed' | 'caution' | 'strength' | 'charisma';

export type EncounterStats = Record<EncounterStat, number>;

/**
 * Was bei einer Konfrontation auf dem Spiel steht (Auftrag 35). Pro Runde schützt man einen Einsatz; was die Gegenseite
 * vorhat (Absicht), trifft oft genau einen davon.
 *   goods  Ware (bzw. Ladung)    cash  Kasse (Schwarzgeld vor Ort, bei Schulden das Geld, um das es geht)
 *   people die eigenen Leute     spot  der Spot bzw. das Revier (Einfluss)    noise  Lärm (Heat im Veedel)
 */
export type StakeId = 'goods' | 'cash' | 'people' | 'spot' | 'noise';

/** Rollen auf der Gegenseite (ohne Namen): Anführer, Nervöser, Schläger. */
export type FoeRole = 'leader' | 'nervous' | 'bruiser';

/** Wo eine Konfrontation spielt (für die Situationstexte). */
export type EncounterSetting = 'spot' | 'warehouse' | 'street' | 'meeting' | 'autobahn' | 'port';

/** Spezialzüge der Crew, einmal pro Konfrontation (siehe crew.ts). */
export type SpecialMoveId = 'block' | 'getaway' | 'secondTalk' | 'stash';

/** Feste Zahl oder Zufallsbereich [min, max] (beide inklusive, ganze Zahlen). */
export type Amount = number | readonly [number, number];

/**
 * Folgen eines Ausgangs. Positive Werte sind Gewinne für den Spieler, negative Verluste.
 * Alles wird über die APIs der anderen Module angewendet (wallet, goods, territory, police, reputation, staff).
 */
export interface EncounterEffects {
  /** Journal-Text. Platzhalter: {opponent}, {place}. */
  text?: string;
  /** Schwarzgeld in Euro. Verlust höchstens so viel, wie da ist. */
  money?: Amount;
  /** Anteil des Schwarzgelds, negativ = Verlust, z.B. -0.2. */
  moneyShare?: number;
  /** Obergrenze für den Verlust durch moneyShare in Euro. */
  moneyShareMax?: number;
  /** Vielfaches des Einsatzes request.stakes.money, z.B. 1 = gewonnen, -1 = verloren. */
  stakeMoney?: number;
  /** Ware in Einheiten. Gewinn wird eingelagert, Verlust aus dem Lager genommen. */
  goods?: Amount;
  /** Qualität gewonnener Ware (0–1), sonst Standardqualität. */
  goodsQuality?: number;
  /** Anteil des gesamten Warenbestands, negativ = Verlust, z.B. -0.3. */
  goodsShare?: number;
  /** Vielfaches des Einsatzes request.stakes.goods. */
  stakeGoods?: number;
  /** Einfluss des Spielers im Veedel der Konfrontation. */
  influence?: number;
  /** Einfluss der Gegenseite (opponent.factionId) im Veedel. */
  opponentInfluence?: number;
  /** Heat im Veedel. */
  heat?: number;
  /** Globaler Ruf. */
  reputation?: number;
  /** Beziehung zur Gegenseite (opponent.factionId, z.B. eine Gang). Wendet das Modul der Gegenseite an. */
  relation?: number;
  /** Chance pro beteiligtem Mitarbeiter, festgenommen zu werden. */
  arrestChance?: number;
}

export interface EncounterOpponentRequest {
  /** Fraktion der Gegenseite, z.B. eine Gang-ID. Leer bei Polizei oder Einzelpersonen. */
  factionId?: string;
  label?: string;
  /**
   * Kampfkraft 0–100 (wie ein Mitarbeiter-Wert). Werte bis STRENGTH_FACTOR_LIMIT (5) gelten als Faktor auf die
   * Standardstärke des Anlasses, z.B. die Polizeipräsenz eines Veedels (1,4 → 40 % stärker als normal).
   */
  strength?: number;
  /** Anzahl der Leute auf der Gegenseite. */
  count?: number;
}

export interface EncounterRequest {
  /** Anlass, Schlüssel aus ENCOUNTER_KINDS, z.B. 'policeChase'. */
  kind: string;
  veedelId?: string;
  spotId?: string;
  /** Überfallenes oder betroffenes Lager: Ware geht nur aus diesem Lager verloren (und der Anteil gilt für dessen Bestand). */
  warehouseId?: string;
  /** Beteiligte eigene Leute (staff-IDs). Nur aktive Mitarbeiter machen mit. */
  staffIds?: string[];
  /** Ist der Spieler selbst dabei? Ohne Angabe nicht (wie beim Stub), außer askPlayer fragt ihn. */
  playerPresent?: boolean;
  /**
   * Den Spieler zu Beginn fragen, ob er selbst hingeht (nur bei Anlässen mit joinable und ohne playerPresent).
   * Z.B. bei einem Überfall der Gangs: selbst hin (Todesgefahr) oder die Leute machen lassen.
   */
  askPlayer?: boolean;
  /** Gegenseite, z.B. eine Gang oder die Polizei. Fehlende Werte kommen aus dem Anlass. */
  opponent?: EncounterOpponentRequest;
  /** Wer die Konfrontation ausgelöst hat, damit er das Ergebnis zuordnen kann. */
  origin?: { module: string; ref?: string };
  /** Ort im Satz, z.B. 'am Ebertplatz'. Standard: aus Spot oder Veedel. */
  place?: string;
  /** Eigener Situationstext statt dem des Anlasses. */
  situation?: string;
  /** Wo es spielt, für die Situationstexte des Anlasses (Standard: aus Lager, Spot oder Veedel). */
  setting?: EncounterSetting;
  /** Einsatz, auf den sich stakeMoney/stakeGoods in den Folgen beziehen (z.B. Schulden, Deal-Menge). */
  stakes?: { money?: number; goods?: number };
  /** Ersetzt die Folgen des Anlasses für einzelne Ausgänge. */
  effects?: Partial<Record<EncounterOutcome, EncounterEffects>>;
  /** true: Keine Folgen aus den Daten anwenden, der Aufrufer kümmert sich selbst (Verletzungen gelten trotzdem). */
  skipEffects?: boolean;
  /** Kategorie für Geld, das dabei weggeht (Bestechung, Verstärkung …), z.B. 'loss.customs'. Standard nach Anlass. */
  lossCategory?: MoneyCategory;
}

export type ParticipantCondition = 'ok' | 'injured' | 'down';

export interface Participant {
  /** 'player' oder die staff-ID. */
  id: string;
  name: string;
  isPlayer: boolean;
  stats: EncounterStats;
  /** ok → verletzt → außer Gefecht. */
  condition: ParticipantCondition;
  killed: boolean;
  /** Spezialzug aus Rolle und Werten (Auftrag 35), null = keiner. Der Spieler hat keinen. */
  move?: SpecialMoveId | null;
  /** Spezialzug schon genutzt (einmal pro Konfrontation). */
  moveUsed?: boolean;
}

/** Ein Gegner mit Rolle. */
export interface Foe {
  role: FoeRole;
  /** in: dabei, gone: abgezogen, down: ausgeschaltet. */
  state: 'in' | 'gone' | 'down';
}

/** Ein Einsatz mit seinem Schaden (0 = unberührt, 100 = ganz verloren). */
export interface StakeState {
  id: StakeId;
  damage: number;
}

export interface Opponent {
  /** Mit Artikel, als Satzanfang nutzbar, z.B. 'Die Streife'. */
  label: string;
  factionId: string | null;
  strength: number;
  /** Noch kampffähig und vor Ort. */
  count: number;
  startCount: number;
  /** Ausgeschaltet (nicht mitgezählt: wer abgehauen ist). */
  down: number;
}

export interface RoundLog {
  round: number;
  actionId: string;
  /** Hat die Runde unterm Strich geholfen (Zeiger in die richtige Richtung)? */
  success: boolean;
  /** Stärke der Handlung in dieser Runde (0–1, früher die Erfolgschance). */
  chance: number;
  text: string;
  /** Absicht der Gegenseite in dieser Runde. */
  intent?: string;
  /** Wie sich die Zeiger in dieser Runde bewegt haben. */
  shift?: GaugeShift;
}

/** Änderung der beiden Zeiger. */
export interface GaugeShift {
  aggression: number;
  resolve: number;
}

/** Teil-Ergebnis pro Einsatz für die Ergebnis-Karte. */
export interface EncounterResultPart {
  stake: StakeId;
  /** kept: gehalten, partial: teilweise verloren, lost: weg. */
  state: 'kept' | 'partial' | 'lost';
  /** Kurzer Text, z.B. "−12 g" oder "Kalle verletzt". */
  text: string;
}

/** Was eine Konfrontation am Ende bewirkt hat, aus Sicht des Spielers. */
export interface EncounterResult {
  /** Schwarzgeld-Änderung inkl. Bestechung. */
  money: number;
  /** Waren-Änderung in Einheiten. */
  goods: number;
  /** Leute der Gegenseite, die ausgeschaltet wurden. */
  opponentLosses: number;
  staffInjured: string[];
  staffKilled: string[];
  staffArrested: string[];
  playerInjured: boolean;
  heat: number;
  influence: number;
  reputation: number;
  /** Änderung der Beziehung zur Gegenseite (wendet z.B. gangs an). */
  relation: number;
  /** Zusammenfassung für Journal und Dialog. */
  text: string;
  /** Teil-Ergebnisse pro Einsatz (Auftrag 35). Fehlt bei alten Spielständen. */
  parts?: EncounterResultPart[];
  /** Wie es geendet hat: Gegenseite abgezogen, Polizei-Uhr abgelaufen, Ladung aufgegeben … (für Auslöser und Texte). */
  ending?: EncounterEnding;
}

/**
 * Wie eine Konfrontation geendet hat:
 *   gaveUp    die Gegenseite zieht ab (Entschlossenheit unter RETREAT_AT)
 *   beaten    alle Gegner ausgeschaltet oder weg
 *   clock     die Polizei-Uhr ist abgelaufen (beide verlieren)
 *   fled      ihr seid abgehauen          surrendered  Ware bzw. Ladung aufgegeben
 *   overrun   eure Seite ist am Boden     looted       sie haben genug erbeutet und ziehen ab
 *   briefing  im Briefing entschieden (freikaufen, Bullen rufen, räumen)
 *   resolved  sofort entschieden (Bestechung angenommen, Rundengrenze, niemand da)
 */
export type EncounterEnding =
  | 'gaveUp'
  | 'beaten'
  | 'clock'
  | 'fled'
  | 'surrendered'
  | 'overrun'
  | 'looted'
  | 'briefing'
  | 'resolved';

export interface Encounter {
  id: number;
  kind: string;
  request: EncounterRequest;
  startedAt: number;
  phase: EncounterPhase;
  /** Wie der Spieler vorgeht (Briefing), null solange er nicht entschieden hat bzw. ohne Briefing. */
  mode: EncounterMode | null;
  situation: string;
  /** Situationstext mit Platzhaltern (aus dem Anlass gewählt), damit {us} nach dem Briefing stimmt. */
  situationTemplate?: string;
  place: string;
  playerPresent: boolean;
  participants: Participant[];
  opponent: Opponent;
  /** Lage: 0 = verloren, 100 = gewonnen (aus den Zeigern abgeleitet, für alte Anzeigen und Aufrufer). */
  edge: number;
  /** Gespielte Runden. */
  round: number;
  /** Runde, in der die Streife spätestens da ist (Runde + Polizei-Uhr). */
  maxRounds: number;
  /** Zeiger Aggression der Gegenseite, 0–100. Ab AGGRESSION_FIGHT wird geprügelt. */
  aggression: number;
  /** Zeiger Entschlossenheit der Gegenseite (Bereitschaft zu bleiben), 0–100. Unter RETREAT_AT ziehen sie ab. */
  resolve: number;
  /** Polizei-Uhr: Runden, bis die Streife da ist. */
  clock: number;
  /** Läuft gerade eine Schlägerei (Aggression über AGGRESSION_FIGHT)? */
  brawl: boolean;
  /** Absicht der Gegenseite in dieser Runde (ID aus den Absichten des Anlasses), null wenn keine. */
  intent: string | null;
  /** Gegner mit Rollen. opponent.count zählt die, die noch dabei sind. */
  foes: Foe[];
  /** Einsätze des Anlasses mit Schaden. */
  stakes: StakeState[];
  /** Einsatz, den die eigene Seite in dieser Runde schützt. */
  protect: StakeId | null;
  log: RoundLog[];
  /** Kosten fürs Bestechen in dieser Konfrontation. */
  bribeCost: number;
  /** Zusätzliche Heat durch Aktionen (z.B. Gewalt gegen Polizei). */
  extraHeat: number;
  /** Ware, die in den Runden weggeworfen wurde (Einheiten). */
  goodsDropped: number;
  /** Bereits gezahltes Bestechungsgeld. */
  bribeSpent: number;
  /** Ab dann entscheiden die Leute selbst (nur ohne Oberfläche relevant, der Dialog pausiert das Spiel). */
  deadline: number;
  outcome: EncounterOutcome | null;
  resolvedAt: number | null;
  playerKilled: boolean;
  result: EncounterResult | null;
}

export interface EncountersState {
  active: Encounter[];
  /** Die letzten abgeschlossenen, neueste zuerst. */
  history: Encounter[];
}

/** Die Würfel-Stärke einer Runde skaliert, was gut für euch ist, und dämpft, was schlecht ist (siehe tactics.ts). */
export interface EncounterAction {
  label: string;
  /** Kurze Erklärung für die Oberfläche. */
  hint: string;
  /** Welcher Wert zählt. 'none' = nur Grundwirkung. */
  stat: EncounterStat | 'none';
  /** Durchschnitt aller Beteiligten oder der Beste (z.B. wer am besten redet). */
  statMode: 'avg' | 'best';
  /** Grundwirkung auf die Zeiger (bei mittlerem Würfel, gleich starken Seiten). */
  shift: GaugeShift;
  /** Zielt auf eine Rolle der Gegenseite (nur, solange sie dabei ist). */
  target?: FoeRole;
  /** Die Zielperson geht danach (z.B. der Nervöse lässt sich überreden). */
  removesTarget?: boolean;
  /** Überzahl zählt (bei Gewalt). */
  numbers?: boolean;
  /** Startet eine Schlägerei bzw. schlägt in einer zu (Chance, einen Gegner auszuschalten, siehe tactics.ts). */
  strike?: number;
  /** Polizei-Uhr: 'call' stellt sie auf 1 (Bullen rufen), eine Zahl verschiebt sie. */
  clock?: number | 'call';
  /** Nur, wenn der Spieler selbst dabei ist. */
  requiresPlayer?: boolean;
  /** Nur, wenn die Konfrontation in einem Veedel spielt (z.B. Bullen rufen). */
  requiresVeedel?: boolean;
  /** Kostet Bestechungsgeld. */
  costsBribe?: boolean;
  /** Wirft sofort so viel Ware weg, z.B. vor der Polizei. */
  dropsGoods?: Amount;
  /** Heat im Veedel bei jeder Nutzung. */
  heat?: number;
  /** Beendet die Konfrontation sofort mit diesem Ausgang (z.B. Abhauen = Rückzug). */
  ends?: EncounterOutcome;
  /** Wie es dann geendet hat (Standard: fled bei Rückzug, resolved sonst). */
  ending?: EncounterEnding;
  /** Bei ends: Chance, dass es auf dem Weg einen erwischt (der Würfel und das Tempo senken sie). */
  endHit?: number;
  /** Gibt die Gegenseite direkt nach dieser Handlung auf, endet es so (z.B. davongefahren = Rückzug). */
  gaveUp?: EncounterOutcome;
  /** Schützt diesen Einsatz in der Runde zusätzlich (z.B. Ablenken schützt die Ladung). */
  shields?: StakeId;
  /** Texte ohne Namen: starke bzw. schwache Runde. Einer wird zufällig gewählt. */
  texts: { strong: readonly string[]; weak: readonly string[] };
}

/**
 * Absicht der Gegenseite für eine Runde, als Chip sichtbar, bevor man handelt. Was sie tut, passiert am Ende der Runde,
 * außer der Einsatz ist geschützt oder die Handlung wendet sie ab.
 */
export interface EncounterIntent {
  /** Chip-Text, z.B. "Sie gehen auf die Kasse". */
  label: string;
  /** Symbol für den Chip (Name aus Icon). */
  icon: string;
  /** Trifft diesen Einsatz, wenn er nicht geschützt ist. */
  stake?: StakeId;
  /** Schaden am Einsatz (0–100). */
  damage?: number;
  /** Chance, dass es einen der eigenen Leute erwischt (Einsatz people). */
  hit?: number;
  /** Heat im Veedel (Einsatz noise). */
  heat?: number;
  /** Ungeschützt: so verschieben sich die Zeiger zusätzlich (z.B. die Polizei wird misstrauisch). */
  onHit?: Partial<GaugeShift>;
  /** Am Ende der Runde in jedem Fall. */
  drift?: Partial<GaugeShift>;
  /** Polizei-Uhr am Ende der Runde (z.B. -1: Funk, Verstärkung kommt früher). */
  clock?: number;
  /** Faktor auf die Wirkung einzelner Handlungen in dieser Runde (z.B. Verhandeln ×1,5, wenn der Anführer reden will). */
  modifiers?: Record<string, number>;
  /** Handlungen, die die Absicht ganz abwenden (auch ohne Schutz). */
  counters?: readonly string[];
  /** Nur, wenn diese Rolle noch dabei ist. */
  needs?: FoeRole;
  /** Gewicht beim Würfeln: Grundwert plus Anteil der Zeiger (0–100 → 0–1) bzw. bei Schlägerei. */
  weight: { base: number; aggression?: number; calm?: number; resolve?: number; doubt?: number; brawl?: number };
  /** Text, wenn die Absicht trifft bzw. abgewendet wird. */
  hitText: string;
  blockedText: string;
}

/** Situationstext mit Bedingungen (alle angegebenen müssen passen; der genaueste passende gewinnt). */
export interface EncounterSituation {
  text: string;
  settings?: readonly EncounterSetting[];
  /** Tagesabschnitt aus dem Kern (night, dawn, day, dusk). */
  phases?: readonly ('night' | 'dawn' | 'day' | 'dusk')[];
  /** Wetter (WeatherKind aus weather). */
  weather?: readonly string[];
}

/** Ein Anlass für Konfrontationen. Neue Anlässe = neuer Eintrag in ENCOUNTER_KINDS, sonst nichts. */
export interface EncounterKind {
  name: string;
  /** Chance, wenn niemand beteiligt ist und trotzdem ausgewürfelt wird. */
  baseSuccess: number;
  /** Situation zu Beginn. Platzhalter: {opponent}, {place}, {us}, {stakeMoney}, {stakeGoods}. */
  situation: string;
  /** Weitere Situationstexte nach Ort, Tageszeit und Wetter (Auftrag 35). Ohne Treffer gilt situation. */
  situations?: readonly EncounterSituation[];
  /** Standard-Gegenseite. */
  opponent: { label: string; strength: number; count: Amount };
  /** Rollen auf der Gegenseite: so viele Anführer und Nervöse (der Rest sind Schläger). Standard 1 und 1. */
  roles?: { leader: number; nervous: number };
  /** Startwerte der Zeiger bei gleich starken Seiten. */
  gauges: GaugeShift;
  /** Polizei-Uhr: Runden bis zur Streife bei normaler Polizeipräsenz und ohne Heat. */
  clock: number;
  /** Ausgang, wenn die Polizei-Uhr abläuft. Standard: 'retreat' (beide verlieren). */
  clockOutcome?: EncounterOutcome;
  /** Was auf dem Spiel steht (Reihenfolge = Anzeige). */
  stakes: readonly StakeId[];
  /**
   * Beute: Erreicht der Schaden an Ware, Kasse und Spot zusammen so viel, hat die Gegenseite, was sie wollte, und zieht
   * ab (Niederlage, ending 'looted'). Ohne Angabe nie.
   */
  lootLimit?: number;
  /** Eigene Namen für Einsätze, z.B. goods: 'Ladung'. */
  stakeLabels?: Partial<Record<StakeId, string>>;
  /** Mögliche Absichten der Gegenseite (Schlüssel aus ENCOUNTER_INTENTS). */
  intents: readonly string[];
  /** Nach so vielen Runden ist spätestens Schluss (Sicherheitsgrenze, Ausgang draw). */
  maxRounds: number;
  /** Kann der Spieler dazukommen, wenn der Auslöser ihn fragen lässt (askPlayer)? */
  joinable: boolean;
  /**
   * Wege im Briefing ("Wie gehst du vor?"), in dieser Reihenfolge. Standard: selbst hin und Leute machen lassen.
   * Nicht jeder Anlass hat alle (z.B. bei der Polizei keine Bullen rufen).
   */
  briefingOptions?: readonly EncounterMode[];
  /** Ausgang, wenn niemand von euch da ist. Standard: 'failure'. */
  ifNobody?: EncounterOutcome;
  /** Ausgang, wenn die Rundengrenze erreicht ist. Standard: 'retreat'. */
  draw?: EncounterOutcome;
  /** Kann jemand sterben? Standard: true. Sonst gehen Getroffene nur zu Boden (z.B. bei der Polizei). */
  lethal?: boolean;
  /** Eigener Journal-Eintrag zum Ergebnis? Standard: true. Aus, wenn der Auslöser selbst einen schreibt. */
  journal?: boolean;
  /** Handlungen, wenn der Spieler dabei ist. */
  actions: readonly string[];
  /** Handlungen, wenn nur seine Leute da sind (Anweisungen per Handy). */
  remoteActions: readonly string[];
  /** Bestechung: Grundbetrag plus pro Gegner. */
  bribe?: { base: number; perOpponent: number };
  /** Anlass-spezifische Anpassungen einzelner Handlungen. */
  actionOverrides?: Record<string, Partial<Omit<EncounterAction, 'stat' | 'statMode'>>>;
  /** Folgen pro Ausgang. */
  outcomes: Record<EncounterOutcome, EncounterEffects>;
}
