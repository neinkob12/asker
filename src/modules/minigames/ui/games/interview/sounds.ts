// Klänge für das Bewerbungsgespräch (Synth, angemeldet wie in kit/sounds.ts): Stift kratzt in der Akte, Karte wird
// über den Tisch geschoben, Uhr tickt in den letzten Sekunden, Herzschlag unter Druck, Stuhl knarrt, wenn die Person
// zumacht. Optik und Ton dürfen Math.random nutzen (keine
// Simulation).

import { audio } from '../../../../../ui';

export const INTERVIEW_SOUNDS = {
  /** Stift notiert etwas in der Akte. */
  pen: 'minigames.interview.pen',
  /** Fragekarte rutscht über den Tisch. */
  slide: 'minigames.interview.slide',
  /** Wanduhr tickt (letzte Sekunden). */
  tick: 'minigames.interview.tick',
  /** Herzschlag (doppelter dumpfer Schlag), solange die Person angespannt ist. */
  heart: 'minigames.interview.heart',
  /** Stuhl rückt nach hinten: Die Person macht zu. */
  chair: 'minigames.interview.chair',
} as const;

function thump(ctx: AudioContext, out: AudioNode, t: number, gain: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(70, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.2);
}

function scratch(ctx: AudioContext, out: AudioNode, t: number, duration: number, freq: number, gain: number): void {
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2.2;
  f.frequency.setValueAtTime(freq, t);
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(f).connect(env).connect(out);
  src.start(t);
}

let registered = false;

export function registerInterviewSounds(): void {
  if (registered) return;
  registered = true;
  audio.registerSound(INTERVIEW_SOUNDS.pen, {
    kind: 'synth',
    play: (ctx, out, t) => {
      // Drei kurze Striche, wie ein Wort in Druckschrift.
      scratch(ctx, out, t, 0.09, 3200, 0.35);
      scratch(ctx, out, t + 0.12, 0.07, 3800, 0.3);
      scratch(ctx, out, t + 0.22, 0.14, 3000, 0.32);
    },
  });
  audio.registerSound(INTERVIEW_SOUNDS.slide, {
    kind: 'synth',
    play: (ctx, out, t) => scratch(ctx, out, t, 0.22, 900, 0.4),
  });
  audio.registerSound(INTERVIEW_SOUNDS.heart, {
    kind: 'synth',
    play: (ctx, out, t) => {
      thump(ctx, out, t, 0.55);
      thump(ctx, out, t + 0.16, 0.35);
    },
  });
  audio.registerSound(INTERVIEW_SOUNDS.chair, {
    kind: 'synth',
    play: (ctx, out, t) => {
      // Knarzen: zwei tiefe, raue Striche.
      scratch(ctx, out, t, 0.28, 260, 0.6);
      scratch(ctx, out, t + 0.22, 0.2, 340, 0.45);
    },
  });
  audio.registerSound(INTERVIEW_SOUNDS.tick, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1900, t);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.18, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + 0.06);
    },
  });
}
