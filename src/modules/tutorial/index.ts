// Tutorial (Auftrag 46b): In welcher Stufe der Spieler ist (0 bis 12, Auftrag 46 „Der Flow“), welche Mission läuft,
// was freigeschaltet ist. Die Touren (Peters Erklärungen Schritt für Schritt) kommen mit 46c über den Tour-Baukasten;
// dieses Modul ruft keine Tour auf.
//
// Das Tutorial startet nur über den Befehl 'tutorial.start', den die Oberfläche direkt nach einem neuen Spiel im Modus
// normal schickt (src/ui/start.tsx mit ?neu=normal&tutorial=1, Dialog „Neues Spiel“). Bot, Szenario-Tests,
// Test-Spielstände, npm run balance und Hardcore laufen ohne (enabled: false): Dann ist alles frei und keine
// Würfelfolge verschiebt sich. Alte Spielstände bekommen den Anfangszustand (enabled: false).
//
// Stufen ohne Mission (0, 3, 4, 10) sind Erklär-Stufen: Sie enden mit 'tutorial.advance' aus der Oberfläche. Eine
// erledigte Mission zahlt die Belohnung (reward.ts) und schaltet von selbst eine Stufe weiter. Die letzte Stufe (12)
// gibt alles frei (tutorialActive ist dann falsch), ihre Mission „Köln komplett“ läuft noch.
//
// Öffentliche API (lesen):
//   tutorialEnabled(state), tutorialActive(state) (enabled und Stufe < 12), tutorialStage(state), tutorialFinished(state),
//   tutorialAllows(state, feature) (immer wahr, wenn nicht aktiv), tutorialAllowsRole(state, role),
//   tutorialSpotOpen(state, spotId), tutorialSpotCost(state, spotId), tutorialSupplierOpen(state, supplierId),
//   currentMission(state), missionProgress(state), missionReward(state), scriptedDone(state, key), stageInfo(stage),
//   STAGES, MISSIONS, FEATURE_STAGE, PETER, LAST_STAGE
// Befehle: 'tutorial.start', 'tutorial.advance', 'tutorial.skip', 'tutorial.scripted', 'tutorial.tourSeen'
// Ereignisse: 'tutorial.stageReached', 'tutorial.missionStarted', 'tutorial.missionDone', 'tutorial.scriptedMoment'
//
// Auftrag 46c: Die Touren je Stufe und die Pop-ups leben in ui/ (tours.ts); die geskripteten Momente (Handy-Bestellung,
// Lager fast leer, erster Gang-Angriff) prüft scripted.ts jede Spielminute, die Beschlagnahme meldet suppliers mit
// 'tutorial.scripted'. Welche Tour schon lief, steht im Zustand (toursSeen), damit sie nach dem Laden nicht noch einmal
// kommt bzw. nachgeholt wird, wenn sie fehlte.

import {
  type CommandResult,
  type Ctx,
  defineModule,
  distanceMeters,
  formatEuro,
  type GameCommands,
  type GameEvents,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { getWarehouses, productName, storeFitting } from '../goods';
import { getSpot, getSpots, isSpotActive, spotCity } from '../spots';
import { controlledBy, PLAYER_FACTION } from '../territory';
import { neighborsOf } from '../veedel';
import {
  EVENT_FEATURES,
  FEATURE_STAGE,
  LAST_STAGE,
  PETER,
  REWARD,
  ROLE_FEATURE,
  SPOTS_ALL_STAGE,
  SPOTS_NEARBY_METERS,
  SPOTS_NEARBY_STAGE,
  STAGES,
  type StageDef,
  SUPPLIER_STAGE,
  TUTORIAL_CHECK_EVERY,
  TUTORIAL_SPOT_COST,
  TUTORIAL_STAGE2_SPOTS,
  TUTORIAL_START_MONEY,
  TUTORIAL_START_SPOT,
  type TutorialFeature,
} from './config';
import { MISSIONS, type MissionDef, type MissionState, missionById, missionForStage } from './missions';
import { type MissionReward, missionReward, recentSales, type SaleRecord } from './reward';
import { runScriptedMoments } from './scripted';

export {
  FEATURE_STAGE,
  LAST_STAGE,
  LOW_STOCK_POPUP,
  PETER,
  SCRIPTED_FIRST_ATTACK,
  SCRIPTED_PHONE_ORDER,
  SCRIPTED_SEIZURE,
  STAGES,
  type StageDef,
  TUTORIAL_SPOT_COST,
  TUTORIAL_START_MONEY,
  TUTORIAL_START_SPOT,
  type TutorialFeature,
} from './config';
export {
  MISSIONS,
  type MissionDef,
  type MissionGoTo,
  type MissionPart,
  type MissionState,
  missionById,
  missionForStage,
} from './missions';
export { type MissionReward, missionReward, rewardGoods, rewardMoney } from './reward';

/** Geskriptete Momente (46c: scripted.ts bzw. 'tutorial.scripted' aus suppliers, jeder genau einmal). */
export type ScriptedKey = 'firstAttack' | 'seizure' | 'phoneOrder' | 'lowStockPopup';

/** Touren außerhalb der Stufen (Auftrag 46c): nach der ersten Lieferung, nach dem ersten Fahrer. */
export type ExtraTour = 'delivery' | 'driver';

export interface TutorialState {
  /** false: alles frei (Hardcore, alte Stände, Bot, andere Städte). */
  enabled: boolean;
  /** 0 bis 12, siehe Flow in Auftrag 46. */
  stage: number;
  /** Laufende Mission und ihr Fortschritt, wie bei den Quests. */
  mission: MissionState | null;
  done: string[];
  /** Beendet über 'tutorial.skip': alles frei, keine Mission mehr. */
  skipped: boolean;
  /** Spots, die beim Start gesperrt wurden (sonst von Anfang an offen); skip öffnet sie wieder. */
  lockedAtStart: string[];
  /** Geskriptete Momente, jeder genau einmal; lowStockDay: Spieltag des letzten Pop-ups (höchstens eins pro Tag). */
  scripted: {
    firstAttack: boolean;
    seizure: boolean;
    phoneOrder: boolean;
    lowStockPopups: number;
    lowStockDay: number;
  };
  /** Stufen, deren Tour schon gelaufen ist (Auftrag 46c); beim Laden holt die Oberfläche die fehlende nach. */
  toursSeen: number[];
  /** Touren außerhalb der Stufen, die schon gelaufen sind (Auftrag 46c). */
  extraToursSeen: ExtraTour[];
  /** Features, die ein Ereignis freigeschaltet hat (Ruf beim ersten Stammkunden, Rang beim ersten Aufstieg). */
  unlocked: TutorialFeature[];
  /** Verkäufe der letzten 24 Stunden für die Belohnung (nur solange das Tutorial läuft). */
  sales: SaleRecord[];
}

declare module '../../core' {
  interface ModuleStates {
    tutorial: TutorialState;
  }
  interface GameCommands {
    /** Tutorial am Spielbeginn einschalten (nur die Oberfläche, Modus normal). */
    'tutorial.start': Record<string, never>;
    /** Eine Stufe weiter (nur, wenn die Mission der Stufe erledigt ist oder die Stufe keine hat). */
    'tutorial.advance': Record<string, never>;
    /** Tutorial beenden: alles frei, Stufe 12 (Einstellungen › Einstieg, Entwicklung). */
    'tutorial.skip': Record<string, never>;
    /** Einen geskripteten Moment als erledigt markieren (46c; suppliers meldet so die Beschlagnahme). */
    'tutorial.scripted': { key: ScriptedKey };
    /** Eine Tour ist durch (46c, aus der Oberfläche): die einer Stufe oder eine der weiteren. */
    'tutorial.tourSeen': { stage?: number; extra?: ExtraTour };
  }
  interface GameEvents {
    'tutorial.stageReached': { stage: number };
    'tutorial.missionStarted': { id: string };
    'tutorial.missionDone': { id: string; reward: MissionReward };
    /** Ein geskripteter Moment ist passiert (46c); ref: Kontakt der Bestellung bzw. die Gang. */
    'tutorial.scriptedMoment': { key: ScriptedKey; ref?: string };
  }
}

const CITY = 'koeln';

// ---------------------------------------------------------------------------------------------
// Lesen

export function tutorialEnabled(state: GameState): boolean {
  return state.modules.tutorial?.enabled === true;
}

export function tutorialStage(state: GameState): number {
  return tutorialEnabled(state) ? state.modules.tutorial.stage : LAST_STAGE;
}

/** Läuft das Tutorial und hält noch etwas zurück? Ab Stufe 12 ist alles frei. */
export function tutorialActive(state: GameState): boolean {
  return tutorialEnabled(state) && state.modules.tutorial.stage < LAST_STAGE;
}

/** Alles durch (letzte Mission erledigt) oder beendet. */
export function tutorialFinished(state: GameState): boolean {
  const t = state.modules.tutorial;
  return !!t && (t.skipped || t.done.includes('koelnDone'));
}

/** Darf das Feature gerade benutzt werden? Ohne aktives Tutorial immer. */
export function tutorialAllows(state: GameState, feature: TutorialFeature): boolean {
  if (!tutorialActive(state)) return true;
  const t = state.modules.tutorial;
  if (t.unlocked.includes(feature)) return true;
  return t.stage >= FEATURE_STAGE[feature];
}

/** Darf diese Rolle gerade angeboten werden (Anheuern, Bewerber, Rumfragen)? Läufer immer. */
export function tutorialAllowsRole(state: GameState, role: string): boolean {
  const feature = ROLE_FEATURE[role];
  return !feature || tutorialAllows(state, feature);
}

/** Eigene Veedel in Köln plus die Veedel der eigenen Spots. */
function ownVeedel(state: GameState): Set<string> {
  const own = new Set(controlledBy(state, PLAYER_FACTION));
  for (const spot of getSpots(state, CITY)) own.add(spot.veedelId);
  return own;
}

/** Stufe 6: im eigenen Veedel oder einem Nachbarveedel, sonst Luftlinie unter SPOTS_NEARBY_METERS zu einem eigenen Spot. */
function isNearby(state: GameState, spot: { veedelId: string; lng: number; lat: number }): boolean {
  const own = ownVeedel(state);
  if (own.has(spot.veedelId)) return true;
  for (const id of own) if (neighborsOf(id).includes(spot.veedelId)) return true;
  return getSpots(state, CITY).some((s) => distanceMeters(s, spot) < SPOTS_NEARBY_METERS);
}

/** Darf der Spot angeboten werden (grau auf der Karte, freischaltbar)? Offene und eigene immer. */
export function tutorialSpotOpen(state: GameState, spotId: string): boolean {
  if (!tutorialActive(state)) return true;
  const spot = getSpot(state, spotId);
  if (!spot || spot.custom || spotCity(spot) !== CITY || isSpotActive(state, spotId)) return true;
  const stage = state.modules.tutorial.stage;
  if (stage >= SPOTS_ALL_STAGE) return true;
  if (stage >= SPOTS_NEARBY_STAGE) return isNearby(state, spot);
  if (stage >= 2) return TUTORIAL_STAGE2_SPOTS.includes(spotId);
  return spotId === TUTORIAL_START_SPOT;
}

/**
 * Preis fürs Freischalten im Tutorial, sonst null: ab Stufe 2 je 350 € für Zülpicher Platz und Rudolfplatz und für
 * die Spots, die beim Start gesperrt wurden (sonst wären sie gratis).
 */
export function tutorialSpotCost(state: GameState, spotId: string): number | null {
  if (!tutorialActive(state) || state.modules.tutorial.stage < 2) return null;
  const t = state.modules.tutorial;
  return TUTORIAL_STAGE2_SPOTS.includes(spotId) || t.lockedAtStart.includes(spotId) ? TUTORIAL_SPOT_COST : null;
}

/** Gibt es den Lieferanten schon (Kalle und Toni ab 5, Hein ab 6, alle anderen wie heute über ihre Bedingungen)? */
export function tutorialSupplierOpen(state: GameState, supplierId: string): boolean {
  if (!tutorialActive(state)) return true;
  const stage = SUPPLIER_STAGE[supplierId];
  return stage === undefined || state.modules.tutorial.stage >= stage;
}

export function currentMission(state: GameState): MissionDef | null {
  const id = state.modules.tutorial?.mission?.id;
  return id ? (missionById(id) ?? null) : null;
}

export interface PartProgress {
  id: string;
  label: string;
  value: number;
  target: number;
  euro: boolean;
  done: boolean;
}

/** Teilziele der laufenden Mission mit Stand. Ohne Mission leer. */
export function missionProgress(state: GameState): { parts: PartProgress[]; done: boolean } {
  const mission = state.modules.tutorial?.mission;
  const def = currentMission(state);
  if (!mission || !def) return { parts: [], done: false };
  const parts = def.parts.map((part) => {
    let value = part.measure ? part.measure(state) : mission.progress;
    if (part.once && mission.reached.includes(part.id)) value = Math.max(value, part.target);
    value = Math.min(part.target, Math.max(0, value));
    return {
      id: part.id,
      label: part.label,
      value,
      target: part.target,
      euro: !!part.euro,
      done: value >= part.target,
    };
  });
  return { parts, done: parts.every((p) => p.done) };
}

/** Ist der geskriptete Moment schon vorbei (bzw. wie oft, beim Lager-Pop-up)? */
export function scriptedDone(state: GameState, key: ScriptedKey): boolean {
  const s = state.modules.tutorial?.scripted;
  if (!s) return true;
  return key === 'lowStockPopup' ? s.lowStockPopups > 0 : s[key];
}

/** Lief die Tour dieser Stufe schon (Auftrag 46c)? Ohne Tutorial immer. */
export function tourSeen(state: GameState, stage: number): boolean {
  const t = state.modules.tutorial;
  return !t?.enabled || t.toursSeen.includes(stage);
}

/** Lief eine der weiteren Touren schon (Auftrag 46c)? */
export function extraTourSeen(state: GameState, extra: ExtraTour): boolean {
  const t = state.modules.tutorial;
  return !t?.enabled || t.extraToursSeen.includes(extra);
}

export function stageInfo(stage: number): StageDef {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))];
}

/** Kurzer Text einer Belohnung, z.B. "+ 450 € · + 35 g Haze". */
export function rewardText(reward: MissionReward): string {
  return `+ ${formatEuro(reward.money)} · + ${reward.amount} g ${productName(reward.productId)}`;
}

// ---------------------------------------------------------------------------------------------
// Schreiben

function startMissionFor(ctx: Ctx): void {
  const t = ctx.state.modules.tutorial;
  const def = missionForStage(t.stage);
  if (!def || t.skipped || t.done.includes(def.id) || t.mission?.id === def.id) return;
  t.mission = { id: def.id, progress: 0, startedAt: ctx.now, seen: [], reached: [] };
  // Auftrag 46c: Peter schreibt nicht, was die Tour sagt; die Aufgabe steht auf der Missions-Karte.
  ctx.emit('tutorial.missionStarted', { id: def.id });
}

/** Zahlt die Belohnung aus; Ware mit storeFitting in die Kölner Lager, was nicht passt, sagt Peter. */
function grant(ctx: Ctx, reward: MissionReward): string {
  wallet.earn(ctx, reward.money, 'dirty', 'Belohnung von Peter', 'income.other');
  let rest = reward.amount;
  for (const warehouse of getWarehouses(ctx.state, CITY)) {
    if (rest <= 0) break;
    rest = storeFitting(ctx, { warehouseId: warehouse.id, productId: reward.productId, amount: rest }).rest;
  }
  const stored = reward.amount - rest;
  const product = productName(reward.productId);
  if (rest > 0) {
    messages.send(ctx, {
      contact: PETER,
      text: `Für ${rest} g ${product} war kein Platz mehr in deinem Lager, die hab ich anderweitig losgeschlagen. Bau dein Lager aus.`,
    });
  }
  return `${formatEuro(reward.money)}${stored > 0 ? ` und ${stored} g ${product}` : ''}`;
}

function finish(ctx: Ctx, def: MissionDef): void {
  const t = ctx.state.modules.tutorial;
  const reward = missionReward(ctx.state);
  t.done.push(def.id);
  t.mission = null;
  const got = grant(ctx, reward);
  journal.add(ctx, `Mission erledigt: ${def.title}. Belohnung: ${got}.`, 'good');
  // Auftrag 46c: die Belohnung als eine Zeile im Chat von Peter.
  messages.send(ctx, { contact: PETER, text: `${def.doneText} Dafür gibt's von mir: ${got}.` });
  ctx.emit('tutorial.missionDone', { id: def.id, reward });
  // Die nächste Stufe kommt von selbst (ihre Tour zeigt 46c beim Ereignis stageReached).
  if (t.stage === def.stage && t.stage < LAST_STAGE) advanceTo(ctx, t.stage + 1);
}

/** Erfüllt? Dann abschließen. Einmal erreichte Teilziele (once) merken. */
function check(ctx: Ctx): void {
  const t = ctx.state.modules.tutorial;
  const def = currentMission(ctx.state);
  if (!t.mission || !def) return;
  for (const part of def.parts) {
    if (part.once && part.measure && !t.mission.reached.includes(part.id) && part.measure(ctx.state) >= part.target) {
      t.mission.reached.push(part.id);
    }
  }
  if (missionProgress(ctx.state).done) finish(ctx, def);
}

function advanceTo(ctx: Ctx, stage: number): void {
  const t = ctx.state.modules.tutorial;
  t.stage = stage;
  journal.add(ctx, `Tutorial: ${stageInfo(stage).title}.`, 'info');
  ctx.emit('tutorial.stageReached', { stage });
  startMissionFor(ctx);
  check(ctx);
}

function start(ctx: Ctx): CommandResult {
  const t = ctx.state.modules.tutorial;
  if (t.enabled) return { ok: false, reason: 'Das Tutorial läuft schon.' };
  t.enabled = true;
  t.stage = 0;
  t.mission = null;
  t.skipped = false;
  wallet.earn(ctx, TUTORIAL_START_MONEY, 'dirty', 'Startgeld', 'income.other');
  // Nur der Neumarkt bleibt offen; die anderen kommen ab Stufe 2 für 350 € wieder (Zülpicher Platz und Rudolfplatz
  // gleich, der Rest mit der Nachbarschaft in Stufe 6).
  t.lockedAtStart = [];
  for (const spot of getSpots(ctx.state, CITY)) {
    if (spot.id === TUTORIAL_START_SPOT || spot.custom) continue;
    if (ctx.dispatch({ type: 'spots.lock', payload: { spotId: spot.id } }, { actor: 'system' }).ok) {
      t.lockedAtStart.push(spot.id);
    }
  }
  journal.add(ctx, 'Tutorial gestartet: Peter zeigt dir, wie Köln läuft.', 'info');
  ctx.emit('tutorial.stageReached', { stage: 0 });
  return { ok: true };
}

function advance(ctx: Ctx): CommandResult {
  const t = ctx.state.modules.tutorial;
  if (!t.enabled) return { ok: false, reason: 'Kein Tutorial.' };
  if (t.stage >= LAST_STAGE) return { ok: false, reason: 'Das Tutorial ist durch.' };
  const def = missionForStage(t.stage);
  if (def && !t.done.includes(def.id)) return { ok: false, reason: `Erst die Mission „${def.title}“ erledigen.` };
  advanceTo(ctx, t.stage + 1);
  return { ok: true };
}

function skip(ctx: Ctx): CommandResult {
  const t = ctx.state.modules.tutorial;
  if (!t.enabled) return { ok: false, reason: 'Kein Tutorial.' };
  if (t.skipped) return { ok: false, reason: 'Das Tutorial ist schon beendet.' };
  t.skipped = true;
  t.mission = null;
  t.stage = LAST_STAGE;
  // Keine Tour mehr nachholen (Auftrag 46c).
  t.toursSeen = Array.from({ length: LAST_STAGE + 1 }, (_, i) => i);
  // Die am Anfang gesperrten Spots sind ohne Tutorial offen (ihr Preis ist 0).
  for (const spotId of t.lockedAtStart) {
    if (!isSpotActive(ctx.state, spotId))
      ctx.dispatch({ type: 'spots.unlock', payload: { spotId } }, { actor: 'system' });
  }
  journal.add(ctx, 'Tutorial beendet: Ab jetzt ist alles frei.', 'info');
  ctx.emit('tutorial.stageReached', { stage: LAST_STAGE });
  return { ok: true };
}

function scripted(ctx: Ctx, key: ScriptedKey): CommandResult {
  const s = ctx.state.modules.tutorial.scripted;
  if (key === 'lowStockPopup') s.lowStockPopups += 1;
  else if (key === 'firstAttack' || key === 'seizure' || key === 'phoneOrder') s[key] = true;
  else return { ok: false, reason: 'Unbekannter Moment.' };
  ctx.emit('tutorial.scriptedMoment', { key });
  return { ok: true };
}

/** Eine Tour ist durch (Auftrag 46c): merken, damit sie nach dem Laden nicht noch einmal kommt. */
function tourSeenCommand(ctx: Ctx, payload: GameCommands['tutorial.tourSeen']): CommandResult {
  const t = ctx.state.modules.tutorial;
  if (!t.enabled) return { ok: false, reason: 'Kein Tutorial.' };
  if (payload.stage !== undefined) {
    if (!Number.isInteger(payload.stage) || payload.stage < 0 || payload.stage > LAST_STAGE) {
      return { ok: false, reason: 'Unbekannte Stufe.' };
    }
    if (!t.toursSeen.includes(payload.stage)) t.toursSeen.push(payload.stage);
  }
  if (payload.extra !== undefined) {
    if (payload.extra !== 'delivery' && payload.extra !== 'driver') return { ok: false, reason: 'Unbekannte Tour.' };
    if (!t.extraToursSeen.includes(payload.extra)) t.extraToursSeen.push(payload.extra);
  }
  return { ok: true };
}

/** Zähler der laufenden Mission für ein Ereignis. */
function onCounted<K extends keyof GameEvents>(type: K) {
  return (ctx: Ctx, payload: GameEvents[K]) => {
    const t = ctx.state.modules.tutorial;
    if (!t.enabled) return;
    if (type === 'sale.completed') {
      const sale = payload as GameEvents['sale.completed'];
      t.sales.push({ at: ctx.now, revenue: sale.revenue, productId: sale.productId, amount: sale.amount });
    }
    const def = currentMission(ctx.state);
    const counter = def?.count?.[type] as ((p: GameEvents[K], s: GameState) => number | readonly string[]) | undefined;
    if (!t.mission || !counter) return;
    const delta = counter(payload, ctx.state);
    if (typeof delta === 'number') {
      if (!(delta > 0)) return;
      t.mission.progress += delta;
    } else {
      const fresh = delta.filter((key) => !t.mission?.seen.includes(key));
      if (fresh.length === 0) return;
      t.mission.seen.push(...fresh);
      t.mission.progress = t.mission.seen.length;
    }
    check(ctx);
  };
}

/** Ein Ereignis schaltet ein Feature frei (Ruf, Rang). */
function onUnlockEvent(feature: TutorialFeature) {
  return (ctx: Ctx) => {
    const t = ctx.state.modules.tutorial;
    if (t.enabled && !t.unlocked.includes(feature)) t.unlocked.push(feature);
  };
}

const COUNTED = [...new Set(MISSIONS.flatMap((m) => Object.keys(m.count ?? {}) as (keyof GameEvents)[]))];
if (!COUNTED.includes('sale.completed')) COUNTED.push('sale.completed');

/** Nach diesen Ereignissen prüft das Modul die Mission sofort (sonst alle TUTORIAL_CHECK_EVERY Minuten). */
const CHECK_AFTER: readonly (keyof GameEvents)[] = [
  'spots.unlocked',
  'staff.hired',
  'recruiting.hired',
  'territory.controlChanged',
  'laundering.completed',
  'logistics.berthBought',
  'hierarchy.appointed',
  'hierarchy.rightHandAppointed',
  'wallet.changed',
];

function checkNow(ctx: Ctx): void {
  if (ctx.state.modules.tutorial.enabled) check(ctx);
}

/** Anfangszustand (auch für die Migration alter Stände). */
function initialState(): TutorialState {
  return {
    enabled: false,
    stage: 0,
    mission: null,
    done: [],
    skipped: false,
    lockedAtStart: [],
    scripted: { firstAttack: false, seizure: false, phoneOrder: false, lowStockPopups: 0, lowStockDay: -1 },
    unlocked: [],
    sales: [],
    toursSeen: [],
    extraToursSeen: [],
  };
}

/** Zustand der Version 1 (Auftrag 46b), ohne die Felder der Touren. */
type TutorialStateV1 = Omit<TutorialState, 'toursSeen' | 'extraToursSeen' | 'scripted'> & {
  scripted: Omit<TutorialState['scripted'], 'lowStockDay'>;
};

export default defineModule({
  id: 'tutorial',
  version: 2,
  dependsOn: [
    'spots',
    'goods',
    'suppliers',
    'customers',
    'staff',
    'territory',
    'hierarchy',
    'logistics',
    'laundering',
    'gangs',
  ],
  init: () => initialState(),
  // Jede Spielminute: die Momente (scripted.ts); die Mission alle TUTORIAL_CHECK_EVERY Minuten wie bisher.
  tickEvery: 1,
  tick: (ctx) => {
    const t = ctx.state.modules.tutorial;
    if (!t.enabled) return;
    runScriptedMoments(ctx);
    if (Math.floor(ctx.now) % TUTORIAL_CHECK_EVERY !== 0) return;
    // Nur die Verkäufe der letzten 24 Stunden behalten.
    if (t.sales.length > 0 && t.sales[0].at <= ctx.now - REWARD.hours * 60) t.sales = [...recentSales(ctx.state)];
    if (!t.mission) startMissionFor(ctx);
    check(ctx);
  },
  commands: {
    'tutorial.start': (ctx) => start(ctx),
    'tutorial.advance': (ctx) => advance(ctx),
    'tutorial.skip': (ctx) => skip(ctx),
    'tutorial.scripted': (ctx, { key }) => scripted(ctx, key),
    'tutorial.tourSeen': (ctx, payload) => tourSeenCommand(ctx, payload),
  },
  on: {
    ...Object.fromEntries(CHECK_AFTER.map((type) => [type, checkNow])),
    ...Object.fromEntries(COUNTED.map((type) => [type, onCounted(type)])),
    ...Object.fromEntries(
      (Object.entries(EVENT_FEATURES) as [TutorialFeature, keyof GameEvents][]).map(([feature, type]) => [
        type,
        onUnlockEvent(feature),
      ]),
    ),
  },
  migrations: {
    // Auftrag 46c: Touren im Zustand, Tag des letzten Lager-Pop-ups. Ein Stand, der schon lief, hat seine Touren
    // gesehen (sonst kämen beim Laden alle bis zur Stufe auf einmal); ein frischer Stand (enabled: false) nicht.
    2: (old: TutorialStateV1 | undefined): TutorialState => {
      if (!old) return initialState();
      const seen = old.enabled ? Array.from({ length: old.stage + 1 }, (_, i) => i) : [];
      return {
        ...old,
        scripted: { ...old.scripted, lowStockDay: -1 },
        toursSeen: seen,
        extraToursSeen: old.enabled ? ['delivery', 'driver'] : [],
      };
    },
  },
});
