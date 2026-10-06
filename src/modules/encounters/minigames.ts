// Anschluss der Konfrontationen an die Minispiele (Auftrag 44). Welcher Anlass welches Minispiel startet, steht als
// Daten in kinds.ts (EncounterKind.minigames); hier: starten, warten und die Folgen eines Ergebnisses.
//
// Ein Minispiel startet nur, wenn der Spieler selbst aktiv dabei ist (nicht am Boden) und die Art scharf ist
// (isMinigameReady). Sonst läuft alles wie bisher. Solange es läuft (encounter.minigame), gehen keine Runden;
// 'encounters.auto' und die Frist der Konfrontation lösen es vorher als timeout auf.
//
// Die Folgen je Art: applyChase, applyBrawl, applyTraffic, applyPapers. Die Teile 1, 2, 4 und 8 von Auftrag 44
// verfeinern nur ihre eigene Funktion. Bei der Rechten Hand gilt dasselbe mit ihrem Score (ohne picks). Bei timeout:
// start → die Runden laufen wie bisher; action → die Runde mit dem alten Würfel; brawl → weiter wie bisher.

import { type Ctx, clock, type GameEvents, type GameState, wallet } from '../../core';
import { getWarehouse } from '../goods';
import {
  type Challenge,
  isMinigameReady,
  MINIGAME_KINDS,
  type MinigameKind,
  minigameDifficulty,
  resolveMinigameNow,
  startMinigame,
} from '../minigames';
import { getSpot } from '../spots';
import { getStaffMember } from '../staff';
import { getVeedel } from '../veedel';
import { getWeather } from '../weather';
import { ENCOUNTER_ACTIONS } from './actions';
import { AGGRESSION_FIGHT, BRAWL_AFTER_AGGRESSION, BRAWL_DOWN_RESOLVE, PROTECT_FACTOR } from './config';
import {
  fillText,
  finish,
  getKind,
  logRound,
  loseGoods,
  lossCategory,
  playerActive,
  playRound,
  requestCity,
  resolveAction,
  roll,
  roundOutcome,
  settingOf,
  textVars,
} from './engine';
import { ENCOUNTER_INTENTS } from './intents';
import { applyShift, damageStake, edgeOf, foesIn, removeFoe, rollIntent } from './tactics';
import type { Encounter, EncounterKind, EncounterMinigame, GaugeShift, Participant } from './types';

/** Situation in der Einleitung, wenn ein Minispiel mitten in der Konfrontation kommt (Platzhalter wie in kinds.ts). */
const MID_SITUATIONS: Partial<Record<MinigameKind, string>> = {
  chase: 'Du trittst aufs Gas {place}. Im Rückspiegel geht das Blaulicht an.',
  brawl: 'Die Fäuste fliegen {place}. {opponent} gegen {us}.',
};

/** Ergebnis eines Minispiels, wie es die Folgen brauchen (picks leer bei der Rechten Hand). */
export interface MinigameResult {
  score: number;
  won: boolean;
  picks: readonly string[];
  by: 'player' | 'rightHand';
}

// ---------------------------------------------------------------------------------------------
// Starten

/** Wo es spielt, als [lng, lat]: Spot, Lager oder Mitte des Veedels (für Kamera und Bühne). */
function startPoint(state: GameState, encounter: Encounter): [number, number] | null {
  const r = encounter.request;
  const spot = r.spotId ? getSpot(state, r.spotId) : undefined;
  if (spot) return [spot.lng, spot.lat];
  const warehouse = r.warehouseId ? getWarehouse(state, r.warehouseId) : undefined;
  if (warehouse) return [warehouse.lng, warehouse.lat];
  const veedel = r.veedelId ? getVeedel(r.veedelId) : undefined;
  return veedel ? [veedel.center.lng, veedel.center.lat] : null;
}

function crewInfo(state: GameState, p: Participant) {
  return {
    id: p.id,
    name: p.name,
    stats: { ...p.stats },
    condition: p.condition,
    move: p.move ?? null,
    // Gesicht wie überall: personLook(name, age) aus dem Kern.
    age: getStaffMember(state, p.id)?.age ?? null,
  };
}

/**
 * Was die Oberfläche über die Konfrontation wissen muss (nur JSON). Die Teile von Auftrag 44 dürfen ergänzen.
 *   start [lng, lat], setting, phase (Tageszeit), weather, opponent, intent, crew, player, stakes, bribeCost, clock
 */
export function minigameParams(state: GameState, encounter: Encounter): Record<string, unknown> {
  const intent = encounter.intent ? ENCOUNTER_INTENTS[encounter.intent] : undefined;
  const player = encounter.participants.find((p) => p.isPlayer);
  return {
    encounterKind: encounter.kind,
    start: startPoint(state, encounter),
    setting: settingOf(encounter.request),
    phase: clock.dayPhase(state.time),
    weather: state.modules.weather ? getWeather(state).kind : 'clear',
    place: encounter.place,
    opponent: {
      label: encounter.opponent.label,
      strength: encounter.opponent.strength,
      count: encounter.opponent.count,
      roles: encounter.foes.filter((f) => f.state === 'in').map((f) => f.role),
    },
    intent: intent ? { id: encounter.intent, label: intent.label, stake: intent.stake ?? null } : null,
    crew: encounter.participants.filter((p) => !p.isPlayer).map((p) => crewInfo(state, p)),
    player: player ? { stats: { ...player.stats }, condition: player.condition } : null,
    stakes: {
      ids: encounter.stakes.map((s) => s.id),
      money: encounter.request.stakes?.money ?? 0,
      goods: encounter.request.stakes?.goods ?? 0,
    },
    bribeCost: encounter.bribeCost,
    clock: encounter.clock,
  };
}

/** Welches Minispiel der Anlass für diesen Auslöser hat (oder keins). */
function minigameFor(
  kind: EncounterKind | undefined,
  trigger: EncounterMinigame['trigger'],
  actionId?: string,
): MinigameKind | undefined {
  const def = kind?.minigames;
  if (!def) return undefined;
  if (trigger === 'start') return def.start;
  if (trigger === 'brawl') return def.brawl;
  return actionId ? def.actions?.[actionId] : undefined;
}

/**
 * Startet das Minispiel des Anlasses für diesen Auslöser, wenn der Spieler selbst aktiv dabei ist und die Art scharf
 * ist. true = es läuft, die Konfrontation wartet (encounter.minigame). Sonst false, und alles bleibt wie bisher.
 */
export function maybeStartMinigame(
  ctx: Ctx,
  encounter: Encounter,
  trigger: EncounterMinigame['trigger'],
  actionId?: string,
): boolean {
  if (encounter.minigame || encounter.phase !== 'rounds' || !playerActive(encounter)) return false;
  const kind = getKind(encounter.kind);
  const minigame = minigameFor(kind, trigger, actionId);
  if (!minigame || !isMinigameReady(minigame)) return false;
  const cityId = requestCity(ctx.state, encounter.request);
  const veedelId = encounter.request.veedelId;
  const template = trigger === 'start' ? undefined : MID_SITUATIONS[minigame];
  const id = startMinigame(ctx, {
    kind: minigame,
    origin: { module: 'encounters', ref: String(encounter.id) },
    cityId,
    ...(veedelId ? { veedelId } : {}),
    difficulty: minigameDifficulty(ctx.state, { cityId, ...(veedelId ? { veedelId } : {}) }),
    title: MINIGAME_KINDS[minigame].name,
    situation: template ? fillText(template, textVars(encounter)) : encounter.situation,
    params: minigameParams(ctx.state, encounter),
  });
  if (id === null) return false;
  encounter.minigame = {
    challengeId: id,
    kind: minigame,
    trigger,
    ...(actionId ? { actionId } : {}),
    ...(encounter.protect ? { protect: encounter.protect } : {}),
  };
  return true;
}

/** Offenes Minispiel als timeout auflösen (encounters.auto, Frist): danach macht die Konfrontation wie bisher weiter. */
export function dropMinigame(ctx: Ctx, encounter: Encounter): void {
  const open = encounter.minigame;
  if (!open) return;
  // Erst lösen, dann melden: Das Ereignis kommt später an und findet kein offenes Minispiel mehr (wird übergangen).
  encounter.minigame = null;
  resolveMinigameNow(ctx, open.challengeId);
}

// ---------------------------------------------------------------------------------------------
// Ergebnis

/** 'minigame.finished' aus den Minispielen: Folgen für die Konfrontation, die es gestartet hat. */
export function onMinigameFinished(ctx: Ctx, payload: GameEvents['minigame.finished']): void {
  if (payload.origin.module !== 'encounters') return;
  const encounter = ctx.state.modules.encounters.active.find((e) => e.id === Number(payload.origin.ref));
  const open = encounter?.minigame;
  if (!encounter || !open || open.challengeId !== payload.id) return;
  encounter.minigame = null;
  const kind = getKind(encounter.kind);
  if (!kind) return;
  if (payload.by === 'timeout' || payload.score === null) {
    onTimeout(ctx, encounter, kind, open);
    return;
  }
  const result: MinigameResult = { score: payload.score, won: payload.won, picks: payload.picks, by: payload.by };
  switch (open.kind) {
    case 'chase':
      applyChase(ctx, encounter, kind, open, result);
      break;
    case 'brawl':
      applyBrawl(ctx, encounter, kind, open, result);
      break;
    case 'traffic':
      applyTraffic(ctx, encounter, kind, open, result);
      break;
    case 'papers':
      applyPapers(ctx, encounter, kind, open, result);
      break;
    default:
      onTimeout(ctx, encounter, kind, open);
  }
}

/** Nicht gespielt (Frist): wie bisher. Bei einer Handlung wird die Runde mit dem alten Würfel gespielt. */
function onTimeout(ctx: Ctx, encounter: Encounter, kind: EncounterKind, open: EncounterMinigame): void {
  if (open.trigger !== 'action' || !open.actionId) return;
  playOldRound(ctx, encounter, kind, open.actionId, open.protect);
}

/** Eine Runde mit dem alten Würfel (statt des Minispiels), mit dem Schutz von damals. */
function playOldRound(ctx: Ctx, encounter: Encounter, kind: EncounterKind, actionId: string, guard?: string): void {
  const action = resolveAction(kind, actionId);
  if (!action || encounter.phase !== 'rounds') return;
  if (guard && encounter.stakes.some((s) => s.id === guard)) encounter.protect = guard as Encounter['protect'];
  playRound(ctx, encounter, kind, actionId, action);
}

/** Eintrag im Verlauf der Akte (zählt als Runde, wenn countsRound). */
function logMinigame(
  ctx: Ctx,
  encounter: Encounter,
  open: EncounterMinigame,
  result: MinigameResult,
  text: string,
  before: GaugeShift,
  countsRound = false,
): void {
  if (countsRound) encounter.round += 1;
  logRound(ctx, encounter, `minigame:${open.kind}`, result.score * 2, [text], before);
}

function gauges(encounter: Encounter): GaugeShift {
  return { aggression: encounter.aggression, resolve: encounter.resolve };
}

function count(picks: readonly string[], prefix: string): number {
  let sum = 0;
  for (const p of picks) {
    if (!p.startsWith(prefix)) continue;
    const n = Number(p.slice(prefix.length));
    if (Number.isFinite(n) && n > 0) sum += Math.floor(n);
  }
  return sum;
}

/**
 * Verfolgungsjagd. Geschafft: entkommen (Polizeiflucht Erfolg; bei „Gas geben“ in der Verkehrskontrolle gilt, was die
 * Handlung sagt: Rückzug, davongefahren). Nicht geschafft: gefasst (Niederlage). picks 'dumped': Ware aus dem Fenster.
 */
export function applyChase(
  ctx: Ctx,
  encounter: Encounter,
  kind: EncounterKind,
  open: EncounterMinigame,
  result: MinigameResult,
): void {
  const before = gauges(encounter);
  if (result.picks.includes('dumped')) {
    const dump = resolveAction(kind, 'dump') ?? ENCOUNTER_ACTIONS.dump;
    encounter.goodsDropped += loseGoods(ctx, roll(ctx, dump.dropsGoods ?? [5, 15]), encounter.request);
  }
  const action = open.actionId ? resolveAction(kind, open.actionId) : undefined;
  const who = result.by === 'rightHand' ? 'Deine Rechte Hand fährt' : 'Du fährst';
  if (result.won) {
    logMinigame(ctx, encounter, open, result, `${who} durch Seitenstraßen. Die Streife ist abgehängt.`, before);
    finish(ctx, encounter, action?.gaveUp ?? 'success', undefined, 'fled');
  } else {
    logMinigame(ctx, encounter, open, result, 'Blaulicht von allen Seiten. Gefasst.', before);
    finish(ctx, encounter, 'failure', undefined, 'resolved');
  }
}

/** Einen der eigenen Leute verletzen (verletzt → außer Gefecht), nie tödlich. */
function hurt(p: Participant): void {
  p.condition = p.condition === 'ok' ? 'injured' : 'down';
}

/**
 * Straßenkampf. picks: 'down:<n>' (so viele Gegner am Boden), 'fled:<n>' (abgehauen), 'hurt:<staffId>' (eigene Leute
 * verletzt, zweimal = außer Gefecht), 'playerHurt', 'ko' (du gehst zu Boden), 'grabbed' (einer ist mit der Beute weg:
 * die Absicht der Runde trifft ihren Einsatz, geschützt nur zum Teil), 'sirens' (die Polizei-Uhr lief im Kampf ab).
 * Alle Gegner weg → Erfolg (beaten). ko → Niederlage (overrun), du bist verletzt, stirbst aber nie durch ein Minispiel.
 * sirens → die Uhr steht auf 0, die Konfrontation endet wie bei abgelaufener Uhr. Sonst: Aggression auf
 * BRAWL_AFTER_AGGRESSION, Entschlossenheit −BRAWL_DOWN_RESOLVE je Gegner am Boden, die Runden laufen weiter (der Kampf
 * zählt als Runde). Ohne picks (Rechte Hand) zählt der Score: Anteil der Gegner, die zu Boden gehen.
 */
export function applyBrawl(
  ctx: Ctx,
  encounter: Encounter,
  kind: EncounterKind,
  open: EncounterMinigame,
  result: MinigameResult,
): void {
  const before = gauges(encounter);
  const picks = result.picks;
  const fromPicks = picks.length > 0;
  const startFoes = foesIn(encounter);
  const down = fromPicks ? count(picks, 'down:') : Math.round(startFoes * result.score);
  const fled = fromPicks ? count(picks, 'fled:') : 0;
  let knocked = 0;
  for (let i = 0; i < down && removeFoe(encounter, 'down'); i++) knocked += 1;
  for (let i = 0; i < fled && removeFoe(encounter, 'gone'); i++);
  for (const p of picks) {
    if (!p.startsWith('hurt:')) continue;
    const member = encounter.participants.find((x) => !x.isPlayer && x.id === p.slice(5));
    if (member && member.condition !== 'down') hurt(member);
  }
  const player = encounter.participants.find((p) => p.isPlayer);
  if (player && (picks.includes('playerHurt') || picks.includes('ko'))) player.condition = 'injured';
  if (!fromPicks && !result.won && player) player.condition = 'injured';

  const lines = [
    knocked > 0
      ? `${knocked} von ihnen ${knocked === 1 ? 'liegt' : 'liegen'} am Boden.`
      : 'Keiner von ihnen geht zu Boden.',
  ];
  // Mit der Beute weg: Die Absicht trifft ihren Einsatz (Ware, Kasse), wie in einer Runde ohne Gegenmittel.
  if (picks.includes('grabbed')) {
    const intent = encounter.intent ? ENCOUNTER_INTENTS[encounter.intent] : undefined;
    const stake = intent?.stake === 'cash' ? 'cash' : 'goods';
    const shielded = encounter.protect === stake || open.protect === stake;
    const cap = stake === 'goods' && encounter.goodsCap !== undefined ? encounter.goodsCap : 100;
    damageStake(encounter, stake, (intent?.damage ?? 30) * (shielded ? PROTECT_FACTOR : 1), cap);
    lines.push(stake === 'cash' ? 'Einer rennt mit dem Bargeld davon.' : 'Einer rennt mit einer Tasche Ware davon.');
  }
  if (picks.includes('ko')) {
    lines.push('Ein Schlag zu viel. Du gehst zu Boden.');
    logMinigame(ctx, encounter, open, result, lines.join(' '), before, true);
    finish(ctx, encounter, 'failure', undefined, 'overrun');
    return;
  }
  if (foesIn(encounter) === 0) {
    lines.push('Keiner steht mehr.');
    logMinigame(ctx, encounter, open, result, lines.join(' '), before, true);
    finish(ctx, encounter, 'success', undefined, 'beaten');
    return;
  }
  // Die Fäuste ruhen, die Runden gehen weiter (der Kampf hat eine Runde gedauert).
  encounter.aggression = Math.min(encounter.aggression, BRAWL_AFTER_AGGRESSION);
  applyShift(encounter, { resolve: -BRAWL_DOWN_RESOLVE * knocked });
  encounter.brawl = encounter.aggression >= AGGRESSION_FIGHT;
  encounter.clock -= 1;
  // Sirenen im Kampf: Die Uhr ist um, alle rennen (die Konfrontation endet wie bei abgelaufener Uhr).
  if (picks.includes('sirens')) {
    encounter.clock = 0;
    lines.push('Sirenen. Alle rennen.');
  }
  encounter.edge = edgeOf(encounter);
  encounter.maxRounds = encounter.round + 1 + Math.max(0, encounter.clock);
  logMinigame(ctx, encounter, open, result, lines.join(' '), before, true);
  const end = roundOutcome(encounter, kind, ENCOUNTER_ACTIONS.fight);
  if (end) {
    finish(ctx, encounter, end.outcome, undefined, end.ending);
    return;
  }
  encounter.intent = rollIntent(ctx, encounter, kind);
}

/** Bestechungsgeld (bribeCost) zahlen, wenn es reicht, gebucht wie beim Bestechen in den Runden. true = bezahlt. */
function payBribe(ctx: Ctx, encounter: Encounter): boolean {
  const cost = encounter.bribeCost;
  if (cost <= 0 || !wallet.pay(ctx, cost, 'dirty', 'Bestechung', lossCategory(encounter))) return false;
  encounter.bribeSpent += cost;
  return true;
}

/**
 * Verkehrskontrolle. picks 'flee': Gas geben → Verfolgungsjagd (wie die Handlung speedOff; ist sie nicht scharf, die
 * Runde „Gas geben“ wie bisher würfeln). 'bribe': Bestechungsgeld (bribeCost) zahlen, Erfolg. Sonst geschafft →
 * weiterfahren (Erfolg), nicht geschafft → Ladung aufgeflogen (Niederlage).
 */
export function applyTraffic(
  ctx: Ctx,
  encounter: Encounter,
  kind: EncounterKind,
  open: EncounterMinigame,
  result: MinigameResult,
): void {
  const before = gauges(encounter);
  if (result.picks.includes('flee')) {
    logMinigame(ctx, encounter, open, result, 'Du legst den Gang ein und trittst aufs Gas.', before);
    if (!startChaseFrom(ctx, encounter)) playOldRound(ctx, encounter, kind, 'speedOff', open.protect);
    return;
  }
  if (result.picks.includes('bribe') && payBribe(ctx, encounter)) {
    logMinigame(ctx, encounter, open, result, 'Ein Schein im Fahrzeugschein. Der Beamte winkt dich durch.', before);
    finish(ctx, encounter, 'success', undefined, 'resolved');
    return;
  }
  if (result.won) {
    logMinigame(ctx, encounter, open, result, '„Gute Fahrt.“ Die Kelle geht runter.', before);
    finish(ctx, encounter, 'success', undefined, 'resolved');
  } else {
    logMinigame(ctx, encounter, open, result, '„Aussteigen. Kofferraum auf.“', before);
    finish(ctx, encounter, 'failure', undefined, 'resolved');
  }
}

/** Aus der Verkehrskontrolle in die Verfolgungsjagd (wie die Handlung „Gas geben“). */
function startChaseFrom(ctx: Ctx, encounter: Encounter): boolean {
  return maybeStartMinigame(ctx, encounter, 'action', 'speedOff');
}

/**
 * Papiere fälschen (Zoll). picks 'bribe': zahlen, Erfolg. 'giveUp': Ladung aufgeben (Niederlage surrendered: Ware weg,
 * niemand festgenommen). Sonst geschafft → Erfolg, nicht geschafft → Niederlage.
 */
export function applyPapers(
  ctx: Ctx,
  encounter: Encounter,
  _kind: EncounterKind,
  open: EncounterMinigame,
  result: MinigameResult,
): void {
  const before = gauges(encounter);
  if (result.picks.includes('bribe') && payBribe(ctx, encounter)) {
    logMinigame(ctx, encounter, open, result, 'Ein Umschlag zwischen den Papieren. Der Stempel kommt.', before);
    finish(ctx, encounter, 'success', undefined, 'resolved');
    return;
  }
  if (result.picks.includes('giveUp')) {
    logMinigame(ctx, encounter, open, result, 'Du lässt die Ladung stehen. Niemand wird festgenommen.', before);
    finish(ctx, encounter, 'failure', undefined, 'surrendered');
    return;
  }
  if (result.won) {
    logMinigame(ctx, encounter, open, result, 'Die Papiere stimmen. Stempel, weiter.', before);
    finish(ctx, encounter, 'success', undefined, 'resolved');
  } else {
    logMinigame(ctx, encounter, open, result, 'Der Zöllner hat den Fehler gefunden. Die Ladung ist fällig.', before);
    finish(ctx, encounter, 'failure', undefined, 'resolved');
  }
}

/** Für die Oberfläche: Die offene Challenge der Konfrontation (oder undefined). */
export function encounterChallenge(state: GameState, encounter: Encounter): Challenge | undefined {
  const open = encounter.minigame;
  return open ? state.modules.minigames?.active.find((c) => c.id === open.challengeId) : undefined;
}
