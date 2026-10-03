// Die Brücke zum Worker (Hauptthread): startet ihn bei Bedarf, lädt Modelle, merkt sich den Stand jedes Modells
// (für Einstellungen und Anruf), spricht Texte und behält fertige Sätze eine Weile (dieselbe Zeile noch einmal,
// vorbereitete Zeilen eines Anrufs). Kein Web Audio hier, nur Daten; die Wiedergabe macht der Audio-Dienst.

import type { LoadPhase, SynthRequestParams, WorkerRequest, WorkerResponse } from './protocol';
import { PIPER_VOICES, type PiperVoiceId, piperVoice, voiceFiles } from './voices';

export type VoiceModelState =
  /** Noch nicht geladen; cached: liegt es schon im Browser (null = noch nicht nachgesehen)? */
  | { kind: 'idle'; cached: boolean | null }
  | { kind: 'loading'; phase: LoadPhase; loaded: number; total: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export interface SpeechChunk {
  index: number;
  sampleRate: number;
  pcm: Float32Array;
}

export interface SpeechAudio {
  sampleRate: number;
  sentences: Float32Array[];
}

export interface SynthJob {
  /** Alle Sätze, wenn der Text fertig gesprochen ist. */
  promise: Promise<SpeechAudio>;
  /** Nur diesen Zuhörer abmelden; die Synthese läuft weiter (jemand anders will sie vielleicht). */
  cancel(): void;
}

export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate(): void;
}

/** Den Worker des Browsers starten, null ohne Worker oder WebAssembly (alte Browser, Tests). */
export function createPiperWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return null;
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'piper',
    }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

interface Job {
  id: number;
  key: string;
  sampleRate: number;
  chunks: SpeechChunk[];
  listeners: Set<(chunk: SpeechChunk) => void>;
  done: boolean;
  failed: boolean;
  promise: Promise<SpeechAudio>;
  resolve: (audio: SpeechAudio) => void;
  reject: (error: Error) => void;
}

interface Deferred {
  promise: Promise<boolean>;
  resolve: (ok: boolean) => void;
}

/** So viele fertige Texte bleiben im Speicher (ein Anruf hat sechs bis acht Zeilen). */
const MEMO_LIMIT = 24;
const UNSUPPORTED = 'Dieser Browser kann das Sprachmodell nicht ausführen.';

export class PiperEngine {
  private worker: WorkerLike | null = null;
  private crashed = false;
  private readonly createWorker: () => WorkerLike | null;
  private readonly customWorker: boolean;
  private readonly states = new Map<PiperVoiceId, VoiceModelState>();
  private readonly listeners = new Set<() => void>();
  private readonly jobs = new Map<number, Job>();
  private readonly memo = new Map<string, Job>();
  private readonly loads = new Map<PiperVoiceId, Deferred>();
  private nextId = 1;

  constructor(options: { createWorker?: () => WorkerLike | null } = {}) {
    this.createWorker = options.createWorker ?? createPiperWorker;
    this.customWorker = options.createWorker !== undefined;
  }

  /** Kann dieser Browser das Modell grundsätzlich ausführen (Worker und WebAssembly)? */
  get supported(): boolean {
    if (this.crashed) return false;
    if (this.worker || this.customWorker) return true;
    return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
  }

  state(voiceId: PiperVoiceId): VoiceModelState {
    return this.states.get(voiceId) ?? { kind: 'idle', cached: null };
  }

  /** Alle Modelle mit Stand (Einstellungen). */
  get models(): { voice: (typeof PIPER_VOICES)[number]; state: VoiceModelState }[] {
    return PIPER_VOICES.map((voice) => ({ voice, state: this.state(voice.id) }));
  }

  /** Liegt irgendein Modell schon im Browser oder ist geladen? */
  get anyAvailable(): boolean {
    return PIPER_VOICES.some((v) => {
      const s = this.state(v.id);
      return s.kind === 'ready' || s.kind === 'loading' || (s.kind === 'idle' && s.cached === true);
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Im Cache nachsehen, welche Modelle schon da sind (einmal beim Start, nach Laden und Entfernen). */
  refreshStatus(): void {
    const worker = this.ensureWorker();
    worker?.postMessage({ type: 'status', voices: PIPER_VOICES.map(voiceFiles) });
  }

  /** Modell laden (aus dem Cache oder per Download). true, sobald es bereit ist; false bei Fehler. */
  load(voiceId: PiperVoiceId, options: { retry?: boolean } = {}): Promise<boolean> {
    const state = this.state(voiceId);
    if (state.kind === 'ready') return Promise.resolve(true);
    if (state.kind === 'error' && !options.retry) return Promise.resolve(false);
    const pending = this.loads.get(voiceId);
    if (pending) return pending.promise;
    const worker = this.ensureWorker();
    if (!worker) {
      this.setState(voiceId, { kind: 'error', message: UNSUPPORTED });
      return Promise.resolve(false);
    }
    const voice = piperVoice(voiceId);
    let resolve: (ok: boolean) => void = () => {};
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    this.loads.set(voiceId, { promise, resolve });
    this.setState(voiceId, { kind: 'loading', phase: 'download', loaded: 0, total: voice.bytes });
    worker.postMessage({ type: 'load', voice: voiceFiles(voice) });
    return promise;
  }

  /** Wie load, aber höchstens so lange warten (0 = unbegrenzt). */
  ready(voiceId: PiperVoiceId, timeoutMs: number): Promise<boolean> {
    const load = this.load(voiceId);
    if (!timeoutMs) return load;
    return Promise.race([
      load,
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  }

  /**
   * Text sprechen lassen. onChunk bekommt jeden fertigen Satz (auch die, die schon da sind, wenn derselbe Text noch
   * einmal gefragt wird). Dieselbe Zeile mit derselben Stimme wird nur einmal gerechnet.
   */
  synthesize(
    voiceId: PiperVoiceId,
    text: string,
    params: SynthRequestParams,
    onChunk?: (chunk: SpeechChunk) => void,
  ): SynthJob {
    const key = `${voiceId}|${params.lengthScale}|${text}`;
    let job = this.memo.get(key);
    if (job && !job.failed) {
      // Zuletzt gebraucht: ans Ende.
      this.memo.delete(key);
      this.memo.set(key, job);
    } else {
      job = this.startJob(voiceId, text, params, key);
    }
    if (onChunk) {
      for (const chunk of job.chunks) onChunk(chunk);
      if (!job.done) job.listeners.add(onChunk);
    }
    const current = job;
    return {
      promise: current.promise,
      cancel: () => {
        if (onChunk) current.listeners.delete(onChunk);
      },
    };
  }

  /** Text schon einmal rechnen lassen (die nächsten Zeilen eines Anrufs), ohne zuzuhören. */
  prepare(voiceId: PiperVoiceId, text: string, params: SynthRequestParams): void {
    this.synthesize(voiceId, text, params);
  }

  /** Alles abbrechen, was noch rechnet (Auflegen). Fertige Texte bleiben. */
  cancelAll(): void {
    const ids: number[] = [];
    for (const job of this.jobs.values()) {
      if (job.done) continue;
      ids.push(job.id);
      job.failed = true;
      this.memo.delete(job.key);
      job.reject(new Error('Abgebrochen.'));
    }
    for (const id of ids) this.jobs.delete(id);
    if (ids.length) this.worker?.postMessage({ type: 'cancel', ids });
  }

  /** Modell aus dem Browser löschen (Einstellungen). */
  remove(voiceId: PiperVoiceId): void {
    const worker = this.ensureWorker();
    if (!worker) return;
    worker.postMessage({ type: 'remove', voice: voiceFiles(piperVoice(voiceId)) });
  }

  private ensureWorker(): WorkerLike | null {
    if (this.worker) return this.worker;
    if (this.crashed) return null;
    const worker = this.createWorker();
    if (!worker) {
      this.crashed = true;
      for (const voice of PIPER_VOICES) this.setState(voice.id, { kind: 'error', message: UNSUPPORTED });
      return null;
    }
    worker.onmessage = (event) => this.handle(event.data);
    worker.onerror = () => this.crash();
    this.worker = worker;
    return worker;
  }

  private crash(): void {
    this.crashed = true;
    const message = 'Das Sprachmodell ist abgestürzt. Anrufe laufen mit der Stimme des Browsers.';
    for (const voice of PIPER_VOICES) this.setState(voice.id, { kind: 'error', message });
    for (const [voiceId, load] of this.loads) {
      load.resolve(false);
      this.loads.delete(voiceId);
    }
    for (const job of this.jobs.values()) {
      job.failed = true;
      this.memo.delete(job.key);
      job.reject(new Error(message));
    }
    this.jobs.clear();
    try {
      this.worker?.terminate();
    } catch {
      // Egal.
    }
    this.worker = null;
  }

  private startJob(voiceId: PiperVoiceId, text: string, params: SynthRequestParams, key: string): Job {
    const id = this.nextId++;
    let resolve: (audio: SpeechAudio) => void = () => {};
    let reject: (error: Error) => void = () => {};
    const promise = new Promise<SpeechAudio>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Niemand muss zuhören (vorbereitete Zeilen): kein "unhandled rejection".
    promise.catch(() => {});
    const job: Job = {
      id,
      key,
      sampleRate: piperVoice(voiceId).sampleRate,
      chunks: [],
      listeners: new Set(),
      done: false,
      failed: false,
      promise,
      resolve,
      reject,
    };
    const worker = this.ensureWorker();
    if (!worker) {
      job.failed = true;
      job.reject(new Error(UNSUPPORTED));
      return job;
    }
    this.jobs.set(id, job);
    this.memo.set(key, job);
    while (this.memo.size > MEMO_LIMIT) {
      const oldest = this.memo.keys().next().value;
      if (oldest === undefined) break;
      this.memo.delete(oldest);
    }
    const state = this.state(voiceId);
    if (state.kind === 'idle') void this.load(voiceId);
    worker.postMessage({ type: 'synth', id, voice: voiceFiles(piperVoice(voiceId)), text, params });
    return job;
  }

  private handle(message: WorkerResponse): void {
    switch (message.type) {
      case 'status': {
        if (!message.supported) {
          this.crashed = true;
          for (const voice of PIPER_VOICES)
            this.setState(voice.id, { kind: 'error', message: message.reason ?? UNSUPPORTED });
          break;
        }
        for (const voice of PIPER_VOICES) {
          const cached = message.cached[voice.id];
          if (cached !== undefined && this.state(voice.id).kind === 'idle')
            this.setState(voice.id, { kind: 'idle', cached });
        }
        break;
      }
      case 'progress':
        if (this.state(message.voice).kind !== 'ready')
          this.setState(message.voice, {
            kind: 'loading',
            phase: message.phase,
            loaded: message.loaded,
            total: message.total,
          });
        break;
      case 'loaded':
        this.setState(message.voice, { kind: 'ready' });
        this.loads.get(message.voice)?.resolve(true);
        this.loads.delete(message.voice);
        break;
      case 'loadError':
        this.setState(message.voice, { kind: 'error', message: message.message });
        this.loads.get(message.voice)?.resolve(false);
        this.loads.delete(message.voice);
        break;
      case 'sentence': {
        const job = this.jobs.get(message.id);
        if (!job) break;
        const chunk: SpeechChunk = { index: message.index, sampleRate: message.sampleRate, pcm: message.pcm };
        job.sampleRate = message.sampleRate;
        job.chunks.push(chunk);
        for (const listener of job.listeners) listener(chunk);
        break;
      }
      case 'done': {
        const job = this.jobs.get(message.id);
        if (!job) break;
        job.done = true;
        job.listeners.clear();
        this.jobs.delete(message.id);
        job.resolve({ sampleRate: job.sampleRate, sentences: job.chunks.map((c) => c.pcm) });
        break;
      }
      case 'error': {
        const job = this.jobs.get(message.id);
        if (!job) break;
        job.failed = true;
        job.listeners.clear();
        this.jobs.delete(message.id);
        this.memo.delete(job.key);
        job.reject(new Error(message.message));
        break;
      }
      case 'removed':
        this.setState(message.voice, { kind: 'idle', cached: false });
        break;
    }
  }

  private setState(voiceId: PiperVoiceId, state: VoiceModelState): void {
    this.states.set(voiceId, state);
    for (const listener of this.listeners) listener();
  }
}
