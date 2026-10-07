// Klänge vom Straßenkampf, als Synth angemeldet (audio.registerSound), wie im Baukasten (kit/sounds.ts).

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
  env.gain.exponentialRampToValueAtTime(gain, time + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(env).connect(out);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

function noise(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  duration: number,
  freq: number,
  gain: number,
  type: BiquadFilterType = 'bandpass',
): void {
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Ton darf Math.random nutzen (kein Einfluss auf die Simulation).
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const env = ctx.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(out);
  src.start(time);
}

export const BRAWL_SOUNDS = {
  /** Leichter Treffer (dumpfer Schlag). */
  punch: 'minigames.brawl.punch',
  /** Schwerer Treffer (tiefer, mit Knacken). */
  heavy: 'minigames.brawl.heavy',
  /** Abgeblockt (Unterarm, Klatschen). */
  block: 'minigames.brawl.block',
  /** Luftzug beim Schlag. */
  whoosh: 'minigames.brawl.whoosh',
  /** Konter (heller Ring). */
  parry: 'minigames.brawl.parry',
  /** Einer geht zu Boden. */
  down: 'minigames.brawl.down',
  /** Messer. */
  knife: 'minigames.brawl.knife',
  /** Sirenen. */
  siren: 'minigames.brawl.siren',
  /** Hupe und Fernlicht. */
  horn: 'minigames.brawl.horn',
} as const;

let registered = false;

export function registerBrawlSounds(): void {
  if (registered) return;
  registered = true;
  const s = BRAWL_SOUNDS;
  audio.registerSound(s.punch, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.07, 900, 0.9, 'lowpass');
      tone(ctx, out, t, 150, 0.09, 'sine', 0.5, 60);
    },
  });
  audio.registerSound(s.heavy, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.12, 600, 1, 'lowpass');
      tone(ctx, out, t, 110, 0.2, 'sine', 0.7, 40);
      noise(ctx, out, t + 0.01, 0.03, 3000, 0.4);
    },
  });
  audio.registerSound(s.block, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.05, 1800, 0.6);
      tone(ctx, out, t, 320, 0.06, 'triangle', 0.15, 200);
    },
  });
  audio.registerSound(s.whoosh, {
    kind: 'synth',
    play: (ctx, out, t) => noise(ctx, out, t, 0.14, 1400, 0.35),
  });
  audio.registerSound(s.parry, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.06, 2500, 0.6);
      tone(ctx, out, t, 1320, 0.4, 'triangle', 0.18);
      tone(ctx, out, t + 0.02, 1980, 0.3, 'sine', 0.08);
    },
  });
  audio.registerSound(s.down, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.25, 250, 1, 'lowpass');
      tone(ctx, out, t, 70, 0.3, 'sine', 0.6, 35);
    },
  });
  audio.registerSound(s.knife, {
    kind: 'synth',
    play: (ctx, out, t) => {
      noise(ctx, out, t, 0.18, 5200, 0.4, 'highpass');
      tone(ctx, out, t, 2400, 0.12, 'sine', 0.05, 3600);
    },
  });
  audio.registerSound(s.siren, {
    kind: 'synth',
    play: (ctx, out, t) => {
      for (let i = 0; i < 3; i++) {
        tone(ctx, out, t + i * 0.7, 640, 0.35, 'sawtooth', 0.06, 960);
        tone(ctx, out, t + i * 0.7 + 0.35, 960, 0.35, 'sawtooth', 0.06, 640);
      }
    },
  });
  audio.registerSound(s.horn, {
    kind: 'synth',
    play: (ctx, out, t) => {
      tone(ctx, out, t, 330, 0.5, 'square', 0.08);
      tone(ctx, out, t, 415, 0.5, 'square', 0.06);
    },
  });
}
