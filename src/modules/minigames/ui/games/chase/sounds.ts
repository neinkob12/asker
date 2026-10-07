// Klänge der Verfolgungsjagd, als Synth angemeldet (audio.registerSound). Dauerklänge (Motor, Martinshorn,
// Hubschrauber) sind Ton-Schleifen (`kind: 'loop'`, gestartet mit audio.loop): Die Bildschleife führt Drehzahl,
// Tonhöhe und Lautstärke nach. Sie laufen über den Effekt-Bus, Lautstärke-Regler und Stummschalten gelten wie für alle
// Effekte.

import { audio, type LoopParams } from '../../../../../ui';

export const CHASE_SOUNDS = {
  engine: 'minigames.chase.engine',
  siren: 'minigames.chase.siren',
  heli: 'minigames.chase.heli',
  squeal: 'minigames.chase.squeal',
  crash: 'minigames.chase.crash',
  bump: 'minigames.chase.bump',
  honk: 'minigames.chase.honk',
  turbo: 'minigames.chase.turbo',
  radio: 'minigames.chase.radio',
  dump: 'minigames.chase.dump',
} as const;

/** Martinshorn: ein Ton-Paar (tatü-tata) dauert so lange. */
export const SIREN_PERIOD = 1.3;
/** So schnell folgen Drehzahl und Tonhöhe (Zeitkonstante in Sekunden). */
const GLIDE = 0.08;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Ton darf Math.random nutzen (kein Einfluss auf die Simulation).
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function noise(ctx: AudioContext, time: number, seconds: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  src.start(time);
  return src;
}

/** Hüllkurve: Anstieg, Halten, Abfall (linear, damit sich überlappende Stücke sauber kreuzen). */
function envelope(ctx: AudioContext, time: number, attack: number, hold: number, release: number, peak: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.setValueAtTime(peak, time + attack + hold);
  g.gain.linearRampToValueAtTime(0, time + attack + hold + release);
  return g;
}

function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 0.8): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

let registered = false;

/** Klänge einmal anmelden (beim Laden der Ansicht). */
export function registerChaseSounds(): void {
  if (registered) return;
  registered = true;
  const s = CHASE_SOUNDS;

  audio.registerSound(s.engine, {
    kind: 'loop',
    start: (ctx, out, t) => {
      // Drei Oszillatoren (Grundton, Unterton, Oberton) durch einen Tiefpass, der mit der Last aufgeht.
      const lp = filter(ctx, 'lowpass', 600, 2.5);
      const level = ctx.createGain();
      level.gain.value = 0.2;
      lp.connect(level).connect(out);
      const parts = (
        [
          ['sawtooth', 1, 0.55],
          ['square', 0.5, 0.45],
          ['sawtooth', 2.01, 0.18],
        ] as const
      ).map(([type, mult, gain]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = 40 * mult;
        const g = ctx.createGain();
        g.gain.value = gain;
        o.connect(g).connect(lp);
        o.start(t);
        return { o, mult };
      });
      return {
        set: (p: LoopParams, at: number) => {
          if (p.rpm !== undefined)
            for (const { o, mult } of parts) o.frequency.setTargetAtTime(p.rpm * mult, at, GLIDE);
          if (p.load !== undefined) {
            lp.frequency.setTargetAtTime(380 + 1300 * p.load, at, GLIDE);
            level.gain.setTargetAtTime(0.16 + 0.1 * p.load, at, GLIDE);
          }
        },
        stop: (at: number) => {
          for (const { o } of parts) o.stop(at);
        },
      };
    },
  });

  audio.registerSound(s.siren, {
    kind: 'loop',
    start: (ctx, out, t) => {
      // Martinshorn: zwei Töne im Quartabstand (440 und 587 Hz), umgeschaltet von einem langsamen Rechteck.
      const lp = filter(ctx, 'lowpass', 2200, 1.2);
      const level = ctx.createGain();
      level.gain.value = 0.12;
      lp.connect(level).connect(out);
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1 / SIREN_PERIOD;
      const depth = ctx.createGain();
      depth.gain.value = 73.5;
      lfo.connect(depth);
      lfo.start(t);
      const tones = (
        [
          ['sawtooth', 0.6],
          ['square', 0.25],
        ] as const
      ).map(([type, gain]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = 513.5;
        depth.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.value = gain;
        o.connect(g).connect(lp);
        o.start(t);
        return o;
      });
      return {
        set: (p: LoopParams, at: number) => {
          if (p.pitch === undefined) return;
          for (const o of tones) o.frequency.setTargetAtTime(513.5 * p.pitch, at, GLIDE);
          depth.gain.setTargetAtTime(73.5 * p.pitch, at, GLIDE);
        },
        stop: (at: number) => {
          lfo.stop(at);
          for (const o of tones) o.stop(at);
        },
      };
    },
  });

  audio.registerSound(s.heli, {
    kind: 'loop',
    start: (ctx, out, t) => {
      // Rotor: tiefes Rauschen, 13-mal pro Sekunde zerhackt (Sägezahn auf die Lautstärke).
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 1);
      src.loop = true;
      const lp = filter(ctx, 'lowpass', 260, 1);
      const chop = ctx.createGain();
      chop.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.value = 13;
      const depth = ctx.createGain();
      depth.gain.value = -0.42;
      lfo.connect(depth).connect(chop.gain);
      const level = ctx.createGain();
      level.gain.value = 0.9;
      src.connect(lp).connect(chop).connect(level).connect(out);
      src.start(t);
      lfo.start(t);
      return {
        stop: (at: number) => {
          src.stop(at);
          lfo.stop(at);
        },
      };
    },
  });

  audio.registerSound(s.squeal, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const src = noise(ctx, t, 0.7);
      const bp = filter(ctx, 'bandpass', 2600, 9);
      bp.frequency.setValueAtTime(3000, t);
      bp.frequency.linearRampToValueAtTime(2100, t + 0.6);
      const env = envelope(ctx, t, 0.03, 0.4, 0.25, 0.7);
      src.connect(bp).connect(env).connect(out);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1500, t);
      o.frequency.linearRampToValueAtTime(1150, t + 0.6);
      const og = envelope(ctx, t, 0.03, 0.35, 0.25, 0.05);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + 0.7);
    },
  });

  audio.registerSound(s.crash, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(120, t);
      thump.frequency.exponentialRampToValueAtTime(38, t + 0.35);
      const tg = envelope(ctx, t, 0.005, 0.05, 0.35, 0.9);
      thump.connect(tg).connect(out);
      thump.start(t);
      thump.stop(t + 0.5);
      const crunch = noise(ctx, t, 0.5);
      const lp = filter(ctx, 'lowpass', 1800, 0.7);
      crunch
        .connect(lp)
        .connect(envelope(ctx, t, 0.004, 0.08, 0.35, 0.8))
        .connect(out);
      // Glas und Blech klirren nach.
      const glass = noise(ctx, t + 0.05, 0.6);
      const hp = filter(ctx, 'highpass', 4200, 0.7);
      glass
        .connect(hp)
        .connect(envelope(ctx, t + 0.05, 0.01, 0.05, 0.45, 0.28))
        .connect(out);
    },
  });

  audio.registerSound(s.bump, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
      o.connect(envelope(ctx, t, 0.004, 0.03, 0.2, 0.7)).connect(out);
      o.start(t);
      o.stop(t + 0.3);
      const n = noise(ctx, t, 0.2);
      n.connect(filter(ctx, 'lowpass', 900))
        .connect(envelope(ctx, t, 0.003, 0.03, 0.15, 0.5))
        .connect(out);
    },
  });

  audio.registerSound(s.honk, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const lp = filter(ctx, 'lowpass', 1500, 1);
      for (const f of [392, 494]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(lp);
        o.start(t + 0.08);
        o.stop(t + 0.62);
      }
      lp.connect(envelope(ctx, t + 0.08, 0.01, 0.42, 0.08, 0.09)).connect(out);
    },
  });

  audio.registerSound(s.turbo, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const src = noise(ctx, t, 0.8);
      const bp = filter(ctx, 'bandpass', 500, 2);
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
      src
        .connect(bp)
        .connect(envelope(ctx, t, 0.08, 0.3, 0.35, 0.5))
        .connect(out);
    },
  });

  audio.registerSound(s.radio, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const src = noise(ctx, t, 0.2);
      src
        .connect(filter(ctx, 'bandpass', 1800, 1.5))
        .connect(envelope(ctx, t, 0.005, 0.08, 0.06, 0.25))
        .connect(out);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 1250;
      o.connect(envelope(ctx, t + 0.12, 0.004, 0.05, 0.02, 0.08)).connect(out);
      o.start(t + 0.12);
      o.stop(t + 0.22);
    },
  });

  audio.registerSound(s.dump, {
    kind: 'synth',
    play: (ctx, out, t) => {
      const src = noise(ctx, t, 0.5);
      src
        .connect(filter(ctx, 'bandpass', 900, 0.8))
        .connect(envelope(ctx, t, 0.02, 0.1, 0.3, 0.4))
        .connect(out);
      for (const [i, f] of [140, 110, 90].entries()) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + 0.25 + i * 0.12);
        o.connect(envelope(ctx, t + 0.25 + i * 0.12, 0.004, 0.02, 0.1, 0.35)).connect(out);
        o.start(t + 0.25 + i * 0.12);
        o.stop(t + 0.45 + i * 0.12);
      }
    },
  });
}
