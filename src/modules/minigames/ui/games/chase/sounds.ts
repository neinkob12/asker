// Klänge der Verfolgungsjagd, als Synth angemeldet (audio.registerSound). Dauerklänge (Motor, Martinshorn,
// Hubschrauber) laufen als kurze, überlappende Stücke, die die Bildschleife nachlegt: So gelten Lautstärke-Regler und
// Stummschalten wie für alle Effekte, und Tonhöhe bzw. Lautstärke folgen dem Spiel ohne eigene Audio-Knoten.

import { audio } from '../../../../../ui';

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

/** Länge eines Motor-Stücks; nachgelegt wird alle ENGINE_STEP Sekunden (die Stücke überlappen sich). */
export const ENGINE_CHUNK = 0.34;
export const ENGINE_STEP = 0.26;
/** Martinshorn: ein Ton-Paar (tatü-tata) dauert so lange. */
export const SIREN_CHUNK = 1.3;
export const HELI_CHUNK = 0.5;

/** Werte für das nächste Motor-Stück (setzt die Bildschleife vor audio.play). */
const engine = { from: 50, to: 50, load: 0.5 };
/** Tonhöhe des Martinshorns (Doppler: näher kommend höher). */
const siren = { pitch: 1 };

export function setEngine(from: number, to: number, load: number): void {
  engine.from = from;
  engine.to = to;
  engine.load = load;
}

export function setSirenPitch(pitch: number): void {
  siren.pitch = pitch;
}

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
    kind: 'synth',
    play: (ctx, out, t) => {
      const { from, to, load } = engine;
      const env = envelope(ctx, t, 0.06, ENGINE_CHUNK - 0.14, 0.08, 0.16 + 0.1 * load);
      const lp = filter(ctx, 'lowpass', 380 + 1300 * load, 2.5);
      for (const [type, mult, gain] of [
        ['sawtooth', 1, 0.55],
        ['square', 0.5, 0.45],
        ['sawtooth', 2.01, 0.18],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(from * mult, t);
        o.frequency.linearRampToValueAtTime(to * mult, t + ENGINE_CHUNK);
        const g = ctx.createGain();
        g.gain.value = gain;
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + ENGINE_CHUNK + 0.02);
      }
      lp.connect(env).connect(out);
    },
  });

  audio.registerSound(s.siren, {
    kind: 'synth',
    play: (ctx, out, t) => {
      // Martinshorn: zwei Töne im Quartabstand, je eine halbe Länge.
      const half = SIREN_CHUNK / 2;
      const p = siren.pitch;
      const env = envelope(ctx, t, 0.04, SIREN_CHUNK - 0.1, 0.06, 0.12);
      const lp = filter(ctx, 'lowpass', 2200, 1.2);
      for (const [type, gain] of [
        ['sawtooth', 0.6],
        ['square', 0.25],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(440 * p, t);
        o.frequency.setValueAtTime(587 * p, t + half);
        const g = ctx.createGain();
        g.gain.value = gain;
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + SIREN_CHUNK + 0.02);
      }
      lp.connect(env).connect(out);
    },
  });

  audio.registerSound(s.heli, {
    kind: 'synth',
    play: (ctx, out, t) => {
      // Rotor: tiefes Rauschen, 13-mal pro Sekunde zerhackt.
      const src = noise(ctx, t, HELI_CHUNK + 0.05);
      const lp = filter(ctx, 'lowpass', 260, 1);
      const chop = ctx.createGain();
      chop.gain.setValueAtTime(0, t);
      const beats = Math.round(HELI_CHUNK * 13);
      for (let i = 0; i < beats; i++) {
        const at = t + i / 13;
        chop.gain.linearRampToValueAtTime(1, at + 0.012);
        chop.gain.linearRampToValueAtTime(0.15, at + 0.06);
      }
      const env = envelope(ctx, t, 0.03, HELI_CHUNK - 0.07, 0.04, 0.9);
      src.connect(lp).connect(chop).connect(env).connect(out);
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
