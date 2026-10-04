// Spielt ein Stück aus tracks.ts ab: Sechzehntel-Raster, vorausgeplant (Lookahead), mit Arrangement nach
// Abschnitten. Jedes Stück hat einen eigenen Lautstärkeregler, damit Übergänge weich überblenden.

import { createRng } from '../core';
import { Instruments, type SynthCore } from './synth';
import { CHORD_INTERVALS, type DrumStyle, type Layer, type Track, trackDuration } from './tracks';

const LOOKAHEAD_S = 0.2;
const TICK_MS = 40;

/** Muster je Schlagzeugstil, 16 Sechzehntel pro Takt: Stärke 0–1. */
const DRUMS = {
  halftime: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hat: [0.9, 0, 0.5, 0, 0.8, 0, 0.5, 0, 0.9, 0, 0.5, 0, 0.8, 0, 0.6, 0.4],
  },
  boombap: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0.9, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.25],
    hat: [0.8, 0, 0.5, 0, 0.8, 0, 0.5, 0.3, 0.8, 0, 0.5, 0, 0.8, 0, 0.5, 0],
  },
  minimal: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0],
    hat: [0.6, 0, 0, 0, 0.5, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0, 0, 0],
  },
} as const;

/** Bass-Rhythmus je Stil: [Sechzehntel, Länge in Sechzehnteln, Stufe 0 = Grundton, 1 = Quinte, 2 = Oktave]. */
const BASS: Record<DrumStyle, [number, number, number][]> = {
  halftime: [
    [0, 6, 0],
    [10, 3, 0],
    [14, 2, 1],
  ],
  boombap: [
    [0, 3, 0],
    [3, 2, 0],
    [8, 3, 1],
    [11, 4, 0],
  ],
  minimal: [
    [0, 12, 0],
    [14, 2, 2],
  ],
};

const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3];

/** Gemeinsame Schnittstelle für erzeugte Stücke und Dateien. */
export interface TrackPlayer {
  readonly track: Track;
  position(): { elapsed: number; duration: number };
  stop(fadeOut?: number): void;
}

/** Spielt ein Stück aus einer Datei (Track mit src), mit Ein- und Ausblenden. */
export class FilePlayer implements TrackPlayer {
  private readonly output: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private duration = 0;
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    readonly track: Track,
    buffer: Promise<AudioBuffer | null>,
    /** failed: Die Datei lief nicht (nicht geladen oder nicht lesbar), nicht: das Stück ist zu Ende. */
    onEnded: (player: FilePlayer, failed?: boolean) => void,
  ) {
    this.output = ctx.createGain();
    this.output.gain.value = 0.0001;
    this.output.connect(destination);
    buffer.then((data) => {
      if (this.stopped) return;
      if (!data) {
        onEnded(this, true);
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = data;
      src.connect(this.output);
      src.onended = () => {
        if (!this.stopped) onEnded(this);
      };
      this.startedAt = ctx.currentTime + 0.05;
      this.duration = data.duration;
      src.start(this.startedAt);
      this.output.gain.exponentialRampToValueAtTime(1, this.startedAt + 2);
      this.source = src;
    });
  }

  position(): { elapsed: number; duration: number } {
    return { elapsed: this.source ? Math.max(0, this.ctx.currentTime - this.startedAt) : 0, duration: this.duration };
  }

  stop(fadeOut = 2.5): void {
    this.stopped = true;
    const g = this.output.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(Math.max(0.0001, g.value), this.ctx.currentTime);
    g.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + fadeOut);
    this.source?.stop(this.ctx.currentTime + fadeOut + 0.1);
    setTimeout(() => this.output.disconnect(), (fadeOut + 0.5) * 1000);
  }
}

export class MusicPlayer implements TrackPlayer {
  readonly output: GainNode;
  private readonly instruments: Instruments;
  private readonly rng: () => number;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly totalBars: number;
  private readonly startedAt: number;
  private ended = false;

  constructor(
    private readonly core: SynthCore,
    destination: AudioNode,
    readonly track: Track,
    private readonly onEnded: (player: MusicPlayer) => void,
    fadeIn = 2,
  ) {
    const ctx = core.ctx;
    this.output = ctx.createGain();
    this.output.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.output.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeIn);
    this.output.connect(destination);
    this.instruments = new Instruments(core, this.output);
    this.rng = createRng(track.id.length * 7919 + track.bpm);
    this.totalBars = track.sections.reduce((sum, s) => sum + s.bars, 0);
    this.nextTime = ctx.currentTime + 0.1;
    this.startedAt = this.nextTime;
    core.setDelayTime((60 / track.bpm) * 0.75);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  /** Sekunden seit dem Start und Gesamtlänge. */
  position(): { elapsed: number; duration: number } {
    return { elapsed: Math.max(0, this.core.ctx.currentTime - this.startedAt), duration: trackDuration(this.track) };
  }

  /** Ausblenden und beenden. */
  stop(fadeOut = 2.5): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ctx = this.core.ctx;
    const g = this.output.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime);
    g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fadeOut);
    setTimeout(() => this.output.disconnect(), (fadeOut + 0.5) * 1000);
  }

  private get stepSeconds(): number {
    return 60 / this.track.bpm / 4;
  }

  private schedule(): void {
    const ctx = this.core.ctx;
    // Nach einer Pause (Tab im Hintergrund) nicht alle verpassten Noten auf einmal spielen.
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      const bar = Math.floor(this.step / 16);
      if (bar >= this.totalBars) {
        if (!this.ended) {
          this.ended = true;
          this.onEnded(this);
        }
        return;
      }
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepSeconds;
      this.step++;
    }
  }

  private layersAt(bar: number): Set<Layer> {
    let b = bar;
    for (const section of this.track.sections) {
      if (b < section.bars) return new Set(section.layers);
      b -= section.bars;
    }
    return new Set();
  }

  private playStep(step: number, time: number): void {
    const track = this.track;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const layers = this.layersAt(bar);
    const swing = s % 2 === 1 ? track.swing * this.stepSeconds : 0;
    const t = time + swing;
    const human = () => 0.85 + this.rng() * 0.3;
    const [offset, type] = track.progression[bar % track.progression.length];
    const chordRoot = track.root + offset;
    const intervals = CHORD_INTERVALS[type];
    const beat = this.stepSeconds * 4;
    const lastBarOfSection = !this.layersAt(bar + 1).has('drums') && layers.has('drums');

    if (s === 0 && layers.has('pad')) {
      const notes = intervals.map((i) => chordRoot + 12 + i);
      this.instruments.pad(notes, t, beat * 4, track.brightness);
    }
    if (layers.has('keys') && (s === 0 || s === 6 || s === 10)) {
      const notes = intervals.map((i) => chordRoot + 24 + i);
      this.instruments.keys(
        s === 0 ? notes : notes.slice(1),
        t,
        s === 0 ? beat * 1.5 : beat * 0.7,
        s === 0 ? 1 : 0.6 * human(),
      );
    }
    if (layers.has('bass')) {
      for (const [at, length, degree] of BASS[track.drums]) {
        if (at !== s) continue;
        const note = chordRoot + (degree === 1 ? 7 : degree === 2 ? 12 : 0);
        this.instruments.bass(note, t, this.stepSeconds * length, human());
      }
    }
    if (layers.has('drums')) {
      const d = DRUMS[track.drums];
      if (d.kick[s]) this.instruments.kick(t, d.kick[s] * human());
      if (d.snare[s]) this.instruments.snare(t, d.snare[s] * human(), track.drums === 'minimal');
      // Kleiner Wirbel am Ende eines Abschnitts.
      if (lastBarOfSection && s >= 13) this.instruments.snare(t, 0.35 + s * 0.02, true);
    }
    if (layers.has('hats')) {
      const d = DRUMS[track.drums];
      if (d.hat[s]) this.instruments.hat(t, d.hat[s] * human(), s === 14 && this.rng() < 0.3);
    }
    if (layers.has('arp') && s % 2 === 0 && this.rng() < 0.85) {
      const index = ARP_PATTERN[(s / 2 + bar) % ARP_PATTERN.length];
      const note = chordRoot + 24 + intervals[index % intervals.length] + (index >= intervals.length ? 12 : 0);
      this.instruments.arp(note, t, track.brightness, human());
    }
  }
}
