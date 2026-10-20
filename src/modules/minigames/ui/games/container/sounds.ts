// Klänge für „Container packen“ (Synth, angemeldet wie in kit/sounds.ts): Kiste absetzen, Ware absetzen (Folie),
// Drehen, Scanner-Summen, Piepen bei einer auffälligen Stelle; Auftrag 48: Einrasten versteckter Ware, Anrollen des
// Scanners, Rundumleuchte in den letzten Sekunden; Teil E: Serie dicht gesetzter Teile, Reihe dicht. Optik und Ton dürfen Math.random nutzen (kein Einfluss
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
  /** Ware ganz versteckt: Einrasten (Klacken mit hellem Nachklang). */
  seal: 'minigames.container.seal',
  /** Der Scanner rollt auf der Schiene an (Rumpeln). */
  roll: 'minigames.container.roll',
  /** Rundumleuchte des Scanners in den letzten Sekunden. */
  beacon: 'minigames.container.beacon',
  /** Teil sitzt dicht (Teil E): heller Klick, je Stufe der Serie höher (snug1 bis snug4). */
  snug1: 'minigames.container.snug1',
  snug2: 'minigames.container.snug2',
  snug3: 'minigames.container.snug3',
  snug4: 'minigames.container.snug4',
  /** Eine Reihe von Wand zu Wand ist dicht: Akkord, der aufsteigt. */
  row: 'minigames.container.row',
} as const;

/** Klang zur Stufe einer Serie dicht gesetzter Teile (1 bis 4, darüber bleibt es bei 4). */
export function snugSound(combo: number): string {
  const k = Math.max(1, Math.min(4, combo));
  return [PACK_SOUNDS.snug1, PACK_SOUNDS.snug2, PACK_SOUNDS.snug3, PACK_SOUNDS.snug4][k - 1];
}

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
      // Dumpfer Schlag auf Holz, kurzes Nachklappern.
      noise(ctx, out, t, 0.14, 'lowpass', 380, 1);
      tone(ctx, out, t, 110, 48, 0.2, 'triangle', 0.55);
      noise(ctx, out, t + 0.05, 0.05, 'bandpass', 900, 0.25);
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
  audio.registerSound(s.seal, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.03, 'highpass', 2500, 0.5);
      tone(ctx, out, t + 0.01, 880, 870, 0.12, 'triangle', 0.12);
      tone(ctx, out, t + 0.07, 1320, 1310, 0.18, 'sine', 0.09);
    },
  });
  audio.registerSound(s.roll, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 1.2, 'lowpass', 160, 0.7);
      tone(ctx, out, t, 45, 60, 1.1, 'sawtooth', 0.06);
      for (let i = 0; i < 4; i++) noise(ctx, out, t + 0.2 + i * 0.24, 0.05, 'bandpass', 700, 0.3);
    },
  });
  // Serie: Grundton steigt je Stufe um eine Quarte bzw. Terz (C, F, A, C).
  [523, 698, 880, 1047].forEach((base, i) => {
    audio.registerSound([s.snug1, s.snug2, s.snug3, s.snug4][i], {
      kind: 'synth',
      play: (ctx, out, t) => {
        noise(ctx, out, t, 0.02, 'highpass', 3000, 0.35);
        tone(ctx, out, t, base, base * 0.99, 0.14, 'triangle', 0.1);
        tone(ctx, out, t + 0.05, base * 1.5, base * 1.49, 0.16, 'sine', 0.06);
      },
    });
  });
  audio.registerSound(s.row, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.25, 'highpass', 5000, 0.12);
      for (const [i, f] of [523, 659, 784, 1047].entries()) tone(ctx, out, t + i * 0.06, f, f, 0.42, 'triangle', 0.07);
    },
  });
  audio.registerSound(s.beacon, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 990, 980, 0.1, 'square', 0.05);
      tone(ctx, out, t + 0.12, 740, 735, 0.12, 'square', 0.04);
    },
  });
}
