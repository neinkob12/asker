// Einstellbare Werte der Polizei. Zeiten in Spielminuten, Wahrscheinlichkeiten pro Spielstunde.
// Die Polizeipräsenz des Veedels (veedel.policePresence, 1 = Durchschnitt) wirkt auf Heat-Anstieg und Zufallsereignisse.

/** Heat liegt zwischen 0 und MAX_HEAT. */
export const MAX_HEAT = 100;

/**
 * Stufen: ab diesen Werten wird es "wachsam" (Kontrollen), "heiß" (Razzien) und "Brennpunkt" (überall Zivis). Die
 * Großrazzia hängt nicht am Heat, sondern an der Größe deines Geschäfts (OPERATION_TIERS).
 */
export const HEAT_LEVELS = [
  { min: 0, id: 'calm', label: 'ruhig' },
  { min: 30, id: 'watchful', label: 'wachsam' },
  { min: 60, id: 'hot', label: 'heiß' },
  { min: 85, id: 'manhunt', label: 'Brennpunkt' },
] as const;

// --- Größe des Geschäfts -----------------------------------------------------------------------------------------

/**
 * So sieht dich die Polizei. Die Stufe richtet sich nach der Größe deines Geschäfts (kontrollierte Veedel, Spots,
 * Leute im Einsatz, Leutnants, Lager, Liegeplatz, Umsatz pro Tag im Schnitt über 7 Tage) und hat eine Hysterese:
 * Hoch geht es bei den "up"-Werten, zurück erst, wenn alles unter den "down"-Werten liegt.
 */
export const OPERATION_TIERS = [
  {
    id: 'small',
    name: 'Kleindealer',
    hint: 'Nur Kontrollen und höchstens eine Razzia an einem Spot. Lager werden nicht durchsucht.',
  },
  {
    id: 'dealer',
    name: 'Händler',
    hint: 'Razzien im ganzen Veedel, Lager dort werden durchsucht. Beschlagnahmt wird ein Anteil, was da ist.',
  },
  {
    id: 'kingpin',
    name: 'Großhändler',
    hint: 'Die Kripo ermittelt: Großrazzien in mehreren Veedeln und Lagern zugleich, mit einem Tag Vorlauf.',
  },
] as const;

/** Händler wird, wer eines davon erreicht (zurück zum Kleindealer erst unter allen DEALER_DOWN-Werten). */
export const DEALER_UP = { veedel: 1, spots: 4, people: 5, lieutenants: 1, warehouses: 2, revenue: 6000 } as const;
export const DEALER_DOWN = { veedel: 0, spots: 3, people: 4, lieutenants: 0, warehouses: 1, revenue: 4500 } as const;
/**
 * Großhändler: ab KINGPIN_UP_VEEDEL kontrollierten Veedeln (mit mindestens KINGPIN_MIN_PEOPLE Leuten im Einsatz, wer
 * mit zwei Läufern viel selbst verkauft, ist noch kein Großhändler) oder sehr vielen Spots plus Liegeplatz und mehreren
 * Lagern. Zurück erst unter KINGPIN_DOWN_VEEDEL Veedeln und unter KINGPIN_DOWN_SPOTS Spots.
 */
export const KINGPIN_UP_VEEDEL = 6;
export const KINGPIN_MIN_PEOPLE = 6;
export const KINGPIN_UP_SPOTS = 8;
export const KINGPIN_UP_WAREHOUSES = 2;
export const KINGPIN_DOWN_VEEDEL = 5;
export const KINGPIN_DOWN_SPOTS = 6;

// --- Heat -----------------------------------------------------------------------------------------------------

/** Heat pro Verkauf im Veedel … */
export const SALE_HEAT_BASE = 0.6;
/** … plus so viel pro verkaufter Einheit. */
export const SALE_HEAT_PER_UNIT = 0.15;
/** Gewalt (Konfrontation im Veedel, reportViolence). */
export const VIOLENCE_HEAT = 15;
/** Nach einer gelungenen Polizeiflucht wird nach den Leuten gesucht. */
export const CHASE_ESCAPED_HEAT = 6;
/** So viel Heat bekommt jedes Veedel einer verpfiffenen Gang. */
export const SNITCH_HEAT = 20;
/** Heat sinkt pro Stunde um so viel … */
export const HEAT_DECAY_PER_HOUR = 0.4;
/**
 * … plus diesen Anteil der aktuellen Heat. Dadurch pendelt sich die Heat bei gleichbleibendem Geschäft ein
 * (Zufluss = Abbau), statt bis 100 durchzulaufen: je mehr Verkäufe im Veedel, desto höher das Gleichgewicht.
 */
export const HEAT_DECAY_SHARE_PER_HOUR = 0.04;

// --- Kontrollen -----------------------------------------------------------------------------------------------

/** Ab diesem Heat gibt es Kontrollen. */
export const CHECK_THRESHOLD = 30;
/** Wahrscheinlichkeit pro Stunde bei Heat 100 und Präsenz 1 (darunter anteilig ab der Schwelle). */
export const CHECK_CHANCE_PER_HOUR = 0.08;
/** Nach einer Kontrolle ist im Veedel so lange Ruhe. */
export const CHECK_COOLDOWN = 12 * 60;
/** Die Polizei ist erst mal zufrieden: Heat sinkt um so viel. */
export const CHECK_HEAT_RELIEF = 6;
/** Beschlagnahmte Ware bei einer Kontrolle (Einheiten). */
export const CHECK_GOODS = { min: 2, max: 8 } as const;
/** Beschlagnahmtes Schwarzgeld bei einer Kontrolle (Euro). */
export const CHECK_MONEY = { min: 30, max: 150 } as const;
/** Festnahme bei einer Kontrolle ohne Flucht (bei Vorsicht 50). */
export const CHECK_ARREST_CHANCE = 0.2;
/** So oft versucht der Kontrollierte zu fliehen (Konfrontation "Polizeiflucht"). */
export const CHASE_CHANCE = 0.3;
/** Scheitert die Flucht, ist mehr weg. */
export const FAILED_CHASE_FACTOR = 1.5;

// --- Razzien --------------------------------------------------------------------------------------------------

/** Ab diesem Heat gibt es Razzien. */
export const RAID_THRESHOLD = 60;
/** Wahrscheinlichkeit pro Stunde bei Heat 100 und Präsenz 1 (darunter anteilig ab der Schwelle). */
export const RAID_CHANCE_PER_HOUR = 0.06;
/** Eine Razzia gegen den Spieler wird so lange vorher geplant (Zeit für die Warnung des Polizei-Kontakts). */
export const RAID_LEAD_TIME = 3 * 60;
/** Nach einer Razzia ist im Veedel so lange Ruhe. */
export const RAID_COOLDOWN = 24 * 60;
export const RAID_HEAT_RELIEF = 25;
/** Razzien je Stufe so viel seltener bzw. häufiger (Kleindealer, Händler, Großhändler). */
export const RAID_CHANCE_BY_TIER = [0.4, 1, 1.5] as const;
/**
 * Heat pro Verkauf je Stufe (Kleindealer, Händler, Großhändler): Wer klein anfängt, fällt kaum auf. Köln ist der
 * Einstieg: Bis etwa Tag 16 soll die Heat bei 1–2 Flammen bleiben, auch als Großhändler pendelt sie sich bei 2–4 ein.
 */
export const SALE_HEAT_BY_TIER = [0.4, 0.5, 0.6] as const;
/**
 * Beute anteilig statt fester Mengen. goodsShare: Anteil der Ware am Ort (aus dem Lager, das dem Spot bzw. Veedel am
 * nächsten liegt, höchstens goodsMax), warehouseShare: Anteil des Bestands in eigenen Lagern im Veedel (0 = keine
 * Durchsuchung), moneyShare: Anteil vom Schwarzgeld (höchstens moneyMax), arrest: Festnahme pro Person (Vorsicht 50).
 */
export const RAID_SCOPES = {
  spot: { goodsShare: 0.08, goodsMax: 15, warehouseShare: 0, moneyShare: 0.03, moneyMax: 250, arrest: 0.5 },
  veedel: { goodsShare: 0.08, goodsMax: 25, warehouseShare: 0.25, moneyShare: 0.08, moneyMax: 800, arrest: 0.55 },
  major: { goodsShare: 0.15, goodsMax: 150, warehouseShare: 0.5, moneyShare: 0.2, moneyMax: 15000, arrest: 0.75 },
} as const;
/** Kompatibilität: Anteil des Lagerbestands bei einer Razzia im Veedel. */
export const RAID_WAREHOUSE_SHARE = RAID_SCOPES.veedel.warehouseShare;
/** Festnahme pro Mitarbeiter im Veedel bei einer Razzia (bei Vorsicht 50). */
export const RAID_ARREST_CHANCE = RAID_SCOPES.veedel.arrest;

// --- Großrazzia (nur Großhändler) ------------------------------------------------------------------------------

/** Wahrscheinlichkeit pro Stunde, dass die Kripo zuschlägt (bei Heat 100 im Schnitt deiner Veedel, anteilig ab 40). */
export const MAJOR_RAID_CHANCE_PER_HOUR = 0.06;
export const MAJOR_RAID_MIN_HEAT = 30;
/** Vorlauf: Die Großrazzia wird so lange vorher geplant (der Polizei-Kontakt warnt dann einen Tag vorher). */
export const MAJOR_RAID_LEAD_TIME = 24 * 60;
/** Danach ist so lange Ruhe. */
export const MAJOR_RAID_COOLDOWN = 3 * 24 * 60;
/** So viele Veedel trifft sie höchstens (die heißesten mit deinen Leuten, dazu die mit deinen Lagern). */
export const MAJOR_RAID_VEEDEL = 4;
/** Razzia gegen eine Gang: so viel Einfluss verliert sie im Veedel. */
export const GANG_RAID_INFLUENCE_LOSS = 15;

// --- Verpfeifen -----------------------------------------------------------------------------------------------

/** So lange gilt ein Hinweis gegen eine Gang. */
export const TIP_OFF_DURATION = 48 * 60;
/** Wahrscheinlichkeit pro Stunde für eine Razzia gegen die verpfiffene Gang (Präsenz 1, ohne Heat-Bonus). */
export const TIP_OFF_RAID_CHANCE_PER_HOUR = 0.02;
/** So lange hört die Polizei nach einem Hinweis nicht mehr zu. */
export const SNITCH_COOLDOWN = 24 * 60;

// --- Städte (Auftrag 30) ---------------------------------------------------------------------------------------

/** So sieht dich die Polizei in einer Stadt mindestens (Hamburg und München: von Anfang an Händler). */
export const MIN_TIER_BY_CITY: Readonly<Record<string, number>> = { hamburg: 1, muenchen: 1 };
/**
 * Kontrollen in der Stadt so viel öfter (Hamburg: die Polizei ist wacher; Berlin: lockerer; München: am strengsten;
 * Frankfurt: etwas mehr, der Brennpunkt Bahnhofsviertel steckt schon in seiner Polizeipräsenz).
 */
export const CHECK_FACTOR_BY_CITY: Readonly<Record<string, number>> = {
  hamburg: 1.3,
  berlin: 0.75,
  muenchen: 1.5,
  frankfurt: 1.15,
};
/** Nachts (22 bis 4 Uhr) kommen Kontrollen in Veedeln mit Nachtleben so viel öfter (mal nightlife des Veedels). */
export const NIGHT_HOURS = { from: 22, to: 4 } as const;
/** Lokale Nachrichten, wenn sich die Stufe ändert und kein Polizei-Kontakt da ist. */
export const TICKERS: Readonly<Record<string, { id: string; name: string }>> = {
  koeln: { id: 'other:koeln-ticker', name: 'Köln-Ticker' },
  hamburg: { id: 'other:hamburg-ticker', name: 'Hamburg-Ticker' },
  berlin: { id: 'other:berlin-ticker', name: 'Berlin-Ticker' },
  muenchen: { id: 'other:muenchen-ticker', name: 'München-Ticker' },
  frankfurt: { id: 'other:frankfurt-ticker', name: 'Frankfurt-Ticker' },
};

// --- Zoll-Heat pro Hafen (Auftrag 40) ---------------------------------------------------------------------------

/**
 * Zoll-Heat eines Hafens (0–100) wie die Heat eines Veedels: jedes Kilo, das ankommt, treibt ihn hoch, die Zeit kühlt
 * ihn ab (pro Stunde ein fester Teil plus ein Anteil). Ein aufgeflogener Container treibt ihn weiter.
 */
export const CUSTOMS_HEAT_PER_KG = 0.35;
export const CUSTOMS_HEAT_SEIZED = 15;
export const CUSTOMS_DECAY_PER_HOUR = 0.15;
export const CUSTOMS_DECAY_SHARE_PER_HOUR = 0.012;
/** Stufen für die Anzeige (wie HEAT_LEVELS). */
export const CUSTOMS_LEVELS = [
  { min: 0, label: 'ruhig' },
  { min: 25, label: 'aufmerksam' },
  { min: 50, label: 'scharf' },
  { min: 75, label: 'Großkontrolle' },
] as const;

// --- Razzia-Countdown (Auftrag 44, Minispiel 'stash') -----------------------------------------------------------

/**
 * Höchstens so viel einer Razzia lässt sich vorher verstecken (Anteil 0 bis 1): Der Score des Minispiels (geretteter
 * Anteil nach Wert) mindert Beschlagnahme von Ware und Schwarzgeld um (1 − stash), begrenzt auf diesen Wert.
 */
export const STASH_MAX = 0.7;
/** So viele Partien bekommt das Minispiel höchstens (die wertvollsten, je Ware zusammengefasst). */
export const STASH_LOTS_MAX = 6;

// --- Zivi oder Kunde (Auftrag 44, Minispiel 'undercover') -------------------------------------------------------

/** Ab dieser Heat im Veedel schickt die Polizei öfter Zivilfahnder an den Spot, an dem du selbst stehst. */
export const UNDERCOVER_HEAT = 20;
/**
 * Chance pro Stunde bei Heat 100 und Präsenz 1 (ab UNDERCOVER_HEAT linear ansteigend, mal Präsenz). Gewürfelt fest aus
 * Seed, Spot und Stunde (keyedRandom), damit die Würfelfolge der Polizei gleich bleibt.
 */
export const UNDERCOVER_CHANCE_PER_HOUR = 0.25;
/**
 * Grundrauschen: Auch unter UNDERCOVER_HEAT kommen ab und zu Zivis, Chance pro Stunde bei Präsenz 1 (Feedback vom
 * 07.10.2026: Vorher kam das erste Minispiel für jemanden, der selbst am Spot steht, erst nach etwa einer Woche).
 * Darüber gilt der Anstieg nach Heat, nie weniger als das.
 */
export const UNDERCOVER_BASE_CHANCE_PER_HOUR = 0.03;
/** Nach einer Schicht mit Zivis ist so lange Ruhe (Spielminuten). */
export const UNDERCOVER_COOLDOWN = 8 * 60;
/** So viele Leute kommen in der Schicht an den Spot (Zivis mitgezählt). */
export const UNDERCOVER_CUSTOMERS = { min: 6, max: 10 } as const;
/** So viele davon sind Zivis: einer, ab dieser Heat je einer mehr (höchstens drei). */
export const UNDERCOVER_ZIVI_HEAT_STEPS = [20, 45, 70] as const;
/** Alle Zivis erkannt: So viel Heat weniger im Veedel (sie ziehen ab und melden: nichts los). */
export const UNDERCOVER_RELIEF = 12;
/** Ruf pro echtem Kunden, den du abgewimmelt hast (wie Kunden warten lassen, etwas weniger). */
export const UNDERCOVER_REP_TURNED_AWAY = -0.3;
/** Verkauf an einen Zivi: Score halbiert (das ist immer „nicht geschafft“, auch wenn sonst alles stimmte). */
export const UNDERCOVER_SOLD_PENALTY = 0.5;
/** Ware am Spot, die die Kunden verlangen können (die meisten im nächsten Lager). */
export const UNDERCOVER_GOODS_MAX = 4;
