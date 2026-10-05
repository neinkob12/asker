// Stadt-Events (Auftrag 30, Etappe 7): Karneval, FC-Heimspiel und Kölner Lichter in Köln, Hafengeburtstag, Schlagermove
// und Hamburger Dom in Hamburg. Der Kalender steht in config.ts (Spieltage, Wochentage, Uhrzeiten); ob ein Event läuft,
// folgt allein aus der Spielzeit. Der Zustand merkt sich nur, was schon gemeldet ist.
//
// Ein Event wirkt nur in seiner Stadt und dort in seinem Gebiet (Veedel oder Spots). Gemeldet wird nur in der Stadt, die
// live ist (Etappe 4); angekündigt wird einen Tag vorher per Handy in jeder freien Stadt.
//
// Öffentliche API:
//   CITY_EVENTS, getEventDef(id), isEventActive(def, time), eventEnd(def, time), nextEventStart(def, time)
//   activeEvents(state, cityId?)       laufende Events (Standard: alle freien Städte)
//   upcomingEvents(state, cityId, days) nächste Termine
//   eventFactor(state, effect, where)  Faktor für 'demand' | 'heatPerSale' | 'checks' | 'gangRaids' an einem Spot, in
//                                      einem Veedel oder (gangRaids) in einer Stadt
//   raidsAllowed(state, cityId)        false, solange ein Event mit noRaids läuft (Karneval)
//   Marktereignisse (Auftrag 32, ohne Gebiet, MARKET_EVENTS in config.ts): marketEvents(state, cityId?),
//   marketEventFactor(state, productId, cityId) (Faktor auf den Preisindex), getMarketEventDef(id)
// Ereignisse: 'events.started' { eventId, cityId, endsAt }, 'events.ended' { eventId, cityId },
//   'events.marketStarted' { runId, eventId, cityId, productId, factor, endsAt }, 'events.marketEnded' { … }

import {
  type Ctx,
  cityDayDice,
  clock,
  defineModule,
  type GameState,
  journal,
  MINUTES_PER_DAY,
  messages,
} from '../../core';
import { activeCity, citiesUnlocked, cityOfSpot, isBusinessSold, isCityLive } from '../city';
import { allProducts, getProduct } from '../goods';
import { getSpot } from '../spots';
import {
  CITY_EVENTS,
  type CityEventDef,
  EVENT_CONTACTS,
  type EventEffects,
  MARKET_EVENT_CHANCE,
  MARKET_EVENT_DAYS,
  MARKET_EVENTS,
  MAX_MARKET_EVENTS,
  type MarketEventDef,
} from './config';

export {
  CITY_EVENTS,
  type CityEventDef,
  type EventEffects,
  MARKET_EVENTS,
  type MarketEventDef,
} from './config';

/** Ein laufendes Marktereignis (Auftrag 32). */
export interface MarketEventRun {
  id: number;
  eventId: string;
  cityId: string;
  productId: string;
  factor: number;
  startedAt: number;
  endsAt: number;
}

export interface EventsState {
  /** Events, deren Start gemeldet ist (bis zu ihrem echten Ende, auch wenn die Stadt zwischendurch schläft). */
  running: string[];
  /** Zuletzt angekündigter Termin pro Event (Startzeit). */
  announced: Record<string, number>;
  /** Laufende Marktereignisse (Auftrag 32). */
  market: MarketEventRun[];
}

type EventsStateV1 = Omit<EventsState, 'market'>;

declare module '../../core' {
  interface ModuleStates {
    events: EventsState;
  }
  interface GameEvents {
    'events.started': { eventId: string; cityId: string; endsAt: number };
    'events.ended': { eventId: string; cityId: string };
    'events.marketStarted': {
      runId: number;
      eventId: string;
      cityId: string;
      productId: string;
      factor: number;
      endsAt: number;
    };
    'events.marketEnded': { runId: number; eventId: string; cityId: string; productId: string };
  }
}

const HOUR = 60;

// ---------------------------------------------------------------------------------------------
// Kalender

export function getEventDef(id: string): CityEventDef | undefined {
  return CITY_EVENTS.find((e) => e.id === id);
}

/** Start und Ende des Termins, der time enthält, oder null. */
function occurrenceAt(def: CityEventDef, time: number): { start: number; end: number } | null {
  const s = def.schedule;
  const day = clock.day(time);
  if (s.kind === 'cycle') {
    if (day < s.firstDay) return null;
    const startDay = s.firstDay + Math.floor((day - s.firstDay) / s.everyDays) * s.everyDays;
    if (day >= startDay + s.days) return null;
    const start = clock.at(startDay);
    return { start, end: start + s.days * MINUTES_PER_DAY };
  }
  if (clock.weekday(time) !== s.weekday) return null;
  if ((Math.floor((day - 1) / 7) + s.offset) % s.everyWeeks !== 0) return null;
  const start = clock.at(day, s.fromHour);
  const end = clock.at(day, s.toHour);
  return time >= start && time < end ? { start, end } : null;
}

export function isEventActive(def: CityEventDef, time: number): boolean {
  return occurrenceAt(def, time) !== null;
}

/** Ende des laufenden Termins (oder time, wenn keiner läuft). */
export function eventEnd(def: CityEventDef, time: number): number {
  return occurrenceAt(def, time)?.end ?? time;
}

/** Nächster Start nach time (höchstens zwei Zyklen voraus), null wenn keiner kommt. */
export function nextEventStart(def: CityEventDef, time: number): number | null {
  const s = def.schedule;
  if (s.kind === 'cycle') {
    const day = clock.day(time);
    const k = day <= s.firstDay ? 0 : Math.ceil((day - s.firstDay) / s.everyDays);
    const start = clock.at(s.firstDay + k * s.everyDays);
    return start > time ? start : clock.at(s.firstDay + (k + 1) * s.everyDays);
  }
  for (let d = 0; d < 7 * s.everyWeeks + 7; d++) {
    const day = clock.day(time) + d;
    const start = clock.at(day, s.fromHour);
    if (start <= time) continue;
    if (clock.weekday(start) !== s.weekday) continue;
    if ((Math.floor((day - 1) / 7) + s.offset) % s.everyWeeks !== 0) continue;
    return start;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Lesen

/** Laufende Events, in einer Stadt oder in allen freien Städten. */
export function activeEvents(state: GameState, cityId?: string): CityEventDef[] {
  const cities = cityId ? [cityId] : citiesUnlocked(state);
  return CITY_EVENTS.filter((e) => cities.includes(e.cityId) && isEventActive(e, state.time));
}

/** Kommende Termine einer Stadt in den nächsten days Tagen (laufende zuerst). */
export function upcomingEvents(
  state: GameState,
  cityId: string,
  days: number,
): { def: CityEventDef; start: number; end: number; running: boolean }[] {
  const out: { def: CityEventDef; start: number; end: number; running: boolean }[] = [];
  const until = state.time + days * MINUTES_PER_DAY;
  for (const def of CITY_EVENTS) {
    if (def.cityId !== cityId) continue;
    const now = occurrenceAt(def, state.time);
    if (now) out.push({ def, ...now, running: true });
    const next = nextEventStart(def, now ? now.end : state.time);
    if (next !== null && next <= until) {
      const occ = occurrenceAt(def, next);
      if (occ) out.push({ def, ...occ, running: false });
    }
  }
  return out.sort((a, b) => Number(b.running) - Number(a.running) || a.start - b.start);
}

// Laufende Events pro Spielzeit merken: Kunden und Polizei fragen das oft in derselben Minute.
let cacheTime = -1;
let cacheList: CityEventDef[] = [];

function runningAt(time: number): CityEventDef[] {
  if (time !== cacheTime) {
    cacheTime = time;
    cacheList = CITY_EVENTS.filter((e) => isEventActive(e, time));
  }
  return cacheList;
}

function inArea(def: CityEventDef, veedelId: string | undefined, spotId: string | undefined): boolean {
  if (spotId && def.area.spots?.includes(spotId)) return true;
  return !!veedelId && !!def.area.veedel?.includes(veedelId);
}

/**
 * Faktor eines Effekts. Für 'demand' und 'heatPerSale' am Spot (spotId, sonst Veedel), für 'checks' im Veedel (auch
 * durch Spots im Gebiet), für 'gangRaids' in der ganzen Stadt.
 */
export function eventFactor(
  state: GameState,
  effect: 'demand' | 'heatPerSale' | 'checks' | 'gangRaids',
  where: { spotId?: string; veedelId?: string; cityId?: string },
): number {
  const running = runningAt(state.time);
  if (running.length === 0) return 1;
  let factor = 1;
  const veedelId = where.veedelId ?? (where.spotId ? getSpot(state, where.spotId)?.veedelId : undefined);
  for (const def of running) {
    const value = def.effects[effect as keyof EventEffects];
    if (typeof value !== 'number') continue;
    if (effect === 'gangRaids') {
      const cityId = where.cityId ?? (where.spotId ? cityOfSpot(state, where.spotId) : undefined);
      if (cityId === def.cityId) factor *= value;
      continue;
    }
    if (effect === 'checks') {
      // Kontrollen gelten im Veedel, auch wenn das Event nur einzelne Spots dort betrifft.
      const spotsHere = (def.area.spots ?? []).some((id) => getSpot(state, id)?.veedelId === veedelId);
      if (inArea(def, veedelId, where.spotId) || spotsHere) factor *= value;
      continue;
    }
    if (inArea(def, veedelId, where.spotId)) factor *= value;
  }
  return factor;
}

/** Razzien erlaubt? Nicht, solange in der Stadt ein Event mit noRaids läuft (Karneval). */
export function raidsAllowed(state: GameState, cityId: string): boolean {
  return !runningAt(state.time).some((e) => e.cityId === cityId && e.effects.noRaids);
}

// ---------------------------------------------------------------------------------------------
// Marktereignisse (Auftrag 32)

export function getMarketEventDef(id: string): MarketEventDef | undefined {
  return MARKET_EVENTS.find((e) => e.id === id);
}

/** Laufende Marktereignisse, in einer Stadt oder überall. */
export function marketEvents(state: GameState, cityId?: string): readonly MarketEventRun[] {
  const all = state.modules.events.market ?? [];
  return cityId ? all.filter((r) => r.cityId === cityId) : all;
}

/** Faktor der laufenden Marktereignisse auf den Preisindex einer Ware in einer Stadt (1 = keiner). */
export function marketEventFactor(state: GameState, productId: string, cityId: string): number {
  let factor = 1;
  for (const run of state.modules.events.market ?? []) {
    if (run.cityId === cityId && run.productId === productId && run.endsAt > state.time) factor *= run.factor;
  }
  return factor;
}

/** Text eines Marktereignisses mit der Ware. */
export function marketEventText(run: Pick<MarketEventRun, 'eventId' | 'productId'>): string {
  const name = getProduct(run.productId)?.name ?? run.productId;
  return (getMarketEventDef(run.eventId)?.text ?? '').replace('{product}', name);
}

/**
 * Um Mitternacht: Abgelaufene enden, in jeder freien Stadt beginnt mit MARKET_EVENT_CHANCE ein neues (höchstens
 * MAX_MARKET_EVENTS gleichzeitig, nie zweimal dieselbe Ware). Halb und halb: Preise rauf oder runter.
 */
function rollMarketEvents(ctx: Ctx): void {
  const s = ctx.state.modules.events;
  for (const run of s.market.filter((r) => r.endsAt <= ctx.now)) {
    const def = getMarketEventDef(run.eventId);
    if (def && isCityLive(ctx.state, run.cityId))
      journal.add(ctx, `${def.name} ist vorbei, die Preise beruhigen sich.`);
    ctx.emit('events.marketEnded', {
      runId: run.id,
      eventId: run.eventId,
      cityId: run.cityId,
      productId: run.productId,
    });
  }
  s.market = s.market.filter((r) => r.endsAt > ctx.now);
  const day = Math.floor(ctx.now / MINUTES_PER_DAY);
  for (const cityId of citiesUnlocked(ctx.state)) {
    // Würfel pro Stadt und Tag (Auftrag 40): unabhängig davon, welche Städte sonst frei sind.
    const dice = cityDayDice(ctx.state.meta.seed, 'events.market', cityId, day);
    const here = s.market.filter((r) => r.cityId === cityId);
    if (here.length >= MAX_MARKET_EVENTS || !dice.chance(MARKET_EVENT_CHANCE)) continue;
    const up = dice.chance(0.5);
    const known = new Set(allProducts().map((p) => p.id));
    const options = MARKET_EVENTS.filter(
      (d) =>
        d.factor > 1 === up &&
        !here.some((r) => r.eventId === d.id) &&
        d.products.some((p) => known.has(p) && !here.some((r) => r.productId === p)),
    );
    if (options.length === 0) continue;
    const def = dice.pick(options);
    const productId = dice.pick(def.products.filter((p) => known.has(p) && !here.some((r) => r.productId === p)));
    const [min, max] = MARKET_EVENT_DAYS;
    const run: MarketEventRun = {
      id: ctx.nextId(),
      eventId: def.id,
      cityId,
      productId,
      factor: def.factor,
      startedAt: ctx.now,
      endsAt: ctx.now + dice.randomInt(min, max) * MINUTES_PER_DAY,
    };
    s.market.push(run);
    if (isCityLive(ctx.state, cityId)) journal.add(ctx, `${def.name}: ${marketEventText(run)}`, up ? 'good' : 'bad');
    ctx.emit('events.marketStarted', {
      runId: run.id,
      eventId: def.id,
      cityId,
      productId,
      factor: def.factor,
      endsAt: run.endsAt,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Ablauf

function tick(ctx: Ctx): void {
  const s = ctx.state.modules.events;
  if (ctx.now % MINUTES_PER_DAY === 0) rollMarketEvents(ctx);
  const unlocked = citiesUnlocked(ctx.state);
  for (const def of CITY_EVENTS) {
    if (!unlocked.includes(def.cityId)) continue;
    const live = isCityLive(ctx.state, def.cityId);
    const occ = occurrenceAt(def, ctx.now);
    const running = s.running.includes(def.id);
    if (occ && live && !running) {
      s.running.push(def.id);
      journal.add(ctx, `${def.name}: ${def.text}`, 'info');
      ctx.emit('events.started', { eventId: def.id, cityId: def.cityId, endsAt: occ.end });
    } else if (running && !occ) {
      // Nur das echte Ende leert die Liste: Wer die Stadt zwischendurch verlässt und wiederkommt, bekommt den Start
      // nicht noch einmal gemeldet (und die Polizei verschiebt die Razzien nicht noch einmal).
      s.running = s.running.filter((id) => id !== def.id);
      if (live) journal.add(ctx, `${def.name} ist vorbei.`, 'info');
      ctx.emit('events.ended', { eventId: def.id, cityId: def.cityId });
    }
    // Ankündigung einen Tag vorher (Kiosk-Kumpel der Stadt), still am Badge.
    if (!def.announce) continue;
    const next = nextEventStart(def, ctx.now);
    if (next === null || next - ctx.now > MINUTES_PER_DAY || s.announced[def.id] === next) continue;
    s.announced[def.id] = next;
    const contact = EVENT_CONTACTS[def.cityId];
    // Nur aus der Stadt, in der du bist (Auftrag 43), und nicht mehr nach dem Verkauf.
    const here = def.cityId === activeCity(ctx.state) && !isBusinessSold(ctx.state);
    if (contact && here) messages.send(ctx, { contact, text: def.announce, silent: true });
  }
}

export default defineModule({
  id: 'events',
  version: 2,
  dependsOn: ['city', 'spots'],
  init: () => ({ running: [], announced: {}, market: [] }),
  tickEvery: HOUR,
  tick,
  migrations: {
    // Version 2 (Auftrag 32): Marktereignisse.
    2: (old: EventsStateV1): EventsState => ({ ...old, market: [] }),
  },
});
