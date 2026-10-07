// Verkehrskontrolle (Feedback vom 07.10.2026: keine Fragen mit Antworten mehr) als reines Modell ohne DOM: „Verstecken
// und Nerven“. Blick von oben ins aufgeschnittene Auto. Der Beamte geht mit der Taschenlampe ums Auto, Station für
// Station (Fahrerfenster, hinten links, Kofferraum, hinten rechts, Beifahrerfenster), und leuchtet an jeder Station in
// ein, zwei Stellen. Du räumst die Pakete rechtzeitig dorthin, wo er nicht hinleuchtet (Handschuhfach, Konsole, unter
// den Fahrersitz, Türfächer, Kofferraum, Reserveradmulde). Liegt etwas in einer Stelle, wenn der Lichtkegel kommt, ist
// es gefunden: beim zweiten Fund „Aussteigen“. Nebenbei der Puls: im ruhigen Takt tippen hält ihn im grünen Bereich;
// zittrig steigt das Misstrauen, und er schaut ein zweites Mal unter den Sitz. Jederzeit: Gas geben (→ Verfolgungsjagd)
// und Schein zustecken (klappt nur bei mittlerem Misstrauen).
//
// Stationen, Stellen und Pakete kommen fest aus dem Seed (createRng). Die Oberfläche ruft advance() jedes Bild und
// send()/tap()/bribe()/flee() bei Eingaben auf und liest den Zustand. Alles ist deterministisch aus Seed,
// Schwierigkeit und Eingaben.

import { createRng } from '../../../../../core';

// ---------------------------------------------------------------------------------------------- Stellschrauben

/** Szene von oben in Einheiten (Breite × Höhe); das Auto steht mittig. */
export const SCENE_W = 100;
export const SCENE_H = 150;
/** Begrüßung am Fenster (Sekunden), bevor er loslegt. */
export const GREET = 2.4;
/** Zu Fuß zur nächsten Station (leicht bis schwer, Sekunden) und Blick in eine Stelle. */
export const WALK = { easy: 2, hard: 1.3 };
export const LOOK = { easy: 3.4, hard: 2.2 };
/** So viele Funde, dann lässt er aussteigen. */
export const MAX_FOUND = 2;
/** Misstrauen je Fund, bei abgelehntem Schein, pro Sekunde bei angespanntem bzw. zittrigem Puls. */
export const FOUND_SUS = 0.45;
export const BRIBE_FAIL_SUS = 0.3;
export const YELLOW_SUS = 0.02;
export const RED_SUS = 0.05;
/** Bestechen klappt nur bei mittlerem Misstrauen (dazwischen). */
export const BRIBE_MIN = 0.25;
export const BRIBE_MAX = 0.75;
/** Puls: bis GREEN ruhig, bis YELLOW angespannt, darüber zittrig; ab NERVOUS schaut er ein zweites Mal. */
export const PULSE_GREEN = 100;
export const PULSE_YELLOW = 120;
export const PULSE_NERVOUS = 128;
export const PULSE_MIN = 58;
export const PULSE_MAX = 170;
/** Ruhiger Takt zum Tippen in Sekunden; Treffer-Fenster um den Schlag. */
export const BEAT = 1;
export const BEAT_WINDOW = 0.2;
export const TAP_CALM = 7;
export const TAP_MISS = 4;
/** Pakete tragen: Einheiten pro Sekunde. */
export const CARRY_SPEED = 70;
/** Score für die Fälle ohne Urteil des Beamten (applyTraffic schaut auf die picks). */
export const BRIBE_SCORE = 0.6;
export const FLEE_SCORE = 0.45;

// ---------------------------------------------------------------------------------------------- Typen

export type ZoneId =
  | 'seat'
  | 'floor'
  | 'bench'
  | 'glovebox'
  | 'console'
  | 'underDriver'
  | 'doorL'
  | 'doorR'
  | 'trunk'
  | 'spare';

export type StopId = 'driverWindow' | 'rearLeft' | 'trunk' | 'rearRight' | 'passengerWindow';

export type PacketSize = 1 | 2;

export interface Zone {
  id: ZoneId;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Platz in Größen-Einheiten (klein 1, mittel 2); offene Stellen fassen alles. */
  capacity: number;
  maxSize: PacketSize;
  /** Sekunden zum Verstauen. */
  stow: number;
  /** Offen (Sitz, Fußraum, Bank): Da liegt es sichtbar. */
  open: boolean;
}

export interface Stop {
  id: StopId;
  label: string;
  /** Wo er steht (Szene). */
  x: number;
  y: number;
  /** Stellen, in die er hier leuchtet, der Reihe nach. */
  zones: ZoneId[];
}

export interface Packet {
  id: number;
  label: string;
  size: PacketSize;
  /** Gramm, nur zur Anzeige. */
  grams: number;
}

export interface TrafficSetup {
  seed: number;
  difficulty: number;
  zones: Zone[];
  stops: Stop[];
  packets: Packet[];
  /** Startplätze der Pakete (offene Stellen). */
  startZones: ZoneId[];
  walk: number;
  look: number;
  night: boolean;
  /** Zusätzliche Station, wenn du sichtbar schwitzt (einmal). */
  nervousStop: Stop;
}

export interface Moving {
  from: { x: number; y: number };
  to: { x: number; y: number };
  zone: ZoneId;
  total: number;
  left: number;
}

export interface PacketState {
  /** Wo es liegt (null: unterwegs oder gefunden). */
  zone: ZoneId | null;
  x: number;
  y: number;
  moving: Moving | null;
  found: boolean;
}

export type Phase = 'greet' | 'walk' | 'look' | 'end';
export type Outcome = 'pass' | 'fail' | 'flee' | 'bribe';

export interface TrafficState {
  t: number;
  phase: Phase;
  phaseT: number;
  phaseLen: number;
  /** Stationen, wie sie kommen (Kopie; die Nervös-Station wird eingeschoben). */
  stops: Stop[];
  stopIndex: number;
  zoneIndex: number;
  items: PacketState[];
  /** Ausgewähltes Paket (Antippen, Tastatur), −1 = keins. */
  selected: number;
  pulse: number;
  lastTapBeat: number;
  suspicion: number;
  found: number;
  nervousAsked: boolean;
  outcome: Outcome | null;
  /** Letzte Zeile des Beamten (Schlüssel und Text) mit Zähler, damit die Sprechblase neu aufploppt. */
  line: { text: string; n: number } | null;
}

/** Was im Schritt passiert ist (für Ton, Vibration, Optik). */
export type Signal =
  | 'greet'
  | 'walk'
  | 'look'
  | 'found'
  | 'stowed'
  | 'nervous'
  | 'pass'
  | 'fail'
  | 'bribeAccepted'
  | 'bribeRejected'
  | 'flee'
  | 'done';

export type SendCheck = 'ok' | 'full' | 'tooBig' | 'seen' | 'busy' | 'same' | 'done';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------- Daten

const ZONES: readonly Zone[] = [
  { id: 'seat', name: 'Beifahrersitz', x: 54, y: 56, w: 16, h: 22, capacity: 99, maxSize: 2, stow: 0.3, open: true },
  { id: 'floor', name: 'Fußraum hinten', x: 30, y: 80, w: 40, h: 11, capacity: 99, maxSize: 2, stow: 0.3, open: true },
  { id: 'bench', name: 'Rückbank', x: 27, y: 93, w: 46, h: 19, capacity: 99, maxSize: 2, stow: 0.3, open: true },
  {
    id: 'glovebox',
    name: 'Handschuhfach',
    x: 57,
    y: 38,
    w: 18,
    h: 10,
    capacity: 2,
    maxSize: 1,
    stow: 0.7,
    open: false,
  },
  { id: 'console', name: 'Mittelkonsole', x: 44, y: 52, w: 12, h: 20, capacity: 1, maxSize: 1, stow: 0.5, open: false },
  {
    id: 'underDriver',
    name: 'Unter dem Fahrersitz',
    x: 30,
    y: 56,
    w: 16,
    h: 22,
    capacity: 2,
    maxSize: 2,
    stow: 0.9,
    open: false,
  },
  { id: 'doorL', name: 'Türfach links', x: 24, y: 46, w: 5.5, h: 34, capacity: 1, maxSize: 1, stow: 0.5, open: false },
  {
    id: 'doorR',
    name: 'Türfach rechts',
    x: 70.5,
    y: 46,
    w: 5.5,
    h: 34,
    capacity: 1,
    maxSize: 1,
    stow: 0.5,
    open: false,
  },
  { id: 'trunk', name: 'Kofferraum', x: 27, y: 114, w: 46, h: 12, capacity: 4, maxSize: 2, stow: 0.9, open: false },
  {
    id: 'spare',
    name: 'Reserveradmulde',
    x: 38,
    y: 127,
    w: 24,
    h: 7.5,
    capacity: 2,
    maxSize: 1,
    stow: 1.4,
    open: false,
  },
];

interface StopDef {
  id: StopId;
  label: string;
  x: number;
  y: number;
  /** Stellen, in die er sicher leuchtet, und solche, die nur mit einer Chance drankommen. */
  always: ZoneId[];
  maybe: ZoneId[];
}

const STOPS: Record<StopId, StopDef> = {
  driverWindow: {
    id: 'driverWindow',
    label: 'am Fahrerfenster',
    x: 14,
    y: 64,
    always: ['seat', 'console'],
    maybe: ['doorL', 'underDriver', 'glovebox'],
  },
  rearLeft: { id: 'rearLeft', label: 'hinten links', x: 14, y: 102, always: ['bench', 'floor'], maybe: [] },
  trunk: { id: 'trunk', label: 'am Kofferraum', x: 50, y: 146, always: ['trunk'], maybe: ['spare'] },
  rearRight: { id: 'rearRight', label: 'hinten rechts', x: 86, y: 102, always: ['floor'], maybe: ['bench'] },
  passengerWindow: {
    id: 'passengerWindow',
    label: 'am Beifahrerfenster',
    x: 86,
    y: 64,
    always: ['seat'],
    maybe: ['glovebox', 'doorR'],
  },
};

const PACKET_LABELS = ['Päckchen', 'Beutel', 'Tüte', 'Block', 'Dose', 'Rolle'];

export function zoneById(id: ZoneId): Zone {
  const zone = ZONES.find((z) => z.id === id);
  if (!zone) throw new Error(`Stelle ${id} fehlt`);
  return zone;
}

// ---------------------------------------------------------------------------------------------- Aufbau

/** Ablauf fest aus Seed und Schwierigkeit: Stationen mit ihren Stellen, Pakete und ihre Startplätze. */
export function createTraffic(seed: number, difficulty: number, options: { night?: boolean } = {}): TrafficSetup {
  const d = clamp(Number.isFinite(difficulty) ? difficulty : 0.5, 0, 1);
  const rnd = createRng(seed);
  const pHidden = 0.25 + 0.6 * d;
  const taken = new Set<ZoneId>();
  const build = (def: StopDef): Stop => {
    const zones: ZoneId[] = [...def.always];
    for (const z of def.maybe) if (!taken.has(z) && rnd() < pHidden) zones.push(z);
    for (const z of zones) if (!zoneById(z).open) taken.add(z);
    return { id: def.id, label: def.label, x: def.x, y: def.y, zones };
  };
  // Erst das Fahrerfenster, dann einmal ums Auto (im oder gegen den Uhrzeigersinn); leicht: eine Seite weniger.
  const clockwise = rnd() < 0.5;
  const round: StopId[] = clockwise
    ? ['rearLeft', 'trunk', 'rearRight', 'passengerWindow']
    : ['passengerWindow', 'rearRight', 'trunk', 'rearLeft'];
  const order: StopId[] = ['driverWindow', ...round];
  if (d < 0.35) order.splice(order.indexOf(clockwise ? 'rearRight' : 'rearLeft'), 1);
  const stops = order.map((id) => build(STOPS[id]));
  // Pakete: 3 bis 6, mittlere eher bei leicht (die passen nicht überall hin).
  const count = 3 + Math.round(3 * d);
  const packets: Packet[] = [];
  const startZones: ZoneId[] = [];
  const opens: ZoneId[] = ['seat', 'bench', 'floor'];
  for (let i = 0; i < count; i++) {
    const size: PacketSize = rnd() < 0.35 ? 2 : 1;
    packets.push({
      id: i,
      label: PACKET_LABELS[Math.floor(rnd() * PACKET_LABELS.length)],
      size,
      grams: size === 2 ? 150 + Math.floor(rnd() * 6) * 50 : 40 + Math.floor(rnd() * 6) * 10,
    });
    startZones.push(opens[Math.floor(rnd() * opens.length)]);
  }
  return {
    seed,
    difficulty: d,
    zones: [...ZONES],
    stops,
    packets,
    startZones,
    walk: lerp(WALK.easy, WALK.hard, d),
    look: lerp(LOOK.easy, LOOK.hard, d),
    night: !!options.night,
    nervousStop: {
      id: 'driverWindow',
      label: 'noch einmal am Fahrerfenster',
      x: 14,
      y: 64,
      zones: ['underDriver', 'console', 'doorL'].filter((z) => !taken.has(z as ZoneId)) as ZoneId[],
    },
  };
}

/** Platz eines Pakets in einer Stelle (Mitte), je nach Reihenfolge der Pakete dort. */
export function slotIn(zone: Zone, index: number, size: PacketSize): { x: number; y: number } {
  const across = zone.w >= zone.h;
  const n = index;
  const step = size === 2 ? 9 : 7;
  if (across) {
    const total = Math.max(1, Math.floor(zone.w / step));
    const col = n % total;
    const row = Math.floor(n / total);
    return { x: zone.x + step / 2 + col * step + 1, y: zone.y + zone.h / 2 + (row % 2 === 0 ? 0 : 3) };
  }
  const total = Math.max(1, Math.floor(zone.h / step));
  const row = n % total;
  const col = Math.floor(n / total);
  return { x: zone.x + zone.w / 2 + (col % 2 === 0 ? 0 : 3), y: zone.y + step / 2 + row * step + 1 };
}

export function initTraffic(setup: TrafficSetup): TrafficState {
  const items: PacketState[] = [];
  const perZone = new Map<ZoneId, number>();
  setup.packets.forEach((p, i) => {
    const zoneId = setup.startZones[i];
    const zone = zoneById(zoneId);
    const index = perZone.get(zoneId) ?? 0;
    perZone.set(zoneId, index + 1);
    const at = slotIn(zone, index, p.size);
    items.push({ zone: zoneId, x: at.x, y: at.y, moving: null, found: false });
  });
  return {
    t: 0,
    phase: 'greet',
    phaseT: 0,
    phaseLen: GREET,
    stops: setup.stops.map((s) => ({ ...s, zones: [...s.zones] })),
    stopIndex: -1,
    zoneIndex: 0,
    items,
    selected: items.length > 0 ? 0 : -1,
    pulse: lerp(84, 96, setup.difficulty),
    lastTapBeat: -1,
    suspicion: 0.05 + 0.1 * setup.difficulty,
    found: 0,
    nervousAsked: false,
    outcome: null,
    line: null,
  };
}

// ---------------------------------------------------------------------------------------------- Lesen

export function zoneOf(state: TrafficState, packetId: number): ZoneId | null {
  return state.items[packetId]?.zone ?? null;
}

/** Pakete, die in einer Stelle liegen oder gerade dorthin unterwegs sind. */
export function packetsIn(state: TrafficState, zoneId: ZoneId): number[] {
  const ids: number[] = [];
  state.items.forEach((it, i) => {
    if (it.found) return;
    if (it.zone === zoneId || it.moving?.zone === zoneId) ids.push(i);
  });
  return ids;
}

export function usedIn(setup: TrafficSetup, state: TrafficState, zoneId: ZoneId): number {
  return packetsIn(state, zoneId).reduce((sum, id) => sum + setup.packets[id].size, 0);
}

export function currentStop(state: TrafficState): Stop | null {
  return state.stops[state.stopIndex] ?? null;
}

export function nextStop(state: TrafficState): Stop | null {
  return state.stops[state.stopIndex + 1] ?? null;
}

/** Stelle, in die er gerade leuchtet (null beim Gehen, Begrüßen, Ende). */
export function litZone(state: TrafficState): ZoneId | null {
  if (state.phase !== 'look') return null;
  return currentStop(state)?.zones[state.zoneIndex] ?? null;
}

/** Stellen, die an der aktuellen Station noch drankommen (nach der aktuellen). */
export function pendingZones(state: TrafficState): ZoneId[] {
  const stop = currentStop(state);
  if (!stop) return [];
  const from = state.phase === 'look' ? state.zoneIndex + 1 : 0;
  return stop.zones.slice(from);
}

export function isDone(state: TrafficState): boolean {
  return state.phase === 'end' && state.phaseT >= state.phaseLen;
}

export type Zone3 = 'green' | 'yellow' | 'red';

export function zoneOfPulse(pulse: number): Zone3 {
  return pulse < PULSE_GREEN ? 'green' : pulse < PULSE_YELLOW ? 'yellow' : 'red';
}

/** Wo im ruhigen Takt wir sind (0 = Schlag, 0,5 = genau dazwischen). */
export function beatPhase(state: TrafficState): number {
  return (state.t / BEAT) % 1;
}

/** Wie weit die Runde ist (0 bis 1, für die Anzeige). */
export function progress(state: TrafficState): number {
  const total = state.stops.reduce((s, st) => s + st.zones.length, 0);
  if (total === 0) return 1;
  let done = 0;
  for (let i = 0; i < state.stopIndex; i++) done += state.stops[i].zones.length;
  if (state.phase === 'look') done += state.zoneIndex;
  if (state.phase === 'end') return 1;
  return clamp(done / total, 0, 1);
}

/** Paket an einem Punkt der Szene (nur liegende, offene), −1 = keins. */
export function packetAt(setup: TrafficSetup, state: TrafficState, x: number, y: number): number {
  let best = -1;
  let bestD = 7;
  state.items.forEach((it, i) => {
    if (it.found || it.moving || !it.zone) return;
    if (!zoneById(it.zone).open) return;
    const d = Math.hypot(it.x - x, it.y - y);
    const r = setup.packets[i].size === 2 ? 5 : 4;
    if (d < r + 1.5 && d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function zoneAt(setup: TrafficSetup, x: number, y: number): ZoneId | null {
  // Kleine Stellen zuerst (Reserveradmulde liegt im Kofferraum, Konsole zwischen den Sitzen).
  const order = [...setup.zones].sort((a, b) => a.w * a.h - b.w * b.h);
  const hit = order.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  return hit?.id ?? null;
}

// ---------------------------------------------------------------------------------------------- Schreiben

function say(state: TrafficState, list: readonly string[], salt: number): void {
  const text = list[(salt + state.found * 3 + state.stopIndex) % list.length];
  state.line = { text, n: (state.line?.n ?? 0) + 1 };
}

function setPhase(state: TrafficState, phase: Phase, len: number): void {
  state.phase = phase;
  state.phaseT = 0;
  state.phaseLen = len;
}

function end(state: TrafficState, outcome: Outcome, len: number): void {
  state.outcome = outcome;
  setPhase(state, 'end', len);
}

export interface Lines {
  greet: readonly string[];
  walk: readonly string[];
  found: readonly string[];
  fail: readonly string[];
  nervous: readonly string[];
  pass: readonly string[];
  look: Record<ZoneId, readonly string[]>;
}

/** Fund in der Stelle, in die er gerade leuchtet: Pakete dort sind weg. 'end', wenn es jetzt vorbei ist. */
function inspect(
  setup: TrafficSetup,
  state: TrafficState,
  zoneId: ZoneId,
  lines: Lines,
  out: Signal[],
): 'none' | 'found' | 'end' {
  const ids = packetsIn(state, zoneId);
  if (ids.length === 0) return 'none';
  for (const id of ids) {
    const it = state.items[id];
    it.found = true;
    it.zone = null;
    it.moving = null;
  }
  state.found += 1;
  state.suspicion = clamp(state.suspicion + FOUND_SUS, 0, 1);
  if (state.selected >= 0 && state.items[state.selected].found) state.selected = -1;
  if (state.found >= MAX_FOUND || state.suspicion >= 1) {
    say(state, lines.fail, 0);
    end(state, 'fail', 2.2);
    out.push('found', 'fail');
    return 'end';
  }
  say(state, lines.found, setup.seed + state.found);
  out.push('found');
  return 'found';
}

/** Nächste Stelle an der Station, sonst zur nächsten Station gehen, sonst „Gute Fahrt“. */
function nextLook(setup: TrafficSetup, state: TrafficState, lines: Lines, out: Signal[]): void {
  const stop = currentStop(state);
  if (stop && state.zoneIndex + 1 < stop.zones.length) {
    state.zoneIndex += 1;
    startLook(setup, state, lines, out);
    return;
  }
  if (state.stopIndex + 1 < state.stops.length) {
    state.stopIndex += 1;
    state.zoneIndex = 0;
    say(state, lines.walk, state.stopIndex);
    setPhase(state, 'walk', setup.walk);
    out.push('walk');
    return;
  }
  say(state, lines.pass, setup.seed);
  end(state, 'pass', 2);
  out.push('pass');
}

function startLook(setup: TrafficSetup, state: TrafficState, lines: Lines, out: Signal[]): void {
  const zoneId = currentStop(state)?.zones[state.zoneIndex];
  if (!zoneId) {
    nextLook(setup, state, lines, out);
    return;
  }
  setPhase(state, 'look', setup.look);
  out.push('look');
  if (inspect(setup, state, zoneId, lines, out) === 'none')
    say(state, lines.look[zoneId], setup.seed + state.zoneIndex);
}

/** Ein Schritt in echten Sekunden. */
export function advance(setup: TrafficSetup, state: TrafficState, dt: number, lines: Lines): Signal[] {
  const out: Signal[] = [];
  if (state.phase === 'end' && state.phaseT >= state.phaseLen) return out;
  state.t += dt;
  state.phaseT += dt;
  // Pakete unterwegs.
  for (const it of state.items) {
    const m = it.moving;
    if (!m) continue;
    m.left -= dt;
    const k = clamp(1 - m.left / m.total, 0, 1);
    it.x = lerp(m.from.x, m.to.x, Math.min(1, k * 1.4));
    it.y = lerp(m.from.y, m.to.y, Math.min(1, k * 1.4));
    if (m.left <= 0) {
      it.zone = m.zone;
      it.moving = null;
      it.x = m.to.x;
      it.y = m.to.y;
      out.push('stowed');
    }
  }
  if (state.phase === 'end') return out;
  // Puls: steigt von selbst, mehr, wenn er gerade guckt und noch etwas offen liegt.
  const lit = litZone(state);
  const exposed = state.items.some((it) => !it.found && it.zone !== null && zoneById(it.zone).open);
  const stress = 1 + (lit && exposed ? 1.8 : 0) + (lit ? 0.4 : 0);
  state.pulse = clamp(state.pulse + stress * dt, PULSE_MIN, PULSE_MAX);
  const zone = zoneOfPulse(state.pulse);
  if (zone === 'yellow') state.suspicion = clamp(state.suspicion + YELLOW_SUS * dt, 0, 1);
  else if (zone === 'red') state.suspicion = clamp(state.suspicion + RED_SUS * dt, 0, 1);
  else state.suspicion = clamp(state.suspicion - 0.01 * dt, 0, 1);
  if (state.suspicion >= 1) {
    say(state, lines.fail, 0);
    end(state, 'fail', 2.2);
    out.push('fail');
    return out;
  }
  // Sichtbar nervös: eine Station mehr (einmal), direkt nach der aktuellen.
  if (
    !state.nervousAsked &&
    state.pulse >= PULSE_NERVOUS &&
    state.stopIndex >= 0 &&
    setup.nervousStop.zones.length > 0
  ) {
    state.nervousAsked = true;
    state.stops.splice(state.stopIndex + 1, 0, { ...setup.nervousStop, zones: [...setup.nervousStop.zones] });
    say(state, lines.nervous, setup.seed);
    out.push('nervous');
  }
  // Ablauf.
  if (state.phase === 'greet') {
    if (state.phaseT === dt || state.line === null) {
      say(state, lines.greet, 0);
      out.push('greet');
    }
    if (state.phaseT >= state.phaseLen) {
      state.stopIndex = 0;
      state.zoneIndex = 0;
      startLook(setup, state, lines, out);
    }
  } else if (state.phase === 'walk') {
    if (state.phaseT >= state.phaseLen) startLook(setup, state, lines, out);
  } else if (state.phase === 'look') {
    if (state.phaseT >= state.phaseLen) nextLook(setup, state, lines, out);
  }
  return out;
}

/** Paket in eine Stelle bringen. 'seen', wenn er gerade dorthin oder von dort wegleuchtet. */
export function send(setup: TrafficSetup, state: TrafficState, packetId: number, zoneId: ZoneId): SendCheck {
  if (state.phase === 'end') return 'done';
  const it = state.items[packetId];
  const packet = setup.packets[packetId];
  if (!it || !packet || it.found) return 'done';
  if (it.moving) return 'busy';
  if (it.zone === zoneId) return 'same';
  const lit = litZone(state);
  if (lit && (lit === zoneId || lit === it.zone)) return 'seen';
  const zone = zoneById(zoneId);
  if (packet.size > zone.maxSize) return 'tooBig';
  if (usedIn(setup, state, zoneId) + packet.size > zone.capacity) return 'full';
  const index = packetsIn(state, zoneId).length;
  const to = slotIn(zone, index, packet.size);
  const distance = Math.hypot(to.x - it.x, to.y - it.y);
  const total = Math.max(0.25, distance / CARRY_SPEED) + zone.stow;
  it.moving = { from: { x: it.x, y: it.y }, to, zone: zoneId, total, left: total };
  it.zone = null;
  return 'ok';
}

/** Im Takt tippen: Treffer beruhigt, daneben macht nervöser. null, wenn in diesem Schlag schon getippt. */
export function tap(state: TrafficState): 'calm' | 'miss' | null {
  if (state.phase === 'end') return null;
  const beat = Math.floor(state.t / BEAT);
  if (beat === state.lastTapBeat) return null;
  state.lastTapBeat = beat;
  const phase = beatPhase(state);
  const hit = phase <= BEAT_WINDOW || phase >= 1 - BEAT_WINDOW;
  state.pulse = clamp(state.pulse + (hit ? -TAP_CALM : TAP_MISS), PULSE_MIN, PULSE_MAX);
  return hit ? 'calm' : 'miss';
}

/** Schein zustecken: klappt bei mittlerem Misstrauen, sonst steigt es. */
export function bribe(
  state: TrafficState,
  lines: { ok: readonly string[]; low: readonly string[]; high: readonly string[] },
) {
  if (state.phase === 'end') return 'done' as const;
  if (state.suspicion >= BRIBE_MIN && state.suspicion <= BRIBE_MAX) {
    say(state, lines.ok, 0);
    end(state, 'bribe', 1.8);
    return 'ok' as const;
  }
  const low = state.suspicion < BRIBE_MIN;
  say(state, low ? lines.low : lines.high, 0);
  state.suspicion = clamp(state.suspicion + BRIBE_FAIL_SUS, 0, 1);
  if (state.suspicion >= 1) {
    end(state, 'fail', 2.2);
    return 'fail' as const;
  }
  return low ? ('low' as const) : ('high' as const);
}

export function flee(state: TrafficState, lines: readonly string[]): boolean {
  if (state.phase === 'end') return false;
  say(state, lines, 0);
  end(state, 'flee', 1.3);
  return true;
}

/** Nächstes liegendes Paket (für die Tastatur), −1 ohne. */
export function nextPacket(state: TrafficState, dir: 1 | -1): number {
  const n = state.items.length;
  for (let k = 1; k <= n; k++) {
    const i = ((((state.selected < 0 ? (dir > 0 ? -1 : 0) : state.selected) + dir * k) % n) + n) % n;
    const it = state.items[i];
    if (!it.found && !it.moving && it.zone !== null) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------- Ergebnis

/**
 * Score: „Gute Fahrt“ 0,6 bis 1 (weniger Misstrauen, nichts gefunden: mehr); Schein BRIBE_SCORE; Gas FLEE_SCORE;
 * „Aussteigen“ 0,1 bis 0,4 nach dem Stand der Runde.
 */
export function trafficScore(state: TrafficState): number {
  const o = state.outcome;
  if (o === 'bribe') return BRIBE_SCORE;
  if (o === 'flee') return FLEE_SCORE;
  if (o === 'pass') {
    const clean = state.found === 0 ? 1 : 0.7;
    return Math.round((0.6 + 0.4 * (1 - state.suspicion) * clean) * 1000) / 1000;
  }
  return Math.round((0.1 + 0.3 * progress(state)) * 1000) / 1000;
}

/** picks für den Kern: 'flee', 'bribe', 'found:<n>' (so viele Pakete hat er eingesackt). */
export function trafficPicks(state: TrafficState): string[] {
  const picks: string[] = [];
  if (state.outcome === 'flee') picks.push('flee');
  if (state.outcome === 'bribe') picks.push('bribe');
  if (state.found > 0) picks.push(`found:${state.found}`);
  return picks;
}
