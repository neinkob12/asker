// Typen der Hierarchie. Andere Module importieren sie über '../hierarchy'.

/** Preisniveau: Welche Kunden die Leute im Veedel bedienen. */
export type PriceLevel = 'volume' | 'fair' | 'premium';
/** Vorsicht: Ab wie viel Heat der Leutnant seine Leute von der Straße holt. */
export type CautionLevel = 'bold' | 'normal' | 'careful';

/** Delegations-Einstellungen eines Leutnants. */
export interface LieutenantSettings {
  /** Unter diesem Bestand (Einheiten, inklusive Lieferungen unterwegs) bestellt er Nachschub. */
  minStock: number;
  priceLevel: PriceLevel;
  caution: CautionLevel;
  /** Darf er Leute einstellen, wenn Läufer fehlen? */
  mayHire: boolean;
  /** Darf er Ware bestellen? */
  mayOrder: boolean;
  /** Rücklage: So viel Schwarzgeld fasst er nie an. */
  reserve: number;
}

export interface LogEntry {
  time: number;
  text: string;
}

/** Der Posten eines Leutnants in einem Veedel. */
export interface LieutenantPost {
  staffId: string;
  appointedAt: number;
  settings: LieutenantSettings;
  /** Nächste Runde, in der er sein Veedel ordnet. */
  nextActionAt: number;
  /** Verkauft selbst bis (Spielminute). */
  busyUntil: number;
  /** Abgetaucht, weil es zu heiß ist. */
  lyingLow: boolean;
  /** Umsatz im Veedel heute und gestern (für die Zufriedenheit). */
  revenueToday: number;
  revenueYesterday: number;
  /** Seit der Ernennung. */
  salesTotal: number;
  revenueTotal: number;
  /** Letzte Beschwerde per Nachricht. */
  complainedAt: number | null;
  /** Was er zuletzt getan hat, neueste zuerst. */
  log: LogEntry[];
}

export interface HierarchyState {
  /** Veedel-ID → Mitarbeiter-ID des Leutnants. */
  lieutenants: Record<string, string>;
  /** Veedel-ID → Posten mit Einstellungen und Protokoll. */
  posts: Record<string, LieutenantPost>;
}
