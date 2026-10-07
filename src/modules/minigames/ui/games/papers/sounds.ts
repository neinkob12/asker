// Klänge von Papiere fälschen (Synth, angemeldet wie in kit/sounds.ts): Papier umblättern, Stempel, Kuli kratzt, der
// Finger tippt aufs Papier, der Zöllner klopft auf den Fehler, ein Umschlag gleitet über den Tisch. Optik und Ton dürfen
// Math.random nutzen (kein Einfluss auf die Simulation).

import { audio } from '../../../../../ui';

export const PAPERS_SOUNDS = {
  /** Papier wird umgeblättert bzw. gereicht. */
  rustle: 'minigames.papers.rustle',
  /** Gummistempel aufs Papier. */
  stamp: 'minigames.papers.stamp',
  /** Kuli kratzt (Feld umschreiben). */
  scribble: 'minigames.papers.scribble',
  /** Finger tippt auf die Zeile (leise). */
  tap: 'minigames.papers.tap',
  /** Er klopft zweimal auf den Fehler. */
  knock: 'minigames.papers.knock',
  /** Umschlag gleitet über den Tisch. */
  slide: 'minigames.papers.slide',
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
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 1.4;
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

function tone(ctx: AudioContext, out: AudioNode, t: number, from: number, to: number, duration: number, gain: number) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

let registered = false;

export function registerPapersSounds(): void {
  if (registered) return;
  registered = true;
  const s = PAPERS_SOUNDS;
  audio.registerSound(s.rustle, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.16, 'highpass', 3000, 0.28);
      noise(ctx, out, t + 0.12, 0.22, 'bandpass', 4500, 0.2, 0.5);
    },
  });
  audio.registerSound(s.stamp, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 150, 55, 0.2, 0.5);
      noise(ctx, out, t, 0.08, 'lowpass', 900, 0.9);
      noise(ctx, out, t + 0.02, 0.05, 'bandpass', 2600, 0.15, 2);
    },
  });
  audio.registerSound(s.scribble, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (let i = 0; i < 5; i++) noise(ctx, out, t + i * 0.07, 0.06, 'bandpass', 5200 + i * 300, 0.12, 3);
    },
  });
  audio.registerSound(s.tap, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.03, 'bandpass', 1500, 0.22, 2);
    },
  });
  audio.registerSound(s.knock, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (const dt of [0, 0.14]) {
        noise(ctx, out, t + dt, 0.05, 'bandpass', 700, 0.8, 2);
        tone(ctx, out, t + dt, 220, 140, 0.07, 0.25);
      }
    },
  });
  audio.registerSound(s.slide, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.45, 'bandpass', 2400, 0.22, 0.7);
    },
  });
}
