// Razzia-Countdown (Auftrag 44, Teil 3): Spiellogik als reines Modell, ohne DOM (getestet in model.test.ts).
//
// Draufsicht auf das eigene Lager (bzw. die Straße am Spot), Szene 100 × 100 Einheiten. Pakete (je Ware ein Farbton
// und Symbol, Größe nach Menge) kommen in Verstecke: Tresor (nur mit Ausbau, Platz nach Stufe), doppelter Boden (Platz
// nach Tarnung), Lüftungsschacht (nur Kleines), Kofferraum (begrenzt, weit draußen), Gully (schnell, aber nass: weniger
// wert). Am Spot: Blumenkübel, Briefkasten, Mülltonne, Gully. Du trägst immer nur ein Paket: Es folgt dem Finger bzw.
// der Maus mit seinem Tempo (große Pakete langsam), losgelassen über einem Versteck läuft es dorthin weiter und wird
// verstaut (jedes Versteck braucht seine Zeit). Kurz vor Schluss steht draußen die Streife: Kofferraum und Gully sind
// dann zu. Wenn die Zeit um ist, stürmen sie rein: Was offen liegt, ist weg.
// Score = geretteter Anteil nach Wert (nasse Ware zählt WET_FACTOR).

import { createRng } from '../../../../../core';

/** Seitenlänge der Szene in Einheiten (gezeichnet wird sie passend zur Bühne). */
export const SCENE = 100;
/** Nasse Ware aus dem Gully ist nur noch so viel wert. */
export const WET_FACTOR = 0.4;
/** Tempo beim Tragen je Größe (Einheiten pro Sekunde): klein, mittel, groß. */
export const CARRY_SPEED: Readonly<Record<PackageSize, number>> = { 1: 78, 2: 54, 3: 38 };
/** Halbe Kantenlänge eines Pakets je Größe (für Zeichnen und Antippen). */
export const PACKAGE_HALF: Readonly<Record<PackageSize, number>> = { 1: 5.6, 2: 6.6, 3: 8 };
/** So viele Sekunden vor Schluss steht draußen die Streife (Kofferraum und Gully zu). */
export const STREET_CLOSES_BEFORE = 7;

export type StashSetting = 'warehouse' | 'street';
export type HideId = 'vault' | 'floor' | 'vent' | 'trunk' | 'drain' | 'planter' | 'mailbox' | 'bin';
export type PackageSize = 1 | 2 | 3;

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
  /** Menge als Text, z.B. „400 g“ bzw. „1.200 €“. */
  amount: number;
  unit: string;
  value: number;
  size: PackageSize;
  /** Startlage (Mitte). */
  x: number;
  y: number;
}

export interface StashHide {
  id: HideId;
  name: string;
  /** Rechteck in der Szene (links oben, Breite, Höhe). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Platz in Größen-Einheiten (klein 1, mittel 2, groß 3). */
  capacity: number;
  /** Größtes Paket, das hineinpasst. */
  maxSize: PackageSize;
  /** Sekunden zum Verstauen. */
  stow: number;
  /** Nasse Ware (Gully). */
  wet: boolean;
  /** Draußen auf der Straße (kurz vor Schluss zu, im Lager). */
  outside: boolean;
}

export interface StashSetup {
  setting: StashSetting;
  packages: StashPackage[];
  /** In der Reihenfolge der Tasten 1, 2, 3 … */
  hides: StashHide[];
  duration: number;
  /** Ab dieser Zeit sind die Verstecke draußen zu (null: nie, am Spot). */
  closeAt: number | null;
  totalValue: number;
  /** Lage des Tors bzw. der Ecke, aus der die Bullen kommen (für das Zeichnen). */
  entry: { x: number; y: number };
}

export interface Carry {
  id: number;
  /** Ziel: ein Versteck oder (beim Ziehen) der Punkt unter dem Finger. */
  target: HideId | null;
  tx: number;
  ty: number;
  /** Restzeit beim Verstauen (−1 = noch unterwegs). */
  stowing: number;
}

export interface StashItem {
  x: number;
  y: number;
  hide: HideId | null;
}

export interface StashState {
  time: number;
  items: StashItem[];
  used: Partial<Record<HideId, number>>;
  carry: Carry | null;
  /** Ausgewähltes Paket (Tastatur, Antippen), −1 = keins. */
  selected: number;
  done: boolean;
  /** Alles versteckt, bevor die Zeit um war. */
  cleared: boolean;
}

export type HideCheck = 'ok' | 'full' | 'tooBig' | 'closed' | 'busy' | 'done';
export type StashEvent =
  | { type: 'stowed'; id: number; hide: HideId }
  | { type: 'arrived'; id: number; hide: HideId }
  | { type: 'closed' }
  | { type: 'timeUp' }
  | { type: 'cleared' };

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
      x: 6,
      y: 7,
      w: 17,
      h: 15,
      capacity: vault >= 2 ? 7 : 4,
      maxSize: 3,
      stow: 0.9,
      wet: false,
      outside: false,
    });
  }
  hides.push(
    {
      id: 'floor',
      name: 'Doppelter Boden',
      x: 71,
      y: 34,
      w: 19,
      h: 16,
      capacity: [3, 4, 6][Math.min(2, Math.max(0, cover))],
      maxSize: 2,
      stow: 1.1,
      wet: false,
      outside: false,
    },
    {
      id: 'vent',
      name: 'Lüftungsschacht',
      x: 72,
      y: 5,
      w: 18,
      h: 9,
      capacity: 3,
      maxSize: 1,
      stow: 0.8,
      wet: false,
      outside: false,
    },
    {
      id: 'trunk',
      name: 'Kofferraum',
      x: 57,
      y: 78,
      w: 13,
      h: 15,
      capacity: 4,
      maxSize: 3,
      stow: 0.45,
      wet: false,
      outside: true,
    },
    {
      id: 'drain',
      name: 'Gully',
      x: 12,
      y: 81,
      w: 12,
      h: 11,
      capacity: 99,
      maxSize: 2,
      stow: 0.3,
      wet: true,
      outside: true,
    },
  );
  return hides;
}

/** Verstecke an der Straße am Spot. */
function streetHides(): StashHide[] {
  return [
    {
      id: 'planter',
      name: 'Blumenkübel',
      x: 6,
      y: 30,
      w: 15,
      h: 15,
      capacity: 3,
      maxSize: 2,
      stow: 0.6,
      wet: false,
      outside: false,
    },
    {
      id: 'mailbox',
      name: 'Briefkasten',
      x: 76,
      y: 9,
      w: 14,
      h: 9,
      capacity: 2,
      maxSize: 1,
      stow: 0.5,
      wet: false,
      outside: false,
    },
    {
      id: 'bin',
      name: 'Mülltonne',
      x: 81,
      y: 56,
      w: 13,
      h: 16,
      capacity: 6,
      maxSize: 3,
      stow: 0.5,
      wet: false,
      outside: false,
    },
    {
      id: 'drain',
      name: 'Gully',
      x: 40,
      y: 84,
      w: 12,
      h: 10,
      capacity: 99,
      maxSize: 2,
      stow: 0.3,
      wet: true,
      outside: false,
    },
  ];
}

/** Plätze, auf denen die Pakete am Anfang liegen (Mitte der Halle bzw. um die Bank am Spot), gemischt. */
function slots(setting: StashSetting, random: () => number): { x: number; y: number }[] {
  const list: { x: number; y: number }[] = [];
  // Abstand 16,5: Auch zwei große Pakete nebeneinander berühren sich nicht.
  const [x0, y0, gap, cols, rows] = setting === 'warehouse' ? [31, 23, 16.5, 3, 3] : [33, 38, 17, 3, 2];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      list.push({
        x: x0 + c * gap + (random() - 0.5) * 2,
        y: y0 + r * gap + (random() - 0.5) * 2,
      });
    }
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Szene aus Seed, Schwierigkeit und Lage. Mehr Pakete und weniger Zeit, je schwerer: 30 s (leicht) bis 20 s (schwer),
 * im Lager 4 bis 8 Pakete, am Spot 3 bis 5. Jede Partie wird nach ihrem Wert auf Pakete verteilt (mindestens eins),
 * Schwarzgeld ist ein eigenes Bündel. Größe nach Rang im Gewicht (schwerstes Drittel groß, leichtestes klein).
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
  const pieces: (Omit<StashPackage, 'id' | 'x' | 'y' | 'size'> & { grams: number })[] = [];
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
  const places = slots(setting, random);
  const packages: StashPackage[] = kept.map((p, i) => {
    const rank = ranked.indexOf(p);
    const size: PackageSize =
      p.productId === null
        ? p.amount >= 1500
          ? 2
          : 1
        : rank < bigCount
          ? 3
          : rank >= goods.length - smallCount
            ? 1
            : 2;
    const { grams: _, ...rest } = p;
    return { id: i, ...rest, size, x: round2(places[i % places.length].x), y: round2(places[i % places.length].y) };
  });
  const duration = Math.round(30 - 10 * d);
  const hides =
    setting === 'warehouse' ? warehouseHides(input.warehouse?.vault ?? 0, input.warehouse?.cover ?? 0) : streetHides();
  return {
    setting,
    packages,
    hides,
    duration,
    closeAt: setting === 'warehouse' ? duration - STREET_CLOSES_BEFORE : null,
    totalValue: packages.reduce((s, p) => s + p.value, 0),
    entry: setting === 'warehouse' ? { x: 42, y: 68 } : { x: 100, y: 62 },
  };
}

export function initStash(setup: StashSetup): StashState {
  return {
    time: 0,
    items: setup.packages.map((p) => ({ x: p.x, y: p.y, hide: null })),
    used: {},
    carry: null,
    selected: setup.packages.length > 0 ? 0 : -1,
    done: false,
    cleared: false,
  };
}

export function getHide(setup: StashSetup, id: HideId): StashHide | undefined {
  return setup.hides.find((h) => h.id === id);
}

/** Restliche Zeit in Sekunden. */
export function timeLeft(setup: StashSetup, state: StashState): number {
  return Math.max(0, setup.duration - state.time);
}

/** Sind die Verstecke draußen schon zu? */
export function streetClosed(setup: StashSetup, state: StashState): boolean {
  return setup.closeAt !== null && state.time >= setup.closeAt;
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

/** Ist das Paket noch zu haben (nicht versteckt, nicht getragen)? */
export function isLoose(state: StashState, id: number): boolean {
  return state.items[id]?.hide === null && state.carry?.id !== id;
}

/** Paket aufnehmen (nur eins zur Zeit, nur lose). */
export function grab(state: StashState, id: number): boolean {
  if (state.done || state.carry || !isLoose(state, id)) return false;
  const item = state.items[id];
  state.carry = { id, target: null, tx: item.x, ty: item.y, stowing: -1 };
  state.selected = id;
  return true;
}

/** Beim Ziehen: Ziel ist der Punkt unter dem Finger (in Szenen-Einheiten). */
export function steer(state: StashState, x: number, y: number): void {
  const c = state.carry;
  if (!c || c.target !== null) return;
  c.tx = Math.min(SCENE, Math.max(0, x));
  c.ty = Math.min(SCENE, Math.max(0, y));
}

/**
 * Loslassen: über einem Versteck, in das es passt, läuft das Paket dorthin weiter; sonst bleibt es liegen, wo es ist.
 * Gibt zurück, ob es klappt (bzw. warum nicht).
 */
export function release(setup: StashSetup, state: StashState, hideId: HideId | null): HideCheck {
  const c = state.carry;
  if (!c || c.target !== null) return 'busy';
  const check = hideId ? canHide(setup, state, c.id, hideId) : 'full';
  if (hideId && check === 'ok') {
    const hide = getHide(setup, hideId) as StashHide;
    c.target = hideId;
    c.tx = hide.x + hide.w / 2;
    c.ty = hide.y + hide.h / 2;
    return 'ok';
  }
  state.carry = null;
  return hideId ? check : 'ok';
}

/** Tastatur und Antippen: das Paket direkt in ein Versteck schicken (wird hingetragen und verstaut). */
export function send(setup: StashSetup, state: StashState, id: number, hideId: HideId): HideCheck {
  if (state.done) return 'done';
  if (state.carry) return 'busy';
  if (!isLoose(state, id)) return 'full';
  const check = canHide(setup, state, id, hideId);
  if (check !== 'ok') return check;
  grab(state, id);
  return release(setup, state, hideId);
}

/** Nächstes loses Paket in Richtung dir (+1/−1) ab dem ausgewählten, −1 wenn keins mehr da ist. */
export function nextLoose(setup: StashSetup, state: StashState, dir: 1 | -1): number {
  const n = setup.packages.length;
  for (let k = 1; k <= n; k++) {
    const id = (((state.selected + dir * k) % n) + n) % n;
    if (isLoose(state, id)) return id;
  }
  return -1;
}

/** Versteck an diesem Punkt (mit etwas Rand zum Treffen), sonst null. */
export function hideAt(setup: StashSetup, x: number, y: number, pad = 3): HideId | null {
  let best: { id: HideId; d: number } | null = null;
  for (const h of setup.hides) {
    if (x < h.x - pad || x > h.x + h.w + pad || y < h.y - pad || y > h.y + h.h + pad) continue;
    const d = Math.hypot(x - (h.x + h.w / 2), y - (h.y + h.h / 2));
    if (!best || d < best.d) best = { id: h.id, d };
  }
  return best?.id ?? null;
}

/** Loses Paket an diesem Punkt (das nächste innerhalb seiner Größe plus Rand), sonst −1. */
export function packageAt(setup: StashSetup, state: StashState, x: number, y: number, pad = 2.5): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of setup.packages) {
    if (!isLoose(state, p.id)) continue;
    const item = state.items[p.id];
    const half = PACKAGE_HALF[p.size] + pad;
    if (Math.abs(x - item.x) > half || Math.abs(y - item.y) > half) continue;
    const d = Math.hypot(x - item.x, y - item.y);
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/** Zeit laufen lassen: Tragen, Verstauen, Straße zu, Ende. Gibt zurück, was passiert ist (für Ton und Effekte). */
export function step(setup: StashSetup, state: StashState, dt: number): StashEvent[] {
  const events: StashEvent[] = [];
  if (state.done || !(dt > 0)) return events;
  const wasClosed = streetClosed(setup, state);
  state.time += dt;
  if (!wasClosed && streetClosed(setup, state)) events.push({ type: 'closed' });
  // Straße zu: Was noch auf dem Weg nach draußen ist, bleibt liegen, wo es gerade ist (wie beim Ablegen). Was dort
  // schon verstaut wird, ist drin (wie beim Ende der Zeit).
  const going = state.carry;
  if (going?.target && going.stowing < 0 && getHide(setup, going.target)?.outside && streetClosed(setup, state)) {
    state.carry = null;
  }
  const c = state.carry;
  if (c) {
    const pkg = setup.packages[c.id];
    const item = state.items[c.id];
    if (c.stowing >= 0) {
      c.stowing -= dt;
      if (c.stowing <= 0 && c.target) {
        item.hide = c.target;
        state.used[c.target] = usedIn(state, c.target) + pkg.size;
        events.push({ type: 'stowed', id: c.id, hide: c.target });
        state.carry = null;
        const next = nextLoose(setup, state, 1);
        state.selected = next;
        if (next < 0) {
          state.done = true;
          state.cleared = true;
          events.push({ type: 'cleared' });
          return events;
        }
      }
    } else {
      const dx = c.tx - item.x;
      const dy = c.ty - item.y;
      const dist = Math.hypot(dx, dy);
      const move = CARRY_SPEED[pkg.size] * dt;
      if (dist <= move) {
        item.x = c.tx;
        item.y = c.ty;
        if (c.target) {
          c.stowing = getHide(setup, c.target)?.stow ?? 0.3;
          events.push({ type: 'arrived', id: c.id, hide: c.target });
        }
      } else {
        item.x += (dx / dist) * move;
        item.y += (dy / dist) * move;
      }
    }
  }
  if (timeLeft(setup, state) <= 0) {
    state.done = true;
    // Was gerade verstaut wird, ist drin; was noch unterwegs ist, nicht.
    if (state.carry && state.carry.stowing >= 0 && state.carry.target) {
      const id = state.carry.id;
      state.items[id].hide = state.carry.target;
      state.used[state.carry.target] = usedIn(state, state.carry.target) + setup.packages[id].size;
    }
    state.carry = null;
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

/** Was passiert ist, für den Kern: je Versteck die Zahl der Pakete, dazu nass und liegen geblieben. */
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
