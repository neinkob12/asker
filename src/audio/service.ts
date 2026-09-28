// Der Audio-Dienst: Musik-Playlist nach Tageszeit, Soundeffekte, Geräusche (Regen …), Lautstärke und
// Stummschalten (pro Gerät gemerkt). Startet erst nach der ersten Nutzerinteraktion (Browser-Regel):
// Vorher sind alle Aufrufe erlaubt, spielen aber nichts.

import type { KeyValueStorage } from '../core';
import { FilePlayer, MusicPlayer, type TrackPlayer } from './music';
import { type AudioSettings, DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings } from './settings';
import { Ambience, type AmbienceId, playSound, type SoundId, SynthCore } from './synth';
import { type MusicMood, pickTrack, TRACKS, type Track } from './tracks';

export type AudioStatus = 'locked' | 'running' | 'suspended' | 'unsupported';

/** Eigener Sound eines Moduls: Erzeugung per Web Audio oder eine Datei (URL, z.B. aus public/audio/). */
export type CustomSound =
  | { kind: 'synth'; play: (ctx: AudioContext, destination: AudioNode, time: number) => void }
  | { kind: 'file'; url: string; volume?: number };

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
  private readonly custom = new Map<string, CustomSound>();
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly listeners = new Set<() => void>();
  private readonly lastPlayed = new Map<string, number>();
  private readonly ambienceLevels = new Map<AmbienceId, number>();
  private readonly createContext: () => AudioContext | null;

  constructor(options: AudioServiceOptions = {}) {
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
    const unlock = () => {
      this.unlock();
      if (this.status === 'running' || this.status === 'unsupported') {
        for (const type of ['pointerdown', 'keydown', 'touchend'] as const)
          target.removeEventListener(type, unlock, true);
      }
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) target.addEventListener(type, unlock, true);
    target.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (target.visibilityState === 'hidden') {
        this.ctx.suspend();
        this.status = 'suspended';
      } else {
        this.ctx.resume();
        this.status = 'running';
      }
      this.emit();
    });
  }

  /** Ton starten (muss aus einer Nutzerinteraktion heraus aufgerufen werden). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
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
    this.core = new SynthCore(ctx, this.musicBus);
    this.ambience = new Ambience(this.core, this.ambienceBus);
    this.applyVolumes(true);
    ctx.resume();
    this.status = 'running';
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
    const t = ctx.currentTime + 0.01 + (options.delay ?? 0);
    const out = ctx.createGain();
    out.gain.value = options.volume ?? 1;
    out.connect(this.sfxBus);
    setTimeout(() => out.disconnect(), 6000 + (options.delay ?? 0) * 1000);
    const custom = this.custom.get(id);
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

  /** Eigenen Sound anmelden, z.B. registerSound('gangs.gunshot', { kind: 'file', url: 'audio/sfx/schuss.ogg' }). */
  registerSound(id: string, sound: CustomSound): void {
    this.custom.set(id, sound);
  }

  private loadBuffer(url: string): Promise<AudioBuffer | null> {
    let promise = this.buffers.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx?.decodeAudioData(data) ?? null)
        .catch(() => null);
      this.buffers.set(url, promise);
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
    this.player?.stop(3);
    this.mismatchSince = null;
    const onEnded = (ended: TrackPlayer) => {
      if (ended === this.player) this.startTrack();
    };
    this.player =
      track.src && this.ctx
        ? new FilePlayer(this.ctx, this.musicBus, track, this.loadBuffer(track.src), onEnded)
        : new MusicPlayer(this.core, this.musicBus, track, onEnded);
    this.emit();
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
    const s = this.settings;
    const set = (param: AudioParam, value: number) => {
      if (immediate) param.setValueAtTime(value, ctx.currentTime);
      else param.setTargetAtTime(value, ctx.currentTime, 0.08);
    };
    set(this.master.gain, s.muted ? 0 : s.master);
    set(this.musicBus.gain, s.music * 2.2);
    set(this.sfxBus.gain, s.sfx);
    set(this.ambienceBus.gain, s.sfx);
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
