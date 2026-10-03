// Die Simulation: hält den Spielzustand und die Module, führt feste Zeitschritte und Befehle aus
// und stellt Ereignisse in fester Reihenfolge zu. Kein DOM, läuft auch in Tests und später auf einem Server.

import { clock, MINUTES_PER_DAY, MINUTES_PER_HOUR } from './clock';
import { START_CLEAN_MONEY, START_DIRTY_MONEY, START_TIME } from './config';
import {
  answerMessage,
  createMessagesState,
  deleteAllThreads,
  deleteThread,
  expireMessages,
  markAllRead,
  markThreadRead,
} from './messages';
import type { ModuleDefinition } from './module';
import { sortModules } from './module';
import { createOutcomeState, outcome } from './outcome';
import { rngNext, seedStream } from './rng';
import type {
  Command,
  CommandMeta,
  CommandResult,
  Ctx,
  EventType,
  GameEvent,
  GameEvents,
  GameMode,
  GameState,
} from './types';

/** Version des Kern-Formats im Spielstand. Hochzählen, wenn sich die Kernfelder ändern, und in persistence.ts migrieren. */
export const CORE_SCHEMA_VERSION = 2;

/** ID des Kerns, z.B. als Quelle von Journal-Einträgen. */
export const CORE_ID = 'core';

declare module './types' {
  interface GameEvents {
    /** Zur vollen Stunde. */
    'clock.hourStarted': { day: number; hour: number };
    /** Um Mitternacht. weekday: 0 = Montag … 6 = Sonntag. */
    'clock.dayStarted': { day: number; weekday: number };
  }
}

export interface NewGameOptions {
  seed: number;
  mode?: GameMode;
  runId?: string;
  /** Echte Zeit beim Anlegen, nur Info. */
  createdAt?: number;
}

type AnyCommandHandler = (ctx: Ctx, payload: unknown, meta: CommandMeta) => CommandResult | undefined;
type AnyEventHandler = (ctx: Ctx, payload: unknown, event: GameEvent) => void;
type EventListener = (event: GameEvent) => void;

/** Schutz gegen Ereignis-Endlosschleifen (Handler, die sich gegenseitig anstoßen). */
const MAX_EVENTS_PER_FLUSH = 10000;

const CORE_COMMANDS: Record<string, AnyCommandHandler> = {
  'messages.answer': answerMessage as AnyCommandHandler,
  'messages.markRead': markThreadRead as AnyCommandHandler,
  'messages.markAllRead': markAllRead as AnyCommandHandler,
  'messages.delete': deleteThread as AnyCommandHandler,
  'messages.deleteAll': deleteAllThreads as AnyCommandHandler,
};

export class Simulation {
  readonly modules: readonly ModuleDefinition[];
  state: GameState;

  private readonly contexts = new Map<string, Ctx>();
  private readonly commandOwners = new Map<string, { moduleId: string; handler: AnyCommandHandler }>();
  private readonly eventHandlers = new Map<string, { moduleId: string; handler: AnyEventHandler }[]>();
  private readonly listeners = new Set<EventListener>();
  private queue: GameEvent[] = [];
  private delivered: GameEvent[] = [];
  private depth = 0;
  /** Module mit Pleite-Prüfung (einmal bestimmt, die Prüfung läuft jede Spielminute). */
  private solvencyChecks: readonly ModuleDefinition[] | null = null;
  /** Module mit tick und ihr Kontext (einmal bestimmt, läuft jede Spielminute). */
  private tickers: { module: ModuleDefinition; ctx: Ctx }[] | null = null;

  /** Erwartet einen fertigen (ggf. migrierten) Zustand. Für neue Spiele: Simulation.create(). */
  constructor(modules: readonly ModuleDefinition[], state: GameState) {
    this.modules = sortModules(modules);
    this.state = state;

    for (const [type, handler] of Object.entries(CORE_COMMANDS)) {
      this.commandOwners.set(type, { moduleId: CORE_ID, handler });
    }
    for (const m of this.modules) {
      for (const [type, handler] of Object.entries(m.commands ?? {})) {
        const owner = this.commandOwners.get(type);
        if (owner) throw new Error(`Befehl "${type}" wird von "${owner.moduleId}" und "${m.id}" verarbeitet.`);
        this.commandOwners.set(type, { moduleId: m.id, handler: handler as AnyCommandHandler });
      }
      for (const [type, handler] of Object.entries(m.on ?? {})) {
        const list = this.eventHandlers.get(type) ?? [];
        list.push({ moduleId: m.id, handler: handler as AnyEventHandler });
        this.eventHandlers.set(type, list);
      }
    }
  }

  /** Neues Spiel mit frischem Zustand für alle Module. */
  static create(modules: readonly ModuleDefinition[], options: NewGameOptions): Simulation {
    const state: GameState = {
      schema: CORE_SCHEMA_VERSION,
      meta: {
        runId: options.runId ?? `run-${options.seed}`,
        mode: options.mode ?? 'normal',
        seed: options.seed,
        createdAt: options.createdAt ?? 0,
      },
      time: START_TIME,
      nextId: 1,
      rng: {},
      wallet: { dirty: START_DIRTY_MONEY, clean: START_CLEAN_MONEY },
      journal: [],
      messages: createMessagesState(),
      outcome: createOutcomeState(),
      modules: {} as GameState['modules'],
      moduleVersions: {},
    };
    const sim = new Simulation(modules, state);
    sim.run(() => {
      for (const m of sim.modules) sim.initModule(m);
    });
    return sim;
  }

  /** Zustand eines Moduls neu anlegen (neues Spiel oder Modul, das im Spielstand noch fehlt). */
  initModule(module: ModuleDefinition): void {
    const modules = this.state.modules as unknown as Record<string, unknown>;
    if (module.init) modules[module.id] = module.init(this.ctx(module.id));
    this.state.moduleVersions[module.id] = module.version;
  }

  /** Kontext eines Moduls (eigener Zufallsstrom). Für Tests und die Leutnant-KI. */
  ctx(moduleId: string): Ctx {
    let ctx = this.contexts.get(moduleId);
    if (!ctx) {
      ctx = this.createContext(moduleId);
      this.contexts.set(moduleId, ctx);
    }
    return ctx;
  }

  /** Ist das Spiel vorbei? Dann laufen keine Schritte und Befehle mehr. */
  get isOver(): boolean {
    return this.state.outcome.gameOver !== null;
  }

  /** Einen Simulationsschritt (eine Spielminute) ausführen. */
  step(): void {
    if (this.isOver) return;
    this.run(() => {
      const state = this.state;
      state.time += 1;
      const core = this.ctx(CORE_ID);
      if (state.time % MINUTES_PER_HOUR === 0) {
        core.emit('clock.hourStarted', { day: clock.day(state.time), hour: clock.hour(state.time) });
      }
      if (state.time % MINUTES_PER_DAY === 0) {
        core.emit('clock.dayStarted', { day: clock.day(state.time), weekday: clock.weekday(state.time) });
      }
      this.tickers ??= this.modules.filter((m) => m.tick).map((module) => ({ module, ctx: this.ctx(module.id) }));
      for (const { module, ctx } of this.tickers) {
        // module.tick erst hier lesen (Messungen umhüllen es nachträglich, siehe perf.bench.test.ts).
        if (state.time % (module.tickEvery ?? 1) === 0) module.tick?.(ctx);
      }
      expireMessages(core);
      this.flush();
      this.checkSolvency();
    });
  }

  /** Mehrere Schritte ausführen, z.B. in Tests: sim.advance(60) = eine Spielstunde. */
  advance(minutes: number): void {
    for (let i = 0; i < minutes && !this.isOver; i++) this.step();
  }

  /**
   * Befehl ausführen. Genau ein Modul verarbeitet ihn. Das Ergebnis sagt, ob er geklappt hat und warum nicht.
   * Ereignisse des Befehls werden danach zugestellt.
   */
  dispatch(command: Command, meta: Partial<CommandMeta> = {}): CommandResult {
    return this.dispatchInternal(command, { actor: meta.actor ?? 'player' });
  }

  /** Auf Ereignisse hören (UI, Sound, Tests). Wird nach der Zustellung an die Module aufgerufen, nur lesen! */
  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Nur auf einen Ereignistyp hören. */
  on<K extends EventType>(type: K, listener: (payload: GameEvents[K], event: GameEvent<K>) => void): () => void {
    return this.onEvent((event) => {
      if (event.type === type) listener(event.payload as GameEvents[K], event as GameEvent<K>);
    });
  }

  /** Welches Modul verarbeitet diesen Befehl? */
  commandOwner(type: string): string | undefined {
    return this.commandOwners.get(type)?.moduleId;
  }

  private dispatchInternal(command: Command, meta: CommandMeta): CommandResult {
    if (this.isOver) return { ok: false, reason: 'Das Spiel ist vorbei.' };
    const owner = this.commandOwners.get(command?.type);
    if (!owner) return { ok: false, reason: `Unbekannter Befehl: ${String(command?.type)}` };
    return this.run(() => {
      const result = owner.handler(this.ctx(owner.moduleId), command.payload, meta) ?? { ok: true };
      if (this.depth === 1) {
        this.flush();
        this.checkSolvency();
      }
      return result;
    });
  }

  /** Klammert eine Operation: Ereignisse werden erst ganz außen an Zuhörer gemeldet. */
  private run<T>(fn: () => T): T {
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
      if (this.depth === 0) this.notifyListeners();
    }
  }

  /** Ereignisse der Reihe nach an die Module zustellen. Neue Ereignisse aus Handlern kommen hinten dran. */
  private flush(): void {
    let count = 0;
    while (this.queue.length > 0) {
      if (++count > MAX_EVENTS_PER_FLUSH) {
        this.queue = [];
        throw new Error('Zu viele Ereignisse in einem Schritt, vermutlich eine Endlosschleife zwischen Handlern.');
      }
      const event = this.queue.shift() as GameEvent;
      for (const { moduleId, handler } of this.eventHandlers.get(event.type) ?? []) {
        handler(this.ctx(moduleId), event.payload, event);
      }
      this.delivered.push(event);
    }
  }

  private notifyListeners(): void {
    // Ereignisse, die außerhalb eines Schritts entstanden sind (z.B. in Tests über ctx), auch zustellen.
    if (this.queue.length > 0) this.flush();
    if (this.delivered.length === 0) return;
    const events = this.delivered;
    this.delivered = [];
    for (const event of events) for (const listener of this.listeners) listener(event);
  }

  /** Pleite-Regel: Melden alle Module mit solvency-Prüfung false, ist das Spiel verloren. */
  private checkSolvency(): void {
    if (this.isOver) return;
    this.solvencyChecks ??= this.modules.filter((m) => m.solvency);
    const checks = this.solvencyChecks;
    if (checks.length === 0) return;
    if (checks.some((m) => m.solvency?.(this.state))) return;
    outcome.gameOver(this.ctx(CORE_ID), 'bankrupt');
    this.flush();
  }

  private createContext(moduleId: string): Ctx {
    const sim = this;
    const random = (): number => {
      const rng = sim.state.rng;
      const current = rng[moduleId] ?? seedStream(sim.state.meta.seed, moduleId);
      const [value, next] = rngNext(current);
      rng[moduleId] = next;
      return value;
    };
    return {
      moduleId,
      get state() {
        return sim.state;
      },
      get now() {
        return sim.state.time;
      },
      random,
      randomInt: (min, max) => min + Math.floor(random() * (max - min + 1)),
      chance: (p) => random() < p,
      pick: (items) => {
        if (items.length === 0) throw new Error('pick: leere Liste');
        return items[Math.floor(random() * items.length)];
      },
      emit: (type, payload) => {
        sim.queue.push({ type, payload, time: sim.state.time } as GameEvent);
      },
      dispatch: (command, meta = {}) => sim.dispatchInternal(command, { actor: meta.actor ?? 'system' }),
      nextId: () => sim.state.nextId++,
    };
  }
}
