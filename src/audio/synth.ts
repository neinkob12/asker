// Klangerzeugung mit der Web Audio API: Instrumente für die Musik, Soundeffekte und Geräusch-Schleifen.
// Alles wird zur Laufzeit synthetisiert, es gibt keine Audiodateien (Lizenz: Teil des Projektcodes).

export type SoundId =
  | 'message'
  | 'notification'
  | 'cash'
  | 'click'
  | 'tap'
  | 'error'
  | 'success'
  | 'alert'
  | 'siren'
  | 'thunder'
  | 'gameOver'
  | 'win'
  | 'vibrate'
  | 'delivery'
  | 'ring';

export const SOUND_IDS: readonly SoundId[] = [
  'message',
  'notification',
  'cash',
  'click',
  'tap',
  'error',
  'success',
  'alert',
  'siren',
  'thunder',
  'gameOver',
  'win',
  'vibrate',
  'delivery',
  'ring',
];

export type AmbienceId = 'rain' | 'storm' | 'wind';

export const midiToFreq = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Gemeinsame Bausteine: Rauschen, Hall, Echo. */
export class SynthCore {
  readonly noise: AudioBuffer;
  readonly reverb: ConvolverNode;
  readonly reverbSend: GainNode;
  readonly delay: DelayNode;
  readonly delaySend: GainNode;
  private readonly delayFeedback: GainNode;

  constructor(
    readonly ctx: AudioContext,
    /** Ziel für Hall und Echo (Musik-Bus). */
    readonly fxOut: AudioNode,
  ) {
    this.noise = createNoise(ctx, 2);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = createImpulse(ctx, 2.8, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(fxOut);

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.45;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.35;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.6;
    this.delaySend.connect(this.delay);
    this.delay.connect(damp).connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(fxOut);
    this.delay.connect(this.reverbSend);
  }

  setDelayTime(seconds: number): void {
    this.delay.delayTime.setValueAtTime(Math.min(1.9, seconds), this.ctx.currentTime);
  }

  /** Rauschquelle mit zufälligem Startpunkt. */
  noiseSource(t: number, duration: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
    return src;
  }
}

function createNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function createImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

/** Hüllkurve: Anschlag, Halten, Ausklingen. */
function envelope(
  ctx: BaseAudioContext,
  t: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, duration: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(t + duration + 0.05);
  return o;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

// ---------------------------------------------------------------------------------------------
// Instrumente der Musik

export class Instruments {
  constructor(
    private readonly core: SynthCore,
    private readonly out: AudioNode,
  ) {}

  private get ctx() {
    return this.core.ctx;
  }

  /** Fläche: zwei verstimmte Sägezähne durch einen Tiefpass, langsamer Einsatz. */
  pad(notes: number[], t: number, duration: number, brightness: number, velocity = 1): void {
    const ctx = this.ctx;
    const lp = filter(ctx, 'lowpass', brightness, 0.6);
    lp.frequency.setValueAtTime(brightness * 0.7, t);
    lp.frequency.linearRampToValueAtTime(brightness * 1.15, t + duration * 0.6);
    const env = envelope(ctx, t, 0.035 * velocity, Math.min(0.9, duration * 0.3), duration * 0.55, 1.4);
    lp.connect(env);
    env.connect(this.out);
    env.connect(this.core.reverbSend);
    for (const note of notes) {
      const f = midiToFreq(note);
      for (const detune of [-8, 7]) osc(ctx, 'sawtooth', f, t, duration + 1.5, detune).connect(lp);
    }
  }

  /** E-Piano-artige Tasten: Sinus mit Oberton, schneller Anschlag. */
  keys(notes: number[], t: number, duration: number, velocity = 1): void {
    const ctx = this.ctx;
    for (const note of notes) {
      const f = midiToFreq(note);
      const env = envelope(ctx, t, 0.05 * velocity, 0.006, 0.05, Math.max(0.4, duration));
      env.connect(this.out);
      env.connect(this.core.reverbSend);
      osc(ctx, 'sine', f, t, duration + 0.6).connect(env);
      const bell = envelope(ctx, t, 0.012 * velocity, 0.003, 0, 0.25);
      bell.connect(env);
      osc(ctx, 'sine', f * 4, t, 0.35).connect(bell);
      const body = ctx.createGain();
      body.gain.value = 0.25;
      body.connect(env);
      osc(ctx, 'triangle', f * 2, t, duration + 0.6).connect(body);
    }
  }

  bass(note: number, t: number, duration: number, velocity = 1): void {
    const ctx = this.ctx;
    const f = midiToFreq(note);
    const lp = filter(ctx, 'lowpass', 520, 1.2);
    const env = envelope(ctx, t, 0.2 * velocity, 0.012, Math.max(0.05, duration - 0.1), 0.18);
    lp.connect(env).connect(this.out);
    osc(ctx, 'triangle', f, t, duration + 0.3).connect(lp);
    osc(ctx, 'sine', f / 2, t, duration + 0.3).connect(lp);
  }

  kick(t: number, velocity = 1): void {
    const ctx = this.ctx;
    const o = osc(ctx, 'sine', 120, t, 0.5);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const env = envelope(ctx, t, 0.75 * velocity, 0.003, 0.03, 0.38);
    o.connect(env).connect(this.out);
  }

  snare(t: number, velocity = 1, rim = false): void {
    const ctx = this.ctx;
    const src = this.core.noiseSource(t, 0.3);
    const bp = filter(ctx, 'bandpass', rim ? 3200 : 1900, rim ? 2 : 0.8);
    const env = envelope(ctx, t, (rim ? 0.12 : 0.22) * velocity, 0.002, 0.01, rim ? 0.06 : 0.2);
    src.connect(bp).connect(env);
    env.connect(this.out);
    env.connect(this.core.reverbSend);
    if (!rim) {
      const tone = envelope(ctx, t, 0.1 * velocity, 0.002, 0.01, 0.1);
      osc(ctx, 'triangle', 190, t, 0.15).connect(tone).connect(this.out);
    }
  }

  hat(t: number, velocity = 1, open = false): void {
    const ctx = this.ctx;
    const src = this.core.noiseSource(t, open ? 0.3 : 0.08);
    const hp = filter(ctx, 'highpass', 7400, 0.8);
    const env = envelope(ctx, t, 0.055 * velocity, 0.001, 0.005, open ? 0.2 : 0.035);
    src.connect(hp).connect(env).connect(this.out);
  }

  arp(note: number, t: number, brightness: number, velocity = 1): void {
    const ctx = this.ctx;
    const lp = filter(ctx, 'lowpass', brightness * 2.2, 1);
    const env = envelope(ctx, t, 0.03 * velocity, 0.004, 0.02, 0.24);
    lp.connect(env);
    env.connect(this.out);
    env.connect(this.core.delaySend);
    env.connect(this.core.reverbSend);
    osc(ctx, 'square', midiToFreq(note), t, 0.35).connect(lp);
  }
}

// ---------------------------------------------------------------------------------------------
// Soundeffekte

/** Kurzer Ton mit Hüllkurve. */
function blip(
  core: SynthCore,
  out: AudioNode,
  freq: number,
  t: number,
  length: number,
  type: OscillatorType,
  peak: number,
  reverb = 0,
): void {
  const env = envelope(core.ctx, t, peak, 0.004, length * 0.3, length);
  osc(core.ctx, type, freq, t, length * 1.5)
    .connect(env)
    .connect(out);
  if (reverb > 0) {
    const send = core.ctx.createGain();
    send.gain.value = reverb;
    env.connect(send).connect(core.reverbSend);
  }
}

export function playSound(core: SynthCore, out: AudioNode, id: SoundId, t: number): void {
  const ctx = core.ctx;
  switch (id) {
    case 'message':
      blip(core, out, 1318.5, t, 0.12, 'triangle', 0.22, 0.3);
      blip(core, out, 1760, t + 0.13, 0.2, 'triangle', 0.2, 0.3);
      break;
    case 'notification':
      blip(core, out, 880, t, 0.1, 'sine', 0.2, 0.2);
      blip(core, out, 1174.7, t + 0.11, 0.16, 'sine', 0.18, 0.2);
      break;
    case 'cash': {
      const click = core.noiseSource(t, 0.05);
      const env = envelope(ctx, t, 0.25, 0.001, 0.005, 0.03);
      click
        .connect(filter(ctx, 'bandpass', 5200, 1.5))
        .connect(env)
        .connect(out);
      [2093, 2637, 3136, 4186].forEach((f, i) => {
        blip(core, out, f, t + 0.01 + i * 0.012, 0.32, 'sine', 0.07, 0.25);
      });
      [3520, 4435, 5274].forEach((f, i) => {
        blip(core, out, f, t + 0.1 + i * 0.015, 0.45, 'sine', 0.05, 0.3);
      });
      const thump = osc(ctx, 'sine', 150, t, 0.2);
      thump.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      thump.connect(envelope(ctx, t, 0.25, 0.002, 0.02, 0.12)).connect(out);
      break;
    }
    case 'click': {
      const src = core.noiseSource(t, 0.04);
      src
        .connect(filter(ctx, 'bandpass', 2600, 2))
        .connect(envelope(ctx, t, 0.22, 0.001, 0.002, 0.018))
        .connect(out);
      break;
    }
    case 'tap':
      blip(core, out, 540, t, 0.04, 'sine', 0.1);
      break;
    case 'error': {
      for (const dt of [0, 0.16]) {
        const lp = filter(ctx, 'lowpass', 1300);
        lp.connect(envelope(ctx, t + dt, 0.12, 0.005, 0.07, 0.06)).connect(out);
        osc(ctx, 'square', 196, t + dt, 0.16).connect(lp);
      }
      break;
    }
    case 'success':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        blip(core, out, f, t + i * 0.07, 0.22, 'triangle', 0.14, 0.25);
      });
      break;
    case 'alert':
      for (const [i, f] of [988, 740, 988, 740].entries()) {
        const lp = filter(ctx, 'lowpass', 2400);
        lp.connect(envelope(ctx, t + i * 0.14, 0.09, 0.004, 0.07, 0.05)).connect(out);
        osc(ctx, 'square', f, t + i * 0.14, 0.14).connect(lp);
      }
      break;
    case 'siren': {
      const length = 2.8;
      const o = osc(ctx, 'sawtooth', 960, t, length);
      for (let k = 0; k * 0.45 < length; k++) o.frequency.setValueAtTime(k % 2 === 0 ? 960 : 770, t + k * 0.45);
      const lp = filter(ctx, 'lowpass', 1900, 1);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.16, t + 0.8);
      env.gain.linearRampToValueAtTime(0.13, t + length - 0.8);
      env.gain.exponentialRampToValueAtTime(0.0001, t + length);
      o.connect(lp).connect(env).connect(out);
      const send = ctx.createGain();
      send.gain.value = 0.4;
      env.connect(send).connect(core.reverbSend);
      break;
    }
    case 'thunder': {
      const crack = core.noiseSource(t, 0.3);
      crack
        .connect(filter(ctx, 'highpass', 1400))
        .connect(envelope(ctx, t, 0.28, 0.005, 0.02, 0.2))
        .connect(out);
      const rumble = core.noiseSource(t, 4);
      const lp = filter(ctx, 'lowpass', 260, 0.9);
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.exponentialRampToValueAtTime(90, t + 3.2);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.7, t + 0.08);
      for (let k = 1; k < 8; k++) env.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.5, t + k * 0.35);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
      rumble.connect(lp).connect(env).connect(out);
      const send = ctx.createGain();
      send.gain.value = 0.5;
      env.connect(send).connect(core.reverbSend);
      break;
    }
    case 'gameOver': {
      const lp = filter(ctx, 'lowpass', 1400);
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 3);
      const env = envelope(ctx, t, 0.1, 0.3, 1.2, 2);
      lp.connect(env).connect(out);
      env.connect(core.reverbSend);
      for (const f of [110, 130.8, 155.6, 98]) for (const d of [-9, 8]) osc(ctx, 'sawtooth', f, t, 3.6, d).connect(lp);
      break;
    }
    case 'win':
      for (const f of [523.25, 659.25, 783.99]) {
        const env = envelope(ctx, t, 0.06, 0.6, 0.8, 1.6);
        osc(ctx, 'triangle', f, t, 3).connect(env).connect(out);
        env.connect(core.reverbSend);
      }
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        blip(core, out, f, t + 0.4 + i * 0.09, 0.3, 'sine', 0.1, 0.4);
      });
      break;
    case 'vibrate':
      for (const dt of [0, 0.2]) {
        const lp = filter(ctx, 'lowpass', 380);
        lp.connect(envelope(ctx, t + dt, 0.05, 0.01, 0.1, 0.03)).connect(out);
        osc(ctx, 'square', 150, t + dt, 0.16).connect(lp);
      }
      break;
    case 'delivery':
      blip(core, out, 392, t, 0.16, 'sine', 0.18, 0.2);
      blip(core, out, 523.25, t + 0.15, 0.28, 'sine', 0.16, 0.2);
      break;
    case 'ring':
      // Klingelton eines Handys (etwa 1,6 s): zweimal ein schnelles Trillern aus zwei Tönen, wie ein altes Telefon.
      for (const burst of [0, 0.8]) {
        for (let k = 0; k < 10; k++) {
          const at = t + burst + k * 0.05;
          blip(core, out, k % 2 === 0 ? 1318.5 : 1046.5, at, 0.05, 'triangle', 0.09, 0.08);
        }
      }
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Geräusch-Schleifen (Regen, Gewitter, Wind)

/** So lange (ms) dauert das Ausblenden einer Schleife (Zeitkonstante 1,2 s: nach 8 s ist sie unhörbar), dann wird sie abgebaut. */
export const AMBIENCE_FADE_OUT_MS = 8000;

interface AmbienceLoop {
  gain: GainNode;
  /** Quellen anhalten und Knoten trennen. */
  stop: () => void;
  /** Läuft nach dem Ausblenden ab und baut die Schleife ab. */
  timer: ReturnType<typeof setTimeout> | null;
}

export class Ambience {
  private readonly loops = new Map<AmbienceId, AmbienceLoop>();

  constructor(
    private readonly core: SynthCore,
    private readonly out: AudioNode,
  ) {}

  /** Wie viele Schleifen gerade gebaut sind (laufen oder ausblenden). */
  get active(): number {
    return this.loops.size;
  }

  /**
   * Lautstärke einer Schleife 0–1. Startet sie beim ersten Mal. Bei 0 blendet sie aus und wird danach abgebaut
   * (Rauschquelle angehalten, Knoten getrennt); beim nächsten Regen baut sie sich neu auf.
   */
  set(id: AmbienceId, level: number): void {
    const ctx = this.core.ctx;
    let loop = this.loops.get(id);
    if (loop?.timer) {
      clearTimeout(loop.timer);
      loop.timer = null;
    }
    if (!loop) {
      if (level <= 0) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.out);
      loop = { gain, stop: this.build(id, gain), timer: null };
      this.loops.set(id, loop);
    }
    const target = Math.max(0, Math.min(1, level)) * AMBIENCE_LEVEL[id];
    loop.gain.gain.cancelScheduledValues(ctx.currentTime);
    loop.gain.gain.setTargetAtTime(target, ctx.currentTime, 1.2);
    if (target <= 0) {
      const ended = loop;
      ended.timer = setTimeout(() => {
        if (this.loops.get(id) !== ended) return;
        ended.stop();
        this.loops.delete(id);
      }, AMBIENCE_FADE_OUT_MS);
    }
  }

  /** Baut die Schleife auf und gibt zurück, wie man sie wieder abbaut. */
  private build(id: AmbienceId, gain: GainNode): () => void {
    const ctx = this.core.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.core.noise;
    src.loop = true;
    const nodes: AudioNode[] = [src];
    let lfo: OscillatorNode | null = null;
    if (id === 'rain') {
      const hp = filter(ctx, 'highpass', 450);
      const lp = filter(ctx, 'lowpass', 3800);
      src.connect(hp).connect(lp).connect(gain);
      nodes.push(hp, lp);
    } else if (id === 'storm') {
      const lp = filter(ctx, 'lowpass', 170, 0.8);
      src.connect(lp).connect(gain);
      nodes.push(lp);
    } else {
      const bp = filter(ctx, 'bandpass', 420, 1.6);
      lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const depth = ctx.createGain();
      depth.gain.value = 220;
      lfo.connect(depth).connect(bp.frequency);
      lfo.start();
      src.connect(bp).connect(gain);
      nodes.push(bp, depth, lfo);
    }
    src.start();
    return () => {
      try {
        src.stop();
        lfo?.stop();
      } catch {
        // Schon angehalten.
      }
      for (const node of nodes) node.disconnect();
      gain.disconnect();
    };
  }
}

const AMBIENCE_LEVEL: Record<AmbienceId, number> = { rain: 0.18, storm: 0.35, wind: 0.14 };
