// Klänge für „Container packen“ (Synth, angemeldet wie in kit/sounds.ts): Kiste absetzen, Ware absetzen (Folie),
// Drehen, Scanner-Summen, Piepen bei einer auffälligen Stelle. Optik und Ton dürfen Math.random nutzen (kein Einfluss
// auf die Simulation).

import { audio } from '../../../../../ui';

export const PACK_SOUNDS = {
  /** Kiste bzw. Palette auf den Holzboden. */
  drop: 'minigames.container.drop',
  /** Ware in Folie (weicher, mit Knistern). */
  wrap: 'minigames.container.wrap',
  /** Teil drehen (kurzes Schaben). */
  turn: 'minigames.container.turn',
  /** Röntgen-Scanner fährt an und summt. */
  scan: 'minigames.container.scan',
  /** Auffällige Stelle im Röntgen. */
  beep: 'minigames.container.beep',
} as const;

function noise(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  duration: number,
  filter: BiquadFilterType,
  freq: number,
  gain: number,
): void {
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
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
  env.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

let registered = false;

export function registerPackSounds(): void {
  if (registered) return;
  registered = true;
  const s = PACK_SOUNDS;
  audio.registerSound(s.drop, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.12, 'lowpass', 420, 0.9);
      tone(ctx, out, t, 120, 55, 0.16, 'triangle', 0.4);
    },
  });
  audio.registerSound(s.wrap, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.1, 'lowpass', 300, 0.7);
      noise(ctx, out, t + 0.02, 0.14, 'highpass', 4200, 0.18);
    },
  });
  audio.registerSound(s.turn, {
    kind: 'synth',
    play: (ctx, out, t) => noise(ctx, out, t, 0.07, 'bandpass', 1500, 0.35),
  });
  audio.registerSound(s.scan, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 80, 160, 0.5, 'sawtooth', 0.08);
      tone(ctx, out, t + 0.45, 160, 158, 1.6, 'sine', 0.06);
      noise(ctx, out, t, 1.8, 'bandpass', 2400, 0.05);
    },
  });
  audio.registerSound(s.beep, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 1320, 1300, 0.09, 'square', 0.09);
      tone(ctx, out, t + 0.11, 1320, 1300, 0.09, 'square', 0.07);
    },
  });
}
