// Klänge der Verkehrskontrolle (Synth, angemeldet wie in kit/sounds.ts): Funk, Taschenlampe, Papiere, ruhiger Takt,
// Motor beim Gasgeben, Klopfen ans Fenster. Optik und Ton dürfen Math.random nutzen (kein Einfluss auf die Simulation).

import { audio } from '../../../../../ui';

export const TRAFFIC_SOUNDS = {
  /** Funkgerät: Knacken, Rauschen, kurzes Piepen. */
  radio: 'minigames.traffic.radio',
  /** Taschenlampe an. */
  flashlight: 'minigames.traffic.flashlight',
  /** Papiere werden gereicht. */
  papers: 'minigames.traffic.papers',
  /** Tippen im Takt getroffen (weich). */
  calm: 'minigames.traffic.calm',
  /** Tippen daneben (dumpf). */
  miss: 'minigames.traffic.miss',
  /** Gas geben: Motor heult auf, Reifen quietschen. */
  rev: 'minigames.traffic.rev',
  /** Fingerknöchel an der Scheibe (Beginn, „Aussteigen!“). */
  knock: 'minigames.traffic.knock',
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
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 1.2;
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
  env.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

let registered = false;

export function registerTrafficSounds(): void {
  if (registered) return;
  registered = true;
  const s = TRAFFIC_SOUNDS;
  audio.registerSound(s.radio, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.05, 'highpass', 2500, 0.5);
      noise(ctx, out, t + 0.04, 0.55, 'bandpass', 1800, 0.18, 0.7);
      tone(ctx, out, t + 0.62, 1400, 1400, 0.08, 'square', 0.05);
      noise(ctx, out, t + 0.7, 0.05, 'highpass', 2500, 0.4);
    },
  });
  audio.registerSound(s.flashlight, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.025, 'highpass', 3200, 0.6);
      tone(ctx, out, t, 2200, 1600, 0.03, 'square', 0.04);
    },
  });
  audio.registerSound(s.papers, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.12, 'highpass', 3500, 0.3);
      noise(ctx, out, t + 0.14, 0.18, 'bandpass', 5000, 0.22, 0.6);
    },
  });
  audio.registerSound(s.calm, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 520, 440, 0.18, 'sine', 0.08);
    },
  });
  audio.registerSound(s.miss, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 180, 120, 0.12, 'triangle', 0.1);
    },
  });
  audio.registerSound(s.rev, {
    kind: 'synth',
    play: (ctx, out, t) => {
      // Motor: Sägezahn durch einen Tiefpass, der mit der Drehzahl aufgeht; dazu Reifen.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.exponentialRampToValueAtTime(2200, t + 0.9);
      lp.connect(out);
      tone(ctx, lp, t, 55, 210, 1.1, 'sawtooth', 0.35);
      tone(ctx, lp, t, 82, 300, 1.1, 'sawtooth', 0.18);
      noise(ctx, out, t + 0.1, 0.8, 'bandpass', 2600, 0.25, 4);
    },
  });
  audio.registerSound(s.knock, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (const dt of [0, 0.16]) {
        noise(ctx, out, t + dt, 0.06, 'bandpass', 900, 0.8, 2);
        tone(ctx, out, t + dt, 240, 160, 0.06, 'sine', 0.2);
      }
    },
  });
}
