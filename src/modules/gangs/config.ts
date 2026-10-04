// Einstellbare Werte der Gangs. Zeiten in Spielminuten, Geld in Euro, Ware in Einheiten.
// Die Gang-KI tickt stündlich, "pro Stunde" heißt also pro Tick.

const HOUR = 60;
const DAY = 24 * HOUR;

// --- Wirtschaft der Gangs -------------------------------------------------------------------

/** So viel Ware verkauft eine Gang pro Stunde in jedem Veedel, das sie kontrolliert. */
export const SALES_PER_VEEDEL_HOUR = 5;
/** Verkäufe des Spielers in ihrem Revier drücken ihren Umsatz, höchstens auf diesen Anteil. */
export const MIN_SALES_SHARE = 0.4;
/** Ab so vielen Verkäufen des Spielers (gleitend) ist ihr Umsatz maximal gedrückt. */
export const SALES_SATURATION = 400;
/** Lohn pro Gang-Mitglied und Tag. */
export const WAGE_PER_PERSON_DAY = 50;
/** Nachkaufen, wenn die Ware für weniger als so viele Stunden reicht, dann für RESTOCK_HOURS. */
export const RESTOCK_BELOW_HOURS = 12;
export const RESTOCK_HOURS = 48;
/** Anwerben um Mitternacht: Kosten pro Person, höchstens so viele pro Tag. */
export const RECRUIT_COST = 1500;
export const RECRUITS_PER_DAY = 2;
/** Höchstzahl Leute: Grundstock plus pro kontrolliertem Veedel. */
export const BASE_PEOPLE = 10;
export const PEOPLE_PER_VEEDEL = 2;

// --- Reviere ---------------------------------------------------------------------------------

/**
 * Verteidigung zusätzlich zur Regeneration in territory: Hat ein Rivale (du oder eine andere Gang) mindestens
 * DEFEND_THREAT Einfluss im Veedel, steckt die Gang Geld hinein, bis sie wieder DEFEND_TARGET hat.
 */
export const DEFEND_THREAT = 20;
export const DEFEND_TARGET = 60;
/** So viel Einfluss pro Stunde, und was ein Punkt kostet. */
export const DEFEND_RATE = 0.5;
export const DEFEND_COST = 40;
/** Chance pro Stunde (mal Expansionsdrang), einen Vorstoß zu beginnen. */
export const EXPAND_CHANCE = 0.01;
/** Mindestens so viele Leute und so viel Geld braucht ein Vorstoß; das Geld kostet er. */
export const PUSH_MIN_PEOPLE = 8;
export const PUSH_COST = 1500;
/** Eine Gang ohne Revier holt sich ihr Heimat-Veedel schon mit so wenigen Leuten zurück, öfter und verbissener. */
export const HOME_PUSH_MIN_PEOPLE = 3;
export const HOME_PUSH_CHANCE_FACTOR = 4;
export const HOME_PUSH_STRENGTH = 1.5;
/** Ab so vielen Veedeln wird eine Gang satt: Die Expansionschance sinkt im Verhältnis. */
export const SATURATION_VEEDEL = 3;
/** Heimat-Veedel und seine Nachbarn sind als Ziel attraktiver (alte Ansprüche). */
export const HOME_CLAIM_BONUS = 25;
/** Höchstdauer eines Vorstoßes. */
export const PUSH_DURATION = 30 * HOUR;
/** Einfluss pro gewonnener bzw. verlorener Stunde im Vorstoß. */
export const PUSH_GAIN = 4;
export const PUSH_DEFENDER_LOSS = 2;
export const PUSH_DEFENDER_GAIN = 1;
/** Verteidiger ziehen diesen Anteil ihrer Leute im umkämpften Veedel zusammen, plus ein fester Stamm vor Ort. */
export const DEFENDER_COMMIT = 0.5;
export const DEFENDER_BASE = 2;
/** Beim letzten Veedel kämpft eine Gang um ihr Leben. */
export const LAST_STAND_BONUS = 1.5;
/** Ihr Heimat-Veedel verteidigt eine Gang wie eine Festung, und andere greifen es nur ungern an. */
export const HOME_DEFENSE_BONUS = 2;
export const HOME_TARGET_PENALTY = 30;
/**
 * Drängt eine Gang in dein Revier, verteidigst du mit einem Grundstock (du, deine Kontakte) plus der Kampfkraft
 * deiner Leute dort (defenseStrength aus staff: Sicherheit voll, andere zu einem Drittel), auf eigenem Pflaster mal
 * PLAYER_DEFENSE_FACTOR. Vier Sicherheitsleute halten etwa so gut wie eine Gang ihr Veedel.
 */
export const PLAYER_DEFENSE_BASE = 60;
export const PLAYER_DEFENSE_FACTOR = 1.5;
/**
 * Je mehr Veedel du hältst, desto mehr schießen sich die Gangs auf dich ein: Expansionschance mal
 * (1 + Faktor × deine Veedel), und deine Veedel werden als Ziel attraktiver (pro Veedel).
 */
export const PLAYER_THREAT_EXPANSION = 0.35;
export const PLAYER_THREAT_TARGET_BONUS = 6;
/** Ziele, deren Gang stärker ist, werden so viel unattraktiver. */
export const STRONGER_TARGET_PENALTY = 40;
/** Chance, dass die unterlegene Seite in einer Vorstoß-Stunde einen Mann verliert. */
export const PUSH_CASUALTY_CHANCE = 0.1;

// --- Preise ------------------------------------------------------------------------------------

/** Zusätzlicher Preisdruck, wenn eine Gang dir feindlich gesinnt ist (Preiskrieg). */
export const PRICE_WAR_EXTRA = 0.1;
export const PRICE_WAR_HOSTILITY = 50;

// --- Verhältnis zum Spieler ---------------------------------------------------------------------

/** Verkäufe in ihrem Revier (gleitende Summe) bis hierhin: du bist ein kleiner Fisch, sie ignorieren dich. */
export const SMALL_FISH_UNITS = 60;
/** Feindseligkeit pro Einheit über der Schwelle und Stunde (mal Aggression). */
export const HOSTILITY_PER_UNIT = 0.01;
/** Die gleitende Summe verfällt pro Stunde auf diesen Anteil (ca. ein Tag Halbwertszeit). */
export const TURF_SALES_DECAY = 0.97;
/** Ohne Anlass kühlt die Feindseligkeit pro Stunde so viel ab. */
export const HOSTILITY_DECAY = 0.4;
/** Eskalationsstufen der Feindseligkeit: Warnung, Drohung, Überfälle. */
export const WARN_AT = 25;
export const THREAT_AT = 50;
export const ATTACK_AT = 70;
/** So weit muss die Feindseligkeit unter eine Stufe fallen, bevor sie wieder auslösen kann. */
export const STAGE_HYSTERESIS = 10;
/** Dieselbe Stufe wird höchstens so oft per Nachricht angekündigt. */
export const ANNOUNCE_INTERVAL = 2 * DAY;
/** Chance pro Stunde auf einen Überfall bei voller Feindseligkeit (mal Aggression). */
export const ATTACK_CHANCE = 0.02;
/** Mindestabstand zwischen zwei Überfällen derselben Gang. */
export const ATTACK_COOLDOWN = 4 * DAY;
/** Nach einem gelungenen Überfall ist die Gang erst mal zufrieden: so viel weniger Feindseligkeit. */
export const HOSTILITY_AFTER_LESSON = 30;
/** Chance, ein Lager statt eines Spots zu überfallen. */
export const WAREHOUSE_RAID_CHANCE = 0.3;
/** Feindseligkeit, wenn du ihr ein Veedel abnimmst. */
export const HOSTILITY_ON_TAKEOVER = 20;

// --- Diplomatie -------------------------------------------------------------------------------

/** Waffenstillstand: Grundpreis plus pro Punkt Feindseligkeit, Dauer, Wirkung. */
export const CEASEFIRE_BASE_COST = 300;
export const CEASEFIRE_COST_PER_HOSTILITY = 20;
export const CEASEFIRE_DURATION = 3 * DAY;
export const CEASEFIRE_HOSTILITY_DROP = 30;
/** Nach einem eigenen Angriff reden sie so lange nicht über Frieden. */
export const CEASEFIRE_COOLDOWN_AFTER_ATTACK = DAY;
/** Unter dieser Beziehung reden sie gar nicht mehr. */
export const MIN_RELATION_TO_TALK = -60;

/** Schutzgeld zahlen: Grundbetrag plus pro Punkt Feindseligkeit, für eine Woche. */
export const TRIBUTE_BASE = 250;
export const TRIBUTE_PER_HOSTILITY = 10;
export const TRIBUTE_DURATION = 7 * DAY;
/** Schutzgeld steigt pro Veedel, das du kontrollierst (wer mehr hat, zahlt mehr). */
export const TRIBUTE_PER_PLAYER_VEEDEL = 250;
export const TRIBUTE_HOSTILITY_DROP = 50;
/** Wie stark Verkäufe in ihrem Revier noch stören, solange du zahlst bzw. Frieden ist. */
export const TRIBUTE_HOSTILITY_FACTOR = 0.2;
export const CEASEFIRE_HOSTILITY_FACTOR = 0.5;
export const ALLIANCE_HOSTILITY_FACTOR = 0.3;

/** Schutzgeld kassieren: Du musst mindestens so stark sein wie die Gang (Faktor), zahlt wöchentlich einen Anteil ihrer Kasse. */
export const PROTECTION_POWER_RATIO = 1;
export const PROTECTION_SHARE = 0.15;
export const PROTECTION_MIN = 300;
export const PROTECTION_INTERVAL = 7 * DAY;
/** Beim Fälligkeitstag zahlen sie nur, wenn du noch mindestens so stark bist (Faktor). */
export const PROTECTION_KEEP_RATIO = 0.8;

/** Bündnis gegen eine andere Gang: Preis, Dauer, Mindest-Beziehung, höchstens so feindselig. */
export const ALLIANCE_COST = 2000;
export const ALLIANCE_DURATION = 5 * DAY;
export const ALLIANCE_MIN_RELATION = 0;
export const ALLIANCE_MAX_HOSTILITY = 40;
/** So viel wahrscheinlicher greift der Verbündete den gemeinsamen Feind an. */
export const ALLIANCE_PUSH_FACTOR = 3;

// --- Gewalt gegen Gangs -----------------------------------------------------------------------

/** In einem Veedel braucht eine Gang so viel Einfluss, damit dort ein Spot von ihr steht. */
export const GANG_SPOT_MIN_INFLUENCE = 20;
/** Beute bei einem Überfall auf einen Gang-Spot (Anteil der Gang-Vorräte, begrenzt). */
export const RAID_LOOT_MONEY_SHARE = 0.04;
export const RAID_LOOT_MONEY_MAX = 3000;
export const RAID_LOOT_GOODS_SHARE = 0.05;
export const RAID_LOOT_GOODS_MAX = 80;
/** Feindseligkeit und Beziehung nach deinem Angriff. */
export const HOSTILITY_ON_PLAYER_ATTACK = 25;
export const RELATION_ON_PLAYER_ATTACK = -25;
/** Wird ein Abkommen gebrochen, sinkt die Beziehung zusätzlich. */
export const RELATION_ON_BETRAYAL = -30;

// --- Polizei ----------------------------------------------------------------------------------

/**
 * Razzia der Polizei bei einer Gang (police.raid, z.B. nach deinem Tipp): Anteil der Ware und Kasse, der
 * beschlagnahmt wird, und Festnahmen. Gut vernetzte Gangs verlieren weniger (mal 1 - Vernetzung × 0,6).
 * Den Einfluss nimmt ihr die Polizei selbst.
 */
export const RAID_GOODS_SHARE = 0.25;
export const RAID_MONEY_SHARE = 0.05;
export const RAID_ARRESTS: readonly [number, number] = [1, 3];
/** Chance, dass sie herausfinden, wer gepetzt hat: Grundwert plus Vernetzung / 2. */
export const TIPOFF_DISCOVERY_BASE = 0.2;
export const HOSTILITY_ON_SNITCH = 30;
export const RELATION_ON_SNITCH = -30;

// --- Angebote ---------------------------------------------------------------------------------

/** Chance pro Stunde (mal dealing), dass eine Gang dir Ware anbietet. */
export const OFFER_CHANCE = 0.012;
export const OFFER_AMOUNTS: readonly number[] = [50, 100, 200];
/** Aufschlag auf ihren Einkaufspreis. */
export const OFFER_MARKUP = 1.35;
export const OFFER_DURATION = 4 * HOUR;
/** Chance, dass ein Deal kippt: Grundwert plus Feindseligkeit/200, minus Beziehung/400. */
export const DEAL_BETRAYAL_BASE = 0.12;
/** Beziehung nach einem sauberen Deal. */
export const RELATION_ON_DEAL = 5;
/** So viel besser wird die Beziehung mit einem Waffenstillstand (beides mal relationFactor der Stadt, Auftrag 30). */
export const CEASEFIRE_RELATION = 5;

// --- Nachrichten ------------------------------------------------------------------------------

/** Antwortfrist für Drohungen und Forderungen. */
export const MESSAGE_EXPIRY = 6 * HOUR;

// --- Stärke -----------------------------------------------------------------------------------

/** Stärke = Leute × PEOPLE_POWER + Geld / MONEY_PER_POWER + Ware / GOODS_PER_POWER. */
export const PEOPLE_POWER = 10;
export const MONEY_PER_POWER = 1000;
export const GOODS_PER_POWER = 100;
/** Stärke des Spielers pro kontrolliertem Veedel. */
export const VEEDEL_POWER = 15;

// --- Methoden und neue Aktionen (Auftrag 23) ----------------------------------------------------
// Wie eine Gang Druck macht, steht pro Gang als Gewichte in data.ts (traits.methods). Ab Stufe 3 wählt die KI bei
// einem Angriff nach diesen Gewichten (Überfall ist eine der Methoden), ab Stufe 2 kommen leichtere Methoden dazu.

/** Chance pro Stunde (mal Aggression), dass eine drohende Gang (Stufe 2) eine leichtere Methode nutzt. */
export const METHOD_CHANCE = 0.004;
/** Abstand zwischen zwei Aktionen derselben Gang (Stufe 2) und zwischen zwei Aktionen irgendeiner Gang. */
export const METHOD_COOLDOWN = 3 * DAY;
export const METHOD_GLOBAL_GAP = DAY;
/** Gewicht des Überfalls ab Stufe 3 mal diesem Faktor: Er bleibt die Hauptsache, die anderen Methoden kommen dazu. */
export const RAID_WEIGHT_FACTOR = 2;
/**
 * Wie oft und wie stark die neuen Methoden pro Stadt zum Zug kommen (Faktor auf METHOD_CHANCE und auf die Gewichte
 * außer Überfall). Hamburgs Gangs sind ohnehin stärker und härter, dort kommen die Methoden seltener dazu.
 */
export const METHOD_FACTOR_BY_CITY: Readonly<Record<string, number>> = { koeln: 1, hamburg: 0.4 };
/** Nach einer Methode sinkt die Feindseligkeit der Gang um so viel (nach einem gelungenen Überfall: HOSTILITY_AFTER_LESSON). */
export const METHOD_HOSTILITY_RELIEF = 20;
/** Antwortfrist für Nachrichten zu Einbruch, Abwerben, Einschüchtern, Erpressung. */
export const INCIDENT_EXPIRY = 8 * HOUR;

/** Einbruch: nur nachts (Stunden), Anteil des Lagerbestands, höchstens so viel. */
export const BURGLARY_HOURS: readonly [number, number] = [1, 5];
export const BURGLARY_SHARE = 0.25;
export const BURGLARY_MAX = 250;
/** Jede Wache am Lager verscheucht Einbrecher mit dieser Chance (sonst halbiert sie den Verlust). */
export const BURGLARY_GUARD_STOP = 0.6;
/** Bemerkt wird der Einbruch um diese Uhrzeit. */
export const BURGLARY_REPORT_HOUR = 7;
/** Wohin die Spur führt: Gang, Junkies (keine Gang), eigener Mann. */
export const BURGLARY_TRAIL = { gang: 0.6, junkies: 0.25, insider: 0.15 } as const;
/** Täter suchen: so viel holt ein Erfolg zurück. */
export const RECOVER_SHARE = 0.7;

/** Abwerben: nur Leute unter dieser Loyalität; Angebot als Anteil vom Lohn (mindestens POACH_MIN_EXTRA). */
export const POACH_MAX_LOYALTY = 45;
export const POACH_EXTRA_SHARE = 0.35;
export const POACH_MIN_EXTRA = 20;
/** Drohen: Chance zu bleiben = Grundwert + Loyalität/100; sonst geht er und plaudert (Heat). */
export const POACH_THREAT_STAY = 0.35;
export const POACH_THREAT_LOYALTY = -10;
export const POACH_TALK_HEAT = 8;
export const POACH_RAISE_LOYALTY = 10;

/** Einschüchtern: so viele Kunden kommen noch (Faktor), so lange. */
export const INTIMIDATION_FACTOR = 0.6;
export const INTIMIDATION_DURATION = 8 * HOUR;
/** Sicherheit hinschicken: Chance, dass sie ohne Kampf abziehen (sonst Konfrontation). */
export const INTIMIDATION_LEAVE_CHANCE = 0.5;

/** Tipp an die Polizei: Heat im Veedel, Chance auf eine geplante Razzia. */
export const TIPOFF_HEAT = 10;
export const TIPOFF_RAID_CHANCE = 0.15;

/** Erpressung: Grundbetrag plus Anteil am Warenwert des Lagers (Einkauf), gerundet; bei Weigerung Heat und Razzia. */
export const BLACKMAIL_BASE = 400;
export const BLACKMAIL_STOCK_SHARE = 0.15;
export const BLACKMAIL_MAX = 3000;
export const BLACKMAIL_HEAT = 18;
/** Abgelehnte Erpressung: Chance, dass die Polizei daraufhin eine Razzia plant (Heat gibt es immer). */
export const BLACKMAIL_RAID_CHANCE = 0.5;

// Chancen von Gangs (Ton „gemischt“): einmal am Tag gewürfelt, nur bei guter Beziehung.
/** Chance pro Tag und Gang auf eine Chance (Warnung, Gefallen), wenn die Beziehung reicht. */
export const GOOD_TURN_CHANCE = 0.12;
export const GOOD_TURN_MIN_RELATION = 5;
/** Warnung vor einem Rivalen: Vorbereiten kostet so viel und hält den Rivalen so lange ab. */
export const WARN_PREPARE_COST = 250;
/** Gefallen (Ware zwischenlagern): Lohn [von, bis], Beziehung, Heat im Lager-Veedel. */
export const FAVOR_PAY: readonly [number, number] = [300, 900];
export const FAVOR_RELATION = 10;
export const FAVOR_HEAT = 6;
/** Überläufer: Chance pro Tag bei einer feindlichen Gang (Stufe 2+), Preis für seine Infos. */
export const DEFECTOR_CHANCE = 0.08;
export const DEFECTOR_PRICE: readonly [number, number] = [200, 450];
/** So viele Aktionen gegen dich merkt sich jede Gang für die Anzeige. */
export const ACTION_LOG_LIMIT = 6;
