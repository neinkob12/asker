// Städte (Auftrag 30). Köln ist der Einstieg; wer Köln komplett übernimmt, bekommt einen Anruf aus dem Hamburger
// Hafen (Fiete Lührs): Er sucht jemanden mit Format für große Mengen am Kai. Um Köln zu verlassen, braucht es eine
// Rechte Hand mit voller Macht (hierarchy.fullPowerMissing, Etappe 3).
//
// Ablauf des Angebots (offer.status):
//   none → scheduled (30 Spielminuten nach "Köln komplett", nicht während einer Konfrontation) → calling (Anruf, siehe
//   messages.call) → Antwort über 'city.answerOffer':
//     come:  Rechte Hand bereit → accepted (Ereignis city.offerAccepted). Fiete fragt noch im selben Gespräch, ob du
//            Köln jetzt übergibst: "Köln an <Name> übergeben und losfahren" ('city.handOver': Vollmacht, Hamburg frei,
//            du fährst los, er verabschiedet sich und das Gespräch endet) oder "Ich regel vorher noch was" (dann über
//            die Karte unter Geld und Heat bzw. die Seite der Rechten Hand).
//            Sonst → house: Er schreibt, was fehlt, und ruft von selbst wieder an, sobald es passt.
//     later: Er meldet sich alle OFFER_REMINDER_DAYS Spieltage per Chat (mit denselben Antworten).
//     stay:  Endlosmodus; er schreibt einmal, dass das Angebot steht (zusagen geht über seinen Chat).
//
// Städte als Grundlage (Etappe 4): Nur eine Stadt ist live (die aktive, die Karte und Handy zeigen); die anderen
// freigeschalteten Städte schlafen. Module ticken nur für die aktive Stadt (isCityLive, isVeedelLive, liveVeedel).
// Für jede schlafende Stadt bucht city um Mitternacht eine Tageszusammenfassung: Schnitt der letzten
// SLEEP_AVERAGE_DAYS ganz live gespielten Tage dieser Stadt aus der Kasse mal 0,85 bis 1,15 ('income.city' bzw.
// 'expense.city'), die Heat fällt auf den Ruhewert (police.restHeat). Die Löhne sind im Ergebnis drin, weil ein live
// gespielter Tag erst fünf Minuten nach Mitternacht in den Schnitt kommt (dann sind die Löhne dieses Tages gebucht).
// Teiltage (Umschalten mitten am Tag) zählen weder für den Schnitt noch bekommen sie eine Zusammenfassung. Den Anteil
// der Rechten Hand nimmt hierarchy danach aus dem Buch der Stadt. Beim Aufwachen wird nichts nachgerechnet.
//
// Öffentliche API: offerStatus(state), hamburgMissing(state), HARBOR_CALLER, CITIES, DEUTSCHLAND_VIEW, getCity(id),
//   cityName(id), activeCity(state), presentCity(state), citiesUnlocked(state), isCityUnlocked(state, id),
//   isCityLive(state, id), cityOf(veedelId), cityOfSpot(state, spotId), isVeedelLive(state, veedelId),
//   liveVeedel(state), sleepInfo(state, cityId), playableCities(), cityAt(lng, lat), isPlayerTraveling(state),
//   isPlayerIn(state, cityId), cityTravel(state), travelMinutesBetween(from, to),
//   relationFactor(cityId), bribeFactor(cityId), raidWarningBonus(cityId) (Charakter, Etappe 7)
// Ankommen (Etappe 5): 'city.travel' fährt dich selbst über die A1 (Weg und Zeit aus roads.interCityRoute); unterwegs
// bist du in keiner Stadt (isPlayerTraveling, logistics.isPlayerOnTheRoad). Bei der Ankunft wird die Zielstadt aktiv
// und live; beim ersten Mal in Hamburg schreibt Fiete, wie man anfängt. Selbst am Spot stehen, selbst ausfahren,
// selbst abholen und bei Konfrontationen dabei sein geht nur in der Stadt, in der du bist (isPlayerIn).
//
// Befehle: 'city.answerOffer', 'city.handOver', 'city.switch', 'city.unlock' (intern), 'city.travel'
// Ereignisse: 'city.offerAnswered', 'city.offerAccepted', 'city.switched', 'city.unlocked', 'city.slept',
//   'city.travelStarted', 'city.arrived'

import {
  type CommandMeta,
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  formatEuro,
  type GameState,
  journal,
  MINUTES_PER_DAY,
  messages,
  wallet,
} from '../../core';
import { isPlayerDelivering, playerSpot } from '../customers';
import { activeEncounters } from '../encounters';
import { bookDay, cityDayProfit } from '../finance';
import { fullPowerMissing, getRightHand } from '../hierarchy';
import { getTrips } from '../logistics';
import { restHeat } from '../police';
import { interCityMinutes } from '../roads';
import { getSpot } from '../spots';
import { getStaffMember } from '../staff';
import { campaignProgress } from '../territory';
import { allVeedel, type Veedel, veedelAt, veedelCity } from '../veedel';
import {
  HARBOR_CALLER,
  NEXT_CITY,
  OFFER_CALL_DELAY,
  OFFER_LINES,
  OFFER_REMINDER_DAYS,
  OFFER_TEXTS,
  PLAYER_CITY_SPEED,
  SLEEP_AVERAGE_DAYS,
  SLEEP_FACTOR_MAX,
  SLEEP_FACTOR_MIN,
  WELCOME_TEXTS,
} from './config';
import { CITIES, type CityDef } from './data';

export { HARBOR_CALLER, OFFER_LINES, SLEEP_AVERAGE_DAYS } from './config';
export { CITIES, type CityDef, DEUTSCHLAND_VIEW } from './data';

export type OfferStatus = 'none' | 'scheduled' | 'calling' | 'house' | 'later' | 'declined' | 'accepted';
export type OfferChoice = 'come' | 'later' | 'stay';

export interface OfferState {
  status: OfferStatus;
  /** Wann er (wieder) anruft ('scheduled'). */
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
  /** Das Angebot aus Hamburg. */
  offer: OfferState;
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

/** Zustand in Version 2 (Etappe 4, ohne besuchte Städte). */
type CityStateV2 = Omit<CityState, 'visited'>;

/** Zustand in Version 1 (Etappe 2, nur das Angebot). */
type CityStateV1 = Pick<CityState, 'offer'>;

declare module '../../core' {
  interface ModuleStates {
    city: CityState;
  }
  interface GameCommands {
    /** Antwort auf Fietes Angebot (aus dem Anruf oder seinem Chat). Chefsache. */
    'city.answerOffer': { choice: OfferChoice };
    /**
     * Köln an die Rechte Hand übergeben (Vollmacht) und sofort über die A1 in die nächste Stadt fahren. Aus Fietes
     * Frage nach der Zusage (im Anruf oder Chat). Chefsache.
     */
    'city.handOver': { cityId?: string };
    /** Andere Stadt live schalten (Karte und Handy wechseln, die bisherige schläft). Nur freigeschaltete Städte. */
    'city.switch': { cityId: string };
    /** Stadt freischalten. Intern (nach der Übergabe an die Rechte Hand), nicht für den Spieler. */
    'city.unlock': { cityId: string };
    /** Selbst in eine andere Stadt fahren (über die A1). */
    'city.travel': { cityId: string };
  }
  interface GameEvents {
    'city.offerAnswered': { choice: OfferChoice; ready: boolean };
    /** Zusage mit bereiter Rechter Hand: Die Übergabe von Köln kann beginnen. */
    'city.offerAccepted': Record<string, never>;
    'city.switched': { from: string; to: string };
    'city.unlocked': { cityId: string };
    /** Tageszusammenfassung einer schlafenden Stadt (gebucht als income.city bzw. expense.city). */
    'city.slept': { cityId: string; day: number; amount: number };
    /** Du fährst los (unterwegs bist du in keiner Stadt). */
    'city.travelStarted': { from: string; to: string; arrivesAt: number };
    /** Du bist in einer Stadt angekommen; first beim ersten Mal. */
    'city.arrived': { cityId: string; first?: boolean };
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

export function offerStatus(state: GameState): OfferStatus {
  return state.modules.city.offer.status;
}

/** Was fehlt, damit du Köln deiner Rechten Hand übergeben und nach Hamburg gehen kannst (leer = nichts). */
export function hamburgMissing(state: GameState): string[] {
  return fullPowerMissing(state, 'koeln');
}

// ---------------------------------------------------------------------------------------------
// Schreiben

const OPTIONS = {
  come: { id: 'come', label: 'Ich komme nach Hamburg', reply: 'Ich komme nach Hamburg.' },
  later: { id: 'later', label: 'Ich brauch noch Zeit', reply: 'Ich brauch noch Zeit.' },
  stay: { id: 'stay', label: 'Köln reicht mir', reply: 'Köln reicht mir.' },
  comeAfterAll: { id: 'come', label: 'Ich komme doch nach Hamburg', reply: 'Ich komme doch nach Hamburg.' },
} as const;

function option(key: keyof typeof OPTIONS, choice: OfferChoice) {
  return { ...OPTIONS[key], command: { type: 'city.answerOffer' as const, payload: { choice } } };
}

function tell(ctx: Ctx, text: string, withOptions?: 'all' | 'comeOnly'): void {
  const options =
    withOptions === 'all'
      ? [option('come', 'come'), option('later', 'later'), option('stay', 'stay')]
      : withOptions === 'comeOnly'
        ? [option('comeAfterAll', 'come')]
        : undefined;
  messages.send(ctx, { contact: HARBOR_CALLER, text, ...(options ? { options } : {}) });
}

/** Offene Fragen von Fiete erledigen sich, sobald eine Antwort gefallen ist (egal in welchem Chat-Eintrag). */
function retractOpenQuestions(ctx: Ctx): void {
  messages.retractWhere(ctx, (m) => m.contactId === HARBOR_CALLER.id);
}

function placeCall(ctx: Ctx): void {
  const offer = ctx.state.modules.city.offer;
  offer.status = 'calling';
  offer.callAt = null;
  messages.call(ctx, {
    contact: HARBOR_CALLER,
    lines: [...OFFER_LINES],
    options: [option('come', 'come'), option('later', 'later'), option('stay', 'stay')],
    summary: OFFER_TEXTS.summary,
    missedText: OFFER_TEXTS.missed,
    gaveUpText: OFFER_TEXTS.gaveUp,
  });
  journal.add(ctx, 'Anruf aus dem Hamburger Hafen.', 'info');
}

export function answerOffer(ctx: Ctx, choice: OfferChoice): CommandResult {
  const offer = ctx.state.modules.city.offer;
  if (offer.status === 'none' || offer.status === 'scheduled') return { ok: false, reason: 'Es gibt kein Angebot.' };
  if (offer.status === 'accepted') return { ok: true };
  retractOpenQuestions(ctx);
  const ready = choice === 'come' && hamburgMissing(ctx.state).length === 0;
  ctx.emit('city.offerAnswered', { choice, ready });
  if (choice === 'come') {
    if (ready) {
      offer.status = 'accepted';
      offer.remindAt = null;
      askHandover(ctx);
      journal.add(ctx, 'Du hast Fiete zugesagt: Hamburg. Jetzt Köln übergeben.', 'good');
      ctx.emit('city.offerAccepted', {});
    } else {
      offer.status = 'house';
      offer.remindAt = null;
      tell(ctx, OFFER_TEXTS.notReady);
      tell(
        ctx,
        `Was mir fehlt:\n${hamburgMissing(ctx.state)
          .map((line) => `– ${line}`)
          .join('\n')}`,
      );
    }
  } else if (choice === 'later') {
    offer.status = 'later';
    offer.remindAt = ctx.now + OFFER_REMINDER_DAYS * MINUTES_PER_DAY;
    tell(ctx, OFFER_TEXTS.later);
  } else {
    offer.status = 'declined';
    offer.remindAt = null;
    tell(ctx, OFFER_TEXTS.stay, 'comeOnly');
  }
  return { ok: true };
}

/** Name der Rechten Hand in einer Stadt (für Fietes Sätze). */
function rightHandName(state: GameState, cityId: string): string {
  const rh = getRightHand(state, cityId);
  return (rh && getStaffMember(state, rh.staffId)?.name) || 'Deine Rechte Hand';
}

/** Nach der Zusage: Fiete fragt (noch im Gespräch), ob du Köln jetzt übergibst. */
function askHandover(ctx: Ctx): void {
  const name = rightHandName(ctx.state, FIRST_CITY);
  messages.send(ctx, { contact: HARBOR_CALLER, text: OFFER_TEXTS.ready });
  messages.send(ctx, { contact: HARBOR_CALLER, text: OFFER_TEXTS.handoverDeal.replaceAll('{name}', name) });
  messages.send(ctx, {
    contact: HARBOR_CALLER,
    text: OFFER_TEXTS.handoverAsk,
    options: [
      {
        id: HANDOVER_NOW,
        label: `Köln an ${name} übergeben und losfahren`,
        reply: `${name} übernimmt Köln. Ich fahr los.`,
        command: { type: 'city.handOver', payload: { cityId: FIRST_CITY } },
      },
      { id: HANDOVER_LATER, label: 'Ich regel vorher noch was', reply: 'Ich regel vorher noch was in Köln.' },
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
  if (getTrips(state).some((t) => t.driverId === null)) return 'Du bist gerade mit dem Transporter unterwegs.';
  return null;
}

/**
 * Stadt an die Rechte Hand übergeben und in die nächste fahren, in einem Rutsch (aus Fietes Frage). Erst prüfen, ob du
 * überhaupt losfahren kannst, damit die Übergabe nicht ohne Fahrt passiert.
 */
export function handOver(ctx: Ctx, cityId: string): CommandResult {
  const next = NEXT_CITY[cityId];
  if (!next) return { ok: false, reason: `Aus ${cityName(cityId)} geht es noch nicht weiter.` };
  const blocked = travelBlocker(ctx.state);
  if (blocked) return { ok: false, reason: blocked };
  const granted = ctx.dispatch({ type: 'hierarchy.grantFullPower', payload: { cityId } }, { actor: 'player' });
  if (!granted.ok) return granted;
  // Das Ereignis der Übergabe kommt erst nach diesem Befehl an; die Stadt muss aber jetzt frei sein, um loszufahren.
  unlockCity(ctx, next);
  if (ctx.state.modules.city.present !== next) {
    const travel = travelTo(ctx, next);
    if (!travel.ok) return travel;
  }
  messages.send(ctx, { contact: HARBOR_CALLER, text: OFFER_TEXTS.handoverDone });
  return { ok: true };
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
  journal.add(ctx, `Du fährst über die A1 nach ${def.name}. Ankunft in ca. ${clock.formatDuration(minutes)}.`, 'info');
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
    for (const text of WELCOME_TEXTS[travel.to] ?? []) {
      messages.send(ctx, { contact: HARBOR_CALLER, text, silent: true });
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
        rec.results.push(Math.round(profit));
        if (rec.results.length > SLEEP_AVERAGE_DAYS) rec.results.splice(0, rec.results.length - SLEEP_AVERAGE_DAYS);
      }
    }
    rec.liveToday = c.active === cityId;
  }
}

function sleepSummary(ctx: Ctx, cityId: string, day: number, rec: CitySleep): void {
  const name = cityName(cityId);
  const average = rec.results.length > 0 ? rec.results.reduce((a, b) => a + b, 0) / rec.results.length : 0;
  const factor = SLEEP_FACTOR_MIN + ctx.random() * (SLEEP_FACTOR_MAX - SLEEP_FACTOR_MIN);
  let amount = Math.round(average * factor);
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
        ? `${name} im Hintergrund: Tag ${day} brachte ${formatEuro(amount)}.`
        : `${name} im Hintergrund: Tag ${day} kostete ${formatEuro(-amount)}.`,
      amount > 0 ? 'good' : 'bad',
    );
  }
  ctx.emit('city.slept', { cityId, day, amount });
}

/** Köln komplett: Er ruft OFFER_CALL_DELAY Spielminuten später an (einmal). */
function schedule(ctx: Ctx): void {
  const offer = ctx.state.modules.city.offer;
  if (offer.status !== 'none') return;
  offer.status = 'scheduled';
  offer.callAt = ctx.now + OFFER_CALL_DELAY;
}

function tick(ctx: Ctx): void {
  const state = ctx.state;
  if (ctx.now > 0 && ctx.now % MINUTES_PER_DAY === 0) closeSleepers(ctx);
  if (ctx.now % MINUTES_PER_DAY === LIVE_CLOSE_MINUTE) closeLiveDay(ctx);
  const travel = state.modules.city.travel;
  if (travel && ctx.now >= travel.arrivesAt) arrive(ctx);
  const offer = state.modules.city.offer;
  // Alte Spielstände, die Köln schon komplett haben (ohne das Ereignis), kommen auch dran.
  if (offer.status === 'none' && campaignProgress(state, 'koeln').complete) schedule(ctx);
  if (offer.status === 'scheduled' && offer.callAt !== null && ctx.now >= offer.callAt) {
    // Nicht mitten in eine Konfrontation hinein: dann danach.
    if (activeEncounters(state).length === 0) placeCall(ctx);
  }
  if (offer.status === 'house' && clock.minute(ctx.now) === 0 && hamburgMissing(state).length === 0) {
    tell(ctx, OFFER_TEXTS.houseReady);
    offer.status = 'scheduled';
    offer.callAt = ctx.now + OFFER_CALL_DELAY;
  }
  if (offer.status === 'later' && offer.remindAt !== null && ctx.now >= offer.remindAt) {
    retractOpenQuestions(ctx);
    tell(ctx, OFFER_TEXTS.reminder, 'all');
    offer.remindAt = ctx.now + OFFER_REMINDER_DAYS * MINUTES_PER_DAY;
  }
}

function initialState(): CityState {
  return {
    offer: { status: 'none', callAt: null, remindAt: null },
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
  version: 3,
  dependsOn: ['territory', 'hierarchy'],
  init: () => initialState(),
  tickEvery: 5,
  tick,
  commands: {
    'city.answerOffer': (ctx, { choice }) => answerOffer(ctx, choice),
    'city.handOver': (ctx, payload, meta) => playerOnly(meta) ?? handOver(ctx, payload?.cityId ?? FIRST_CITY),
    'city.switch': (ctx, { cityId }, meta) => playerOnly(meta) ?? switchCity(ctx, cityId),
    'city.unlock': (ctx, { cityId }, meta) =>
      meta.actor === 'system' ? unlockCity(ctx, cityId) : { ok: false, reason: 'Städte werden im Spiel frei.' },
    'city.travel': (ctx, { cityId }, meta) => playerOnly(meta) ?? travelTo(ctx, cityId),
  },
  on: {
    'campaign.won': (ctx, { cityId }) => {
      if ((cityId ?? FIRST_CITY) === FIRST_CITY) schedule(ctx);
    },
    // Übergabe an die Rechte Hand: Die nächste Stadt wird frei (Köln → Hamburg).
    'hierarchy.fullPowerGranted': (ctx, { cityId }) => {
      const next = NEXT_CITY[cityId];
      if (next) unlockCity(ctx, next);
      // Übergeben (auch über den Dialog): Fietes Frage danach hat sich erledigt.
      retractOpenQuestions(ctx);
    },
    // "Ich regel vorher noch was": Fiete gibt dir Zeit.
    'message.answered': (ctx, { contactId, optionId }) => {
      if (contactId === HARBOR_CALLER.id && optionId === HANDOVER_LATER) tell(ctx, OFFER_TEXTS.handoverLater);
    },
  },
  migrations: {
    // Version 2 (Etappe 4): aktive Stadt, Aufenthalt, freigeschaltete Städte, Schlafmodus. Alles bisher war Köln.
    2: (old: CityStateV1): CityStateV2 => {
      const { visited: _, ...fresh } = initialState();
      return { ...fresh, offer: old.offer };
    },
    // Version 3 (Etappe 5): besuchte Städte. Wer schon irgendwo war, war dort.
    3: (old: CityStateV2): CityState => ({ ...old, visited: [...new Set([FIRST_CITY, old.present])] }),
  },
});
