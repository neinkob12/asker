// Klänge für Bude durchsuchen (Synth, angemeldet wie in kit/sounds.ts): Rascheln beim Suchen, Geldscheine, Geschirr
// klirrt, die Nachbarn hämmern an die Wand, Schritte im Treppenhaus, der Schlüssel im Schloss.
// Optik und Ton dürfen Math.random nutzen (kein Einfluss auf die Simulation).

import { audio } from '../../../../../ui';

export const SEARCH_SOUNDS = {
  /** Kurzes Rascheln (beim Suchen wiederholt). */
  rustle: 'minigames.search.rustle',
  /** Geldscheine: Blättern und ein heller Ton. */
  cash: 'minigames.search.cash',
  /** Nichts: dumpfes Zuklappen. */
  empty: 'minigames.search.empty',
  /** Geschirr klirrt. */
  clatter: 'minigames.search.clatter',
  /** Nachbar hämmert an die Wand. */
  bang: 'minigames.search.bang',
  /** Schritte im Treppenhaus. */
  steps: 'minigames.search.steps',
  /** Schlüssel dreht sich im Schloss, die Tür geht auf. */
  key: 'minigames.search.key',
} as const;

function noise(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  duration: number,
  filter: BiquadFilterType,
  freq: number,
  gain: number,
  q = 1,
): void {
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 1.5;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(f).connect(env).connect(out);
  src.start(t);
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  gain: number,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

let registered = false;

export function registerSearchSounds(): void {
  if (registered) return;
  registered = true;
  const s = SEARCH_SOUNDS;
  audio.registerSound(s.rustle, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (let i = 0; i < 3; i++) {
        noise(ctx, out, t + i * 0.07 + Math.random() * 0.03, 0.09, 'bandpass', 2200 + Math.random() * 1800, 0.32, 1.4);
      }
    },
  });
  audio.registerSound(s.cash, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (let i = 0; i < 5; i++) noise(ctx, out, t + i * 0.045, 0.05, 'highpass', 3500, 0.35);
      tone(ctx, out, t + 0.18, 1318, 1318, 0.18, 'triangle', 0.16);
      tone(ctx, out, t + 0.26, 1760, 1760, 0.3, 'triangle', 0.14);
    },
  });
  audio.registerSound(s.empty, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.1, 'lowpass', 500, 0.6);
      tone(ctx, out, t, 180, 120, 0.12, 'sine', 0.12);
    },
  });
  audio.registerSound(s.clatter, {
    kind: 'synth',
    play: (ctx, out, t) => {
      // Teller und Tassen: helle, unharmonische Töne kurz nacheinander.
      for (let i = 0; i < 7; i++) {
        const at = t + i * 0.05 + Math.random() * 0.04;
        const f = 1800 + Math.random() * 2600;
        tone(ctx, out, at, f, f * 0.98, 0.16 + Math.random() * 0.2, 'sine', 0.09);
        tone(ctx, out, at, f * 2.76, f * 2.7, 0.08, 'sine', 0.04);
        noise(ctx, out, at, 0.03, 'highpass', 4000, 0.3);
      }
    },
  });
  audio.registerSound(s.bang, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (let i = 0; i < 3; i++) {
        noise(ctx, out, t + i * 0.22, 0.14, 'lowpass', 260, 1.2);
        tone(ctx, out, t + i * 0.22, 90, 50, 0.16, 'sine', 0.45);
      }
    },
  });
  audio.registerSound(s.steps, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (let i = 0; i < 4; i++) {
        noise(ctx, out, t + i * 0.32, 0.07, 'lowpass', 420, 0.7);
        tone(ctx, out, t + i * 0.32, 120, 70, 0.08, 'sine', 0.18);
      }
    },
  });
  audio.registerSound(s.key, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.06, 'bandpass', 3000, 0.5, 3);
      noise(ctx, out, t + 0.18, 0.05, 'bandpass', 2600, 0.6, 3);
      noise(ctx, out, t + 0.34, 0.09, 'bandpass', 1400, 0.9, 2);
      tone(ctx, out, t + 0.34, 220, 140, 0.12, 'triangle', 0.18);
      // Tür knarrt.
      tone(ctx, out, t + 0.55, 180, 260, 0.6, 'sawtooth', 0.035);
    },
  });
}
