// Klänge für den Razzia-Countdown (Synth, angemeldet wie in kit/sounds.ts): Sirene, Verstauen, Platschen im Gully,
// Reinstürmen. Optik und Ton dürfen Math.random nutzen (kein Einfluss auf die Simulation).

import { audio } from '../../../../../ui';

export const STASH_SOUNDS = {
  /** Zwei Töne einer Martinshorn-Sirene (Lautstärke beim Abspielen). */
  siren: 'minigames.stash.siren',
  /** Paket gleitet in ein Versteck, Klappe zu. */
  stow: 'minigames.stash.stow',
  /** Platschen im Gully. */
  splash: 'minigames.stash.splash',
  /** Paket aufnehmen. */
  lift: 'minigames.stash.lift',
  /** Tür fliegt auf, sie stürmen rein. */
  breach: 'minigames.stash.breach',
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
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 1.5;
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

export function registerStashSounds(): void {
  if (registered) return;
  registered = true;
  const s = STASH_SOUNDS;
  audio.registerSound(s.siren, {
    kind: 'synth',
    play: (ctx, out, t) => {
      // Tatü-tata: zwei Töne, weich durch einen Tiefpass.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      lp.connect(out);
      for (const [i, f] of [466, 622, 466, 622].entries()) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t + i * 0.3);
        env.gain.setValueAtTime(0.0001, t + i * 0.3);
        env.gain.exponentialRampToValueAtTime(0.16, t + i * 0.3 + 0.03);
        env.gain.setValueAtTime(0.16, t + i * 0.3 + 0.26);
        env.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.3 + 0.3);
        osc.connect(env).connect(lp);
        osc.start(t + i * 0.3);
        osc.stop(t + i * 0.3 + 0.32);
      }
    },
  });
  audio.registerSound(s.stow, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.18, 'bandpass', 900, 0.5);
      noise(ctx, out, t + 0.16, 0.08, 'lowpass', 400, 0.9);
      tone(ctx, out, t + 0.16, 150, 80, 0.14, 'triangle', 0.3);
    },
  });
  audio.registerSound(s.splash, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.35, 'lowpass', 1400, 0.8);
      tone(ctx, out, t, 420, 140, 0.18, 'sine', 0.18);
    },
  });
  audio.registerSound(s.lift, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.06, 'bandpass', 2400, 0.35);
      tone(ctx, out, t, 300, 520, 0.08, 'sine', 0.08);
    },
  });
  audio.registerSound(s.breach, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.5, 'lowpass', 700, 1);
      tone(ctx, out, t, 110, 45, 0.45, 'sawtooth', 0.22);
      noise(ctx, out, t + 0.12, 0.25, 'highpass', 3000, 0.35);
    },
  });
}
