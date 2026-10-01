// Typen des Personals. Andere Module importieren sie über '../staff' (index.ts exportiert alles).

export type StaffRole = 'runner' | 'courier' | 'driver' | 'security' | 'lawyer' | 'accountant' | 'policeContact';
export type StaffStatus = 'active' | 'injured' | 'jailed' | 'quit' | 'dead';

/** Werte von 0 bis 100. */
export interface StaffStats {
  speed: number;
  caution: number;
  strength: number;
  charisma: number;
  loyalty: number;
}

export type StatKey = keyof StaffStats;

/**
 * Einsatzort. kind 'spot' → targetId = Spot-ID, 'delivery' → Auftrags-ID, 'warehouse' → Lager-ID,
 * 'veedel' → Veedel-ID (Leutnant, der das Veedel führt; setzt das hierarchy-Modul),
 * 'transport' → Fahrt-ID (Fahrer, der Ware abholt oder umlagert; setzt das logistics-Modul),
 * 'office' → 'rightHand' (Rechte Hand über den Leutnants, steht an keinem Spot; setzt das hierarchy-Modul).
 */
export interface StaffAssignment {
  kind: 'spot' | 'delivery' | 'warehouse' | 'veedel' | 'transport' | 'office';
  targetId: string;
}

/** Wie jemand zu dir gekommen ist. */
export type StaffOrigin = 'street' | 'pool' | 'referral' | 'regular' | 'event';

export type StaffLeaveReason = 'fired' | 'quit' | 'dead';

export interface CareerEntry {
  time: number;
  text: string;
}

/** Bilanz eines Mitarbeiters. */
export interface StaffRecord {
  sales: number;
  revenue: number;
  arrests: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  stats: StaffStats;
  level: number;
  /** Gesamt-Erfahrung (steigt nur). */
  xp: number;
  /** Lohn pro Spieltag in Euro (Schwarzgeld). */
  wage: number;
  hiredAt: number;
  assignment: StaffAssignment | null;
  /** Beschäftigt bis (Spielminute). */
  busyUntil: number;
  /** Porträt-Bild (URL), vorerst null = Platzhalter. */
  portrait: string | null;
  age: number;
  /** Kurzer Hintergrund für die Akte. */
  background: string;
  origin: StaffOrigin;
  /** Werte, die der Spieler schon kennt. Der Rest zeigt sich mit der Zeit. */
  knownStats: StatKey[];
  /** Anspruch: Faktor auf den üblichen Lohn (1 = normal, Leutnants höher). */
  demand: number;
  /** Haft bzw. Verletzung dauert bis (Spielminute), sonst null. */
  statusUntil: number | null;
  /** Einsatz, zu dem die Person nach Haft oder Verletzung zurückkehrt. */
  returnTo: StaffAssignment | null;
  /** Laufbahn, älteste zuerst. */
  career: CareerEntry[];
  record: StaffRecord;
  /** Letzter Verrat (Spielminute). */
  lastIncidentAt: number | null;
  /** Tage in Folge ohne Lohn (fehlt = 0; zwei Tage, dann kündigt die Person). */
  unpaidDays?: number;
  /** Nur bei ehemaligen Mitarbeitern gesetzt. */
  leftAt: number | null;
  leftReason: StaffLeaveReason | null;
}

export interface StaffState {
  /** Aktuelle Mitarbeiter (aktiv, verletzt, in Haft). */
  members: StaffMember[];
  /** Ehemalige (gekündigt, entlassen, tot), neueste zuerst. */
  former: StaffMember[];
  /** Abgetauchte Veedel (nach einer Warnung vor einer Razzia): bis wann und wer danach wohin zurückgeht. */
  hiding: Record<string, StaffHiding>;
}

export interface StaffHiding {
  until: number;
  returns: { staffId: string; assignment: StaffAssignment }[];
}

/** Boni von Spezialisten, die andere Module abfragen. Alle Werte sind Anteile von 0 bis 1. */
export type StaffBonus =
  /** Anwalt: Kaution wird um diesen Anteil billiger. */
  | 'bailDiscount'
  /** Anwalt: Haft wird um diesen Anteil kürzer. */
  | 'jailReduction'
  /** Buchhalter: Geldwäsche-Gebühr sinkt um diesen Anteil (0,25 = ein Viertel weniger Gebühr). */
  | 'launderingFeeDiscount'
  /** Polizei-Kontakt: Wahrscheinlichkeit, vor einer Razzia gewarnt zu werden. */
  | 'raidWarning';

export interface StaffFilter {
  role?: StaffRole;
  /** 'quit' und 'dead' suchen unter den Ehemaligen. Ohne Status nur aktuelle Mitarbeiter. */
  status?: StaffStatus;
  spotId?: string;
  /** Wer im Veedel eingesetzt ist: an einem Spot, im Lager dort oder als Leutnant. */
  veedelId?: string;
}

/** Arten von Verrat. */
export type BetrayalKind = 'goods' | 'money' | 'quit' | 'talk';

/** Ein neuer Mensch, bevor er eingestellt wird (z.B. ein Bewerber). */
export interface RecruitProfile {
  name: string;
  role: StaffRole;
  age: number;
  background: string;
  stats: StaffStats;
  level: number;
  /** Verlangter Tageslohn. */
  wage: number;
  portrait: string | null;
}
