// Typen der Hierarchie. Andere Module importieren sie über '../hierarchy'.

/** Preisniveau an seinen Spots ('keep' = die Preise lässt er, wie sie sind). */
export type PriceLevel = 'keep' | 'volume' | 'fair' | 'premium';
/** Vorsicht: Ab wie viel Heat der Leutnant seine Leute von der Straße holt. */
export type CautionLevel = 'bold' | 'normal' | 'careful';
/**
 * Was er tut, wenn jemand aus seinem Team ausfällt (Haft, verletzt): abwarten, sofort ersetzen (die Person kommt
 * danach in den freien Pool), ersetzen und nach absentDays Tagen entlassen oder sofort entlassen und ersetzen.
 */
export type AbsentPolicy = 'wait' | 'replace' | 'fireAndReplace' | 'fireNow';

/**
 * Bestellregel: Ware, Lieferant, Paket, Mindestbestand und Ziel-Lager. null heißt jeweils "automatisch" (Ware nach
 * Nachfrage, günstigster Lieferant, passendes Paket, das Lager, aus dem seine Spots verkaufen).
 */
export interface OrderRule {
  id: string;
  productId: string | null;
  supplierId: string | null;
  packageId: string | null;
  /** Unter diesem Bestand im Ziel-Lager (plus was dorthin unterwegs ist) bestellt er. */
  minStock: number;
  warehouseId: string | null;
  /** Warum die Regel gerade ruht (Lieferant gesperrt …), sonst null. */
  paused: string | null;
}

/** Delegations-Einstellungen eines Leutnants. */
export interface LieutenantSettings {
  priceLevel: PriceLevel;
  caution: CautionLevel;
  /** Darf er Leute anheuern, wenn an seinen Spots jemand fehlt? */
  mayHire: boolean;
  /** So viel darf er pro Tag fürs Anheuern ausgeben. */
  hireBudgetPerDay: number;
  /** Darf er Ware bestellen (nach seinen Bestellregeln)? */
  mayOrder: boolean;
  /** Rücklage: So viel Schwarzgeld fasst er nie an. */
  reserve: number;
  onAbsent: AbsentPolicy;
  /** Bei 'fireAndReplace': nach so vielen Tagen Ausfall entlassen. */
  absentDays: number;
  orderRules: OrderRule[];
}

export interface LogEntry {
  time: number;
  text: string;
}

/** Der Posten eines Leutnants: bis zu drei Spots, Einstellungen, Team und Protokoll. */
export interface LieutenantPost {
  staffId: string;
  /** Spots, die er führt (höchstens MAX_SPOTS_PER_LIEUTENANT), in beliebigen Veedeln. */
  spotIds: string[];
  appointedAt: number;
  settings: LieutenantSettings;
  /** Nächste Runde, in der er seine Spots ordnet. */
  nextActionAt: number;
  /** Verkauft selbst bis (Spielminute). */
  busyUntil: number;
  /** Veedel, in denen er wegen zu viel Heat abgetaucht ist. */
  lyingLow: string[];
  /** Umsatz an seinen Spots heute und gestern (für die Zufriedenheit). */
  revenueToday: number;
  revenueYesterday: number;
  /** Seit der Ernennung. */
  salesTotal: number;
  revenueTotal: number;
  /** Letzte Beschwerde per Nachricht. */
  complainedAt: number | null;
  /** Wen er selbst angeheuert hat (gehört zu seinem Team, auch ohne Spot). */
  team: string[];
  /** Ausgaben fürs Anheuern am Tag spentDay. */
  spentDay: number;
  hireSpent: number;
  /**
   * Ausfälle seines Teams: seit wann, ob schon ersetzt und ob er dir schon gesagt hat, dass er gerade niemanden
   * hinstellen kann (dann versucht er es weiter, sobald Leute oder Budget da sind).
   */
  absences: Record<string, { since: number; replaced: boolean; stuck?: boolean }>;
  /** Was er zuletzt getan hat, neueste zuerst. */
  log: LogEntry[];
}

/** Aufgaben der Rechten Hand, jede einzeln abschaltbar. */
export interface RightHandSettings {
  /** Tagesbericht jeden Morgen um 8 Uhr. */
  dailyReport: boolean;
  /** Freie Leute an leere Spots (auch über Leutnant-Grenzen), Bestellungen der Leutnants abgleichen. */
  coordinate: boolean;
  /** Hält die Löhne für PAYROLL_RESERVE_DAYS zurück und sperrt Ausgaben der Leutnants, die sie angreifen. */
  payrollGuard: boolean;
  /** Entscheidet über Kaution oder Ersetzen, wenn der Leutnant das nicht tut. */
  absences: boolean;
  /** Gemeinsames Tagesbudget der Leutnants für Anheuern und Bestellen. */
  budgetPerDay: number;
}

/** Tagesbericht der Rechten Hand (Zahlen vom Vortag). */
export interface DailyReport {
  day: number;
  revenue: number;
  costs: number;
  profit: number;
  cash: number;
  /** Wie viele Nächte die Löhne aus dem Schwarzgeld noch reichen (null = keine Löhne). */
  runwayDays: number | null;
  /** Bis zu drei Empfehlungen. */
  advice: string[];
}

/** Die Stelle der Rechten Hand über den Leutnants. */
export interface RightHandPost {
  staffId: string;
  appointedAt: number;
  settings: RightHandSettings;
  nextActionAt: number;
  /** Tag, an dem der letzte Tagesbericht kam. */
  reportDay: number;
  lastReport: DailyReport | null;
  /** Ausgaben der Leutnants (Anheuern und Bestellen) am Tag spentDay. */
  spentDay: number;
  spent: number;
  /** Letzte Warnung, dass die Löhne nicht reichen (Spielminute). */
  warnedAt: number | null;
  /** Ausfälle, um die sie sich schon gekümmert hat (bis die Person zurück ist). */
  handled: string[];
  log: LogEntry[];
}

export interface HierarchyState {
  /** Mitarbeiter-ID → Posten. */
  posts: Record<string, LieutenantPost>;
  /** Rechte Hand, sonst null. */
  rightHand: RightHandPost | null;
  /** Vorlage für die Bestellregeln neuer Leutnants (letzte Einstellung des Spielers), sonst null. */
  orderTemplate: OrderRule[] | null;
}
