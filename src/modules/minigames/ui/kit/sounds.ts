// Klänge der Minispiele, als Synth angemeldet (audio.registerSound). Abspielen mit playSound('minigames.click', …)
// oder audio.play. Eigene Klänge eines Teils kommen in dessen Ordner (games/<art>/), angemeldet wie hier.

import { audio } from '../../../../ui';

/** Kurzer Ton mit Hüllkurve. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.3,
  endFreq?: number,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(gain, time + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(env).connect(out);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

/** Rauschstoß (Klick, Schlag, Mechanik). */
function noise(ctx: AudioContext, out: AudioNode, time: number, duration: number, freq: number, gain = 0.4): void {
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Optik und Ton dürfen Math.random nutzen (kein Einfluss auf die Simulation).
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 3;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(out);
  src.start(time);
}

export const MINIGAME_SOUNDS = {
  /** Rasten eines Rads, Zahnrad, leises Klacken. */
  click: 'minigames.click',
  /** Ein Bolzen fällt, etwas rastet ein. */
  clunk: 'minigames.clunk',
  /** Daneben (tiefes Brummen). */
  fail: 'minigames.fail',
  /** Countdown 3, 2, 1 und Los. */
  count: 'minigames.count',
  go: 'minigames.go',
  /** Geschafft bzw. nicht geschafft am Ende. */
  win: 'minigames.win',
  lose: 'minigames.lose',
  /** Tresortür schwingt auf. */
  open: 'minigames.open',
  /** Alarmglocke. */
  alarm: 'minigames.alarm',
  /** Herzschlag, Zeitdruck. */
  heartbeat: 'minigames.heartbeat',
} as const;

export type MinigameSoundId = (typeof MINIGAME_SOUNDS)[keyof typeof MINIGAME_SOUNDS];

let registered = false;

/** Meldet die Klänge einmal an (beim Laden der Oberfläche). */
export function registerMinigameSounds(): void {
  if (registered) return;
  registered = true;
  const s = MINIGAME_SOUNDS;
  audio.registerSound(s.click, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.025, 3200, 0.5);
      tone(ctx, out, t, 1900, 0.03, 'square', 0.05);
    },
  });
  audio.registerSound(s.clunk, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.09, 700, 0.9);
      tone(ctx, out, t, 140, 0.18, 'triangle', 0.35, 70);
    },
  });
  audio.registerSound(s.fail, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 110, 0.32, 'sawtooth', 0.12, 80);
      tone(ctx, out, t + 0.02, 116, 0.3, 'square', 0.06, 85);
    },
  });
  audio.registerSound(s.count, { kind: 'synth', play: (ctx, out, t) => tone(ctx, out, t, 660, 0.12, 'sine', 0.25) });
  audio.registerSound(s.go, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 990, 0.22, 'sine', 0.28);
      tone(ctx, out, t, 1320, 0.22, 'sine', 0.12);
    },
  });
  audio.registerSound(s.win, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (const [i, f] of [523, 659, 784, 1046].entries()) tone(ctx, out, t + i * 0.08, f, 0.3, 'triangle', 0.22);
    },
  });
  audio.registerSound(s.lose, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (const [i, f] of [392, 330, 262].entries()) tone(ctx, out, t + i * 0.14, f, 0.34, 'triangle', 0.2);
    },
  });
  audio.registerSound(s.open, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.12, 500, 0.8);
      tone(ctx, out, t + 0.05, 90, 0.9, 'sawtooth', 0.06, 160);
      noise(ctx, out, t + 0.7, 0.2, 300, 0.6);
    },
  });
  audio.registerSound(s.alarm, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (let i = 0; i < 6; i++) tone(ctx, out, t + i * 0.18, i % 2 ? 880 : 1175, 0.16, 'square', 0.12);
    },
  });
  audio.registerSound(s.heartbeat, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 60, 0.12, 'sine', 0.5, 40);
      tone(ctx, out, t + 0.16, 55, 0.12, 'sine', 0.35, 38);
    },
  });
}

/** Klang der Minispiele abspielen (Lautstärke 0–1 relativ zu den Effekten). */
export function playSound(id: MinigameSoundId, volume = 1): void {
  audio.play(id, { volume });
}
