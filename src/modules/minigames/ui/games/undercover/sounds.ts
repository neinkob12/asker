// Klänge für Zivi oder Kunde (Synth, angemeldet wie in kit/sounds.ts): Karte wischt weg, kurzes Funkgerät (ein Zivi
// meldet sich bei den Kollegen), Münzen und Scheine. Optik und Ton dürfen Math.random nutzen (keine Simulation).

import { audio } from '../../../../../ui';

export const UNDERCOVER_SOUNDS = {
  /** Karte fliegt mit Schwung weg. */
  swoosh: 'minigames.undercover.swoosh',
  /** Funkgerät knackt (Zivi meldet sich). */
  radio: 'minigames.undercover.radio',
  /** Geld wechselt die Hand. */
  deal: 'minigames.undercover.deal',
  /** Neue Person tritt an den Spot (leise Schritte). */
  steps: 'minigames.undercover.steps',
} as const;

function noise(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  duration: number,
  filter: BiquadFilterType,
  from: number,
  to: number,
  gain: number,
): void {
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + duration);
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(f).connect(env).connect(out);
  src.start(t);
}

function tone(ctx: AudioContext, out: AudioNode, t: number, freq: number, duration: number, gain: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

let registered = false;

export function registerUndercoverSounds(): void {
  if (registered) return;
  registered = true;
  const s = UNDERCOVER_SOUNDS;
  audio.registerSound(s.swoosh, {
    kind: 'synth',
    play: (ctx, out, t) => noise(ctx, out, t, 0.22, 'bandpass', 600, 2600, 0.5),
  });
  audio.registerSound(s.radio, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 1450, 0.06, 0.06);
      noise(ctx, out, t + 0.05, 0.42, 'bandpass', 1800, 1500, 0.55);
      tone(ctx, out, t + 0.5, 1100, 0.05, 0.05);
    },
  });
  audio.registerSound(s.deal, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.12, 'highpass', 3000, 5000, 0.35);
      for (const [i, f] of [2600, 3300].entries()) tone(ctx, out, t + 0.08 + i * 0.07, f, 0.08, 0.04);
    },
  });
  audio.registerSound(s.steps, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.05, 'lowpass', 500, 300, 0.4);
      noise(ctx, out, t + 0.22, 0.05, 'lowpass', 520, 300, 0.32);
    },
  });
}
