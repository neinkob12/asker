// Städte (Auftrag 30 und 36). Köln ist der Einstieg; wer eine Stadt komplett übernimmt, bekommt Anrufe aus den
// noch freien Städten (NEXT_CITY, Reihenfolge frei): Die nächstgelegene ruft OFFER_CALL_DELAY Spielminuten später an,
// die übrigen melden sich danach der Reihe nach per Chat (OFFER_NEXT_DELAY), und ein Tipp auf ihre Glas-Karte in der
// Deutschland-Ansicht ('city.requestCall') holt den Anruf sofort. Jede Stadt hat einen Kontakt mit Gesicht und Stimme
// und einen Satz Dreh (CITIES in data.ts, Gespräch in CITY_OFFERS). Hamburg ist Fiete Lührs aus dem Hafen. Um eine
// Stadt zu verlassen, braucht es eine Rechte Hand mit voller Macht (hierarchy.fullPowerMissing).
//
// Ablauf eines Angebots (offers[stadt].status), eine Runde pro kompletter Stadt (offerFrom):
//   none → scheduled (die nächstgelegene) bzw. queued (die anderen) → pitched (Chat mit "Ruf mich an") → calling
//   (Anruf, siehe messages.call) → Antwort über 'city.answerOffer' (mit Stadt):
//     come:  Rechte Hand bereit → accepted (Ereignis city.offerAccepted). Der Kontakt fragt noch im selben Gespräch, ob
//            du die Stadt jetzt übergibst: "<Stadt> an <Name> übergeben und losfahren" ('city.handOver': Vollmacht,
//            Ziel frei, du fährst los, das Gespräch endet) oder "Ich regel vorher noch was" (dann über die Karte unter
//            Geld und Heat bzw. die Seite der Rechten Hand). Sagst du einer anderen Stadt zu, gilt nur die neue Zusage.
//            Sonst → house: Er schreibt, was fehlt, und ruft von selbst wieder an, sobald es passt.
//     later: Er meldet sich alle OFFER_REMINDER_DAYS Spieltage per Chat (mit denselben Antworten).
//     stay:  Er schreibt einmal, dass das Angebot steht (zusagen geht über seinen Chat).
// Schablonen (template in CITIES) rufen nie an und stehen in der Deutschland-Ansicht als „bald“.
//
// Städte als Grundlage (Auftrag 30, Etappe 4): Nur eine Stadt ist live (die aktive, die Karte und Handy zeigen); die
// anderen freigeschalteten Städte schlafen. Module ticken nur für die aktive Stadt (isCityLive, isVeedelLive,
// liveVeedel). Für jede schlafende Stadt bucht city um Mitternacht eine Tageszusammenfassung: Schnitt der letzten
// SLEEP_AVERAGE_DAYS ganz live gespielten Tage dieser Stadt aus der Kasse mal 0,85 bis 1,15 ('income.city' bzw.
// 'expense.city'), die Heat fällt auf den Ruhewert (police.restHeat). Die Löhne sind im Ergebnis drin, weil ein live
// gespielter Tag erst fünf Minuten nach Mitternacht in den Schnitt kommt (dann sind die Löhne dieses Tages gebucht).
// Teiltage (Umschalten mitten am Tag) zählen weder für den Schnitt noch bekommen sie eine Zusammenfassung. Den Anteil
// der Rechten Hand nimmt hierarchy danach aus dem Buch der Stadt. Beim Aufwachen wird nichts nachgerechnet.
//
// Öffentliche API: offerStatus(state, cityId?), offerFrom(state), offerCities(state), freeCities(state),
//   cityOffer(state, cityId), nextCityMissing(state), hamburgMissing(state), HARBOR_CALLER, CITIES, CITY_OFFERS,
//   NEXT_CITY, DEUTSCHLAND_VIEW, getCity(id), cityName(id), cityContact(id), activeCity(state), presentCity(state),
//   citiesUnlocked(state), isCityUnlocked(state, id), isCityLive(state, id), cityOf(veedelId), cityOfSpot(state,
//   spotId), isVeedelLive(state, veedelId), liveVeedel(state), sleepInfo(state, cityId), playableCities(),
//   cityAt(lng, lat), isPlayerTraveling(state), isPlayerIn(state, cityId), cityTravel(state),
//   travelMinutesBetween(from, to), relationFactor(cityId), bribeFactor(cityId), raidWarningBonus(cityId)
// Ankommen (Etappe 5): 'city.travel' fährt dich selbst über die Autobahn (Weg und Zeit aus roads.interCityRoute);
// unterwegs bist du in keiner Stadt (isPlayerTraveling, logistics.isPlayerOnTheRoad). Bei der Ankunft wird die
// Zielstadt aktiv und live; beim ersten Mal schreibt ihr Kontakt, wie man anfängt. Selbst am Spot stehen, selbst
// ausfahren, selbst abholen und bei Konfrontationen dabei sein geht nur in der Stadt, in der du bist (isPlayerIn).
//
// Befehle: 'city.answerOffer', 'city.requestCall', 'city.handOver', 'city.switch', 'city.unlock' (intern), 'city.travel'
// Ereignisse: 'city.offerAnswered', 'city.offerAccepted', 'city.switched', 'city.unlocked', 'city.slept',
//   'city.travelStarted', 'city.arrived'

import {
  type CommandMeta,
  type CommandResult,
  type Contact,
  type Ctx,
  clock,
  defineModule,
  distanceMeters,
  formatEuro,
  type GameState,
  journal,
  MINUTES_PER_DAY,
  messages,
  texts,
  wallet,
} from '../../core';
import { isPlayerDelivering, playerSpot } from '../customers';
import { activeEncounters } from '../encounters';
import { bookDay, cityDayProfit, cityReport } from '../finance';
import { freeVehicles, releaseVehicle } from '../fleet';
import {
  FULL_POWER_SHARE,
  fullPowerMissing,
  getRightHand,
  handOffLeader,
  hasFullPower,
  rightHandTitle,
  START_PACK_MAX_STAFF,
  startPackLeaders,
  startPackStaff,
} from '../hierarchy';
import { getRoutes, getTrips } from '../logistics';
import { restHeat } from '../police';
import { autobahnRefs, interCityMinutes } from '../roads';
import { getSpot } from '../spots';
import { getStaffMember, staffContact } from '../staff';
import { campaignProgress } from '../territory';
import { allVeedel, type Veedel, veedelAt, veedelCity } from '../veedel';
import {
  CITY_OFFERS,
  CITY_PLACE,
  type CityOffer,
  GERMANY_MIN_CITIES,
  HANDOVER_START_MONEY_DAYS,
  HARBOR_CALLER,
  NEXT_CITY,
  OFFER_CALL_DELAY,
  OFFER_NEXT_DELAY,
  OFFER_REMINDER_DAYS,
  PLAYER_CITY_SPEED,
  SLEEP_AVERAGE_DAYS,
  SLEEP_FACTOR_MAX,
  SLEEP_FACTOR_MIN,
  SLEEP_RAID_CHANCE,
  SLEEP_RAID_HALF_CHANCE,
  SLEEP_RAID_LOSS_MAX,
  SLEEP_RAID_LOSS_MIN,
  SLEEP_RAID_TEXTS,
  START_MONEY_MIN_BY_CITY,
} from './config';
import { CITIES, type CityDef } from './data';
import { PLAYER_RANKS, type PlayerRank, reachedRank } from './ranks';

export {
  CITY_OFFERS,
  type CityOffer,
  HARBOR_CALLER,
  NEXT_CITY,
  OFFER_LINES,
  type OfferTexts,
  SLEEP_AVERAGE_DAYS,
} from './config';
export { CITIES, type CityDef, DEUTSCHLAND_VIEW } from './data';
export { PLAYER_RANKS, type PlayerRank, type PlayerRankDef } from './ranks';

/**
 * queued: meldet sich später per Chat; pitched: hat sich per Chat gemeldet und wartet auf "Ruf mich an" bzw. einen
 * Tipp auf ihre Karte.
 */
export type OfferStatus =
  | 'none'
  | 'scheduled'
  | 'queued'
  | 'pitched'
  | 'calling'
  | 'house'
  | 'later'
  | 'declined'
  | 'accepted';
export type OfferChoice = 'come' | 'later' | 'stay';

/**
 * Was bei der Übergabe in die nächste Stadt mitkommt (Auftrag 36): eine neue Rechte Hand (hierarchy.startPackLeaders),
 * bis zu START_PACK_MAX_STAFF Leute (hierarchy.startPackStaff) und freie Fahrzeuge der Stadt. Leer = nichts.
 */
export interface StartPack {
  leaderId?: string | null;
  staffIds?: string[];
  vehicleIds?: number[];
}

export interface OfferState {
  status: OfferStatus;
  /** Wann sie (wieder) anruft ('scheduled') bzw. sich per Chat meldet ('queued'). */
  callAt: number | null;
  /** Nächste Erinnerung per Chat ('later'). */
  remindAt: number | null;
}

/** Schlafmodus einer Stadt. */
export interface CitySleep {
  /** Ergebnisse der letzten live gespielten Tage (ältester zuerst, höchstens SLEEP_AVERAGE_DAYS). */
  results: number[];
  /** War den ganzen laufenden Tag live (dann zählt der Tag zu den Ergebnissen statt einer Zusammenfassung). */
  liveToday: boolean;
  /** Schläft seit (Spielminute), null = live. */
  since: number | null;
  /** Letzte Tageszusammenfassung. */
  last: { day: number; amount: number } | null;
}

/** Deine eigene Fahrt zwischen zwei Städten (Etappe 5). */
export interface CityTravel {
  from: string;
  to: string;
  departedAt: number;
  arrivesAt: number;
}

export interface CityState {
  /** Angebote der freien Städte (Auftrag 36), pro Stadt. */
  offers: Record<string, OfferState>;
  /** Die komplette Stadt, für die die Angebote gerade laufen (null = keine Runde offen). */
  offerFrom: string | null;
  /** Städte, nach deren "komplett" schon eine Runde Angebote kam (jede nur einmal). */
  rounds: string[];
  /** Städte, deren Statthalter schon Startgeld mitgegeben hat (jede Stadt nur einmal). */
  startMoneyPaid: string[];
  /** Startpaket unterwegs: Diese Person wird bei ihrer Ankunft Rechte Hand der Stadt (Auftrag 36). */
  startLeader: { staffId: string; cityId: string } | null;
  /**
   * Dein höchster Rang bisher (Auftrag 36, ranks.ts), at = seit wann. quiet: aus einem alten Spielstand, der nächste
   * Schritt übernimmt den Stand ohne Banner.
   */
  rank: PlayerRank & { at: number; quiet?: boolean };
  /** Stadt, die gerade live ist: Karte und Handy zeigen sie, die Module ticken für sie. */
  active: string;
  /** Wo du selbst gerade bist (Etappe 5). */
  present: string;
  /** Freigeschaltete Städte, Köln zuerst. */
  unlocked: string[];
  travel: CityTravel | null;
  /** Schlafmodus pro freigeschalteter Stadt. */
  sleep: Record<string, CitySleep>;
  /** Städte, in denen du schon warst (die erste Ankunft bringt Fietes Begrüßung). */
  visited: string[];
}

/** Zustand in Version 3 (Auftrag 30): ein Angebot, das aus Hamburg. */
/** Zustand in Version 4 (Auftrag 36, vor dem Review): ohne Gedächtnis fürs Startgeld. */
type CityStateV4 = Omit<CityState, 'startMoneyPaid'>;

type CityStateV3 = Omit<CityState, 'offers' | 'offerFrom' | 'rounds' | 'startLeader' | 'rank' | 'startMoneyPaid'> & {
  offer: OfferState;
};

/** Zustand in Version 2 (Etappe 4, ohne besuchte Städte). */
type CityStateV2 = Omit<CityStateV3, 'visited'>;

/** Zustand in Version 1 (Etappe 2, nur das Angebot). */
type CityStateV1 = Pick<CityStateV3, 'offer'>;

declare module '../../core' {
  interface ModuleStates {
    city: CityState;
  }
  interface GameCommands {
    /**
     * Antwort auf das Angebot einer Stadt (aus dem Anruf oder ihrem Chat). Chefsache. Ohne Stadt: Hamburg (alte
     * Antworten in Spielständen von Auftrag 30).
     */
    'city.answerOffer': { choice: OfferChoice; cityId?: string };
    /** Eine freie Stadt soll jetzt anrufen (Tipp auf ihre Karte in der Deutschland-Ansicht, "Ruf mich an" im Chat). */
    'city.requestCall': { cityId: string };
    /**
     * Die Stadt cityId (Standard Köln) an die Rechte Hand übergeben (Vollmacht) und sofort über die Autobahn in die
     * zugesagte Stadt fahren (toCityId, sonst die zugesagte, sonst die nächstgelegene freie). Chefsache.
     */
    'city.handOver': { cityId?: string; toCityId?: string; pack?: StartPack };
    /** Andere Stadt live schalten (Karte und Handy wechseln, die bisherige schläft). Nur freigeschaltete Städte. */
    'city.switch': { cityId: string };
    /** Stadt freischalten. Intern (nach der Übergabe an die Rechte Hand), nicht für den Spieler. */
    'city.unlock': { cityId: string };
    /** Selbst in eine andere Stadt fahren (über die A1). */
    'city.travel': { cityId: string };
  }
  interface GameEvents {
    'city.offerAnswered': { choice: OfferChoice; ready: boolean; cityId: string };
    /** Zusage mit bereiter Rechter Hand: Die Übergabe kann beginnen (cityId = Ziel, from = die komplette Stadt). */
    'city.offerAccepted': { cityId: string; from: string };
    'city.switched': { from: string; to: string };
    'city.unlocked': { cityId: string };
    /** Tageszusammenfassung einer schlafenden Stadt (gebucht als income.city bzw. expense.city). */
    'city.slept': { cityId: string; day: number; amount: number; raid?: boolean };
    /** Du fährst los (unterwegs bist du in keiner Stadt). */
    'city.travelStarted': { from: string; to: string; arrivesAt: number };
    /** Du bist in einer Stadt angekommen; first beim ersten Mal. */
    'city.arrived': { cityId: string; first?: boolean };
    /** Neuer Rang des Spielers (Auftrag 36): Titel im HUD und in der Bestenliste. */
    'player.rankUp': { rankId: string; title: string; score: number };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));

/** Die Stadt, mit der alles beginnt (und zu der alte Spielstände gehören). */
export const FIRST_CITY = 'koeln';

export function getCity(id: string): CityDef | undefined {
  return CITY_BY_ID.get(id);
}

export function cityName(id: string): string {
  return CITY_BY_ID.get(id)?.name ?? id;
}

/**
 * Charakter einer Stadt (Etappe 7): Faktor auf wachsende Beziehungen (Lieferanten-Vertrauen, Gang-Beziehung bei Deals
 * und Waffenstillstand). Köln 1,5 (Klüngel), Hamburg 0,8 (kühl und korrekt).
 */
export function relationFactor(cityId: string): number {
  return CITY_BY_ID.get(cityId)?.relationFactor ?? 1;
}

/** Faktor auf Freikaufen in Konfrontationen und Kaution. Köln 0,75, Hamburg 1,2. */
export function bribeFactor(cityId: string): number {
  return CITY_BY_ID.get(cityId)?.bribeFactor ?? 1;
}

/** Zusatz auf die Warnung des Polizei-Kontakts vor einer Razzia. Köln +0,1. */
export function raidWarningBonus(cityId: string): number {
  return CITY_BY_ID.get(cityId)?.raidWarningBonus ?? 0;
}

/** Städte mit Inhalt (ohne Schablonen). */
export function playableCities(): readonly CityDef[] {
  return CITIES.filter((c) => !c.template);
}

/**
 * Die Stadt, die gerade live ist. Vor dem Anlegen des Moduls (init anderer Module) und in alten Ständen: Köln.
 * Der Zustand kann hier fehlen, obwohl der Typ ihn verspricht (init-Reihenfolge).
 */
export function activeCity(state: GameState): string {
  return (state.modules.city as CityState | undefined)?.active ?? FIRST_CITY;
}

/** Wo du selbst gerade bist. */
export function presentCity(state: GameState): string {
  return (state.modules.city as CityState | undefined)?.present ?? FIRST_CITY;
}

export function citiesUnlocked(state: GameState): readonly string[] {
  return (state.modules.city as CityState | undefined)?.unlocked ?? [FIRST_CITY];
}

export function isCityUnlocked(state: GameState, cityId: string): boolean {
  return citiesUnlocked(state).includes(cityId);
}

/** Läuft die Stadt gerade voll (statt im Schlafmodus)? */
export function isCityLive(state: GameState, cityId: string): boolean {
  return activeCity(state) === cityId;
}

/** Stadt eines Veedels. */
export function cityOf(veedelId: string): string {
  return veedelCity(veedelId);
}

/** Stadt eines Spots (über sein Veedel; unbekannte Spots zählen zu Köln). */
export function cityOfSpot(state: GameState, spotId: string): string {
  const spot = getSpot(state, spotId);
  return spot ? veedelCity(spot.veedelId) : FIRST_CITY;
}

/**
 * Zu welcher Stadt gehört ein Punkt? Erst über das Veedel, dann über den Rahmen der Stadt (Hafen, Autobahn-Einfahrt),
 * sonst die Stadt mit dem nächsten Mittelpunkt.
 */
export function cityAt(lng: number, lat: number): string {
  const veedel = veedelAt(lng, lat);
  if (veedel) return veedel.cityId;
  let best = FIRST_CITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of CITIES) {
    if (c.template) continue;
    const [w, s, e, n] = c.bounds;
    if (lng >= w && lng <= e && lat >= s && lat <= n) return c.id;
    const d = (c.center.lng - lng) ** 2 + (c.center.lat - lat) ** 2;
    if (d < bestDistance) {
      best = c.id;
      bestDistance = d;
    }
  }
  return best;
}

export function isVeedelLive(state: GameState, veedelId: string): boolean {
  return veedelCity(veedelId) === activeCity(state);
}

/** Veedel der Stadt, die gerade live ist. */
export function liveVeedel(state: GameState): readonly Veedel[] {
  return allVeedel(activeCity(state));
}

/** Deine Fahrt zwischen zwei Städten, sonst null. */
export function cityTravel(state: GameState): CityTravel | null {
  return (state.modules.city as CityState | undefined)?.travel ?? null;
}

/** Bist du gerade selbst zwischen zwei Städten unterwegs? */
export function isPlayerTraveling(state: GameState): boolean {
  return cityTravel(state) !== null;
}

/** Bist du selbst in dieser Stadt (und nicht unterwegs)? Nur dort stehst du am Spot, fährst aus, holst ab. */
export function isPlayerIn(state: GameState, cityId: string): boolean {
  return !isPlayerTraveling(state) && presentCity(state) === cityId;
}

/** Fahrzeit mit dem eigenen Auto zwischen zwei Städten (über roads). */
export function travelMinutesBetween(from: string, to: string): number {
  const a = getCity(from);
  const b = getCity(to);
  if (!a || !b) return 0;
  return interCityMinutes(a.center, b.center, PLAYER_CITY_SPEED);
}

/** Schlafmodus einer Stadt (null, wenn sie nicht freigeschaltet ist). */
export function sleepInfo(state: GameState, cityId: string): CitySleep | null {
  return (state.modules.city as CityState | undefined)?.sleep?.[cityId] ?? null;
}

/** Kontakt einer Stadt (ruft nach "<Stadt> komplett" an). */
export function cityContact(cityId: string): Contact {
  return CITY_BY_ID.get(cityId)?.contact ?? HARBOR_CALLER;
}

/** Gespräch und Texte einer Stadt (Hamburg, wenn die Stadt keine eigenen hat). */
export function cityOffer(cityId: string): CityOffer {
  return CITY_OFFERS[cityId] ?? CITY_OFFERS.hamburg;
}

function cityState(state: GameState): CityState | undefined {
  return state.modules.city as CityState | undefined;
}

/** Die komplette Stadt, für die gerade Angebote laufen (null = keine Runde offen). */
export function offerFrom(state: GameState): string | null {
  return cityState(state)?.offerFrom ?? null;
}

/** Städte nach Köln, die man noch nicht hat und die spielbar sind (keine Schablone). */
export function freeCities(state: GameState): string[] {
  return NEXT_CITY.filter((id) => !getCity(id)?.template && !isCityUnlocked(state, id));
}

/** Freie Städte, nach Entfernung zu from (die nächstgelegene zuerst). */
function citiesByDistance(state: GameState, from: string): string[] {
  const origin = getCity(from)?.center;
  const far = (id: string) => (origin ? distanceMeters(origin, getCity(id)?.center ?? origin) : 0);
  return freeCities(state).sort((a, b) => far(a) - far(b) || a.localeCompare(b));
}

/** Städte mit einem Angebot in der laufenden Runde (die nächstgelegene zuerst), leer ohne Runde. */
export function offerCities(state: GameState): string[] {
  const from = offerFrom(state);
  const offers = cityState(state)?.offers ?? {};
  return from ? citiesByDistance(state, from).filter((id) => (offers[id]?.status ?? 'none') !== 'none') : [];
}

/** Rangfolge, welches Angebot "das aktuelle" ist (für Anzeigen ohne Stadt). */
const STATUS_ORDER: readonly OfferStatus[] = [
  'calling',
  'accepted',
  'house',
  'later',
  'declined',
  'pitched',
  'scheduled',
  'queued',
  'none',
];

/** Das wichtigste laufende Angebot (Anruf vor Zusage vor Warten …), null ohne. */
export function currentOffer(state: GameState): string | null {
  const offers = cityState(state)?.offers ?? {};
  let best: string | null = null;
  let rank = STATUS_ORDER.length - 1;
  for (const id of NEXT_CITY) {
    // Eine freie Stadt hat kein Angebot mehr (es ist mit dem Freischalten erledigt).
    if (isCityUnlocked(state, id)) continue;
    const status = offers[id]?.status ?? 'none';
    const r = STATUS_ORDER.indexOf(status);
    if (status !== 'none' && r < rank) {
      best = id;
      rank = r;
    }
  }
  return best;
}

/** Stand des Angebots einer Stadt; ohne Stadt das wichtigste laufende (sonst 'none'). */
export function offerStatus(state: GameState, cityId?: string): OfferStatus {
  const id = cityId ?? currentOffer(state);
  if (!id || isCityUnlocked(state, id)) return 'none';
  return cityState(state)?.offers?.[id]?.status ?? 'none';
}

/** Die Stadt, der du zugesagt hast (null ohne Zusage). */
export function acceptedCity(state: GameState): string | null {
  const offers = cityState(state)?.offers ?? {};
  return NEXT_CITY.find((id) => offers[id]?.status === 'accepted' && !isCityUnlocked(state, id)) ?? null;
}

/** Was fehlt, damit du die komplette Stadt deiner Rechten Hand übergeben und weiterziehen kannst (leer = nichts). */
export function nextCityMissing(state: GameState): string[] {
  return fullPowerMissing(state, offerFrom(state) ?? FIRST_CITY);
}

/** Alter Name (Auftrag 30): was fehlt, um weiterzuziehen. */
export function hamburgMissing(state: GameState): string[] {
  return nextCityMissing(state);
}

// ---------------------------------------------------------------------------------------------
// Schreiben

/** Platzhalter in den Texten einer Stadt füllen. */
function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all);
}

function placeOf(cityId: string): string {
  return CITY_PLACE[cityId] ?? `in ${cityName(cityId)}`;
}

/** Die Autobahn, über die man von from nach to fährt (für "Fahr über die A1"). */
function roadName(from: string, to: string): string {
  const refs = autobahnRefs(from, to);
  return refs[0]?.replace(' ', '') ?? 'Autobahn';
}

/** Werte für die Platzhalter: komplette Stadt, ihre Rechte Hand, Anteil, Autobahn. */
function textVars(state: GameState, cityId: string): Record<string, string> {
  const from = offerFrom(state) ?? presentCity(state);
  return {
    from: cityName(from),
    fromPlace: placeOf(from),
    city: cityName(cityId),
    name: rightHandName(state, from),
    share: `${Math.round(FULL_POWER_SHARE * 100)} Prozent`,
    road: roadName(from, cityId),
  };
}

function offerText(state: GameState, cityId: string, key: keyof CityOffer['texts']): string {
  return fill(cityOffer(cityId).texts[key], textVars(state, cityId));
}

function options(cityId: string, which: 'all' | 'comeOnly' | 'callMe') {
  const come = cityOffer(cityId).come;
  const answer = (id: string, label: string, choice: OfferChoice) => ({
    id,
    label,
    reply: `${label}.`,
    command: { type: 'city.answerOffer' as const, payload: { choice, cityId } },
  });
  if (which === 'callMe') {
    return [
      {
        id: 'callMe',
        label: 'Ruf mich an',
        reply: 'Ruf mich an.',
        command: { type: 'city.requestCall' as const, payload: { cityId } },
      },
    ];
  }
  if (which === 'comeOnly') return [answer('come', come.replace('Ich komme', 'Ich komme doch'), 'come')];
  return [
    answer('come', come, 'come'),
    answer('later', 'Ich brauch noch Zeit', 'later'),
    // Den Namen der kompletten Stadt setzt answerOptions ein.
    answer('stay', 'Das reicht mir', 'stay'),
  ];
}

function tell(ctx: Ctx, cityId: string, text: string, withOptions?: 'all' | 'comeOnly' | 'callMe'): void {
  const opts = withOptions ? answerOptions(ctx.state, cityId, withOptions) : undefined;
  messages.send(ctx, { contact: cityContact(cityId), text, ...(opts ? { options: opts } : {}) });
}

/** Antworten an eine Stadt (mit dem Namen der kompletten Stadt in "<Stadt> reicht mir"). */
function answerOptions(state: GameState, cityId: string, which: 'all' | 'comeOnly' | 'callMe') {
  const list = options(cityId, which);
  const from = cityName(offerFrom(state) ?? FIRST_CITY);
  return list.map((o) => (o.id === 'stay' ? { ...o, label: `${from} reicht mir`, reply: `${from} reicht mir.` } : o));
}

/** Offene Fragen einer Stadt erledigen sich, sobald eine Antwort gefallen ist (egal in welchem Chat-Eintrag). */
function retractOpenQuestions(ctx: Ctx, cityId: string): void {
  const contactId = cityContact(cityId).id;
  messages.retractWhere(ctx, (m) => m.contactId === contactId);
}

function offerOf(ctx: Ctx, cityId: string): OfferState {
  const offers = ctx.state.modules.city.offers;
  offers[cityId] ??= { status: 'none', callAt: null, remindAt: null };
  return offers[cityId];
}

function placeCall(ctx: Ctx, cityId: string): void {
  const offer = offerOf(ctx, cityId);
  const offerDef = cityOffer(cityId);
  offer.status = 'calling';
  offer.callAt = null;
  retractOpenQuestions(ctx, cityId);
  const vars = textVars(ctx.state, cityId);
  messages.call(ctx, {
    contact: cityContact(cityId),
    lines: offerDef.lines.map((line) => fill(line, vars)),
    options: answerOptions(ctx.state, cityId, 'all'),
    summary: fill(offerDef.texts.summary, vars),
    missedText: fill(offerDef.texts.missed, vars),
    gaveUpText: fill(offerDef.texts.gaveUp, vars),
  });
  journal.add(ctx, `Anruf aus ${cityName(cityId)}: ${cityContact(cityId).name}.`, 'info');
}

/** Klingelt gerade schon eine Stadt an (oder ruft gleich zurück)? Dann wartet die nächste. */
function cityCalling(state: GameState): boolean {
  const ids = new Set(NEXT_CITY.map((id) => cityContact(id).id));
  if (messages.ringingCalls(state).some((m) => ids.has(m.contactId))) return true;
  return (state.messages.calls?.retries ?? []).some((r) => ids.has(r.call.contact.id));
}

export function answerOffer(ctx: Ctx, choice: OfferChoice, cityId: string): CommandResult {
  const offer = ctx.state.modules.city.offers[cityId];
  if (!offer || offer.status === 'none' || offer.status === 'scheduled' || offer.status === 'queued') {
    return { ok: false, reason: 'Es gibt kein Angebot.' };
  }
  if (offer.status === 'accepted') return { ok: true };
  if (isCityUnlocked(ctx.state, cityId)) return { ok: false, reason: `${cityName(cityId)} ist schon frei.` };
  retractOpenQuestions(ctx, cityId);
  const from = offerFrom(ctx.state) ?? FIRST_CITY;
  const ready = choice === 'come' && nextCityMissing(ctx.state).length === 0;
  ctx.emit('city.offerAnswered', { choice, ready, cityId });
  if (choice === 'come') {
    if (ready) {
      // Nur eine Zusage gilt: Wer vorher einer anderen Stadt zugesagt hat, lässt die jetzt warten.
      for (const [id, other] of Object.entries(ctx.state.modules.city.offers)) {
        if (id !== cityId && other.status === 'accepted' && !isCityUnlocked(ctx.state, id)) other.status = 'later';
      }
      offer.status = 'accepted';
      offer.remindAt = null;
      askHandover(ctx, from, cityId);
      journal.add(ctx, `Du hast ${cityName(cityId)} zugesagt. Jetzt ${cityName(from)} übergeben.`, 'good');
      ctx.emit('city.offerAccepted', { cityId, from });
    } else {
      offer.status = 'house';
      offer.remindAt = null;
      tell(ctx, cityId, offerText(ctx.state, cityId, 'notReady'));
      tell(
        ctx,
        cityId,
        `Was mir fehlt:\n${nextCityMissing(ctx.state)
          .map((line) => `– ${line}`)
          .join('\n')}`,
      );
    }
  } else if (choice === 'later') {
    offer.status = 'later';
    offer.remindAt = ctx.now + OFFER_REMINDER_DAYS * MINUTES_PER_DAY;
    tell(ctx, cityId, offerText(ctx.state, cityId, 'later'));
  } else {
    offer.status = 'declined';
    offer.remindAt = null;
    tell(ctx, cityId, offerText(ctx.state, cityId, 'stay'), 'comeOnly');
  }
  return { ok: true };
}

/** Eine freie Stadt ruft jetzt an (Tipp auf ihre Karte, "Ruf mich an"). */
export function requestCall(ctx: Ctx, cityId: string): CommandResult {
  const def = getCity(cityId);
  if (!def || def.template) return { ok: false, reason: `${def?.name ?? cityId} ist noch nicht im Spiel.` };
  if (isCityUnlocked(ctx.state, cityId)) return { ok: false, reason: `${def.name} ist schon frei.` };
  const offer = ctx.state.modules.city.offers[cityId];
  if (!offerFrom(ctx.state) || !offer || offer.status === 'none') {
    return { ok: false, reason: 'Erst eine Stadt komplett übernehmen, dann melden sich die anderen.' };
  }
  if (offer.status === 'calling' || offer.status === 'accepted') return { ok: true };
  if (cityCalling(ctx.state)) return { ok: false, reason: 'Gerade ruft schon jemand an.' };
  placeCall(ctx, cityId);
  return { ok: true };
}

/** Name der Rechten Hand in einer Stadt (für die Sätze der Kontakte). */
function rightHandName(state: GameState, cityId: string): string {
  const rh = getRightHand(state, cityId);
  return (rh && getStaffMember(state, rh.staffId)?.name) || 'Deine Rechte Hand';
}

/** Nach der Zusage: Der Kontakt fragt (noch im Gespräch), ob du die komplette Stadt jetzt übergibst. */
function askHandover(ctx: Ctx, from: string, cityId: string): void {
  const name = rightHandName(ctx.state, from);
  const contact = cityContact(cityId);
  messages.send(ctx, { contact, text: offerText(ctx.state, cityId, 'ready') });
  messages.send(ctx, { contact, text: offerText(ctx.state, cityId, 'handoverDeal') });
  messages.send(ctx, {
    contact,
    text: offerText(ctx.state, cityId, 'handoverAsk'),
    options: [
      {
        id: HANDOVER_NOW,
        label: `${cityName(from)} an ${name} übergeben und losfahren`,
        reply: `${name} übernimmt ${cityName(from)}. Ich fahr los.`,
        command: { type: 'city.handOver', payload: { cityId: from, toCityId: cityId } },
      },
      {
        id: HANDOVER_LATER,
        label: 'Ich regel vorher noch was',
        reply: `Ich regel vorher noch was in ${cityName(from)}.`,
      },
    ],
  });
}

const HANDOVER_NOW = 'handover';
const HANDOVER_LATER = 'handoverLater';

/** Warum du gerade nicht in eine andere Stadt fahren kannst (null = nichts). */
function travelBlocker(state: GameState): string | null {
  const c = state.modules.city;
  if (c.travel) return `Du bist schon auf dem Weg nach ${cityName(c.travel.to)}.`;
  if (isPlayerDelivering(state)) return 'Erst die Lieferung zu Ende fahren.';
  // Eigene Fahrten (Auftrag 33): Ein Wagen, der am vollen Lager im Hof wartet, hält dich nicht auf, eine geplante
  // Nachtfahrt schon (du musst sie fahren).
  const own = getTrips(state).filter((t) => t.driverId === null && t.status !== 'waiting');
  if (own.some((t) => t.status === 'planned')) return 'Du hast heute Nacht noch eine Fahrt geplant.';
  if (own.length > 0) return 'Du bist gerade mit dem Wagen unterwegs.';
  return null;
}

/** Wohin es nach der Übergabe von from geht: die zugesagte Stadt, sonst die nächstgelegene freie (null = keine). */
export function nextCityAfter(state: GameState, from: string): string | null {
  // Nur in der Runde dieser Stadt: Ohne Anruf wird keine Stadt frei (auch nicht nach Widerruf und neuer Übergabe).
  if (offerFrom(state) !== from) return null;
  return acceptedCity(state) ?? offerCities(state)[0] ?? null;
}

/**
 * Stadt an die Rechte Hand übergeben und in die zugesagte fahren, in einem Rutsch (aus der Frage des Kontakts oder
 * dem Übergabe-Dialog). Erst prüfen, ob du überhaupt losfahren kannst, damit die Übergabe nicht ohne Fahrt passiert.
 */
export function handOver(ctx: Ctx, cityId: string, toCityId?: string, pack: StartPack = {}): CommandResult {
  const next = toCityId ?? nextCityAfter(ctx.state, cityId);
  const def = next ? getCity(next) : undefined;
  if (!next || !def) return { ok: false, reason: `Aus ${cityName(cityId)} geht es noch nicht weiter.` };
  if (def.template) return { ok: false, reason: `${def.name} ist noch nicht im Spiel.` };
  if (next === cityId) return { ok: false, reason: `Du bist schon in ${def.name}.` };
  // Eine neue Stadt wird nur in der Runde der übergebenen Stadt frei (sie hat angerufen oder sich gemeldet).
  const roundOpen = offerFrom(ctx.state) === cityId;
  if (!isCityUnlocked(ctx.state, next) && !(roundOpen && offerStatus(ctx.state, next) !== 'none')) {
    return { ok: false, reason: `${def.name} hat sich noch nicht gemeldet.` };
  }
  const blocked = travelBlocker(ctx.state);
  if (blocked) return { ok: false, reason: blocked };
  if (!hasFullPower(ctx.state, cityId)) {
    const missing = fullPowerMissing(ctx.state, cityId);
    if (missing.length > 0) return { ok: false, reason: missing[0] };
  }
  const packProblem = checkPack(ctx.state, cityId, pack);
  if (packProblem) return { ok: false, reason: packProblem };
  // Wer im Dialog eine andere Stadt wählt als zugesagt, sagt damit dieser zu.
  if (roundOpen) {
    const offer = offerOf(ctx, next);
    if (offer.status !== 'accepted') {
      for (const [id, other] of Object.entries(ctx.state.modules.city.offers)) {
        if (other.status === 'accepted' && !isCityUnlocked(ctx.state, id)) other.status = 'later';
      }
      offer.status = 'accepted';
    }
  }
  const money = startMoneyDue(ctx.state, cityId, next);
  // Das Ereignis der Übergabe kommt erst nach diesem Befehl an; die Stadt muss aber jetzt frei sein, um loszufahren.
  unlockCity(ctx, next);
  closeRound(ctx, next);
  if (ctx.state.modules.city.present !== next) {
    const travel = travelTo(ctx, next);
    if (!travel.ok) return travel;
  }
  // Erst das Startpaket auf den Weg (danach gibt der Statthalter niemanden mehr frei), dann die Vollmacht.
  sendPack(ctx, cityId, next, pack);
  if (money > 0) startMoney(ctx, cityId, next, money);
  if (!hasFullPower(ctx.state, cityId)) {
    const granted = ctx.dispatch({ type: 'hierarchy.grantFullPower', payload: { cityId } }, { actor: 'player' });
    if (!granted.ok) return granted;
  }
  messages.send(ctx, { contact: cityContact(next), text: offerText(ctx.state, next, 'handoverDone') });
  return { ok: true };
}

/**
 * Startgeld für die nächste Stadt: HANDOVER_START_MONEY_DAYS Tagesgewinne der übergebenen Stadt, mindestens
 * START_MONEY_MIN_BY_CITY der Zielstadt.
 */
export function startMoneyFor(state: GameState, from: string, to?: string): number {
  const results = cityState(state)?.sleep?.[from]?.results ?? [];
  const average = results.length > 0 ? results.reduce((a, b) => a + b, 0) / results.length : 0;
  const min = (to && START_MONEY_MIN_BY_CITY[to]) || 0;
  return Math.max(min, Math.round(average * HANDOVER_START_MONEY_DAYS), 0);
}

/**
 * Startgeld, das die Übergabe von from nach to jetzt wirklich zahlt: nur in der Runde von from (eine neue Stadt hat
 * angerufen) und nur einmal pro Stadt; sonst 0 (z.B. nach Widerruf und neuer Übergabe).
 */
export function startMoneyDue(state: GameState, from: string, to: string): number {
  const c = cityState(state);
  if (!c || c.offerFrom !== from || (c.startMoneyPaid ?? []).includes(from) || isCityUnlocked(state, to)) return 0;
  return startMoneyFor(state, from, to);
}

/** Der Statthalter gibt dir Startgeld mit (Umbuchung aus der Kasse der Stadt, kein Gewinn). */
function startMoney(ctx: Ctx, from: string, to: string, amount: number): void {
  ctx.state.modules.city.startMoneyPaid.push(from);
  wallet.earn(ctx, amount, 'dirty', `Startgeld für ${cityName(to)} aus ${cityName(from)}`, {
    category: 'transfer',
    cityId: from,
  });
  journal.add(ctx, `Startgeld für ${cityName(to)}: ${formatEuro(amount)} aus der Kasse von ${cityName(from)}.`, 'good');
}

/** Fahrzeuge, die mitkommen können: frei und keiner festen Route zugeteilt (die bliebe sonst ohne Wagen). */
export function packVehicles(state: GameState, from: string) {
  const routed = new Set(getRoutes(state).map((r) => r.vehicleId));
  return freeVehicles(state, from).filter((v) => !routed.has(v.id));
}

/** Was am Startpaket nicht stimmt (null = alles gut). */
function checkPack(state: GameState, from: string, pack: StartPack): string | null {
  const staffIds = pack.staffIds ?? [];
  if (staffIds.length > START_PACK_MAX_STAFF) return `Höchstens ${START_PACK_MAX_STAFF} Leute können mitkommen.`;
  if (pack.leaderId && !startPackLeaders(state, from).some((m) => m.id === pack.leaderId)) {
    return 'Diese Person kann nicht als Rechte Hand mitkommen.';
  }
  const allowed = new Set(startPackStaff(state, from).map((m) => m.id));
  if (staffIds.some((id) => !allowed.has(id) || id === pack.leaderId)) return 'Nicht alle können gerade mitkommen.';
  const free = new Set(packVehicles(state, from).map((v) => v.id));
  if ((pack.vehicleIds ?? []).some((id) => !free.has(id))) return 'Ein Fahrzeug ist gerade nicht frei.';
  return null;
}

/**
 * Startpaket auf den Weg: Die neue Rechte Hand gibt ihre Spots ab und fährt los (wird bei der Ankunft Rechte Hand, siehe
 * 'staff.relocated'), die Leute fahren mit, die Fahrzeuge kommen mit dir an.
 */
function sendPack(ctx: Ctx, from: string, to: string, pack: StartPack): void {
  const leaderId = pack.leaderId ?? null;
  if (leaderId) {
    handOffLeader(ctx, leaderId, to);
    if (ctx.dispatch({ type: 'staff.relocate', payload: { staffId: leaderId, cityId: to } }, { actor: 'player' }).ok) {
      ctx.state.modules.city.startLeader = { staffId: leaderId, cityId: to };
    }
  }
  for (const staffId of pack.staffIds ?? []) {
    ctx.dispatch({ type: 'staff.relocate', payload: { staffId, cityId: to } }, { actor: 'player' });
  }
  for (const id of pack.vehicleIds ?? []) releaseVehicle(ctx, id, to);
  const parts = [
    leaderId ? 'eine neue Rechte Hand' : '',
    (pack.staffIds ?? []).length > 0 ? `${(pack.staffIds ?? []).length} Leute` : '',
    (pack.vehicleIds ?? []).length > 0 ? `${(pack.vehicleIds ?? []).length} Fahrzeuge` : '',
  ].filter(Boolean);
  if (parts.length > 0) {
    journal.add(
      ctx,
      `Startpaket nach ${cityName(to)}: ${parts.join(', ')}. Aus ${cityName(from)} mitgenommen.`,
      'info',
    );
  }
}

function newSleep(live: boolean, now: number): CitySleep {
  return { results: [], liveToday: live, since: live ? null : now, last: null };
}

/** Selbst in eine andere Stadt fahren. */
export function travelTo(ctx: Ctx, cityId: string): CommandResult {
  const c = ctx.state.modules.city;
  const def = getCity(cityId);
  if (!def || def.template) return { ok: false, reason: 'Diese Stadt gibt es im Spiel noch nicht.' };
  if (!c.unlocked.includes(cityId)) return { ok: false, reason: `${def.name} ist noch nicht frei.` };
  if (c.travel) return { ok: false, reason: `Du bist schon auf dem Weg nach ${cityName(c.travel.to)}.` };
  if (c.present === cityId) return { ok: false, reason: `Du bist schon in ${def.name}.` };
  const blocked = travelBlocker(ctx.state);
  if (blocked) return { ok: false, reason: blocked };
  // Wer losfährt, steht nicht mehr am Spot.
  if (playerSpot(ctx.state)) ctx.dispatch({ type: 'customers.standAt', payload: { spotId: null } });
  const from = c.present;
  const minutes = travelMinutesBetween(from, cityId);
  c.travel = { from, to: cityId, departedAt: ctx.now, arrivesAt: ctx.now + minutes };
  journal.add(
    ctx,
    `Du fährst über die ${roadName(from, cityId)} nach ${def.name}. Ankunft in ca. ${clock.formatDuration(minutes)}.`,
    'info',
  );
  ctx.emit('city.travelStarted', { from, to: cityId, arrivesAt: c.travel.arrivesAt });
  return { ok: true, data: { arrivesAt: c.travel.arrivesAt } };
}

/** Angekommen: Du bist in der Stadt, sie wird aktiv und live. */
function arrive(ctx: Ctx): void {
  const c = ctx.state.modules.city;
  const travel = c.travel;
  if (!travel) return;
  c.travel = null;
  c.present = travel.to;
  const first = !c.visited.includes(travel.to);
  if (first) c.visited.push(travel.to);
  if (c.active !== travel.to) switchCity(ctx, travel.to);
  journal.add(ctx, `Angekommen in ${cityName(travel.to)}.`, 'good');
  ctx.emit('city.arrived', first ? { cityId: travel.to, first } : { cityId: travel.to });
  if (first) {
    for (const text of CITY_OFFERS[travel.to]?.welcome ?? []) {
      messages.send(ctx, { contact: cityContact(travel.to), text, silent: true });
    }
  }
}

/** Stadt live schalten: Karte und Handy wechseln, die bisherige Stadt schläft. */
export function switchCity(ctx: Ctx, cityId: string): CommandResult {
  const c = ctx.state.modules.city;
  const def = getCity(cityId);
  if (!def || def.template) return { ok: false, reason: 'Diese Stadt gibt es im Spiel noch nicht.' };
  if (!c.unlocked.includes(cityId)) return { ok: false, reason: `${def.name} ist noch nicht frei.` };
  if (c.active === cityId) return { ok: true };
  const from = c.active;
  c.active = cityId;
  c.sleep[from] ??= newSleep(false, ctx.now);
  c.sleep[from].since = ctx.now;
  c.sleep[cityId] ??= newSleep(true, ctx.now);
  c.sleep[cityId].since = null;
  // Wer mitten am Tag umschaltet, hat von diesem Tag nur einen Teil gespielt: Er zählt nicht (siehe closeLiveDay).
  c.sleep[from].liveToday = false;
  c.sleep[cityId].liveToday = false;
  journal.add(ctx, `Du schaust jetzt auf ${def.name}. ${cityName(from)} läuft im Hintergrund weiter.`, 'info');
  ctx.emit('city.switched', { from, to: cityId });
  return { ok: true };
}

/** Stadt freischalten (intern). */
export function unlockCity(ctx: Ctx, cityId: string): CommandResult {
  const c = ctx.state.modules.city;
  const def = getCity(cityId);
  if (!def || def.template) return { ok: false, reason: 'Diese Stadt gibt es im Spiel noch nicht.' };
  if (c.unlocked.includes(cityId)) return { ok: true };
  c.unlocked.push(cityId);
  c.sleep[cityId] ??= newSleep(c.active === cityId, ctx.now);
  // Das Angebot dieser Stadt ist erledigt.
  if (c.offers[cityId]) c.offers[cityId] = { status: 'none', callAt: null, remindAt: null };
  journal.add(ctx, `${def.name} ist frei. Oben in der Leiste wechselst du zwischen den Städten.`, 'good');
  ctx.emit('city.unlocked', { cityId });
  return { ok: true };
}

/** Minute nach Mitternacht, in der die Ergebnisse der live gespielten Städte für den Vortag eingetragen werden. */
const LIVE_CLOSE_MINUTE = 5;

/**
 * Mitternacht: Für jede Stadt, die den ganzen Buchungstag geschlafen hat, bucht die Zusammenfassung das geschätzte
 * Ergebnis. Städte, die nur einen Teil des Tages live waren (Umschalten mitten am Tag), bekommen für diesen Tag weder
 * Zusammenfassung noch Eintrag: Der Teil davor steht schon echt in der Kasse, der Rest ist nicht gespielt.
 */
function closeSleepers(ctx: Ctx): void {
  const c = ctx.state.modules.city;
  const day = bookDay(ctx.now);
  const dayStart = clock.at(day);
  for (const cityId of c.unlocked) {
    c.sleep[cityId] ??= newSleep(c.active === cityId, ctx.now);
    const rec = c.sleep[cityId];
    if (rec.since !== null && rec.since <= dayStart) sleepSummary(ctx, cityId, day, rec);
  }
}

/**
 * Kurz nach Mitternacht: Für jede Stadt, die den ganzen Vortag live war, zählt ihr Ergebnis zum Schnitt. Erst jetzt,
 * denn die Löhne des Tages werden im Ereignis clock.dayStarted gezahlt und von der Kasse erst danach gebucht (zum
 * Vortag): Um Mitternacht selbst stünde der Tag noch brutto im Buch. Danach beginnt ein neuer Tag für alle.
 */
function closeLiveDay(ctx: Ctx): void {
  const c = ctx.state.modules.city;
  const day = bookDay(ctx.now) - 1;
  for (const cityId of c.unlocked) {
    c.sleep[cityId] ??= newSleep(c.active === cityId, ctx.now);
    const rec = c.sleep[cityId];
    if (rec.liveToday && day >= 1) {
      const profit = cityDayProfit(ctx.state, cityId, day);
      if (profit !== null) {
        // Einmalige Ausgaben (Lager, Spots, Fahrzeuge: Ausbau) gehören nicht in den Schnitt (Auftrag 33/36): Der
        // Statthalter baut im Schlaf nicht weiter aus.
        const once = cityReport(ctx.state, cityId, 1, bookDay(ctx.now) - day).rows;
        const expansion = once.find((r) => r.category === 'expansion')?.amount ?? 0;
        rec.results.push(Math.round(profit - expansion));
        if (rec.results.length > SLEEP_AVERAGE_DAYS) rec.results.splice(0, rec.results.length - SLEEP_AVERAGE_DAYS);
      }
    }
    rec.liveToday = c.active === cityId;
  }
}

/**
 * Ergebnis eines Tages im Schlaf aus dem Schnitt (rein, für Tests): Faktor 0,85 bis 1,15; an etwa SLEEP_RAID_CHANCE der
 * Tage eine Razzia: halbes Ergebnis oder ein kleines Minus (SLEEP_RAID_LOSS_MIN bis _MAX vom Schnitt), nie mehr.
 */
export function sleepResult(average: number, random: () => number): { amount: number; raid: 'half' | 'loss' | null } {
  const factor = SLEEP_FACTOR_MIN + random() * (SLEEP_FACTOR_MAX - SLEEP_FACTOR_MIN);
  const amount = Math.round(average * factor);
  if (!(average > 0) || random() >= SLEEP_RAID_CHANCE) return { amount, raid: null };
  if (random() < SLEEP_RAID_HALF_CHANCE) return { amount: Math.round(amount / 2), raid: 'half' };
  const share = SLEEP_RAID_LOSS_MIN + random() * (SLEEP_RAID_LOSS_MAX - SLEEP_RAID_LOSS_MIN);
  return { amount: -Math.max(1, Math.round(average * share)), raid: 'loss' };
}

function sleepSummary(ctx: Ctx, cityId: string, day: number, rec: CitySleep): void {
  const name = cityName(cityId);
  const average = rec.results.length > 0 ? rec.results.reduce((a, b) => a + b, 0) / rec.results.length : 0;
  const result = sleepResult(average, () => ctx.random());
  let amount = result.amount;
  const raidKind = result.raid;
  if (amount > 0) {
    wallet.earn(ctx, amount, 'dirty', `Ergebnis ${name} (Rechte Hand)`, { category: 'income.city', cityId });
  } else if (amount < 0) {
    amount = -wallet.lose(ctx, -amount, 'dirty', `Verlust ${name}`, { category: 'expense.city', cityId });
  }
  rec.last = { day, amount };
  restHeat(ctx, cityId);
  if (amount !== 0) {
    journal.add(
      ctx,
      amount > 0
        ? `${name} im Hintergrund: Tag ${day} brachte ${formatEuro(amount)}.${raidKind ? ' Razzia, halber Tag.' : ''}`
        : `${name} im Hintergrund: Tag ${day} kostete ${formatEuro(-amount)}.${raidKind ? ' Razzia.' : ''}`,
      amount > 0 && !raidKind ? 'good' : 'bad',
    );
  }
  if (raidKind) statthalterLine(ctx, cityId, raidKind, amount);
  ctx.emit('city.slept', raidKind ? { cityId, day, amount, raid: true } : { cityId, day, amount });
}

/** Der Statthalter schreibt eine Zeile zur Razzia im Schlaf (still, kein Banner). */
function statthalterLine(ctx: Ctx, cityId: string, kind: 'half' | 'loss', amount: number): void {
  const rh = getRightHand(ctx.state, cityId);
  const m = rh ? getStaffMember(ctx.state, rh.staffId) : undefined;
  if (!m) return;
  const text = texts.pick(ctx, `report:statthalter:raid-${kind}`, SLEEP_RAID_TEXTS[kind], {
    city: cityName(cityId),
    amount: formatEuro(Math.abs(amount)),
  });
  messages.send(ctx, {
    contact: { ...staffContact(m), role: rightHandTitle(ctx.state, cityId) },
    text,
    silent: true,
  });
}

/**
 * Eine Stadt ist komplett (einmal pro Stadt): Die nächstgelegene freie ruft OFFER_CALL_DELAY Spielminuten später an,
 * die übrigen melden sich danach im Abstand von OFFER_NEXT_DELAY per Chat.
 */
function startRound(ctx: Ctx, from: string): void {
  const c = ctx.state.modules.city;
  if (c.rounds.includes(from) || c.offerFrom !== null) return;
  // Ist gerade keine Stadt frei (die übrigen sind Schablonen), zählt die Runde nicht: Sie kommt nach, sobald eine
  // Stadt spielbar wird (tickOffers).
  const list = citiesByDistance(ctx.state, from);
  if (list.length === 0) return;
  c.rounds.push(from);
  c.offerFrom = from;
  list.forEach((id, i) => {
    c.offers[id] = {
      status: i === 0 ? 'scheduled' : 'queued',
      callAt: ctx.now + OFFER_CALL_DELAY + i * OFFER_NEXT_DELAY,
      remindAt: null,
    };
  });
}

/** Nach der Übergabe: Die Runde ist vorbei, offene Fragen der anderen Städte erledigen sich. */
function closeRound(ctx: Ctx, to: string | null): void {
  const c = ctx.state.modules.city;
  // Die Fragen der Ziel-Stadt (Übergabe jetzt oder später) haben sich mit der Übergabe erledigt.
  if (to) retractOpenQuestions(ctx, to);
  for (const [id, offer] of Object.entries(c.offers)) {
    if (id === to) continue;
    if (offer.status !== 'none' && !isCityUnlocked(ctx.state, id)) {
      offer.status = 'none';
      offer.callAt = null;
      offer.remindAt = null;
      retractOpenQuestions(ctx, id);
    }
  }
  c.offerFrom = null;
}

function tickOffers(ctx: Ctx): void {
  const state = ctx.state;
  const c = state.modules.city;
  // Eine komplette Stadt ohne Runde (alte Spielstände, oder es war keine Stadt frei, als sie komplett wurde): Die
  // Runde kommt nach, sobald eine Stadt frei ist. Die Stadt, in der du bist, zuerst.
  if (!c.travel && c.offerFrom === null && clock.minute(ctx.now) % 30 === 0 && freeCities(state).length > 0) {
    const order = [c.present, ...c.unlocked.filter((id) => id !== c.present)];
    const due = order.find((id) => !c.rounds.includes(id) && campaignProgress(state, id).complete);
    if (due) startRound(ctx, due);
  }
  const ready = clock.minute(ctx.now) === 0 && nextCityMissing(state).length === 0;
  for (const id of NEXT_CITY) {
    const offer = c.offers[id];
    if (!offer || offer.status === 'none' || isCityUnlocked(state, id)) continue;
    if (offer.status === 'scheduled' && offer.callAt !== null && ctx.now >= offer.callAt) {
      // Nicht mitten in eine Konfrontation oder einen anderen Anruf hinein: dann danach.
      if (activeEncounters(state).length === 0 && !cityCalling(state)) placeCall(ctx, id);
    } else if (offer.status === 'queued' && offer.callAt !== null && ctx.now >= offer.callAt) {
      // Die anderen melden sich per Chat: ein Satz, dann "Ruf mich an".
      offer.status = 'pitched';
      offer.callAt = null;
      tell(ctx, id, offerText(state, id, 'pitch'), 'callMe');
    } else if (offer.status === 'house' && ready) {
      tell(ctx, id, offerText(state, id, 'houseReady'));
      offer.status = 'scheduled';
      offer.callAt = ctx.now + OFFER_CALL_DELAY;
    } else if (offer.status === 'later' && offer.remindAt !== null && ctx.now >= offer.remindAt) {
      retractOpenQuestions(ctx, id);
      tell(ctx, id, offerText(state, id, 'reminder'), 'all');
      offer.remindAt = ctx.now + OFFER_REMINDER_DAYS * MINUTES_PER_DAY;
    }
  }
}

const FIRST_RANK: PlayerRank = { id: PLAYER_RANKS[0].id, title: PLAYER_RANKS[0].title, score: 0 };

/** Dein Rang (der höchste bisher). */
export function playerRank(state: GameState): PlayerRank {
  const rank = cityState(state)?.rank;
  return rank ? { id: rank.id, title: rank.title, score: rank.score } : FIRST_RANK;
}

/** Was der Stand gerade hergibt (für die Leiter in der Oberfläche). */
export function currentRank(state: GameState): PlayerRank {
  return reachedRank(state, {
    cities: playableCities().map((c) => c.id),
    unlocked: citiesUnlocked(state),
    name: cityName,
    minGermany: GERMANY_MIN_CITIES,
  });
}

/**
 * Rang prüfen: Ist der Stand höher als der gemerkte, gibt es den neuen Titel (Ereignis player.rankUp, Banner und Ton in
 * der Oberfläche). Ränge gehen nie verloren. Ein alter Spielstand übernimmt beim ersten Mal still, was er schon hat.
 */
function updateRank(ctx: Ctx): void {
  const c = ctx.state.modules.city;
  const next = currentRank(ctx.state);
  const quiet = c.rank.quiet === true;
  if (next.score <= c.rank.score) {
    if (quiet) c.rank = { id: c.rank.id, title: c.rank.title, score: c.rank.score, at: c.rank.at };
    return;
  }
  c.rank = { ...next, at: ctx.now };
  if (quiet) return;
  journal.add(ctx, `Neuer Rang: ${next.title}.`, 'good');
  ctx.emit('player.rankUp', { rankId: next.id, title: next.title, score: next.score });
}

function tick(ctx: Ctx): void {
  const state = ctx.state;
  if (ctx.now % 60 === 0 || state.modules.city.rank.quiet) updateRank(ctx);
  if (ctx.now > 0 && ctx.now % MINUTES_PER_DAY === 0) closeSleepers(ctx);
  if (ctx.now % MINUTES_PER_DAY === LIVE_CLOSE_MINUTE) closeLiveDay(ctx);
  const travel = state.modules.city.travel;
  if (travel && ctx.now >= travel.arrivesAt) arrive(ctx);
  tickOffers(ctx);
}

function initialState(): CityState {
  return {
    offers: {},
    offerFrom: null,
    rounds: [],
    startMoneyPaid: [],
    startLeader: null,
    rank: { ...FIRST_RANK, at: 0 },
    active: FIRST_CITY,
    present: FIRST_CITY,
    unlocked: [FIRST_CITY],
    travel: null,
    sleep: { [FIRST_CITY]: newSleep(true, 0) },
    visited: [FIRST_CITY],
  };
}

/** Nur der Spieler wechselt die Stadt; freischalten tut das Spiel selbst. */
function playerOnly(meta: CommandMeta): CommandResult | null {
  return meta.actor === 'player' ? null : { ok: false, reason: 'Das entscheidest du selbst.' };
}

export default defineModule({
  id: 'city',
  version: 5,
  dependsOn: ['territory', 'hierarchy'],
  init: () => initialState(),
  tickEvery: 5,
  tick,
  commands: {
    'city.answerOffer': (ctx, payload) => answerOffer(ctx, payload.choice, payload.cityId ?? 'hamburg'),
    'city.requestCall': (ctx, { cityId }, meta) => playerOnly(meta) ?? requestCall(ctx, cityId),
    'city.handOver': (ctx, payload, meta) =>
      playerOnly(meta) ?? handOver(ctx, payload?.cityId ?? FIRST_CITY, payload?.toCityId, payload?.pack),
    'city.switch': (ctx, { cityId }, meta) => playerOnly(meta) ?? switchCity(ctx, cityId),
    'city.unlock': (ctx, { cityId }, meta) =>
      meta.actor === 'system' ? unlockCity(ctx, cityId) : { ok: false, reason: 'Städte werden im Spiel frei.' },
    'city.travel': (ctx, { cityId }, meta) => playerOnly(meta) ?? travelTo(ctx, cityId),
  },
  on: {
    'campaign.won': (ctx, { cityId }) => {
      startRound(ctx, cityId ?? FIRST_CITY);
      updateRank(ctx);
    },
    'campaign.milestone': (ctx) => updateRank(ctx),
    // Übergabe an die Rechte Hand: Die zugesagte Stadt wird frei (ohne Zusage die nächstgelegene freie).
    // Nur in der Runde dieser Stadt (city.handOver schließt sie selbst, ein späteres erneutes Übergeben schaltet nichts
    // mehr frei).
    'hierarchy.fullPowerGranted': (ctx, { cityId }) => {
      if (offerFrom(ctx.state) !== cityId) return;
      const next = nextCityAfter(ctx.state, cityId);
      if (next) unlockCity(ctx, next);
      closeRound(ctx, next);
    },
    // Startpaket: Die mitgebrachte Person ist angekommen und wird Rechte Hand (hat die Stadt keine).
    'staff.relocated': (ctx, { staffId, to }) => {
      const leader = ctx.state.modules.city.startLeader;
      if (!leader || leader.staffId !== staffId || leader.cityId !== to) return;
      ctx.state.modules.city.startLeader = null;
      if (getRightHand(ctx.state, to)) return;
      ctx.dispatch({ type: 'hierarchy.installRightHand', payload: { staffId, cityId: to } }, { actor: 'system' });
    },
    // "Ich regel vorher noch was": Der Kontakt gibt dir Zeit.
    'message.answered': (ctx, { contactId, optionId }) => {
      if (optionId !== HANDOVER_LATER) return;
      const id = NEXT_CITY.find((c) => cityContact(c).id === contactId);
      if (id) tell(ctx, id, offerText(ctx.state, id, 'handoverLater'));
    },
  },
  migrations: {
    // Version 2 (Etappe 4): aktive Stadt, Aufenthalt, freigeschaltete Städte, Schlafmodus. Alles bisher war Köln.
    2: (old: CityStateV1): CityStateV2 => {
      const {
        visited: _,
        offers: __,
        offerFrom: ___,
        rounds: ____,
        startLeader: _____,
        rank: ______,
        startMoneyPaid: _______,
        ...fresh
      } = initialState();
      return { ...fresh, offer: old.offer };
    },
    // Version 3 (Etappe 5): besuchte Städte. Wer schon irgendwo war, war dort.
    3: (old: CityStateV2): CityStateV3 => ({ ...old, visited: [...new Set([FIRST_CITY, old.present])] }),
    // Version 4 (Auftrag 36): Angebote pro Stadt. Das alte war Hamburgs, nach "Köln komplett".
    4: (old: CityStateV3): CityStateV4 => {
      const { offer, ...rest } = old;
      const started = offer.status !== 'none';
      const hamburgFree = rest.unlocked.includes('hamburg');
      return {
        ...rest,
        offers: { hamburg: { ...offer } },
        offerFrom: started && !hamburgFree ? FIRST_CITY : null,
        rounds: started ? [FIRST_CITY] : [],
        startLeader: null,
        // Der Rang kommt beim ersten Schritt aus dem Stand (ohne Banner für das, was schon erreicht war).
        rank: { ...FIRST_RANK, at: 0, quiet: true },
      };
    },
    // Version 5 (Review Auftrag 36): Startgeld nur einmal pro Stadt; leere Runden (keine Stadt war frei) zählen nicht
    // und kommen nach; „Boss von Deutschland“ erst mit GERMANY_MIN_CITIES Städten (zu früh vergeben: neu bestimmen).
    5: (old: CityStateV4): CityState => {
      const handedOver = old.unlocked.some((id) => id !== FIRST_CITY);
      const rounds = old.rounds.filter((id) => id === old.offerFrom || (id === FIRST_CITY && handedOver));
      return {
        ...old,
        rounds,
        startMoneyPaid: [],
        rank: old.rank.id === 'bossGermany' ? { ...FIRST_RANK, at: old.rank.at, quiet: true } : old.rank,
      };
    },
  },
});
