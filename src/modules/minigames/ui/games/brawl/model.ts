// Straßenkampf (Auftrag 44, Teil 2): Spiellogik als reines Modell, ohne DOM (getestet in model.test.ts).
//
// Seitenansicht mit zwei Tiefen-Ebenen (vorne, hinten). Du, bis zu drei Leute deiner Crew und die Gegner aus der
// Konfrontation (Rollen Anführer, Nervöser, Schläger). Treffen kann nur, wer in derselben Ebene vor dem anderen steht.
//   leichter Schlag   schnell, wenig Schaden
//   schwerer Schlag   langsam, viel Schaden, stößt zurück, bricht die Deckung des Anführers
//   Block             halten: fängt fast alles ab; im letzten Moment vor dem Treffer = Konter
//   Ausweichen        kurz unverwundbar; im letzten Moment vor dem Treffer = Konter
// Gegner kündigen Angriffe an (Ausholen mit Symbol über dem Kopf, das Messer rot). Ein Konter gibt Zeitlupe, der Gegner
// taumelt, und dein nächster Treffer zählt doppelt. Die Absicht der Konfrontation bestimmt, wer was vorhat (intent).
// Die Polizei-Uhr läuft mit: Ist sie um, kommen Sirenen, und alle rennen weg.
//
// Zufall nur aus dem Seed (createRng), nie ctx.random(). Zeit in echten Sekunden (dt), Zeitlupe und Treffer-Stopp
// rechnet das Modell selbst. Ergebnis als picks wie in applyBrawl: down:<n>, fled:<n>, hurt:<staffId>, playerHurt, ko,
// dazu grabbed (einer ist mit der Beute weg) und sirens (die Polizei kam).

import { createRng } from '../../../../../core';

// ---------------------------------------------------------------------------------------------
// Daten

/** Breite der Bühne in Metern. */
export const ARENA_W = 18;
/** So weit vom Rand bleibt man stehen (außer beim Wegrennen). */
export const EDGE = 0.8;
/** Bis zu so vielen Gegnern stehen auf der Bühne. */
export const MAX_FOES = 6;
export const MAX_CREW = 3;

export type FoeRole = 'leader' | 'nervous' | 'bruiser';
export type FighterKind = 'player' | 'crew' | FoeRole;
export type AttackId = 'light' | 'heavy' | 'knife';
export type CrewMove = 'block' | 'secondTalk' | 'getaway' | 'stash';
export type FighterState =
  | 'idle'
  | 'walk'
  | 'windup'
  | 'strike'
  | 'recover'
  | 'block'
  | 'dodge'
  | 'hit'
  | 'down'
  | 'run';

export interface AttackDef {
  /** Ausholen (Spieler, Crew) in Sekunden; Gegner holen länger aus (FOE_TELL). */
  windup: number;
  active: number;
  recover: number;
  damage: number;
  /** Reichweite in Metern. */
  reach: number;
  /** Rückstoß in m/s. */
  knock: number;
  /** So lange taumelt der Getroffene. */
  stun: number;
}

export const ATTACKS: Record<AttackId, AttackDef> = {
  light: { windup: 0.09, active: 0.08, recover: 0.22, damage: 7, reach: 1.1, knock: 0.9, stun: 0.24 },
  heavy: { windup: 0.3, active: 0.1, recover: 0.36, damage: 16, reach: 1.3, knock: 3.2, stun: 0.5 },
  knife: { windup: 0.3, active: 0.12, recover: 0.5, damage: 22, reach: 1.4, knock: 0.6, stun: 0.45 },
};

/** Leben eines Gegners (vor Rolle und Stärke). */
export const FOE_HP = 80;
/** Nach so vielen Treffern in Folge (je höchstens CHAIN_GAP auseinander) fliegt der Getroffene aus der Reichweite. */
export const CHAIN_MAX = 3;
export const CHAIN_GAP = 0.9;

/** Wie lange Gegner ausholen (Ansage), bei Schwierigkeit 0; mit Schwierigkeit 1 gut ein Drittel kürzer. */
export const FOE_TELL: Record<AttackId, number> = { light: 0.5, heavy: 0.75, knife: 0.95 };

/** Werte der Gegner je Rolle (Faktoren auf Leben, Kraft, Tempo; guard = wie oft der Anführer blockt). */
export const ROLES: Record<FoeRole, { hp: number; power: number; speed: number; guard: number; heavy: number }> = {
  leader: { hp: 1.2, power: 1.1, speed: 1, guard: 0.5, heavy: 0.45 },
  nervous: { hp: 0.7, power: 0.8, speed: 1.15, guard: 0, heavy: 0.15 },
  bruiser: { hp: 1.75, power: 1.45, speed: 0.72, guard: 0, heavy: 0.75 },
};

export const ROLE_NAMES: Record<FoeRole, string> = { leader: 'Anführer', nervous: 'Nervöser', bruiser: 'Schläger' };

/** Spezialzüge der Crew im Kampf (aus crew.ts der Konfrontationen): Knopf mit Abklingzeit. */
export const CREW_MOVES: Record<CrewMove, { label: string; hint: string; icon: string; cooldown: number }> = {
  block: { label: 'Deckung', hint: 'Fängt den nächsten Treffer gegen dich ab.', icon: 'shield', cooldown: 9 },
  secondTalk: { label: 'Reden', hint: 'Ein Gegner zögert und hält still.', icon: 'handshake', cooldown: 12 },
  getaway: { label: 'Fernlicht', hint: 'Der Wagen blendet auf, alle taumeln.', icon: 'car', cooldown: 15 },
  stash: { label: 'Ablenken', hint: 'Einer jagt ihm hinterher. Die Beute ist sicher.', icon: 'bag', cooldown: 11 },
};

/** Treffer im letzten Moment abgefangen (Block oder Ausweichen so kurz davor) = Konter. */
export const PARRY_WINDOW = 0.22;
export const DODGE_TIME = 0.34;
export const DODGE_COOLDOWN = 0.45;
export const COUNTER_TIME = 1.4;
/** Ein zu früher Angriff gilt, bis du wieder frei bist, und danach noch so lange (Spielzeit). */
export const ATTACK_BUFFER = 0.25;
/** Zeitlupe nach einem Konter und am Ende (Sekunden echter Zeit, Faktor). */
export const SLOWMO = 0.28;
/** So lange braucht einer, um die Beute zu greifen. */
export const GRAB_TIME = 2.6;

export interface BrawlFighterSetup {
  id: string;
  kind: FighterKind;
  name: string;
  /** Für das Aussehen: Seed (lookFor) bzw. Name und Alter (personLook). */
  lookSeed: string;
  age: number | null;
  hp: number;
  power: number;
  /** Meter pro Sekunde. */
  speed: number;
  move: CrewMove | null;
  knife: boolean;
}

export interface BrawlIntent {
  id: string;
  label: string;
  stake: string | null;
}

export interface BrawlSetup {
  seed: number;
  difficulty: number;
  /** Polizei-Uhr in Sekunden. */
  duration: number;
  label: string;
  setting: string;
  phase: string;
  weather: string;
  intent: BrawlIntent | null;
  /** Einer will an die Beute (Ware, Kasse): Sie steht am rechten Rand. */
  loot: { stake: string; x: number } | null;
  /** Was die Absicht im Kampf heißt (Ansage oben), oder null. */
  callout: string | null;
  own: BrawlFighterSetup[];
  foes: BrawlFighterSetup[];
  /** Wie viele Gegner gleichzeitig angreifen dürfen. */
  attackers: number;
  /** Faktor auf die Pausen der Gegner zwischen zwei Angriffen (< 1 = aggressiver). */
  pace: number;
  /** Ab diesem Anteil Leben haut der Nervöse ab. */
  nervousAt: number;
}

// ---------------------------------------------------------------------------------------------
// Zustand

export interface Fighter {
  id: string;
  side: 'own' | 'foe';
  kind: FighterKind;
  x: number;
  /** Ebene: 0 vorne, 1 hinten. depth folgt weich (für das Bild und die Treffer). */
  lane: 0 | 1;
  depth: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  power: number;
  speed: number;
  state: FighterState;
  /** Zeit im aktuellen Zustand. */
  t: number;
  /** Dauer des Zustands (für windup/strike/recover/hit/dodge). */
  dur: number;
  attack: AttackId | null;
  /** Schon getroffen in diesem Schlag. */
  landed: boolean;
  /** Rückstoß (m/s), klingt ab. */
  vx: number;
  /** KI: Zeit bis zur nächsten Entscheidung bzw. zum nächsten Angriff. */
  cooldown: number;
  target: string | null;
  /** Zögert (Spezialzug „Reden“): greift nicht an. */
  hesitate: number;
  /** Will an die Beute: Fortschritt in Sekunden (0 = nicht dabei). */
  grab: number;
  grabber: boolean;
  /** Wie lange es noch dauert, bis er wieder an die Beute geht. */
  grabPause: number;
  knife: boolean;
  /** Ausgeschaltet: down (am Boden), fled (abgehauen), null (dabei). */
  out: null | 'down' | 'fled';
  /** Seit wann der Block gehalten wird (für den Konter), −1 = kein Block. */
  blockSince: number;
  /** Seit wann ausgewichen wird. */
  dodgeSince: number;
  /** Treffer abbekommen (für die Optik: Veilchen und Co.). */
  hitsTaken: number;
  /** Treffer in Folge (Kette) und wann der letzte war: Nach CHAIN_MAX fliegt er zurück. */
  chain: number;
  chainAt: number;
  /** Optik: wann zuletzt getroffen (Aufblitzen). */
  flash: number;
  /** Abklingzeit des Spezialzugs (Crew). */
  moveCd: number;
  move: CrewMove | null;
  /** Haut wirklich ab (nicht nur vor den Sirenen): zählt als abgehauen. */
  fleeing: boolean;
}

export type BrawlEnd = 'won' | 'ko' | 'sirens' | null;

export interface BrawlState {
  /** Spielzeit in Sekunden (mit Zeitlupe). */
  time: number;
  /** Echte Sekunden seit dem Start (für die Polizei-Uhr). */
  clock: number;
  fighters: Fighter[];
  /** Treffer-Stopp: so lange steht alles (echte Sekunden). */
  hitStop: number;
  /** Zeitlupe: so lange (echte Sekunden), Faktor SLOWMO. */
  slowmo: number;
  /** Der nächste Treffer des Spielers zählt doppelt (Konter), bis zu dieser Zeit. */
  counterUntil: number;
  /** Deckung durch die Crew (Spezialzug block): id des Beschützers oder null. */
  guardBy: string | null;
  guardUntil: number;
  /** Die Beute ist eine Weile sicher (Spezialzug stash) bis zu dieser Zeit. */
  lootSafeUntil: number;
  grabbed: boolean;
  sirens: boolean;
  end: BrawlEnd;
  /** Echte Sekunden seit dem Ende (Zeitlupe, Abgang), danach meldet die Oberfläche das Ergebnis. */
  endT: number;
  /** Zufall aus dem Seed (Zustand des Generators lebt in der Funktion). */
  combo: number;
  /** Dein letzter Angriff wurde gepuffert (kam zu früh): so lange gilt er noch (bis du frei bist plus ATTACK_BUFFER). */
  buffered: { attack: AttackId; until: number } | null;
  /**
   * Tasten-Drücke aus dem Treffer-Stopp: Sie gelten im ersten Bild danach (sonst gingen sie verloren). Ausweichen
   * wartet hier, solange du noch ausholst, zuschlägst oder taumelst.
   */
  held: BrawlInput | null;
}

/** Was der Spieler in diesem Bild tut. Tasten-Drücke (light, heavy, dodge, lane, special) gelten einmal. */
export interface BrawlInput {
  dx: -1 | 0 | 1;
  lane?: -1 | 1 | null;
  light?: boolean;
  heavy?: boolean;
  block?: boolean;
  dodge?: boolean;
  /** Spezialzug der Crew (staff-ID). */
  special?: string | null;
}

export type BrawlEvent =
  | {
      type: 'hit';
      attacker: string;
      target: string;
      damage: number;
      attack: AttackId;
      counter: boolean;
      blocked: boolean;
      x: number;
      depth: number;
    }
  | { type: 'parry'; target: string; attacker: string; how: 'block' | 'dodge' }
  | { type: 'guarded'; by: string; attacker: string }
  | { type: 'telegraph'; id: string; attack: AttackId }
  | { type: 'swing'; id: string; attack: AttackId }
  | { type: 'guardBreak'; id: string }
  | { type: 'down'; id: string }
  | { type: 'fled'; id: string }
  | { type: 'grabStart'; id: string }
  | { type: 'grabbed'; id: string }
  | { type: 'special'; id: string; move: CrewMove; target: string | null }
  | { type: 'sirens' }
  | { type: 'end'; end: Exclude<BrawlEnd, null> };

// ---------------------------------------------------------------------------------------------
// Aufbau aus den params der Konfrontation

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isRole(value: unknown): value is FoeRole {
  return value === 'leader' || value === 'nervous' || value === 'bruiser';
}

function isMove(value: unknown): value is CrewMove {
  return value === 'block' || value === 'secondTalk' || value === 'getaway' || value === 'stash';
}

/** Absichten, die hinter der Beute her sind (stake Ware oder Kasse). */
const GRAB_INTENTS = new Set(['grabGoods', 'grabCash', 'hideLoot', 'emptyTill', 'hideMoney']);

/** Was die Absicht im Kampf heißt: eine kurze Ansage oben. */
const INTENT_CALLOUTS: Record<string, string> = {
  knife: 'Messer! Abstand halten, ausweichen.',
  grabGoods: 'Einer will an die Ware. Halt ihn auf.',
  grabCash: 'Einer will an die Kasse. Halt ihn auf.',
  hideLoot: 'Sie schaffen die Ware weg. Halt ihn auf.',
  emptyTill: 'Einer räumt die Kasse. Halt ihn auf.',
  hideMoney: 'Er will das Geld verstecken. Halt ihn auf.',
  bruiserUp: 'Der Schläger ist in Rage.',
  nervousWavers: 'Der Nervöse schaut zur Tür.',
  leaderTalks: 'Der Anführer zögert noch.',
  exit: 'Sie suchen den Ausgang.',
  whine: 'Er will eigentlich nicht kämpfen.',
  noise: 'Es wird laut. Die Polizei kommt schneller.',
  callFriends: 'Sie haben Verstärkung gerufen.',
  wreck: 'Sie zerlegen alles. Mach schnell.',
};

/** Rollen der Gegner, wenn die Konfrontation keine nennt: einer führt, einer ist nervös, dann Schläger. */
function defaultRoles(count: number): FoeRole[] {
  const roles: FoeRole[] = [];
  for (let i = 0; i < count; i++) roles.push(i === 0 ? 'leader' : i === 1 ? 'nervous' : 'bruiser');
  return roles;
}

/**
 * Kampf aus den params der Konfrontation (minigameParams in encounters): opponent { label, strength, count, roles },
 * intent { id, label, stake }, crew [{ id, name, stats, condition, move, age }], player { stats, condition }, clock,
 * setting, phase, weather.
 */
export function createBrawl(seed: number, difficulty: number, params: Record<string, unknown>): BrawlSetup {
  const d = clamp(num(difficulty, 0.5), 0, 1);
  const opponent = obj(params.opponent);
  const strength = clamp(num(opponent.strength, 50), 0, 100);
  const listed = Array.isArray(opponent.roles) ? opponent.roles.filter(isRole) : [];
  const count = clamp(Math.round(num(opponent.count, listed.length || 3)), 1, MAX_FOES);
  const roles = (listed.length > 0 ? listed : defaultRoles(count)).slice(0, MAX_FOES);
  const label = str(opponent.label, 'Die Gegner');
  const rawIntent = obj(params.intent);
  const intent: BrawlIntent | null =
    typeof rawIntent.id === 'string'
      ? {
          id: rawIntent.id,
          label: str(rawIntent.label, ''),
          stake: typeof rawIntent.stake === 'string' ? rawIntent.stake : null,
        }
      : null;
  const intentId = intent?.id ?? '';

  // Gegner: Leben und Kraft aus der Stärke der Gegenseite (0–100) und der Schwierigkeit.
  const scale = 0.75 + (strength / 100) * 0.5 + d * 0.25;
  const knifeAt = intentId === 'knife' ? Math.max(0, roles.indexOf('leader') >= 0 ? roles.indexOf('leader') : 0) : -1;
  const foes: BrawlFighterSetup[] = roles.map((role, i) => {
    const r = ROLES[role];
    const rage = role === 'bruiser' && intentId === 'bruiserUp' ? 1.25 : 1;
    return {
      id: `foe:${i}`,
      kind: role,
      name: ROLE_NAMES[role],
      lookSeed: `gang:${label}:${seed}:${i}`,
      age: null,
      hp: Math.round(FOE_HP * r.hp * scale),
      power: r.power * (0.95 + d * 0.5) * rage,
      speed: 2.4 * r.speed,
      move: null,
      knife: i === knifeAt,
    };
  });

  const player = obj(params.player);
  const pStats = obj(player.stats);
  const pStrength = clamp(num(pStats.strength, 50), 0, 100);
  const own: BrawlFighterSetup[] = [
    {
      id: 'player',
      kind: 'player',
      name: 'Du',
      lookSeed: 'player:boss',
      age: null,
      hp: player.condition === 'injured' ? 70 : 100,
      power: 0.85 + (pStrength / 100) * 0.5,
      speed: 3.3 + (clamp(num(pStats.speed, 50), 0, 100) / 100) * 0.6,
      move: null,
      knife: false,
    },
  ];
  const crew = Array.isArray(params.crew) ? params.crew : [];
  for (const raw of crew) {
    if (own.length > MAX_CREW) break;
    const c = obj(raw);
    if (c.condition === 'down' || typeof c.id !== 'string') continue;
    const stats = obj(c.stats);
    const s = clamp(num(stats.strength, 40), 0, 100);
    own.push({
      id: c.id,
      kind: 'crew',
      name: str(c.name, 'Crew'),
      lookSeed: str(c.name, c.id),
      age: Number.isFinite(Number(c.age)) && c.age !== null ? Number(c.age) : null,
      hp: Math.round((c.condition === 'injured' ? 0.6 : 1) * (55 + s * 0.35)),
      power: 0.6 + (s / 100) * 0.75,
      speed: 2.6 + (clamp(num(stats.speed, 40), 0, 100) / 100) * 0.8,
      move: isMove(c.move) ? c.move : null,
      knife: false,
    });
  }

  // Polizei-Uhr: Runden der Konfrontation in Sekunden (Lärm macht sie kürzer).
  const rounds = clamp(num(params.clock, 4), 1, 8);
  const duration = clamp(24 + rounds * 9 - (intentId === 'noise' ? 10 : 0), 30, 80);
  const grabs = GRAB_INTENTS.has(intentId) && foes.length > 0;
  const calm = intentId === 'leaderTalks' || intentId === 'exit' || intentId === 'whine';
  return {
    seed,
    difficulty: d,
    duration,
    label,
    setting: str(params.setting, 'street'),
    phase: str(params.phase, 'night'),
    weather: str(params.weather, 'clear'),
    intent,
    loot: grabs ? { stake: intent?.stake ?? 'goods', x: ARENA_W - EDGE - 0.6 } : null,
    callout: INTENT_CALLOUTS[intentId] ?? null,
    own,
    foes,
    attackers: d >= 0.7 && foes.length > 2 ? 2 : 1,
    pace: (1.25 - d * 0.55) * (calm ? 1.35 : 1) * (intentId === 'callFriends' || intentId === 'wreck' ? 0.85 : 1),
    nervousAt: intentId === 'nervousWavers' || intentId === 'exit' ? 0.8 : 0.5,
  };
}

function fighterFrom(s: BrawlFighterSetup, side: 'own' | 'foe', x: number, lane: 0 | 1): Fighter {
  return {
    id: s.id,
    side,
    kind: s.kind,
    x,
    lane,
    depth: lane,
    facing: side === 'own' ? 1 : -1,
    hp: s.hp,
    maxHp: s.hp,
    power: s.power,
    speed: s.speed,
    state: 'idle',
    t: 0,
    dur: 0,
    attack: null,
    landed: false,
    vx: 0,
    cooldown: 0,
    target: null,
    hesitate: 0,
    grab: 0,
    grabber: false,
    grabPause: 0,
    knife: s.knife,
    out: null,
    blockSince: -1,
    dodgeSince: -10,
    hitsTaken: 0,
    chain: 0,
    chainAt: -10,
    flash: -10,
    moveCd: 0,
    move: s.move,
    fleeing: false,
  };
}

/** Anfangsaufstellung: ihr links, die Gegner rechts, verteilt auf beide Ebenen. */
export function initBrawl(setup: BrawlSetup): BrawlState {
  const rng = createRng(setup.seed);
  const fighters: Fighter[] = [];
  setup.own.forEach((s, i) => {
    const lane: 0 | 1 = i === 0 ? 0 : i % 2 === 1 ? 1 : 0;
    fighters.push(fighterFrom(s, 'own', 4.2 - i * 0.9 - (lane === 1 ? 0.2 : 0), lane));
  });
  setup.foes.forEach((s, i) => {
    const lane: 0 | 1 = i % 2 === 0 ? 0 : 1;
    const f = fighterFrom(s, 'foe', 9.6 + i * 1.05 + rng() * 0.4, lane);
    f.cooldown = 0.6 + rng() * 0.9;
    fighters.push(f);
  });
  // Der Greifer: der Nervöse (sonst der letzte), wenn die Absicht der Beute gilt.
  if (setup.loot) {
    const foes = fighters.filter((f) => f.side === 'foe');
    const grabber = foes.find((f) => f.kind === 'nervous') ?? foes[foes.length - 1];
    if (grabber) {
      grabber.grabber = true;
      grabber.grabPause = 1.2;
    }
  }
  return {
    time: 0,
    clock: 0,
    fighters,
    hitStop: 0,
    slowmo: 0,
    counterUntil: -1,
    guardBy: null,
    guardUntil: -1,
    lootSafeUntil: -1,
    grabbed: false,
    sirens: false,
    end: null,
    endT: 0,
    combo: 0,
    buffered: null,
    held: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Lesen

export function playerOf(state: BrawlState): Fighter {
  const p = state.fighters.find((f) => f.kind === 'player');
  if (!p) throw new Error('Kein Spieler im Kampf');
  return p;
}

export function fighterById(state: BrawlState, id: string): Fighter | undefined {
  return state.fighters.find((f) => f.id === id);
}

/** Steht noch und ist auf der Bühne. */
export function isIn(f: Fighter): boolean {
  return f.out === null && f.state !== 'down';
}

export function foesLeft(state: BrawlState): Fighter[] {
  return state.fighters.filter((f) => f.side === 'foe' && f.out === null && !f.fleeing);
}

export function timeLeft(setup: BrawlSetup, state: BrawlState): number {
  return Math.max(0, setup.duration - state.clock);
}

/** Gesamtleben beider Seiten (für die DuelBar). */
export function sideHealth(state: BrawlState, side: 'own' | 'foe'): number {
  let sum = 0;
  for (const f of state.fighters) if (f.side === side && f.out === null && !f.fleeing) sum += Math.max(0, f.hp);
  return sum;
}

/** Abklingzeit des Spezialzugs einer Person (0 = bereit), null = keiner oder nicht mehr möglich. */
export function moveReady(state: BrawlState, id: string): number | null {
  const f = fighterById(state, id);
  if (!f?.move || f.out !== null || f.state === 'down') return null;
  return Math.max(0, f.moveCd);
}

// ---------------------------------------------------------------------------------------------
// Schritt

interface Ctx {
  setup: BrawlSetup;
  state: BrawlState;
  rng: () => number;
  events: BrawlEvent[];
}

const rngs = new WeakMap<BrawlState, () => number>();

function rngOf(setup: BrawlSetup, state: BrawlState): () => number {
  let r = rngs.get(state);
  if (!r) {
    r = createRng(setup.seed ^ 0x5bd1e995);
    rngs.set(state, r);
  }
  return r;
}

function setState(f: Fighter, state: FighterState, dur = 0): void {
  f.state = state;
  f.t = 0;
  f.dur = dur;
  if (state !== 'block') f.blockSince = -1;
}

/** Kann gerade etwas Neues anfangen (nicht mitten im Schlag, nicht getroffen, nicht am Boden). */
function free(f: Fighter): boolean {
  return f.state === 'idle' || f.state === 'walk' || f.state === 'block';
}

/** Spielzeit, bis f wieder frei ist (Ausholen, Schlag und Erholung zusammen; Taumeln, Ausweichen). */
function busyLeft(f: Fighter): number {
  const left = Math.max(0, f.dur - f.t);
  const def = f.attack ? ATTACKS[f.attack] : null;
  switch (f.state) {
    case 'windup':
      return left + (def ? def.active + def.recover : 0);
    case 'strike':
      return left + (def ? def.recover : 0);
    case 'recover':
    case 'hit':
    case 'dodge':
      return left;
    default:
      return 0;
  }
}

/** Aus diesen Zuständen kannst du noch nicht ausweichen, kommst aber von selbst wieder heraus. */
function dodgeLater(f: Fighter): boolean {
  return f.state === 'windup' || f.state === 'strike' || f.state === 'hit';
}

function startAttack(c: Ctx, f: Fighter, attack: AttackId): void {
  const def = ATTACKS[attack];
  const tell = f.side === 'foe' ? FOE_TELL[attack] * (1 - 0.35 * c.setup.difficulty) : def.windup;
  setState(f, 'windup', tell);
  f.attack = attack;
  f.landed = false;
  if (f.side === 'foe') c.events.push({ type: 'telegraph', id: f.id, attack });
  // Der Anführer liest deinen Schlag: Steht er nah genug und hat Zeit, nimmt er die Deckung hoch (einmal pro Schlag).
  if (f.kind !== 'player') return;
  const chance = ROLES.leader.guard + 0.25 * c.setup.difficulty;
  for (const o of c.state.fighters) {
    if (o.kind !== 'leader' || !isIn(o) || !free(o) || o.hesitate > 0 || Math.abs(o.x - f.x) > 1.8) continue;
    if (c.rng() >= chance) continue;
    setState(o, 'block', def.windup + 0.45);
    o.blockSince = c.state.time;
    faceTowards(o, f.x);
  }
}

function sameLane(a: Fighter, b: Fighter): boolean {
  return a.lane === b.lane && Math.abs(a.depth - b.depth) < 0.35;
}

function faceTowards(f: Fighter, x: number): void {
  if (Math.abs(x - f.x) > 0.05) f.facing = x > f.x ? 1 : -1;
}

/** Wer im Schlag steht: nächster Gegner vor f in derselben Ebene, in Reichweite. */
function targetsInReach(c: Ctx, f: Fighter, reach: number): Fighter[] {
  return c.state.fighters
    .filter((o) => o.side !== f.side && isIn(o) && sameLane(f, o))
    .filter((o) => {
      const dx = (o.x - f.x) * f.facing;
      // Wer gerade ausweicht, zählt mit etwas mehr Reichweite (sonst gäbe es für den Konter nichts zu kontern).
      return dx > -0.15 && dx <= reach + (o.state === 'dodge' ? 1.6 : 0);
    })
    .sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
}

function knockOut(c: Ctx, f: Fighter): void {
  f.hp = 0;
  setState(f, 'down');
  f.attack = null;
  f.grab = 0;
  if (f.side === 'foe') {
    f.out = 'down';
    c.events.push({ type: 'down', id: f.id });
  } else c.events.push({ type: 'down', id: f.id });
}

function flee(c: Ctx, f: Fighter): void {
  if (f.out !== null || f.fleeing) return;
  f.fleeing = true;
  setState(f, 'run');
  f.attack = null;
  f.grab = 0;
  f.facing = f.x < ARENA_W / 2 ? -1 : 1;
  c.events.push({ type: 'fled', id: f.id });
}

/** Ein Schlag trifft (oder nicht): Block, Konter, Deckung durch die Crew, Schaden, Rückstoß. */
function land(c: Ctx, f: Fighter): void {
  const attack = f.attack;
  if (!attack || f.landed) return;
  f.landed = true;
  const def = ATTACKS[attack];
  const targets = targetsInReach(c, f, def.reach).slice(0, attack === 'heavy' ? 2 : 1);
  c.events.push({ type: 'swing', id: f.id, attack });
  const { state } = c;
  for (const t of targets) {
    const playerHit = t.kind === 'player';
    // Ausweichen: unverwundbar; im letzten Moment = Konter.
    if (t.state === 'dodge') {
      if (playerHit && state.time - t.dodgeSince <= PARRY_WINDOW + 0.12) counter(c, t, f, 'dodge');
      continue;
    }
    // Deckung durch die Crew (Spezialzug block): fängt den Treffer gegen dich ab.
    if (playerHit && state.guardBy && state.time <= state.guardUntil) {
      const by = state.guardBy;
      state.guardBy = null;
      c.events.push({ type: 'guarded', by, attacker: f.id });
      setState(f, 'hit', 0.4);
      continue;
    }
    const facingAttacker = t.facing === (f.x > t.x ? 1 : -1);
    const blocking = t.state === 'block' && facingAttacker;
    if (blocking && playerHit && t.blockSince >= 0 && state.time - t.blockSince <= PARRY_WINDOW) {
      counter(c, t, f, 'block');
      continue;
    }
    // Der Anführer blockt deine leichten Schläge; ein schwerer bricht die Deckung.
    if (blocking && attack === 'heavy' && t.side === 'foe') {
      setState(t, 'hit', 0.7);
      t.vx = f.facing * def.knock;
      c.events.push({ type: 'guardBreak', id: t.id });
      hit(c, f, t, attack, def.damage * 0.5 * f.power, false, false);
      continue;
    }
    const isCounter = f.kind === 'player' && state.time <= state.counterUntil;
    let damage = def.damage * f.power * (isCounter ? 2 : 1);
    if (blocking) damage *= attack === 'knife' ? 0.3 : 0.15;
    if (isCounter) state.counterUntil = -1;
    hit(c, f, t, attack, damage, isCounter, blocking);
  }
}

function hit(
  c: Ctx,
  f: Fighter,
  t: Fighter,
  attack: AttackId,
  damage: number,
  isCounter: boolean,
  blocked: boolean,
): void {
  const def = ATTACKS[attack];
  const { state } = c;
  const amount = Math.max(1, Math.round(damage));
  t.hp = Math.max(0, t.hp - amount);
  t.hitsTaken += 1;
  t.flash = state.time;
  c.events.push({
    type: 'hit',
    attacker: f.id,
    target: t.id,
    damage: amount,
    attack,
    counter: isCounter,
    blocked,
    x: t.x,
    depth: t.depth,
  });
  if (f.kind === 'player' && !blocked) state.combo += 1;
  if (t.kind === 'player' && !blocked) state.combo = 0;
  // Treffer-Stopp: kurz steht alles (schwer und Konter länger).
  state.hitStop = Math.max(state.hitStop, blocked ? 0.03 : attack === 'light' ? 0.05 : 0.1);
  if (t.hp <= 0) {
    t.vx = f.facing * (def.knock + 2.5);
    knockOut(c, t);
    return;
  }
  // Getroffen beim Greifen: er lässt los und wehrt sich eine Weile.
  if (t.grab > 0) {
    t.grab = 0;
    t.grabPause = 3.5;
  }
  if (blocked) {
    t.vx = f.facing * def.knock * 0.4;
    return;
  }
  // Der Schläger steckt leichte Schläge beim Ausholen weg (Rüstung).
  const armor = t.kind === 'bruiser' && attack === 'light' && t.state === 'windup';
  if (!armor) {
    setState(t, 'hit', def.stun * (isCounter ? 1.6 : 1));
    t.attack = null;
  }
  // Kette: Nach CHAIN_MAX Treffern in Folge fliegt er aus der Reichweite (kein endloses Festhalten mit Schlägen).
  t.chain = state.time - t.chainAt <= CHAIN_GAP ? t.chain + 1 : 1;
  t.chainAt = state.time;
  const launched = t.chain >= CHAIN_MAX;
  if (launched) t.chain = 0;
  t.vx = f.facing * (launched ? 4.5 : def.knock) * (t.kind === 'bruiser' ? 0.6 : 1);
  // Der Nervöse haut ab, wenn er genug abbekommen hat.
  if (t.kind === 'nervous' && t.hp / t.maxHp < c.setup.nervousAt && c.rng() < 0.65) flee(c, t);
}

function counter(c: Ctx, t: Fighter, f: Fighter, how: 'block' | 'dodge'): void {
  const { state } = c;
  c.events.push({ type: 'parry', target: t.id, attacker: f.id, how });
  setState(f, 'hit', 1.0);
  f.attack = null;
  f.vx = -f.facing * 1.2;
  state.counterUntil = state.time + COUNTER_TIME;
  state.slowmo = Math.max(state.slowmo, 0.55);
  state.hitStop = Math.max(state.hitStop, 0.06);
}

// ---------------------------------------------------------------------------------------------
// Spieler

function playerStep(c: Ctx, p: Fighter, input: BrawlInput, dt: number): void {
  const { state } = c;
  if (p.state === 'down') return;
  if (input.lane && (free(p) || p.state === 'dodge')) {
    const lane = clamp(p.lane - input.lane, 0, 1) as 0 | 1;
    p.lane = lane;
  }
  let want: AttackId | null = input.heavy ? 'heavy' : input.light ? 'light' : null;
  // Zu früh gedrückt (noch im eigenen Schlag, beim Taumeln): gilt, bis du wieder frei bist, sonst verfiele er vorher.
  if (want) state.buffered = { attack: want, until: state.time + busyLeft(p) + ATTACK_BUFFER };
  else if (state.buffered && state.time <= state.buffered.until) want = state.buffered.attack;
  if (input.dodge && (free(p) || p.state === 'recover') && state.time - p.dodgeSince > DODGE_COOLDOWN) {
    setState(p, 'dodge', DODGE_TIME);
    p.dodgeSince = state.time;
    p.attack = null;
    // Ausweichen: kurzer Sprung weg vom nächsten Gegner (oder in Laufrichtung).
    const near = nearestFoe(state, p);
    const away = input.dx !== 0 ? input.dx : near ? (near.x > p.x ? -1 : 1) : -p.facing;
    p.vx = away * 5.5;
    return;
  }
  if (want && free(p)) {
    state.buffered = null;
    const near = nearestFoe(state, p, 2.6);
    if (near && input.dx === 0) faceTowards(p, near.x);
    startAttack(c, p, want);
    return;
  }
  if (input.block && free(p)) {
    if (p.state !== 'block') {
      setState(p, 'block');
      p.blockSince = state.time;
    }
    const near = nearestFoe(state, p, 3);
    if (near) faceTowards(p, near.x);
    return;
  }
  if (!input.block && p.state === 'block') setState(p, 'idle');
  if (free(p)) {
    if (input.dx !== 0) {
      p.facing = input.dx;
      p.x += input.dx * p.speed * dt;
      if (p.state !== 'walk') setState(p, 'walk');
    } else if (p.state === 'walk') setState(p, 'idle');
  }
}

function nearestFoe(state: BrawlState, f: Fighter, within = Number.POSITIVE_INFINITY): Fighter | undefined {
  let best: Fighter | undefined;
  let bestD = within;
  for (const o of state.fighters) {
    if (o.side === f.side || !isIn(o) || o.state === 'run') continue;
    const d = Math.abs(o.x - f.x) + (o.lane === f.lane ? 0 : 0.8);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Spezialzüge der Crew

/** Spezialzug auslösen (Knopf 1 bis 3). false = geht gerade nicht. */
function triggerSpecial(c: Ctx, id: string): boolean {
  const { state } = c;
  const f = fighterById(state, id);
  if (!f?.move || f.out !== null || f.state === 'down' || f.moveCd > 0 || state.end) return false;
  const def = CREW_MOVES[f.move];
  const p = playerOf(state);
  let target: string | null = null;
  switch (f.move) {
    case 'block':
      state.guardBy = f.id;
      state.guardUntil = state.time + 6;
      break;
    case 'secondTalk': {
      const foes = state.fighters.filter((o) => o.side === 'foe' && isIn(o) && o.state !== 'run');
      const t = foes.find((o) => o.state === 'windup') ?? foes.find((o) => o.kind === 'leader') ?? foes[0];
      if (!t) return false;
      target = t.id;
      t.hesitate = 4;
      if (t.state === 'windup') setState(t, 'idle');
      t.attack = null;
      if (t.kind === 'nervous' && t.hp / t.maxHp < 0.75) flee(c, t);
      break;
    }
    case 'getaway':
      for (const o of state.fighters) {
        if (o.side !== 'foe' || !isIn(o) || o.state === 'run') continue;
        setState(o, 'hit', 1.1);
        o.attack = null;
        o.grab = 0;
        o.vx = (o.x >= p.x ? 1 : -1) * 2.5;
      }
      break;
    case 'stash': {
      state.lootSafeUntil = state.time + 10;
      const foes = state.fighters.filter((o) => o.side === 'foe' && isIn(o) && o.state !== 'run');
      const t = foes.find((o) => o.grab > 0 || o.grabber) ?? nearestFoe(state, p);
      if (!t) return false;
      target = t.id;
      setState(t, 'hit', 2);
      t.attack = null;
      t.grab = 0;
      t.grabPause = Math.max(t.grabPause, 10);
      break;
    }
  }
  f.moveCd = def.cooldown;
  c.events.push({ type: 'special', id: f.id, move: f.move, target });
  return true;
}

// ---------------------------------------------------------------------------------------------
// KI (Crew und Gegner)

function aiStep(c: Ctx, f: Fighter, dt: number): void {
  const { state, setup } = c;
  if (f.state === 'down') return;
  if (f.state === 'run') {
    f.x += f.facing * f.speed * 1.5 * dt;
    if (f.fleeing && (f.x < -1.2 || f.x > ARENA_W + 1.2)) f.out = 'fled';
    return;
  }
  f.cooldown -= dt;
  f.hesitate = Math.max(0, f.hesitate - dt);
  f.grabPause = Math.max(0, f.grabPause - dt);
  if (f.state === 'block') {
    if (f.t < f.dur) return;
    setState(f, 'idle');
  }
  if (!free(f)) return;

  // Greifer: geht an die Beute, solange ihn keiner aufhält.
  if (f.side === 'foe' && f.grabber && setup.loot && f.grabPause <= 0 && state.time > state.lootSafeUntil) {
    const lx = setup.loot.x;
    if (f.lane !== 1) f.lane = 1;
    if (Math.abs(f.x - lx) > 0.25) {
      walk(f, lx, dt);
      f.grab = 0;
      return;
    }
    if (f.grab === 0) c.events.push({ type: 'grabStart', id: f.id });
    f.grab += dt;
    setState(f, 'idle');
    f.facing = 1;
    if (f.grab >= GRAB_TIME) {
      state.grabbed = true;
      c.events.push({ type: 'grabbed', id: f.id });
      flee(c, f);
      f.facing = 1;
    }
    return;
  }

  const target = chooseTarget(c, f, dt);
  if (!target) {
    if (f.state === 'walk') setState(f, 'idle');
    return;
  }
  f.target = target.id;
  // In die Ebene des Ziels wechseln (Gegner mit kurzer Verzögerung).
  if (f.lane !== target.lane && f.cooldown < 0.4) f.lane = target.lane;
  const gap = f.side === 'foe' ? 1.0 : 0.95;
  let side = f.x <= target.x ? -1 : 1;
  // Die Crew flankiert: Steht der Spieler schon auf dieser Seite des Ziels, geht sie auf die andere.
  if (f.side === 'own') {
    const p = playerOf(state);
    const pSide = p.x <= target.x ? -1 : 1;
    if (p.lane === target.lane && Math.abs(p.x - target.x) < 1.8 && pSide === side) side = -side as 1 | -1;
  }
  let goal = target.x + side * gap;
  // Nicht alle auf einen Haufen: Wer nicht angreifen darf, wartet etwas weiter weg.
  const attacking = state.fighters.filter(
    (o) => o.side === f.side && o !== f && (o.state === 'windup' || o.state === 'strike'),
  ).length;
  const mayAttack = f.side === 'own' || (attacking < setup.attackers && f.hesitate <= 0);
  if (f.side === 'foe' && (!mayAttack || f.hesitate > 0)) goal = target.x + side * (gap + 1.3 + (f.knife ? 0.3 : 0));
  goal = spread(state, f, goal);
  faceTowards(f, target.x);
  const dist = Math.abs(f.x - target.x);
  const reach = ATTACKS[f.knife ? 'knife' : 'light'].reach;
  if (mayAttack && f.cooldown <= 0 && sameLane(f, target) && dist <= reach + 0.05) {
    startAttack(c, f, pickAttack(c, f));
    f.cooldown = nextPause(c, f);
    return;
  }
  if (Math.abs(f.x - goal) > 0.15) walk(f, goal, dt);
  else if (f.state === 'walk') setState(f, 'idle');
  faceTowards(f, target.x);
}

function walk(f: Fighter, x: number, dt: number): void {
  const dir = x > f.x ? 1 : -1;
  const step = Math.min(Math.abs(x - f.x), f.speed * dt);
  f.x += dir * step;
  f.facing = dir;
  if (f.state !== 'walk') setState(f, 'walk');
}

/** Abstand halten zu anderen der eigenen Seite in derselben Ebene. */
function spread(state: BrawlState, f: Fighter, goal: number): number {
  let g = goal;
  for (const o of state.fighters) {
    if (o === f || o.side !== f.side || !isIn(o) || o.lane !== f.lane) continue;
    if (Math.abs(o.x - g) < 0.7) g += (f.x >= o.x ? 1 : -1) * 0.7;
  }
  return g;
}

function chooseTarget(c: Ctx, f: Fighter, dt: number): Fighter | undefined {
  const { state } = c;
  const others = state.fighters.filter((o) => o.side !== f.side && isIn(o) && o.state !== 'run');
  if (others.length === 0) return undefined;
  const current = f.target ? others.find((o) => o.id === f.target) : undefined;
  // Ab und zu neu wählen (im Schnitt alle drei Sekunden).
  if (current && c.rng() > dt / 3) return current;
  // Wie viele schon auf jemanden gehen (damit sich die Kämpfe verteilen und lesbar bleiben).
  const load = (o: Fighter) =>
    state.fighters.filter((x) => x !== f && x.side === f.side && isIn(x) && x.target === o.id).length;
  if (f.side === 'foe') {
    // Gegner gehen meist auf dich, aber höchstens zwei gleichzeitig; der Rest auf deine Leute.
    const p = others.find((o) => o.kind === 'player');
    if (p && load(p) < 2 && c.rng() < 0.75) return p;
  }
  // Sonst: wer am wenigsten Gegner hat, bei Gleichstand der Nächste.
  return [...others].sort((a, b) => load(a) - load(b) || Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
}

function pickAttack(c: Ctx, f: Fighter): AttackId {
  if (f.knife) return 'knife';
  if (f.side === 'own') return c.rng() < 0.3 ? 'heavy' : 'light';
  const role = isRole(f.kind) ? ROLES[f.kind] : ROLES.leader;
  return c.rng() < role.heavy ? 'heavy' : 'light';
}

function nextPause(c: Ctx, f: Fighter): number {
  const base = f.side === 'own' ? 1.0 + c.rng() * 0.8 : (1.0 + c.rng() * 1.0) * c.setup.pace;
  return base * (f.kind === 'bruiser' ? 1.3 : 1);
}

// ---------------------------------------------------------------------------------------------
// Zustände weiterschalten

function advanceState(c: Ctx, f: Fighter, dt: number): void {
  f.t += dt;
  f.moveCd = Math.max(0, f.moveCd - dt);
  // Rückstoß, klingt ab.
  if (Math.abs(f.vx) > 0.01) {
    f.x += f.vx * dt;
    f.vx *= Math.max(0, 1 - dt * 7);
  } else f.vx = 0;
  // Ebene weich wechseln.
  const dz = f.lane - f.depth;
  f.depth += Math.sign(dz) * Math.min(Math.abs(dz), dt * 6);
  if (f.state !== 'run') f.x = clamp(f.x, EDGE, ARENA_W - EDGE);
  switch (f.state) {
    case 'windup':
      if (f.t >= f.dur && f.attack) setState(f, 'strike', ATTACKS[f.attack].active);
      break;
    case 'strike':
      land(c, f);
      if (f.t >= f.dur && f.attack) setState(f, 'recover', ATTACKS[f.attack].recover);
      break;
    case 'recover':
    case 'hit':
    case 'dodge':
      if (f.t >= f.dur) {
        setState(f, 'idle');
        f.attack = null;
      }
      break;
    default:
      break;
  }
}

/** Eingabe dieses Bildes plus die Tasten-Drücke aus `held` (Richtung und Block gelten nur aus `input`). */
function withPresses(input: BrawlInput, held: BrawlInput | null): BrawlInput {
  if (!held) return input;
  return {
    ...input,
    lane: input.lane ?? held.lane ?? null,
    light: input.light || held.light,
    heavy: input.heavy || held.heavy,
    dodge: input.dodge || held.dodge,
    special: input.special ?? held.special ?? null,
  };
}

/**
 * Ein Bild weiter (dt in echten Sekunden). Gibt zurück, was passiert ist (für Ton und Optik). Nach dem Ende läuft nur
 * noch der Abgang (Zeitlupe, Wegrennen); state.endT zählt mit.
 */
export function stepBrawl(setup: BrawlSetup, state: BrawlState, rawDt: number, input: BrawlInput): BrawlEvent[] {
  const c: Ctx = { setup, state, rng: rngOf(setup, state), events: [] };
  const real = Math.max(0, Math.min(0.1, rawDt));
  if (state.end) state.endT += real;
  if (state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - real);
    // Was in der Pause gedrückt wird, gilt danach.
    if (!state.end) state.held = withPresses(input, state.held);
    return c.events;
  }
  let dt = real;
  if (state.slowmo > 0) {
    state.slowmo = Math.max(0, state.slowmo - real);
    dt *= SLOWMO;
  }
  state.time += dt;
  if (!state.end) state.clock += real;

  const p = playerOf(state);
  if (!state.end) {
    // Ausweichen aus der Pause geht im eigenen Schlag oder beim Taumeln noch nicht: Es wartet, bis du ausweichen kannst.
    const waitDodge = state.held?.dodge === true && dodgeLater(p);
    const now = withPresses(input, state.held);
    state.held = null;
    if (now.special) triggerSpecial(c, now.special);
    playerStep(c, p, now, dt);
    if (waitDodge) state.held = { dx: 0, dodge: true };
  }
  for (const f of state.fighters) {
    if (f.kind !== 'player' && (!state.end || f.state === 'run')) aiStep(c, f, dt);
    advanceState(c, f, dt);
  }
  separate(state, dt);
  if (state.guardBy && state.time > state.guardUntil) state.guardBy = null;
  if (!state.end) checkEnd(c);
  return c.events;
}

/** Körper überlappen nicht: Wer in derselben Ebene zu dicht steht, wird sanft auseinandergeschoben. */
export const BODY_GAP = 0.62;

function separate(state: BrawlState, dt: number): void {
  const list = state.fighters.filter((f) => isIn(f) && f.state !== 'run');
  const k = Math.min(1, dt * 12);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (Math.abs(a.depth - b.depth) > 0.35) continue;

      const dx = b.x - a.x;
      const gap = Math.abs(dx);
      if (gap >= BODY_GAP) continue;
      const dir = gap < 0.001 ? (a.id < b.id ? 1 : -1) : Math.sign(dx);
      const push = (BODY_GAP - gap) * k;
      // Deine Leute machen dir Platz (nur sie weichen), sonst weichen beide je zur Hälfte.
      const own = a.side === b.side && (a.kind === 'player' || b.kind === 'player');
      const shareA = own ? (a.kind === 'player' ? 0 : 1) : 0.5;
      a.x = clamp(a.x - dir * push * shareA, EDGE, ARENA_W - EDGE);
      b.x = clamp(b.x + dir * push * (1 - shareA), EDGE, ARENA_W - EDGE);
    }
  }
}

function checkEnd(c: Ctx): void {
  const { state, setup } = c;
  const p = playerOf(state);
  if (p.hp <= 0 || p.state === 'down') endWith(c, 'ko');
  else if (foesLeft(state).length === 0) endWith(c, 'won');
  else if (state.clock >= setup.duration) {
    state.sirens = true;
    c.events.push({ type: 'sirens' });
    // Alle rennen weg: die Gegner nach rechts, deine Leute nach links.
    for (const f of state.fighters) {
      if (f.out !== null || f.state === 'down' || f.kind === 'player') continue;
      if (f.side === 'foe') {
        setState(f, 'run');
        f.facing = 1;
      }
    }
    endWith(c, 'sirens');
  }
}

function endWith(c: Ctx, end: Exclude<BrawlEnd, null>): void {
  c.state.end = end;
  c.state.endT = 0;
  c.state.slowmo = Math.max(c.state.slowmo, end === 'sirens' ? 0 : 1.1);
  c.events.push({ type: 'end', end });
}

/** So lange (echte Sekunden) läuft der Abgang nach dem Ende, dann kommt das Ergebnis. */
export const END_DELAY = 1.7;

export function finished(state: BrawlState): boolean {
  return state.end !== null && state.endT >= END_DELAY;
}

// ---------------------------------------------------------------------------------------------
// Ergebnis

export interface BrawlTally {
  down: number;
  fled: number;
  total: number;
  /** Anteil des eigenen Lebens, der weg ist (0–1). */
  damage: number;
}

export function tally(state: BrawlState): BrawlTally {
  const foes = state.fighters.filter((f) => f.side === 'foe');
  // Wer erst vor den Sirenen wegrennt, zählt nicht als abgehauen: Er ist ja noch da (die Runden laufen weiter).
  const down = foes.filter((f) => f.out === 'down').length;
  const fled = foes.filter((f) => f.out !== 'down' && f.fleeing).length;
  const p = playerOf(state);
  return { down, fled, total: foes.length, damage: 1 - Math.max(0, p.hp) / p.maxHp };
}

/**
 * Score = Anteil der ausgeschalteten Gegner (abgehauen zählt drei Viertel, mit der Beute weg gar nicht), gemindert
 * durch eigene Treffer. Am Boden höchstens 0,3.
 */
export function brawlScore(state: BrawlState): number {
  const t = tally(state);
  if (t.total === 0) return 1;
  const fledCount = Math.max(0, t.fled - (state.grabbed ? 1 : 0));
  const share = (t.down + 0.75 * fledCount) / t.total;
  let score = share * (1 - 0.3 * t.damage);
  if (state.end === 'won') score = Math.max(score, 0.6);
  if (state.end === 'ko') score = Math.min(score, 0.3);
  return clamp(Math.round(score * 1000) / 1000, 0, 1);
}

/** picks für applyBrawl: down:<n>, fled:<n>, hurt:<staffId> (zweimal = außer Gefecht), playerHurt, ko, grabbed, sirens. */
export function brawlPicks(state: BrawlState): string[] {
  const t = tally(state);
  const picks: string[] = [];
  if (t.down > 0) picks.push(`down:${t.down}`);
  if (t.fled > 0) picks.push(`fled:${t.fled}`);
  for (const f of state.fighters) {
    if (f.kind !== 'crew') continue;
    if (f.hp <= 0) picks.push(`hurt:${f.id}`, `hurt:${f.id}`);
    else if (f.hp / f.maxHp < 0.5) picks.push(`hurt:${f.id}`);
  }
  const p = playerOf(state);
  if (state.end === 'ko' || p.hp <= 0) picks.push('ko');
  else if (p.hp / p.maxHp < 0.5) picks.push('playerHurt');
  if (state.grabbed) picks.push('grabbed');
  if (state.sirens) picks.push('sirens');
  return picks.slice(0, 20);
}
