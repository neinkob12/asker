// Der Audio-Dienst: Musik-Playlist nach Tageszeit, Soundeffekte, Geräusche (Regen …), Lautstärke und
// Stummschalten (pro Gerät gemerkt). Startet erst nach der ersten Nutzerinteraktion (Browser-Regel):
// Vorher sind alle Aufrufe erlaubt, spielen aber nichts.
// Stimmen im Anruf: Figuren sprechen mit dem Sprachmodell Piper im Browser (piper/), die Sprachausgabe des Browsers
// (voice.ts) ist nur die Notlösung, wenn das Modell nicht läuft. Während eines Gesprächs (setCall) sind Musik,
// Effekte und Geräusche aus, nur die Stimme ist zu hören.

import type { KeyValueStorage, VoiceSpec } from '../core';
import { FilePlayer, MusicPlayer, type TrackPlayer } from './music';
import { PiperEngine, type SynthJob, type VoiceModelState } from './piper/engine';
import { SpeechPlayback } from './piper/playback';
import { type PiperVoice, type PiperVoiceId, piperParams, piperVoiceFor } from './piper/voices';
import { type AudioSettings, DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings } from './settings';
import { Ambience, type AmbienceId, playSound, type SoundId, SynthCore } from './synth';
import { type MusicMood, pickTrack, TRACKS, type Track } from './tracks';
import { Speaker } from './voice';

export type AudioStatus = 'locked' | 'running' | 'suspended' | 'unsupported';

/** Eigener Sound eines Moduls: Erzeugung per Web Audio oder eine Datei (URL, z.B. aus public/audio/). */
export type CustomSound =
  | { kind: 'synth'; play: (ctx: AudioContext, destination: AudioNode, time: number) => void }
  | { kind: 'file'; url: string; volume?: number }
  | { kind: 'loop'; start: (ctx: AudioContext, destination: AudioNode, time: number) => LoopVoice };

/** Werte einer Ton-Schleife (z.B. Drehzahl, Tonhöhe). `volume` (0–1) regelt der Dienst selbst. */
export type LoopParams = Record<string, number>;

/** Die Knoten einer laufenden Schleife (vom Modul gebaut): Werte nachführen und zum Zeitpunkt anhalten. */
export interface LoopVoice {
  set?(params: LoopParams, time: number): void;
  stop(time: number): void;
}

/** Griff auf eine Schleife (audio.loop). Läuft der Ton noch nicht, startet sie später; ohne Web Audio tut er nichts. */
export interface LoopHandle {
  set(params: LoopParams): void;
  stop(): void;
}

const SILENT_LOOP: LoopHandle = { set: () => {}, stop: () => {} };
/** Ein- und Ausblenden einer Schleife (Sekunden, Zeitkonstante bzw. Länge). */
const LOOP_SMOOTH = 0.06;
const LOOP_FADE_OUT = 0.12;

export interface PlayOptions {
  /** Lautstärke 0–1 relativ zur Effekt-Lautstärke. */
  volume?: number;
  /** Verzögerung in Sekunden. */
  delay?: number;
}

export interface NowPlaying {
  track: Track;
  elapsed: number;
  duration: number;
}

/** Wie lange (Sekunden) ein Stück gegen die Tageszeit laufen darf, bevor überblendet wird. */
const MISMATCH_SECONDS = 45;
const NEIGHBORS: Record<MusicMood, MusicMood[]> = {
  night: ['dusk', 'dawn'],
  dawn: ['night', 'day'],
  day: ['dawn', 'dusk'],
  dusk: ['day', 'night'],
};

export interface AudioServiceOptions {
  /** Erzeugt den AudioContext. Standard: window.AudioContext. In Tests null. */
  createContext?: () => AudioContext | null;
  /** Sprachausgabe des Browsers (Notlösung im Anruf). Standard: die des Browsers. */
  speaker?: Speaker;
  /** Sprachmodell (Piper im Worker). Standard: eines mit dem Worker des Browsers; null = ohne Modell (Tests). */
  createEngine?: () => PiperEngine | null;
}

/** Lautstärke der Busse aus den Einstellungen und der Lage: Im Gespräch bleibt nur die Stimme übrig. */
export function busLevels(
  s: AudioSettings,
  state: { speaking: boolean; inCall: boolean },
): { master: number; music: number; sfx: number; ambience: number; voice: number } {
  const call = state.inCall ? 0 : 1;
  return {
    master: s.muted ? 0 : s.master,
    // Spricht jemand (Profil "Stimme anhören"), tritt die Musik zurück; im Anruf ist sie ganz aus.
    music: s.music * 2.2 * (state.speaking ? 0.3 : 1) * call,
    sfx: s.sfx * call,
    ambience: s.sfx * call,
    voice: Math.max(0.6, s.sfx),
  };
}

/** So lange (ms) bleibt eine fehlgeschlagene Audio-Datei im Speicher, bevor ein neuer Versuch erlaubt ist. */
const BUFFER_RETRY_MS = 30_000;
/** Wartezeit (ms) nach einem Stück, das nicht lief: 2 s, 4 s, 8 s … höchstens 60 s. */
const MUSIC_RETRY_MS = 2_000;
const MUSIC_RETRY_MAX_MS = 60_000;

/** So lange wartet ein Satz auf das Modell (Download beim ersten Anruf), dann spricht der Browser. */
const READY_TIMEOUT_MS = 90_000;
/** Meldet das bereite Modell so lange (ms) keinen Satz und kein Ende, gilt die Zeile als hängengeblieben. */
export const SYNTH_IDLE_MS = 30_000;

/** Datensparmodus des Geräts: Dann lädt das Spiel das Modell nicht von selbst (nur aus dem Cache). */
function dataSaver(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return nav.connection?.saveData === true;
}

export class AudioService {
  settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  status: AudioStatus = 'locked';
  mood: MusicMood = 'night';

  private storage: KeyValueStorage | null = null;
  private ctx: AudioContext | null = null;
  private core: SynthCore | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private ambience: Ambience | null = null;
  private player: TrackPlayer | null = null;
  private readonly recent: string[] = [];
  private mismatchSince: number | null = null;
  /** Wie oft hintereinander ein Stück aus einer Datei nicht lief, und der Timer für den nächsten Versuch. */
  private musicFailures = 0;
  private musicRetry: ReturnType<typeof setTimeout> | null = null;
  private readonly custom = new Map<string, CustomSound>();
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly listeners = new Set<() => void>();
  private readonly lastPlayed = new Map<string, number>();
  private readonly ambienceLevels = new Map<AmbienceId, number>();
  /** Ton-Schleifen, die angefragt wurden, bevor der Ton lief (deferLoop). */
  private readonly pendingLoops = new Set<() => void>();
  private readonly createContext: () => AudioContext | null;
  private speakerInstance: Speaker | null;
  /** Wie viele Sätze gerade gesprochen werden (Musik so lange leiser). */
  private speaking = 0;
  private voiceBus: GainNode | null = null;
  private readonly createEngine: () => PiperEngine | null;
  /** undefined: noch nicht angelegt, null: dieser Browser kann kein Sprachmodell. */
  private piperEngine: PiperEngine | null | undefined = undefined;
  /** Läuft gerade ein Gespräch? Dann sind Musik, Effekte und Geräusche aus. */
  private callActive = false;
  /**
   * Zählt hoch, wenn ein Gespräch endet (stopSpeaking, setCall(false)). Vorrechnen wartet auf das Modell und merkt
   * sich die Zahl: Ist sie danach eine andere, ist der Anruf vorbei und die Zeilen bleiben ungerechnet.
   */
  private speechGeneration = 0;
  /** Abbrechen-Funktionen der laufenden Sätze (stopSpeaking). */
  private readonly activeSpeech = new Set<() => void>();

  constructor(options: AudioServiceOptions = {}) {
    this.speakerInstance = options.speaker ?? null;
    this.createEngine = options.createEngine ?? (() => new PiperEngine());
    this.createContext =
      options.createContext ??
      (() => {
        const Ctor =
          typeof window === 'undefined'
            ? undefined
            : (window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
        return Ctor ? new Ctor({ latencyHint: 'playback' }) : null;
      });
  }

  /** Einstellungen aus dem Speicher laden (einmal beim Start). */
  init(storage: KeyValueStorage | null): void {
    this.storage = storage;
    this.settings = loadAudioSettings(storage);
    this.emit();
  }

  /**
   * Wartet auf die erste Interaktion (Klick, Tippen, Taste) und startet dann den Ton.
   * Pausiert, wenn der Tab im Hintergrund ist.
   */
  attach(target: Document): void {
    // Die Listener bleiben dran (außer ohne Web Audio): Ein Kontext kann auch später wieder stehen (Anruf,
    // Sperrbildschirm, iOS "interrupted") und braucht dann wieder eine Geste. unlock() ist beim laufenden Ton billig.
    const unlock = () => {
      this.unlock();
      if (this.status === 'unsupported') {
        for (const type of ['pointerdown', 'keydown', 'touchend'] as const)
          target.removeEventListener(type, unlock, true);
      }
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) target.addEventListener(type, unlock, true);
    target.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (target.visibilityState === 'hidden') {
        void this.ctx.suspend()?.catch?.(() => {});
      } else {
        this.resumeContext();
      }
      this.syncStatus();
    });
  }

  /** Kontext fortsetzen und den echten Zustand übernehmen (resume() ist asynchron und kann scheitern). */
  private resumeContext(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    try {
      void ctx
        .resume()
        ?.then(() => this.syncStatus())
        .catch(() => this.syncStatus());
    } catch {
      this.syncStatus();
    }
  }

  /** Status aus dem echten Zustand des Kontexts und der Sichtbarkeit des Tabs ableiten. */
  private syncStatus(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const next: AudioStatus = !hidden && ctx.state === 'running' ? 'running' : 'suspended';
    if (next === this.status) return;
    this.status = next;
    this.startPendingLoops();
    this.emit();
  }

  /** Ton starten (muss aus einer Nutzerinteraktion heraus aufgerufen werden). */
  unlock(): void {
    if (this.ctx) {
      this.resumeContext();
      this.syncStatus();
      return;
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = this.createContext();
    } catch {
      ctx = null;
    }
    if (!ctx) {
      this.status = 'unsupported';
      this.pendingLoops.clear();
      this.emit();
      return;
    }
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.connect(compressor).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.connect(this.master);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    this.core = new SynthCore(ctx, this.musicBus);
    this.ambience = new Ambience(this.core, this.ambienceBus);
    this.applyVolumes(true);
    ctx.addEventListener?.('statechange', () => this.syncStatus());
    this.resumeContext();
    // Safari startet den Kontext erst nach resume(): Bis der Zustand "running" meldet, bleibt der Status "suspended".
    this.status = ctx.state === 'running' ? 'running' : 'suspended';
    this.startPendingLoops();
    for (const [id, level] of this.ambienceLevels) this.ambience.set(id, level);
    if (this.settings.musicOn) this.startTrack();
    this.emit();
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  // -------------------------------------------------------------------------------------------
  // Soundeffekte

  /**
   * Soundeffekt abspielen (eingebaut oder mit registerSound angemeldet). Vor der ersten Interaktion,
   * bei Stummschaltung oder wenn der Tab im Hintergrund ist, passiert nichts.
   */
  play(id: SoundId | (string & {}), options: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.core || !this.sfxBus || this.status !== 'running' || this.settings.muted) return;
    // Im Gespräch gibt es nur die Stimme.
    if (this.callActive) return;
    const custom = this.custom.get(id);
    // Schleifen laufen nur über loop().
    if (custom?.kind === 'loop') return;
    const t = ctx.currentTime + 0.01 + (options.delay ?? 0);
    const out = ctx.createGain();
    out.gain.value = options.volume ?? 1;
    out.connect(this.sfxBus);
    setTimeout(() => out.disconnect(), 6000 + (options.delay ?? 0) * 1000);
    if (custom?.kind === 'synth') {
      custom.play(ctx, out, t);
    } else if (custom?.kind === 'file') {
      out.gain.value *= custom.volume ?? 1;
      this.loadBuffer(custom.url).then((buffer) => {
        if (!buffer || !this.ctx) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(out);
        src.start(Math.max(t, this.ctx.currentTime));
      });
    } else {
      playSound(this.core, out, id as SoundId, t);
    }
  }

  /** Wie play, aber höchstens einmal pro Zeitraum (z.B. Kasse bei vielen Verkäufen). */
  playThrottled(id: SoundId | (string & {}), minIntervalMs: number, options?: PlayOptions): void {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const last = this.lastPlayed.get(id) ?? -Infinity;
    if (now - last < minIntervalMs) return;
    this.lastPlayed.set(id, now);
    this.play(id, options);
  }

  /**
   * Ton-Schleife starten (mit registerSound als `kind: 'loop'` angemeldet), z.B. Motor oder Martinshorn:
   * `const engine = audio.loop('minigames.chase.engine', { volume: 0.7 })`, dann pro Bild `engine.set({ rpm })` und
   * am Ende `engine.stop()`. Läuft über den Effekt-Bus: Lautstärke, Stummschalten und Gespräch gelten wie für alle
   * Effekte. Läuft der Ton noch nicht (vor der ersten Interaktion, Tab gerade zurück), merkt sich der Griff die Werte
   * und die Schleife startet, sobald der Ton läuft; ohne Web Audio tut er nichts.
   */
  loop(id: string, params: LoopParams = {}): LoopHandle {
    const ctx = this.ctx;
    const custom = this.custom.get(id);
    if (custom?.kind !== 'loop' || this.status === 'unsupported') return SILENT_LOOP;
    if (!ctx || !this.sfxBus || this.status !== 'running') return this.deferLoop(id, params);
    const out = ctx.createGain();
    const t = ctx.currentTime + 0.01;
    out.gain.setValueAtTime(0, t);
    out.gain.setTargetAtTime(params.volume ?? 1, t, LOOP_SMOOTH);
    out.connect(this.sfxBus);
    let voice: LoopVoice;
    try {
      voice = custom.start(ctx, out, t);
      voice.set?.(params, t);
    } catch {
      out.disconnect();
      return SILENT_LOOP;
    }
    let stopped = false;
    return {
      set: (next) => {
        if (stopped) return;
        const now = ctx.currentTime;
        if (next.volume !== undefined) out.gain.setTargetAtTime(Math.max(0, next.volume), now, LOOP_SMOOTH);
        voice.set?.(next, now);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, LOOP_FADE_OUT / 3);
        voice.stop(now + LOOP_FADE_OUT + 0.05);
        setTimeout(() => out.disconnect(), (LOOP_FADE_OUT + 0.3) * 1000);
      },
    };
  }

  /** Griff auf eine Schleife, die erst startet, wenn der Ton läuft (startPendingLoops); bis dahin sammelt er die Werte. */
  private deferLoop(id: string, params: LoopParams): LoopHandle {
    let latest = { ...params };
    let live: LoopHandle | null = null;
    const start = () => {
      this.pendingLoops.delete(start);
      live = this.loop(id, latest);
    };
    this.pendingLoops.add(start);
    return {
      set: (next) => {
        if (live) live.set(next);
        else if (this.pendingLoops.has(start)) latest = { ...latest, ...next };
      },
      stop: () => {
        this.pendingLoops.delete(start);
        live?.stop();
      },
    };
  }

  /** Der Ton läuft (wieder): Schleifen starten, die angefragt wurden, solange er stand. */
  private startPendingLoops(): void {
    if (this.status !== 'running') return;
    for (const start of [...this.pendingLoops]) start();
  }

  /** Eigenen Sound anmelden, z.B. registerSound('gangs.gunshot', { kind: 'file', url: 'audio/sfx/schuss.ogg' }). */
  registerSound(id: string, sound: CustomSound): void {
    this.custom.set(id, sound);
  }

  private loadBuffer(url: string): Promise<AudioBuffer | null> {
    let promise = this.buffers.get(url);
    if (!promise) {
      const created: Promise<AudioBuffer | null> = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Audio-Datei nicht geladen (${r.status}).`);
          return r.arrayBuffer();
        })
        .then((data) => this.ctx?.decodeAudioData(data) ?? null)
        .catch(() => null);
      promise = created;
      this.buffers.set(url, created);
      // Ein Fehlschlag bleibt nicht für immer im Speicher: nach einer Weile darf es noch einmal versucht werden.
      void created.then((buffer) => {
        if (buffer !== null) return;
        setTimeout(() => {
          if (this.buffers.get(url) === created) this.buffers.delete(url);
        }, BUFFER_RETRY_MS);
      });
    }
    return promise;
  }

  // -------------------------------------------------------------------------------------------
  // Geräusche

  /** Geräusch-Schleife (Regen, Gewitter, Wind) auf eine Lautstärke 0–1 setzen, 0 = aus. */
  setAmbience(id: AmbienceId, level: number): void {
    if ((this.ambienceLevels.get(id) ?? 0) === level) return;
    this.ambienceLevels.set(id, level);
    this.ambience?.set(id, level);
  }

  // -------------------------------------------------------------------------------------------
  // Musik

  /** Stimmung nach Tageszeit. Das nächste Stück passt dazu; läuft eines lange dagegen, wird überblendet. */
  setMood(mood: MusicMood): void {
    if (mood !== this.mood) {
      this.mood = mood;
      this.emit();
    }
    const track = this.player?.track;
    const ctx = this.ctx;
    if (!track || !ctx) return;
    const fits = track.moods.includes(mood) || track.moods.some((m) => NEIGHBORS[mood].includes(m));
    if (fits) {
      this.mismatchSince = null;
      return;
    }
    this.mismatchSince ??= ctx.currentTime;
    if (ctx.currentTime - this.mismatchSince > MISMATCH_SECONDS) this.next();
  }

  /** Zum nächsten Stück springen (überblendet). */
  next(): void {
    if (!this.ctx || !this.settings.musicOn) return;
    this.startTrack();
  }

  nowPlaying(): NowPlaying | null {
    if (!this.player) return null;
    return { track: this.player.track, ...this.player.position() };
  }

  get tracks(): readonly Track[] {
    return TRACKS;
  }

  private startTrack(): void {
    if (!this.core || !this.musicBus) return;
    const track = pickTrack(TRACKS, this.mood, this.recent, Math.random);
    this.recent.push(track.id);
    if (this.recent.length > 3) this.recent.shift();
    this.clearMusicRetry();
    this.player?.stop(3);
    this.mismatchSince = null;
    const onEnded = (ended: TrackPlayer, failed = false) => {
      if (ended !== this.player) return;
      if (!failed) {
        this.musicFailures = 0;
        this.startTrack();
        return;
      }
      // Datei nicht ladbar (offline, 404): nicht sofort das nächste Stück, sonst dreht sich das im Kreis.
      const delay = Math.min(MUSIC_RETRY_MAX_MS, MUSIC_RETRY_MS * 2 ** this.musicFailures);
      this.musicFailures++;
      this.musicRetry = setTimeout(() => {
        this.musicRetry = null;
        if (ended === this.player && this.settings.musicOn) this.startTrack();
      }, delay);
    };
    this.player =
      track.src && this.ctx
        ? new FilePlayer(this.ctx, this.musicBus, track, this.loadBuffer(track.src), onEnded)
        : new MusicPlayer(this.core, this.musicBus, track, onEnded);
    this.emit();
  }

  private clearMusicRetry(): void {
    if (this.musicRetry) clearTimeout(this.musicRetry);
    this.musicRetry = null;
  }

  // -------------------------------------------------------------------------------------------
  // Lautstärke

  update(patch: Partial<AudioSettings>): void {
    const before = this.settings;
    this.settings = { ...before, ...patch };
    saveAudioSettings(this.storage, this.settings);
    this.applyVolumes(false);
    if (this.ctx && patch.musicOn !== undefined && patch.musicOn !== before.musicOn) {
      if (patch.musicOn) this.startTrack();
      else {
        this.clearMusicRetry();
        this.player?.stop(1.5);
        this.player = null;
      }
    }
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.update({ muted });
  }

  toggleMute(): void {
    this.setMuted(!this.settings.muted);
  }

  private applyVolumes(immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.sfxBus || !this.ambienceBus) return;
    const levels = busLevels(this.settings, { speaking: this.speaking > 0, inCall: this.callActive });
    const set = (param: AudioParam, value: number) => {
      if (immediate) param.setValueAtTime(value, ctx.currentTime);
      else param.setTargetAtTime(value, ctx.currentTime, 0.08);
    };
    set(this.master.gain, levels.master);
    set(this.musicBus.gain, levels.music);
    set(this.sfxBus.gain, levels.sfx);
    set(this.ambienceBus.gain, levels.ambience);
    if (this.voiceBus) set(this.voiceBus.gain, levels.voice);
  }

  // -------------------------------------------------------------------------------------------
  // Gespräch

  /** Gespräch läuft (angenommener Anruf): Musik, Effekte und Geräusche aus, bis es vorbei ist. */
  setCall(active: boolean): void {
    if (this.callActive === active) return;
    this.callActive = active;
    if (!active) this.speechGeneration++;
    this.applyVolumes(false);
    this.emit();
  }

  get inCall(): boolean {
    return this.callActive;
  }

  // -------------------------------------------------------------------------------------------
  // Stimmen im Anruf

  private get speaker(): Speaker {
    this.speakerInstance ??= new Speaker();
    return this.speakerInstance;
  }

  /** Das Sprachmodell, beim ersten Zugriff angelegt; null, wenn der Browser es nicht kann. */
  private engine(): PiperEngine | null {
    if (this.piperEngine !== undefined) return this.piperEngine;
    let engine: PiperEngine | null = null;
    try {
      engine = this.createEngine();
    } catch {
      engine = null;
    }
    this.piperEngine = engine?.supported ? engine : null;
    if (this.piperEngine) {
      this.piperEngine.subscribe(() => this.emit());
      this.piperEngine.refreshStatus();
    }
    return this.piperEngine;
  }

  /** Kann dieser Browser überhaupt sprechen (Sprachmodell oder Sprachausgabe des Browsers)? */
  get canSpeakAtAll(): boolean {
    return this.engine() !== null || this.speaker.available;
  }

  /** Sprechen Figuren im Anruf? (Einstellung an, nicht stumm, Browser kann es.) */
  get canSpeak(): boolean {
    return this.settings.voices && !this.settings.muted && this.canSpeakAtAll;
  }

  /** Womit die Figuren sprechen: das Sprachmodell, die Stimme des Browsers (Notlösung) oder gar nicht. */
  get voiceEngine(): 'model' | 'browser' | 'none' {
    if (!this.canSpeak) return 'none';
    const engine = this.engine();
    if (engine?.models.some((m) => m.state.kind !== 'error')) return 'model';
    return this.speaker.available ? 'browser' : 'none';
  }

  /** Alle Sprachmodelle mit Stand (Einstellungen › Ton). Leer, wenn der Browser keins ausführen kann. */
  get voiceModels(): { voice: PiperVoice; state: VoiceModelState }[] {
    return this.engine()?.models ?? [];
  }

  /** Stand des Modells, das diese Figur spricht; null ohne Sprachmodell (dann spricht der Browser). */
  voiceState(spec: VoiceSpec): VoiceModelState | null {
    const engine = this.engine();
    return engine ? engine.state(piperVoiceFor(spec).id) : null;
  }

  /** Modell laden, auch nach einem Fehler noch einmal (Einstellungen). Ein entferntes darf dann wieder von selbst laden. */
  loadVoiceModel(id: PiperVoiceId): void {
    const removed = this.settings.removedVoices;
    if (removed.includes(id)) this.update({ removedVoices: removed.filter((v) => v !== id) });
    void this.engine()?.load(id, { retry: true });
  }

  /** Modell vom Gerät löschen (Einstellungen). Es lädt erst wieder über "Laden", nicht still beim nächsten Anruf. */
  removeVoiceModel(id: PiperVoiceId): void {
    const engine = this.engine();
    if (!engine) return;
    const removed = this.settings.removedVoices;
    if (!removed.includes(id)) this.update({ removedVoices: [...removed, id] });
    engine.remove(id);
  }

  /** Darf das Modell für diese Figur gerade sprechen (läuft, lädt oder darf laden)? */
  private modelAllowed(engine: PiperEngine, spec: VoiceSpec): boolean {
    const id = piperVoiceFor(spec).id;
    const state = engine.state(id);
    if (state.kind === 'error') return false;
    // Nicht im Browser: lädt von selbst, außer das Gerät spart Daten oder der Spieler hat es entfernt.
    if (state.kind === 'idle')
      return state.cached === true || (!dataSaver() && !this.settings.removedVoices.includes(id));
    return true;
  }

  /**
   * Modell einer Figur schon einmal laden, wenn ihr Anruf klingelt: aus dem Cache in Sekunden, sonst als Download
   * (einmalig, bleibt im Browser), außer das Gerät spart Daten oder der Spieler hat das Modell entfernt.
   */
  prepareVoice(spec: VoiceSpec): void {
    if (!this.settings.voices) return;
    const engine = this.engine();
    if (!engine || !this.modelAllowed(engine, spec)) return;
    void engine.load(piperVoiceFor(spec).id);
  }

  /** Zeilen eines Gesprächs vorrechnen lassen, damit sie ohne Wartezeit kommen (sobald das Modell da ist). */
  prepareSpeech(texts: readonly string[], spec: VoiceSpec): void {
    if (!this.canSpeak) return;
    const engine = this.engine();
    if (!engine || !this.modelAllowed(engine, spec)) return;
    const voice = piperVoiceFor(spec);
    const params = piperParams(spec);
    const generation = this.speechGeneration;
    void engine.ready(voice.id, READY_TIMEOUT_MS).then((ok) => {
      // Aufgelegt, während das Modell lud: Die Zeilen gehören zu einem Anruf, den es nicht mehr gibt.
      if (!ok || !this.settings.voices || generation !== this.speechGeneration) return;
      for (const text of texts) engine.prepare(voice.id, text, params);
    });
  }

  /**
   * Einen Satz mit der Stimme einer Figur sprechen. onEnd kommt genau einmal (fertig, Fehler oder Sicherheitsnetz).
   * Kann nicht gesprochen werden, kommt nichts (dann zeigt der Anruf die Zeile im eigenen Tempo). Gibt eine Funktion
   * zum Abbrechen zurück. Die Musik ist so lange leiser. Erst das Sprachmodell; läuft es nicht, der Browser.
   */
  speak(text: string, voice: VoiceSpec, onEnd: () => void): (() => void) | null {
    if (!this.canSpeak) return null;
    const engine = this.engine();
    const ctx = this.ctx;
    const bus = this.voiceBus;
    if (engine && ctx && bus && this.status === 'running' && this.modelAllowed(engine, voice))
      return this.speakWithModel(engine, ctx, bus, text, voice, onEnd);
    return this.speakWithBrowser(text, voice, onEnd);
  }

  private get browserVolume(): number {
    return this.settings.master * Math.max(0.6, this.settings.sfx);
  }

  /** Mitzählen, wer spricht (Musik leiser), und die Abbrechen-Funktion für stopSpeaking merken. */
  private track(cancel: () => void): () => void {
    this.speaking++;
    this.applyVolumes(false);
    this.activeSpeech.add(cancel);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeSpeech.delete(cancel);
      this.speaking = Math.max(0, this.speaking - 1);
      this.applyVolumes(false);
    };
  }

  private speakWithBrowser(text: string, voice: VoiceSpec, onEnd: () => void): (() => void) | null {
    if (!this.speaker.available) return null;
    let done = false;
    const cancel = () => {
      if (done) return;
      done = true;
      stop();
      release();
    };
    const release = this.track(cancel);
    const stop = this.speaker.speak(text, voice, this.browserVolume, () => {
      if (done) return;
      done = true;
      release();
      onEnd();
    });
    return cancel;
  }

  private speakWithModel(
    engine: PiperEngine,
    ctx: AudioContext,
    bus: GainNode,
    text: string,
    voice: VoiceSpec,
    onEnd: () => void,
  ): () => void {
    const model = piperVoiceFor(voice);
    const params = piperParams(voice);
    let cancelled = false;
    let finished = false;
    let job: SynthJob | null = null;
    let browserStop: (() => void) | null = null;
    let sentences = 0;
    /** Sicherheitsnetz: läuft ab, wenn das Modell zu lange keinen Satz und kein Ende meldet. */
    let idle: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (cancelled || finished) return;
      cancelled = true;
      clearTimeout(idle);
      playback.stop();
      job?.cancel();
      browserStop?.();
      release();
    };
    const release = this.track(cancel);
    const finish = () => {
      if (finished || cancelled) return;
      finished = true;
      release();
      onEnd();
    };
    const playback = new SpeechPlayback(ctx, bus, params.playbackRate, finish);
    // Notlösung: Modell nicht da, dann die Stimme des Browsers; geht auch das nicht, ist der Satz gleich "fertig".
    const fallback = () => {
      if (cancelled || finished) return;
      const stop = this.speaker.available ? this.speaker.speak(text, voice, this.browserVolume, finish) : null;
      if (stop) browserStop = stop;
      else finish();
    };
    void (async () => {
      const ok = await engine.ready(model.id, READY_TIMEOUT_MS);
      if (cancelled) return;
      if (!ok) {
        fallback();
        return;
      }
      // Hängt die Synthese (kein Satz, kein Ende), endet die Zeile trotzdem: mit den Sätzen, die schon da sind,
      // sonst mit der Stimme des Browsers. Was danach noch vom Modell kommt, fällt weg.
      let settled = false;
      const giveUp = () => {
        if (settled || cancelled) return;
        settled = true;
        job?.cancel();
        if (sentences > 0) playback.end();
        else fallback();
      };
      const watch = () => {
        clearTimeout(idle);
        idle = setTimeout(giveUp, SYNTH_IDLE_MS);
      };
      watch();
      job = engine.synthesize(model.id, text, params, (chunk) => {
        if (cancelled || settled) return;
        sentences++;
        playback.add(chunk.pcm, chunk.sampleRate);
        watch();
      });
      try {
        await job.promise;
        if (!cancelled && !settled) playback.end();
      } catch {
        if (cancelled || settled) return;
        if (sentences > 0) playback.end();
        else fallback();
      } finally {
        settled = true;
        clearTimeout(idle);
      }
    })();
    return cancel;
  }

  /** Sprachausgabe des Browsers freigeben (aus einem Tippen heraus, z.B. Anruf annehmen): Safari will das so. */
  primeSpeech(): void {
    if (this.settings.voices && this.speaker.available) this.speaker.prime();
  }

  /** Alle Stimmen verstummen lassen (Auflegen, Überspringen); vorgerechnete Zeilen, die noch rechnen, fallen weg. */
  stopSpeaking(): void {
    this.speechGeneration++;
    for (const cancel of [...this.activeSpeech]) cancel();
    this.activeSpeech.clear();
    this.piperEngine?.cancelAll();
    this.speakerInstance?.stop();
    this.speaking = 0;
    this.applyVolumes(false);
  }

  // -------------------------------------------------------------------------------------------

  /** Änderungen (Einstellungen, Stück, Status) für die Oberfläche. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
