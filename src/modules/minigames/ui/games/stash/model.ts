// Razzia-Countdown (Auftrag 44, Teil 3; seit Auftrag 48 ein Lauf im Lager, seitlich): Spiellogik als reines Modell,
// ohne DOM (getestet in model.test.ts).
//
// Das Lager im Schnitt von der Seite, eine Strecke in Metern (x nach rechts): links Tresor (nur mit Ausbau), an der
// Wand oben der Lüftungsschacht (Leiter, nur Kleines), mitten im Boden die Klappe zum doppelten Boden; rechts das
// Rolltor, davor auf der Straße der Kofferraum und der Gully. Am Spot ist es der Gehweg mit Blumenkübel, Briefkasten,
// Gully und Mülltonne. Du läufst selbst: Paket aufheben (große sind schwer, du wirst langsamer), zum Versteck rennen,
// verstauen (jedes Versteck braucht seine Zeit). Antippen schickt dich hin (Paket: aufheben; Versteck: verstauen),
// mit der Tastatur läufst du mit ←/→ und machst mit der Leertaste, was gerade geht. Kurz vor Schluss steht die Streife
// vor dem Tor: Das Tor geht zu, Kofferraum und Gully sind weg. Wenn die Zeit um ist, stürmen sie rein: Was offen
// liegt oder du noch in der Hand hast, ist weg. Score = geretteter Anteil nach Wert (nasse Ware zählt WET_FACTOR).

import { createRng } from '../../../../../core';

/** Nasse Ware aus dem Gully ist nur noch so viel wert. */
export const WET_FACTOR = 0.4;
/** Lauftempo mit leeren Händen (Meter pro Sekunde). */
export const RUN_SPEED = 6.2;
/** Lauftempo beim Tragen je Größe (Meter pro Sekunde): klein, mittel, groß. */
export const CARRY_SPEED: Readonly<Record<PackageSize, number>> = { 1: 5.2, 2: 4, 3: 2.9 };
/** Anlaufen und Abbremsen (Meter pro Sekunde²): kurz, damit sich Laufen direkt anfühlt. */
export const RUN_ACCEL = 32;
/** Aufheben je Größe (Sekunden); aus dem oberen Fach dauert es PICKUP_HIGH länger. */
export const PICKUP_TIME: Readonly<Record<PackageSize, number>> = { 1: 0.18, 2: 0.28, 3: 0.42 };
export const PICKUP_HIGH = 0.18;
/** So nah (Meter) musst du an einem Paket sein, um es zu greifen. */
export const REACH = 0.75;
/** So viele Sekunden vor Schluss steht draußen die Streife (Tor zu, Kofferraum und Gully weg). */
export const STREET_CLOSES_BEFORE = 7;
/** Spielzeit in Sekunden: leicht bzw. schwer. */
export const DURATION_EASY = 34;
export const DURATION_HARD = 25;
/** Am Spot ist die Strecke kurz: so viel der Zeit im Lager. */
export const STREET_TIME = 0.7;

export type StashSetting = 'warehouse' | 'street';
export type HideId = 'vault' | 'floor' | 'vent' | 'trunk' | 'drain' | 'planter' | 'mailbox' | 'bin';
export type PackageSize = 1 | 2 | 3;
/** Fach: 0 unten (Boden, unteres Regal), 1 oben (oberes Regal, Bank). */
export type Shelf = 0 | 1;

/** Was die Oberfläche aus den params bekommt (police/stash.ts, StashParams). */
export interface StashInput {
  setting: StashSetting;
  lots: readonly { productId: string; name: string; amount: number; unit: string; grams: number; value: number }[];
  money: number;
  warehouse?: { vault: number; cover: number };
}

export interface StashPackage {
  id: number;
  /** null = ein Bündel Schwarzgeld. */
  productId: string | null;
  label: string;
  /** Menge, z.B. 400 (g) bzw. 1200 (€). */
  amount: number;
  unit: string;
  value: number;
  size: PackageSize;
  /** Startlage auf der Strecke (Meter) und Fach. */
  x: number;
  shelf: Shelf;
}

export interface StashHide {
  id: HideId;
  name: string;
  /** Linke Kante und Breite auf der Strecke (Meter), Höhe über dem Boden und Höhe des Verstecks (für das Zeichnen). */
  x: number;
  w: number;
  y: number;
  h: number;
  /** Platz in Größen-Einheiten (klein 1, mittel 2, groß 3). */
  capacity: number;
  /** Größtes Paket, das hineinpasst. */
  maxSize: PackageSize;
  /** Sekunden zum Verstauen. */
  stow: number;
  /** Nasse Ware (Gully). */
  wet: boolean;
  /** Draußen vor dem Tor (kurz vor Schluss zu, im Lager). */
  outside: boolean;
}

export interface StashSetup {
  setting: StashSetting;
  packages: StashPackage[];
  /** Von links nach rechts (Reihenfolge der Tasten 1, 2, 3 …). */
  hides: StashHide[];
  duration: number;
  /** Ab dieser Zeit ist das Tor zu (null: nie, am Spot). */
  closeAt: number | null;
  totalValue: number;
  /** Länge der Strecke (Meter). */
  length: number;
  /** Lage des Rolltors (null am Spot): Danach beginnt die Straße. */
  gate: number | null;
  /** Hier stehst du am Anfang. */
  start: number;
}

export interface StashItem {
  x: number;
  shelf: Shelf;
  hide: HideId | null;
}

/** Wohin du gerade (von selbst) läufst. */
export type StashGoal = { kind: 'package'; id: number } | { kind: 'hide'; id: HideId } | { kind: 'point'; x: number };

export interface StashAction {
  kind: 'pickup' | 'stow';
  id: number;
  hide: HideId | null;
  /** Vergangene und ganze Dauer (Sekunden). */
  t: number;
  total: number;
}

export interface StashState {
  time: number;
  items: StashItem[];
  used: Partial<Record<HideId, number>>;
  /** Du: Lage, Tempo (Meter pro Sekunde, + nach rechts), Blickrichtung. */
  x: number;
  v: number;
  facing: 1 | -1;
  /** Paket in deiner Hand, null = keins. */
  carry: number | null;
  /** Aufheben bzw. Verstauen läuft (du stehst still). */
  action: StashAction | null;
  goal: StashGoal | null;
  /** Ziel danach (Paket holen, dann ins Versteck). */
  queued: StashGoal | null;
  done: boolean;
  /** Alles versteckt, bevor die Zeit um war. */
  cleared: boolean;
}

export type HideCheck = 'ok' | 'full' | 'tooBig' | 'closed' | 'busy' | 'done';
export type StashEvent =
  | { type: 'picked'; id: number }
  | { type: 'stowing'; id: number; hide: HideId }
  | { type: 'stowed'; id: number; hide: HideId }
  | { type: 'dropped'; id: number }
  | { type: 'refused'; id: number; hide: HideId; check: HideCheck }
  | { type: 'pushed' }
  | { type: 'closed' }
  | { type: 'timeUp' }
  | { type: 'cleared' };

/** Was die Aktions-Taste gerade tun würde (für den Knopf und das Zeichnen). */
export type StashContext =
  | { kind: 'pickup'; id: number }
  | { kind: 'stow'; hide: HideId; check: HideCheck }
  | { kind: 'drop' }
  | { kind: 'busy' }
  | { kind: 'none' };

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Verstecke im Lager. Tresor nur mit Ausbau (Platz 4 bzw. 7), der doppelte Boden wächst mit der Tarnung. */
function warehouseHides(vault: number, cover: number): StashHide[] {
  const hides: StashHide[] = [];
  if (vault > 0) {
    hides.push({
      id: 'vault',
      name: 'Tresor',
      x: 0.5,
      w: 1.3,
      y: 0,
      h: 1.5,
      capacity: vault >= 2 ? 7 : 4,
      maxSize: 3,
      stow: 0.8,
      wet: false,
      outside: false,
    });
  }
  hides.push(
    {
      id: 'vent',
      name: 'Lüftungsschacht',
      x: 5.7,
      w: 1.1,
      y: 2.7,
      h: 0.6,
      capacity: 3,
      maxSize: 1,
      // Die Leiter hoch und wieder runter.
      stow: 1.1,
      wet: false,
      outside: false,
    },
    {
      id: 'floor',
      name: 'Doppelter Boden',
      x: 11.4,
      w: 1.5,
      y: 0,
      h: 0.15,
      capacity: [3, 4, 6][Math.min(2, Math.max(0, cover))],
      maxSize: 2,
      stow: 1,
      wet: false,
      outside: false,
    },
    {
      id: 'trunk',
      name: 'Kofferraum',
      x: 22.4,
      w: 1.8,
      y: 0.55,
      h: 1.1,
      capacity: 4,
      maxSize: 3,
      stow: 0.45,
      wet: false,
      outside: true,
    },
    {
      id: 'drain',
      name: 'Gully',
      x: 26.3,
      w: 0.9,
      y: 0,
      h: 0.08,
      capacity: 99,
      maxSize: 2,
      stow: 0.3,
      wet: true,
      outside: true,
    },
  );
  return hides;
}

/** Verstecke am Gehweg vor dem Spot. */
function streetHides(): StashHide[] {
  return [
    {
      id: 'planter',
      name: 'Blumenkübel',
      x: 0.8,
      w: 1.2,
      y: 0,
      h: 0.8,
      capacity: 3,
      maxSize: 2,
      stow: 0.6,
      wet: false,
      outside: false,
    },
    {
      id: 'mailbox',
      name: 'Briefkasten',
      x: 5.2,
      w: 0.7,
      y: 1,
      h: 0.6,
      capacity: 2,
      maxSize: 1,
      stow: 0.5,
      wet: false,
      outside: false,
    },
    {
      id: 'drain',
      name: 'Gully',
      x: 11.2,
      w: 0.9,
      y: 0,
      h: 0.08,
      capacity: 99,
      maxSize: 2,
      stow: 0.3,
      wet: true,
      outside: false,
    },
    {
      id: 'bin',
      name: 'Mülltonne',
      x: 18.6,
      w: 1,
      y: 0,
      h: 1.2,
      capacity: 6,
      maxSize: 3,
      stow: 0.5,
      wet: false,
      outside: false,
    },
  ];
}

/** Plätze für Pakete: Regale und Paletten im Lager, Bank und Boden am Spot. */
function slotsFor(setting: StashSetting): { x: number; shelf: Shelf }[] {
  if (setting === 'street') {
    return [
      { x: 7.4, shelf: 0 },
      { x: 8.6, shelf: 0 },
      { x: 13.4, shelf: 1 },
      { x: 14.6, shelf: 1 },
      { x: 15.8, shelf: 1 },
      { x: 14, shelf: 0 },
      { x: 16.6, shelf: 0 },
    ];
  }
  return [
    { x: 3, shelf: 0 },
    { x: 4.3, shelf: 0 },
    { x: 3, shelf: 1 },
    { x: 4.3, shelf: 1 },
    { x: 8, shelf: 0 },
    { x: 9.4, shelf: 0 },
    { x: 8, shelf: 1 },
    { x: 9.4, shelf: 1 },
    { x: 14.2, shelf: 0 },
    { x: 15.6, shelf: 0 },
    { x: 17, shelf: 0 },
    { x: 18.4, shelf: 0 },
  ];
}

/**
 * Szene aus Seed, Schwierigkeit und Lage. Mehr Pakete und weniger Zeit, je schwerer: DURATION_EASY bis DURATION_HARD
 * Sekunden (am Spot STREET_TIME davon), im Lager 4 bis 8 Pakete, am Spot 3 bis 5. Jede Partie wird nach ihrem Wert auf Pakete verteilt (mindestens
 * eins), Schwarzgeld ist ein eigenes Bündel. Größe nach Rang im Gewicht (schwerstes Drittel groß, leichtestes klein).
 * Große Pakete liegen nie oben im Regal.
 */
export function createStash(seed: number, difficulty: number, input: StashInput): StashSetup {
  const random = createRng(seed);
  const d = clamp01(difficulty);
  const setting: StashSetting = input.setting === 'street' ? 'street' : 'warehouse';
  const maxPackages = setting === 'warehouse' ? 9 : 6;
  const target = setting === 'warehouse' ? Math.round(4 + 4 * d) : Math.round(3 + 2 * d);
  const lots = input.lots.filter((l) => l.value > 0 && l.amount > 0);
  const money = Math.max(0, Math.round(input.money || 0));
  const total = lots.reduce((s, l) => s + l.value, 0) + money;
  const slotsLeft = Math.max(lots.length, target - (money > 0 ? 1 : 0));
  // Pakete je Partie nach Wert, jede mindestens eins.
  const counts = lots.map((l) => Math.max(1, Math.round((slotsLeft * l.value) / Math.max(1, total - money))));
  while (counts.reduce((s, c) => s + c, 0) > slotsLeft) {
    const i = counts.indexOf(Math.max(...counts));
    if (counts[i] <= 1) break;
    counts[i] -= 1;
  }
  const pieces: (Omit<StashPackage, 'id' | 'x' | 'shelf' | 'size'> & { grams: number })[] = [];
  lots.forEach((l, i) => {
    const n = counts[i];
    for (let k = 0; k < n; k++) {
      const share = k < n - 1 ? Math.floor(l.amount / n) : l.amount - Math.floor(l.amount / n) * (n - 1);
      pieces.push({
        productId: l.productId,
        label: l.name,
        amount: share,
        unit: l.unit,
        value: Math.round((l.value * share) / l.amount),
        grams: (l.grams * share) / l.amount,
      });
    }
  });
  if (money > 0) {
    // Geldbündel: leicht, aber je mehr, desto dicker.
    pieces.push({ productId: null, label: 'Schwarzgeld', amount: money, unit: '€', value: money, grams: 0 });
  }
  const kept = pieces.slice(0, maxPackages);
  // Größe nach Rang im Gewicht: das schwerste Drittel groß, das leichteste Drittel klein (gleich schwer: Reihenfolge).
  const goods = kept.filter((p) => p.productId !== null);
  const ranked = [...goods].sort((a, b) => b.grams - a.grams);
  const bigCount = Math.round(goods.length * 0.3);
  const smallCount = Math.round(goods.length * 0.35);
  const sizes: PackageSize[] = kept.map((p) => {
    if (p.productId === null) return p.amount >= 1500 ? 2 : 1;
    const rank = ranked.indexOf(p);
    return rank < bigCount ? 3 : rank >= goods.length - smallCount ? 1 : 2;
  });
  // Plätze mischen; große Pakete bekommen zuerst die unteren.
  const slots = slotsFor(setting);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const order = kept.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a] || a - b);
  const placeOf: { x: number; shelf: Shelf }[] = [];
  for (const i of order) {
    const k = sizes[i] === 3 ? slots.findIndex((s) => s.shelf === 0) : 0;
    const [slot] = slots.splice(Math.max(0, k), 1);
    placeOf[i] = slot ?? { x: 10 + i * 0.4, shelf: 0 };
  }
  const packages: StashPackage[] = kept.map((p, i) => {
    const { grams: _, ...rest } = p;
    const jitter = (random() - 0.5) * 0.24;
    return { id: i, ...rest, size: sizes[i], x: round2(placeOf[i].x + jitter), shelf: placeOf[i].shelf };
  });
  const base = DURATION_EASY - (DURATION_EASY - DURATION_HARD) * d;
  const duration = Math.round(setting === 'street' ? base * STREET_TIME : base);
  const hides =
    setting === 'warehouse' ? warehouseHides(input.warehouse?.vault ?? 0, input.warehouse?.cover ?? 0) : streetHides();
  return {
    setting,
    packages,
    hides,
    duration,
    closeAt: setting === 'warehouse' ? duration - STREET_CLOSES_BEFORE : null,
    totalValue: packages.reduce((s, p) => s + p.value, 0),
    length: setting === 'warehouse' ? 28 : 21,
    gate: setting === 'warehouse' ? 20 : null,
    start: setting === 'warehouse' ? 11 : 12,
  };
}

export function initStash(setup: StashSetup): StashState {
  return {
    time: 0,
    items: setup.packages.map((p) => ({ x: p.x, shelf: p.shelf, hide: null })),
    used: {},
    x: setup.start,
    v: 0,
    facing: -1,
    carry: null,
    action: null,
    goal: null,
    queued: null,
    done: false,
    cleared: false,
  };
}

export function getHide(setup: StashSetup, id: HideId): StashHide | undefined {
  return setup.hides.find((h) => h.id === id);
}

/** Mitte eines Verstecks auf der Strecke. */
export function hideCenter(hide: StashHide): number {
  return hide.x + hide.w / 2;
}

/** Restliche Zeit in Sekunden. */
export function timeLeft(setup: StashSetup, state: StashState): number {
  return Math.max(0, setup.duration - state.time);
}

/** Ist das Tor schon zu (Verstecke draußen weg)? */
export function streetClosed(setup: StashSetup, state: StashState): boolean {
  return setup.closeAt !== null && state.time >= setup.closeAt;
}

/** Weiter nach rechts kommst du gerade nicht (Tor zu bzw. Ende der Strecke). */
export function rightLimit(setup: StashSetup, state: StashState): number {
  if (setup.gate !== null && streetClosed(setup, state)) return setup.gate - 0.45;
  return setup.length - 0.4;
}

/** Belegter Platz in einem Versteck. */
export function usedIn(state: StashState, id: HideId): number {
  return state.used[id] ?? 0;
}

/** Passt dieses Paket gerade in dieses Versteck? */
export function canHide(setup: StashSetup, state: StashState, id: number, hideId: HideId): HideCheck {
  if (state.done) return 'done';
  const hide = getHide(setup, hideId);
  const pkg = setup.packages[id];
  if (!hide || !pkg) return 'full';
  if (hide.outside && streetClosed(setup, state)) return 'closed';
  if (pkg.size > hide.maxSize) return 'tooBig';
  if (usedIn(state, hideId) + pkg.size > hide.capacity) return 'full';
  return 'ok';
}

/** Liegt das Paket noch offen herum (nicht versteckt, nicht in deiner Hand)? */
export function isLoose(state: StashState, id: number): boolean {
  return state.items[id]?.hide === null && state.carry !== id;
}

/** Nächstes loses Paket in Reichweite, sonst −1. */
export function packageInReach(setup: StashSetup, state: StashState): number {
  let best = -1;
  let bestD = REACH;
  for (const p of setup.packages) {
    if (!isLoose(state, p.id)) continue;
    const d = Math.abs(state.items[p.id].x - state.x);
    if (d <= bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/** Versteck, vor dem du stehst (innerhalb seiner Breite plus etwas Rand), sonst null. */
export function hideInReach(setup: StashSetup, state: StashState): HideId | null {
  let best: { id: HideId; d: number } | null = null;
  for (const h of setup.hides) {
    if (state.x < h.x - 0.45 || state.x > h.x + h.w + 0.45) continue;
    const d = Math.abs(state.x - hideCenter(h));
    if (!best || d < best.d) best = { id: h.id, d };
  }
  return best?.id ?? null;
}

/** Was die Aktions-Taste jetzt täte. */
export function contextOf(setup: StashSetup, state: StashState): StashContext {
  if (state.done) return { kind: 'none' };
  if (state.action) return { kind: 'busy' };
  if (state.carry !== null) {
    const hide = hideInReach(setup, state);
    if (hide) return { kind: 'stow', hide, check: canHide(setup, state, state.carry, hide) };
    return { kind: 'drop' };
  }
  const id = packageInReach(setup, state);
  return id >= 0 ? { kind: 'pickup', id } : { kind: 'none' };
}

function startPickup(setup: StashSetup, state: StashState, id: number, events: StashEvent[]): void {
  const pkg = setup.packages[id];
  const item = state.items[id];
  if (state.carry !== null) {
    // Tauschen: was du trägst, legst du hier ab.
    const held = state.carry;
    state.items[held].x = state.x;
    state.items[held].shelf = 0;
    state.carry = null;
    events.push({ type: 'dropped', id: held });
  }
  state.v = 0;
  state.facing = item.x >= state.x ? 1 : -1;
  state.action = {
    kind: 'pickup',
    id,
    hide: null,
    t: 0,
    total: PICKUP_TIME[pkg.size] + (item.shelf === 1 ? PICKUP_HIGH : 0),
  };
}

function startStow(setup: StashSetup, state: StashState, hideId: HideId, events: StashEvent[]): HideCheck {
  const id = state.carry;
  if (id === null) return 'busy';
  const check = canHide(setup, state, id, hideId);
  if (check !== 'ok') {
    events.push({ type: 'refused', id, hide: hideId, check });
    return check;
  }
  const hide = getHide(setup, hideId) as StashHide;
  state.v = 0;
  state.action = { kind: 'stow', id, hide: hideId, t: 0, total: hide.stow };
  events.push({ type: 'stowing', id, hide: hideId });
  return 'ok';
}

function dropHere(state: StashState, events: StashEvent[]): void {
  if (state.carry === null) return;
  const id = state.carry;
  state.items[id].x = state.x;
  state.items[id].shelf = 0;
  state.carry = null;
  events.push({ type: 'dropped', id });
}

/** Aktions-Taste (Leertaste): aufheben, verstauen oder ablegen, je nachdem, wo du stehst. */
export function act(setup: StashSetup, state: StashState): StashEvent[] {
  const events: StashEvent[] = [];
  const ctx = contextOf(setup, state);
  state.goal = null;
  state.queued = null;
  if (ctx.kind === 'pickup') startPickup(setup, state, ctx.id, events);
  else if (ctx.kind === 'stow') startStow(setup, state, ctx.hide, events);
  else if (ctx.kind === 'drop') dropHere(state, events);
  return events;
}

/** Hinlaufen (Antippen): zu einem Paket (aufheben), zu einem Versteck (verstauen) oder an einen Punkt. */
export function goTo(setup: StashSetup, state: StashState, goal: StashGoal): boolean {
  if (state.done) return false;
  if (goal.kind === 'package' && !isLoose(state, goal.id)) return false;
  if (goal.kind === 'hide' && !getHide(setup, goal.id)) return false;
  state.goal = goal.kind === 'point' ? { kind: 'point', x: Math.min(setup.length, Math.max(0, goal.x)) } : goal;
  state.queued = null;
  return true;
}

/**
 * Ein Paket holen und gleich in ein Versteck bringen (Tasten 1–5, Bot). Prüft vorher, ob es passt. Trägst du schon
 * eins, geht nur das getragene.
 */
export function send(setup: StashSetup, state: StashState, id: number, hideId: HideId): HideCheck {
  if (state.done) return 'done';
  const check = canHide(setup, state, id, hideId);
  if (check !== 'ok') return check;
  if (state.carry === id) {
    state.goal = { kind: 'hide', id: hideId };
    state.queued = null;
    return 'ok';
  }
  if (state.carry !== null || !isLoose(state, id)) return 'busy';
  state.goal = { kind: 'package', id };
  state.queued = { kind: 'hide', id: hideId };
  return 'ok';
}

/**
 * Taste für ein Versteck: Trägst du etwas, bringst du es hin; sonst holst du das nächste lose Paket, das hineinpasst.
 */
export function sendTo(setup: StashSetup, state: StashState, hideId: HideId): HideCheck {
  if (state.done) return 'done';
  if (state.carry !== null) return send(setup, state, state.carry, hideId);
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  let reason: HideCheck = 'full';
  for (const p of setup.packages) {
    if (!isLoose(state, p.id)) continue;
    const check = canHide(setup, state, p.id, hideId);
    if (check !== 'ok') {
      if (reason === 'full' || check === 'closed') reason = check;
      continue;
    }
    const d = Math.abs(state.items[p.id].x - state.x);
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best >= 0 ? send(setup, state, best, hideId) : reason;
}

function goalX(setup: StashSetup, state: StashState, goal: StashGoal): number {
  if (goal.kind === 'package') return state.items[goal.id].x;
  if (goal.kind === 'hide') {
    const hide = getHide(setup, goal.id) as StashHide;
    // Vor einem breiten Versteck reicht der nächste Rand (nicht bis zur Mitte laufen).
    return Math.min(hide.x + hide.w - 0.2, Math.max(hide.x + 0.2, state.x));
  }
  return goal.x;
}

/** Am Ziel angekommen: tun, was das Ziel will. */
function arrive(setup: StashSetup, state: StashState, events: StashEvent[]): void {
  const goal = state.goal;
  state.goal = state.queued;
  state.queued = null;
  if (!goal) return;
  if (goal.kind === 'package') {
    if (isLoose(state, goal.id)) startPickup(setup, state, goal.id, events);
    else state.goal = null;
  } else if (goal.kind === 'hide') {
    if (state.carry === null) return;
    if (startStow(setup, state, goal.id, events) !== 'ok') state.goal = null;
  }
}

function finishAction(setup: StashSetup, state: StashState, events: StashEvent[]): void {
  const a = state.action;
  if (!a) return;
  state.action = null;
  if (a.kind === 'pickup') {
    state.carry = a.id;
    events.push({ type: 'picked', id: a.id });
    return;
  }
  if (!a.hide) return;
  const item = state.items[a.id];
  item.hide = a.hide;
  state.used[a.hide] = usedIn(state, a.hide) + setup.packages[a.id].size;
  state.carry = null;
  events.push({ type: 'stowed', id: a.id, hide: a.hide });
  if (state.items.every((it) => it.hide !== null)) {
    state.done = true;
    state.cleared = true;
    state.goal = null;
    state.queued = null;
    events.push({ type: 'cleared' });
  }
}

/** Was du gerade trägst, wiegt so viel (Tempo). */
export function topSpeed(setup: StashSetup, state: StashState): number {
  return state.carry === null ? RUN_SPEED : CARRY_SPEED[setup.packages[state.carry].size];
}

/**
 * Zeit laufen lassen. move: −1/1 läufst du selbst (bricht das Hinlaufen ab), 0 läufst du zum Ziel, falls es eins gibt.
 * Gibt zurück, was passiert ist (für Ton und Effekte).
 */
export function step(setup: StashSetup, state: StashState, dt: number, move: -1 | 0 | 1 = 0): StashEvent[] {
  const events: StashEvent[] = [];
  if (state.done || !(dt > 0)) return events;
  const wasClosed = streetClosed(setup, state);
  state.time += dt;
  if (!wasClosed && streetClosed(setup, state)) {
    events.push({ type: 'closed' });
    // Wer gerade nach draußen will, kommt nicht mehr hin. Was dort schon verstaut wird, ist drin.
    const outside = (g: StashGoal | null) =>
      (g?.kind === 'hide' && getHide(setup, g.id)?.outside) || (g?.kind === 'point' && g.x > rightLimit(setup, state));
    if (outside(state.goal) || outside(state.queued)) {
      state.goal = null;
      state.queued = null;
    }
    const limit = rightLimit(setup, state);
    if (state.x > limit && state.action?.kind !== 'stow') {
      // Die Streife schiebt dich rein; was du draußen gerade aufhebst, bleibt liegen.
      state.x = limit;
      state.v = 0;
      state.action = null;
      events.push({ type: 'pushed' });
    }
  }
  if (state.action) {
    state.action.t += dt;
    state.v = 0;
    if (state.action.t >= state.action.total) finishAction(setup, state, events);
    if (state.done) return events;
  } else {
    if (move !== 0) {
      state.goal = null;
      state.queued = null;
    }
    const top = topSpeed(setup, state);
    let want = move * top;
    let target: number | null = null;
    if (move === 0 && state.goal) {
      target = goalX(setup, state, state.goal);
      const dx = target - state.x;
      // Kurz vor dem Ziel abbremsen, damit man nicht vorbeischießt.
      const brake = Math.sqrt(2 * RUN_ACCEL * Math.abs(dx));
      want = Math.sign(dx) * Math.min(top, brake);
    }
    const dv = want - state.v;
    const maxDv = RUN_ACCEL * dt;
    state.v += Math.abs(dv) <= maxDv ? dv : Math.sign(dv) * maxDv;
    if (Math.abs(state.v) > top) state.v = Math.sign(state.v) * top;
    let next = state.x + state.v * dt;
    if (target !== null && (target - state.x) * (target - next) <= 0) next = target;
    const limit = rightLimit(setup, state);
    if (next > limit || next < 0.3) {
      next = Math.min(limit, Math.max(0.3, next));
      state.v = 0;
    }
    state.x = next;
    if (Math.abs(state.v) > 0.05) state.facing = state.v > 0 ? 1 : -1;
    if (target !== null && Math.abs(target - state.x) < 0.04) {
      state.v = 0;
      arrive(setup, state, events);
    } else if (target !== null && Math.abs(target - state.x) >= 0.04 && state.x === limit && target > limit) {
      // Ziel hinter dem Tor: hier ist Schluss.
      state.goal = null;
      state.queued = null;
    }
  }
  if (state.carry !== null) {
    state.items[state.carry].x = state.x;
    state.items[state.carry].shelf = 0;
  }
  if (timeLeft(setup, state) <= 0) {
    state.done = true;
    // Was gerade verstaut wird, ist drin; was du in der Hand hast oder aufhebst, nicht.
    const a = state.action;
    if (a?.kind === 'stow' && a.hide) {
      state.items[a.id].hide = a.hide;
      state.used[a.hide] = usedIn(state, a.hide) + setup.packages[a.id].size;
      state.carry = null;
    }
    state.action = null;
    state.goal = null;
    state.queued = null;
    events.push({ type: 'timeUp' });
  }
  return events;
}

/** Geretteter Wert (nasse Ware zählt WET_FACTOR). */
export function savedValue(setup: StashSetup, state: StashState): number {
  let saved = 0;
  for (const p of setup.packages) {
    const hide = state.items[p.id]?.hide;
    if (!hide) continue;
    saved += p.value * (getHide(setup, hide)?.wet ? WET_FACTOR : 1);
  }
  return saved;
}

/** Score = geretteter Anteil nach Wert (0 bis 1). */
export function stashScore(setup: StashSetup, state: StashState): number {
  if (setup.totalValue <= 0) return 0;
  return Math.round(clamp01(savedValue(setup, state) / setup.totalValue) * 1000) / 1000;
}

/** Was passiert ist, für den Kern: je Versteck die Zahl der Pakete, dazu liegen geblieben. */
export function stashPicks(setup: StashSetup, state: StashState): string[] {
  const picks: string[] = [];
  for (const h of setup.hides) {
    const n = setup.packages.filter((p) => state.items[p.id]?.hide === h.id).length;
    if (n > 0) picks.push(`${h.id}:${n}`);
  }
  const left = setup.packages.filter((p) => state.items[p.id]?.hide === null).length;
  if (left > 0) picks.push(`left:${left}`);
  return picks;
}

/** Wie viele Pakete gerettet bzw. nass sind (für das Ergebnis). */
export function stashCounts(setup: StashSetup, state: StashState): { hidden: number; wet: number; left: number } {
  let hidden = 0;
  let wet = 0;
  for (const p of setup.packages) {
    const hide = state.items[p.id]?.hide;
    if (!hide) continue;
    hidden += 1;
    if (getHide(setup, hide)?.wet) wet += 1;
  }
  return { hidden, wet, left: setup.packages.length - hidden };
}

/**
 * Bester nächster Zug für Bot und Tests (und als Maßstab für die Schwierigkeit): das Paar aus losem Paket und
 * Versteck mit dem meisten geretteten Wert pro Sekunde, das noch vor dem Ende (bzw. vor dem Tor) zu schaffen ist.
 */
export function bestMove(setup: StashSetup, state: StashState): { id: number; hide: HideId } | null {
  let best: { id: number; hide: HideId; rate: number } | null = null;
  const used: Partial<Record<HideId, number>> = { ...state.used };
  for (const p of setup.packages) {
    if (!isLoose(state, p.id) && state.carry !== p.id) continue;
    const item = state.items[p.id];
    const toPkg = state.carry === p.id ? 0 : Math.abs(item.x - state.x) / RUN_SPEED + PICKUP_TIME[p.size] + 0.15;
    if (state.carry !== null && state.carry !== p.id) continue;
    for (const h of setup.hides) {
      if (canHide(setup, state, p.id, h.id) !== 'ok' || (used[h.id] ?? 0) + p.size > h.capacity) continue;
      const from = state.carry === p.id ? state.x : item.x;
      const t = toPkg + Math.abs(hideCenter(h) - from) / CARRY_SPEED[p.size] + h.stow + 0.2;
      const arrive = state.time + t;
      if (arrive > setup.duration - 0.1) continue;
      if (h.outside && setup.closeAt !== null && arrive - h.stow > setup.closeAt - 0.1) continue;
      let rate = (p.value * (h.wet ? WET_FACTOR : 1)) / t;
      // Nicht den letzten trockenen Platz eines anderen Pakets zustellen (das Große gehört zuerst in die Tonne).
      used[h.id] = (used[h.id] ?? 0) + p.size;
      const blocks = setup.packages.some(
        (q) =>
          q.id !== p.id &&
          isLoose(state, q.id) &&
          setup.hides.some((o) => !o.wet && canHide(setup, state, q.id, o.id) === 'ok') &&
          !setup.hides.some(
            (o) =>
              !o.wet &&
              canHide(setup, state, q.id, o.id) === 'ok' &&
              (used[o.id] ?? 0) + q.size <= o.capacity &&
              !(o.outside && setup.closeAt !== null && state.time + t > setup.closeAt),
          ),
      );
      used[h.id] = (used[h.id] ?? 0) - p.size;
      if (blocks) rate *= 0.3;
      if (!best || rate > best.rate) best = { id: p.id, hide: h.id, rate };
    }
  }
  return best ? { id: best.id, hide: best.hide } : null;
}

/** Ein Wert unter der Wertung (Form wie MinigameStat im Rahmen, Lead-PR #136). */
export interface StashStat {
  label: string;
  value: string;
  icon?: string;
  tone?: 'good' | 'bad';
}

/** Ergebnis-Werte: versteckt, nass, liegen geblieben, Zeit übrig (höchstens vier). */
export function stashStats(setup: StashSetup, state: StashState): StashStat[] {
  const c = stashCounts(setup, state);
  const stats: StashStat[] = [
    { label: 'Versteckt', value: `${c.hidden}/${setup.packages.length}`, icon: 'package', tone: 'good' },
  ];
  if (c.wet > 0) stats.push({ label: 'Nass', value: String(c.wet), icon: 'drop' });
  if (c.left > 0) stats.push({ label: 'Gefunden', value: String(c.left), icon: 'siren', tone: 'bad' });
  if (state.cleared)
    stats.push({ label: 'Zeit übrig', value: `${Math.ceil(timeLeft(setup, state))} s`, icon: 'clock' });
  return stats.slice(0, 4);
}
