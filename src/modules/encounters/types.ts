// Typen der Konfrontationen. Reine Daten (JSON), damit sie im Spielstand liegen können.

export type EncounterOutcome = 'success' | 'failure' | 'retreat';

/** briefing: Spieler entscheidet, ob er selbst hingeht. rounds: Runden laufen. done: vorbei. */
export type EncounterPhase = 'briefing' | 'rounds' | 'done';

/** Werte, die in Konfrontationen zählen (Teilmenge der Mitarbeiter-Werte aus staff). */
export type EncounterStat = 'speed' | 'caution' | 'strength' | 'charisma';

export type EncounterStats = Record<EncounterStat, number>;

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
  /** Chance pro beteiligtem Mitarbeiter, festgenommen zu werden. */
  arrestChance?: number;
}

export interface EncounterOpponentRequest {
  /** Fraktion der Gegenseite, z.B. eine Gang-ID. Leer bei Polizei oder Einzelpersonen. */
  factionId?: string;
  label?: string;
  /** Kampfkraft 0–100 (wie ein Mitarbeiter-Wert). */
  strength?: number;
  /** Anzahl der Leute auf der Gegenseite. */
  count?: number;
}

export interface EncounterRequest {
  /** Anlass, Schlüssel aus ENCOUNTER_KINDS, z.B. 'policeChase'. */
  kind: string;
  veedelId?: string;
  spotId?: string;
  /** Beteiligte eigene Leute (staff-IDs). Nur aktive Mitarbeiter machen mit. */
  staffIds?: string[];
  /**
   * Ist der Spieler selbst dabei? true/false legt es fest. Ohne Angabe entscheidet der Spieler zu Beginn
   * (bei Anlässen mit joinable), sonst ist er nicht dabei.
   */
  playerPresent?: boolean;
  /** Gegenseite, z.B. eine Gang oder die Polizei. Fehlende Werte kommen aus dem Anlass. */
  opponent?: EncounterOpponentRequest;
  /** Wer die Konfrontation ausgelöst hat, damit er das Ergebnis zuordnen kann. */
  origin?: { module: string; ref?: string };
  /** Ort im Satz, z.B. 'am Ebertplatz'. Standard: aus Spot oder Veedel. */
  place?: string;
  /** Eigener Situationstext statt dem des Anlasses. */
  situation?: string;
  /** Einsatz, auf den sich stakeMoney/stakeGoods in den Folgen beziehen (z.B. Schulden, Deal-Menge). */
  stakes?: { money?: number; goods?: number };
  /** Ersetzt die Folgen des Anlasses für einzelne Ausgänge. */
  effects?: Partial<Record<EncounterOutcome, EncounterEffects>>;
  /** true: Keine Folgen aus den Daten anwenden, der Aufrufer kümmert sich selbst (Verletzungen gelten trotzdem). */
  skipEffects?: boolean;
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
  success: boolean;
  /** Erfolgschance in dieser Runde (0–1). */
  chance: number;
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
  /** Zusammenfassung für Journal und Dialog. */
  text: string;
}

export interface Encounter {
  id: number;
  kind: string;
  request: EncounterRequest;
  startedAt: number;
  phase: EncounterPhase;
  situation: string;
  place: string;
  playerPresent: boolean;
  participants: Participant[];
  opponent: Opponent;
  /** Lage: 0 = verloren, 100 = gewonnen, Start um 50. */
  edge: number;
  /** Gespielte Runden. */
  round: number;
  maxRounds: number;
  log: RoundLog[];
  /** Kosten fürs Bestechen in dieser Konfrontation. */
  bribeCost: number;
  /** Zusätzliche Heat durch Aktionen (z.B. Gewalt gegen Polizei). */
  extraHeat: number;
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

/** Eine Handlungsmöglichkeit in einer Runde. Reine Daten, siehe actions.ts. */
export interface EncounterAction {
  label: string;
  /** Kurze Erklärung für die Oberfläche. */
  hint: string;
  /** Welcher Wert zählt. 'none' = nur Grundchance. */
  stat: EncounterStat | 'none';
  /** Durchschnitt aller Beteiligten oder der Beste (z.B. wer am besten redet). */
  statMode: 'avg' | 'best';
  /** Grundchance 0–1. */
  base: number;
  /** Überzahl zählt (bei Gewalt). */
  numbers?: boolean;
  /** Nur, wenn der Spieler selbst dabei ist. */
  requiresPlayer?: boolean;
  /** Kostet Bestechungsgeld (bei Erfolg und Misserfolg). */
  costsBribe?: boolean;
  /** Heat im Veedel bei jeder Nutzung. */
  heat?: number;
  onSuccess: {
    /** Änderung der Lage. */
    edge?: number;
    /** Konfrontation sofort mit diesem Ausgang beenden. */
    resolve?: EncounterOutcome;
    /** Chance, einen Gegner auszuschalten. */
    knockdown?: number;
    /** Chance, dass einer der Gegner abhaut (ohne Verletzung). */
    scare?: number;
    /** Chance, dass es trotzdem einen der eigenen Leute erwischt. */
    hitChance?: number;
  };
  onFailure: {
    edge?: number;
    resolve?: EncounterOutcome;
    /** Chance, dass es einen der eigenen Leute erwischt. */
    hitChance?: number;
  };
  /** Texte ohne Namen (die Engine ergänzt, wen es erwischt). Einer wird zufällig gewählt. */
  texts: { success: readonly string[]; failure: readonly string[] };
}

/** Ein Anlass für Konfrontationen. Neue Anlässe = neuer Eintrag in ENCOUNTER_KINDS, sonst nichts. */
export interface EncounterKind {
  name: string;
  /** Chance, wenn niemand beteiligt ist und trotzdem ausgewürfelt wird. */
  baseSuccess: number;
  /** Situation zu Beginn. Platzhalter: {opponent}, {place}, {us}, {stakeMoney}, {stakeGoods}. */
  situation: string;
  /** Standard-Gegenseite. */
  opponent: { label: string; strength: number; count: Amount };
  /** Nach so vielen Runden entscheidet die Lage. */
  maxRounds: number;
  /** Kann der Spieler dazukommen, wenn der Auslöser es offen lässt? */
  joinable: boolean;
  /** Ausgang, wenn niemand von euch da ist. Standard: 'failure'. */
  ifNobody?: EncounterOutcome;
  /** Handlungen, wenn der Spieler dabei ist. */
  actions: readonly string[];
  /** Handlungen, wenn nur seine Leute da sind (Anweisungen per Handy). */
  remoteActions: readonly string[];
  /** Bestechung: Grundbetrag plus pro Gegner. */
  bribe?: { base: number; perOpponent: number };
  /** Anlass-spezifische Anpassungen einzelner Handlungen. */
  actionOverrides?: Record<
    string,
    Partial<Pick<EncounterAction, 'label' | 'hint' | 'base' | 'heat' | 'texts' | 'onSuccess' | 'onFailure'>>
  >;
  /** Folgen pro Ausgang. */
  outcomes: Record<EncounterOutcome, EncounterEffects>;
}
