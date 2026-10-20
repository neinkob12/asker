// Klänge vom Tresor (Auftrag 49), als Synth angemeldet (audio.registerSound), wie im Baukasten (kit/sounds.ts):
// Die echte Zahl fällt hell und metallisch mit Nachklang (Zuhaltung fällt), der Störklick ist dumpf und kurz.

import { audio } from '../../../../../ui';

function tone(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  endFreq?: number,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(gain, time + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(env).connect(out);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

function noise(ctx: AudioContext, out: AudioNode, time: number, duration: number, freq: number, gain: number): void {
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Ton darf Math.random nutzen (kein Einfluss auf die Simulation).
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 4;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(out);
  src.start(time);
}

export const SAFE_SOUNDS = {
  /** Die richtige Zahl: Zuhaltung fällt (hell, zweifach, mit Nachklang). */
  tumbler: 'minigames.safe.tumbler',
  /** Störklick: dumpf und kurz. */
  thud: 'minigames.safe.thud',
} as const;

let registered = false;

export function registerSafeSounds(): void {
  if (registered) return;
  registered = true;
  audio.registerSound(SAFE_SOUNDS.tumbler, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.05, 3200, 1.1);
      noise(ctx, out, t + 0.055, 0.06, 2400, 0.9);
      tone(ctx, out, t + 0.055, 1850, 0.32, 'sine', 0.07, 1780);
      tone(ctx, out, t, 160, 0.16, 'triangle', 0.3, 90);
    },
  });
  audio.registerSound(SAFE_SOUNDS.thud, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.06, 420, 0.7);
      tone(ctx, out, t, 95, 0.1, 'triangle', 0.2, 70);
    },
  });
}
