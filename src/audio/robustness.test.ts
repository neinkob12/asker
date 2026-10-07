// Robustheit des Audio-Dienstes: Auflegen während das Modell lädt, Fehler nur auf Zeit, Timer, Geräusch-Schleifen,
// Musik-Backoff, Kontext-Zustand.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../core';
import { ERROR_RETRY_MS, PiperEngine, type WorkerLike } from './piper/engine';
import type { WorkerRequest } from './piper/protocol';
import { AudioService } from './service';
import { AMBIENCE_FADE_OUT_MS, Ambience, type SynthCore } from './synth';
import { Speaker } from './voice';

const THORSTEN = { feminine: false, pitch: 0.7, rate: 0.9 };

function fakeWorker() {
  const sent: WorkerRequest[] = [];
  const worker: WorkerLike = {
    postMessage: (m) => {
      sent.push(m);
    },
    onmessage: null,
    onerror: null,
    terminate: () => {},
  };
  return {
    worker,
    sent,
    reply: (data: Parameters<NonNullable<WorkerLike['onmessage']>>[0]['data']) => worker.onmessage?.({ data }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Vorrechnen nach dem Auflegen', () => {
  function setup() {
    const { worker, sent, reply } = fakeWorker();
    const service = new AudioService({
      createContext: () => null,
      createEngine: () => new PiperEngine({ createWorker: () => worker }),
      speaker: new Speaker(null),
    });
    service.init(memoryStorage());
    return { service, sent, reply };
  }
  const synths = (sent: WorkerRequest[]) => sent.filter((m) => m.type === 'synth');

  it('schickt keine Zeilen an den Worker, wenn aufgelegt wurde, bevor das Modell geladen war', async () => {
    const { service, sent, reply } = setup();
    service.setCall(true);
    service.prepareSpeech(['Moin.', 'Wie geht es?'], THORSTEN);
    service.setCall(false);
    service.stopSpeaking();
    reply({ type: 'loaded', voice: 'de_DE-thorsten-medium', sampleRate: 22050 });
    await Promise.resolve();
    await Promise.resolve();
    expect(synths(sent)).toHaveLength(0);
  });

  it('rechnet vor, wenn der Anruf noch läuft', async () => {
    const { service, sent, reply } = setup();
    service.setCall(true);
    service.prepareSpeech(['Moin.', 'Wie geht es?'], THORSTEN);
    reply({ type: 'loaded', voice: 'de_DE-thorsten-medium', sampleRate: 22050 });
    await vi.waitFor(() => expect(synths(sent)).toHaveLength(2));
  });

  it('rechnet die Zeilen des nächsten Anrufs vor, auch wenn der erste aufgelegt hat', async () => {
    const { service, sent, reply } = setup();
    service.setCall(true);
    service.prepareSpeech(['Alt.'], THORSTEN);
    service.setCall(false);
    service.stopSpeaking();
    service.setCall(true);
    service.prepareSpeech(['Neu.'], THORSTEN);
    reply({ type: 'loaded', voice: 'de_DE-thorsten-medium', sampleRate: 22050 });
    await vi.waitFor(() => expect(synths(sent)).toHaveLength(1));
    expect((synths(sent)[0] as { text: string }).text).toBe('Neu.');
  });
});

describe('Modell: ready() räumt den Timer ab', () => {
  it('lässt keinen Timer stehen, wenn das Laden fertig ist', async () => {
    vi.useFakeTimers();
    const { worker, reply } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    const ready = engine.ready('de_DE-thorsten-medium', 90_000);
    expect(vi.getTimerCount()).toBe(1);
    reply({ type: 'loaded', voice: 'de_DE-thorsten-medium', sampleRate: 22050 });
    await expect(ready).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gibt nach dem Zeitlimit false zurück', async () => {
    vi.useFakeTimers();
    const { worker } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    const ready = engine.ready('de_DE-thorsten-medium', 1000);
    vi.advanceTimersByTime(1001);
    await expect(ready).resolves.toBe(false);
  });
});

describe('Modell: Fehler gelten nur auf Zeit', () => {
  it('erlaubt nach einer Weile einen neuen Versuch', () => {
    vi.useFakeTimers();
    const { worker, sent, reply } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    void engine.load('de_DE-thorsten-medium');
    reply({ type: 'loadError', voice: 'de_DE-thorsten-medium', message: 'offline' });
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('error');
    vi.advanceTimersByTime(ERROR_RETRY_MS + 1);
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('idle');
    const loads = sent.filter((m) => m.type === 'load').length;
    void engine.load('de_DE-thorsten-medium');
    expect(sent.filter((m) => m.type === 'load')).toHaveLength(loads + 1);
  });

  it('vergisst vorübergehende Fehler auf Wunsch sofort (Netz wieder da)', () => {
    const { worker, reply } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    void engine.load('de_DE-thorsten-medium');
    reply({ type: 'loadError', voice: 'de_DE-thorsten-medium', message: 'offline' });
    engine.forgetErrors();
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('idle');
  });

  it('startet nach einem Absturz später einen neuen Worker', () => {
    vi.useFakeTimers();
    let created = 0;
    const engine = new PiperEngine({
      createWorker: () => {
        created++;
        return fakeWorker().worker;
      },
    });
    engine.refreshStatus();
    expect(created).toBe(1);
    // Der Worker meldet einen Fehler: abgestürzt.
    (engine as unknown as { worker: WorkerLike }).worker.onerror?.({});
    expect(engine.supported).toBe(false);
    void engine.load('de_DE-thorsten-medium', { retry: true });
    expect(created).toBe(1);
    vi.advanceTimersByTime(ERROR_RETRY_MS + 1);
    void engine.load('de_DE-thorsten-medium');
    expect(created).toBe(2);
  });

  it('lässt "nicht unterstützt" für immer stehen', () => {
    vi.useFakeTimers();
    const engine = new PiperEngine({ createWorker: () => null });
    void engine.load('de_DE-thorsten-medium');
    vi.advanceTimersByTime(ERROR_RETRY_MS * 10);
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('error');
  });
});

describe('Geräusch-Schleifen', () => {
  function fakeCore() {
    let nodes = 0;
    let stopped = 0;
    const param = () => ({
      value: 0,
      cancelScheduledValues: () => {},
      setTargetAtTime: () => {},
    });
    const node = () => {
      nodes++;
      const self: Record<string, unknown> = {
        connect: (to: unknown) => to,
        disconnect: () => {},
        start: () => {},
        stop: () => {
          stopped++;
        },
        gain: param(),
        frequency: param(),
        Q: param(),
      };
      return self;
    };
    const ctx = {
      currentTime: 0,
      createGain: node,
      createBufferSource: node,
      createBiquadFilter: node,
      createOscillator: node,
    };
    return { core: { ctx, noise: {} } as unknown as SynthCore, count: () => nodes, stopped: () => stopped };
  }

  it('baut eine Schleife nach dem Ausblenden ab und danach bei Bedarf neu auf', () => {
    vi.useFakeTimers();
    const { core, count, stopped } = fakeCore();
    const ambience = new Ambience(core, { connect: () => {} } as unknown as AudioNode);
    ambience.set('rain', 0);
    expect(ambience.active).toBe(0);
    ambience.set('rain', 0.8);
    expect(ambience.active).toBe(1);
    const built = count();
    ambience.set('rain', 0);
    expect(ambience.active).toBe(1);
    vi.advanceTimersByTime(AMBIENCE_FADE_OUT_MS + 1);
    expect(ambience.active).toBe(0);
    expect(stopped()).toBe(1);
    ambience.set('rain', 0.5);
    expect(ambience.active).toBe(1);
    expect(count()).toBeGreaterThan(built);
  });

  it('behält die Schleife, wenn es vor dem Abbau wieder regnet', () => {
    vi.useFakeTimers();
    const { core, stopped } = fakeCore();
    const ambience = new Ambience(core, { connect: () => {} } as unknown as AudioNode);
    ambience.set('wind', 0.6);
    ambience.set('wind', 0);
    vi.advanceTimersByTime(AMBIENCE_FADE_OUT_MS / 2);
    ambience.set('wind', 0.6);
    vi.advanceTimersByTime(AMBIENCE_FADE_OUT_MS * 2);
    expect(ambience.active).toBe(1);
    expect(stopped()).toBe(0);
  });
});

/** Ein AudioContext, dessen Zustand der Test steuert. */
function fakeContext(initial: AudioContextState) {
  const listeners: (() => void)[] = [];
  const g = () => ({
    gain: { value: 0, setValueAtTime: () => {}, setTargetAtTime: () => {}, cancelScheduledValues: () => {} },
    connect: (to: unknown) => to,
    disconnect: () => {},
  });
  const ctx = {
    state: initial,
    currentTime: 0,
    destination: {},
    resumeCalls: 0,
    createDynamicsCompressor: () => ({ threshold: { value: 0 }, ratio: { value: 0 }, connect: (to: unknown) => to }),
    createGain: g,
    createBufferSource: () => ({
      connect: (to: unknown) => to,
      start: () => {},
      stop: () => {},
      disconnect: () => {},
    }),
    createConvolver: () => ({ connect: (to: unknown) => to, buffer: null }),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createDelay: () => ({ delayTime: { value: 0, setValueAtTime: () => {} }, connect: (to: unknown) => to }),
    createBiquadFilter: () => ({ frequency: { value: 0 }, Q: { value: 0 }, connect: (to: unknown) => to }),
    sampleRate: 44100,
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
    resume: () => {
      ctx.resumeCalls++;
      return Promise.resolve();
    },
    suspend: () => Promise.resolve(),
    change(state: AudioContextState) {
      ctx.state = state;
      for (const fn of listeners) fn();
    },
  };
  return ctx;
}

describe('Kontext-Zustand', () => {
  it('meldet "running" erst, wenn der Kontext wirklich läuft, und folgt späteren Änderungen', () => {
    const ctx = fakeContext('suspended');
    const service = new AudioService({
      createContext: () => ctx as unknown as AudioContext,
      createEngine: () => null,
      speaker: new Speaker(null),
    });
    service.init(memoryStorage());
    service.update({ musicOn: false });
    service.unlock();
    expect(service.status).toBe('suspended');
    ctx.change('running');
    expect(service.status).toBe('running');
    // Der Browser hält den Kontext an (z.B. iOS "interrupted"): Status folgt, die nächste Geste setzt ihn fort.
    ctx.change('interrupted' as AudioContextState);
    expect(service.status).toBe('suspended');
    const before = ctx.resumeCalls;
    service.unlock();
    expect(ctx.resumeCalls).toBe(before + 1);
    ctx.change('running');
    expect(service.status).toBe('running');
  });
});

describe('Ton-Schleifen (audio.loop)', () => {
  it('startet über den Effekt-Bus, führt Werte nach und hält beim Stoppen an', () => {
    vi.useFakeTimers();
    const ctx = fakeContext('running');
    const service = new AudioService({
      createContext: () => ctx as unknown as AudioContext,
      createEngine: () => null,
      speaker: new Speaker(null),
    });
    service.init(memoryStorage());
    service.update({ musicOn: false });
    // Vor dem Entsperren: ein Griff, der nichts tut.
    const silent = service.loop('test.motor', { rpm: 1 });
    silent.set({ rpm: 2 });
    silent.stop();
    service.unlock();
    const calls: string[] = [];
    service.registerSound('test.motor', {
      kind: 'loop',
      start: () => {
        calls.push('start');
        return {
          set: (p) => calls.push(`set:${p.rpm ?? '-'}`),
          stop: () => calls.push('stop'),
        };
      },
    });
    // play() spielt keine Schleife.
    service.play('test.motor');
    expect(calls).toEqual([]);
    const loop = service.loop('test.motor', { rpm: 40, volume: 0.5 });
    loop.set({ rpm: 60 });
    loop.stop();
    loop.stop();
    loop.set({ rpm: 80 });
    expect(calls).toEqual(['start', 'set:40', 'set:60', 'stop']);
    // Unbekannte Schleife: stumm, kein Fehler.
    expect(() => service.loop('test.gibtsnicht').set({ rpm: 1 })).not.toThrow();
  });
});

describe('Audio-Dateien', () => {
  it('versucht eine fehlgeschlagene Datei nach einer Weile noch einmal', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const ctx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createDynamicsCompressor: () => ({ threshold: { value: 0 }, ratio: { value: 0 }, connect: (to: unknown) => to }),
      createGain: () => ({
        gain: { value: 0, setValueAtTime: () => {}, setTargetAtTime: () => {} },
        connect: (to: unknown) => to,
        disconnect: () => {},
      }),
      createBufferSource: () => ({ connect: (to: unknown) => to, start: () => {}, stop: () => {} }),
      createConvolver: () => ({ connect: (to: unknown) => to }),
      createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
      createDelay: () => ({ delayTime: { setValueAtTime: () => {} }, connect: (to: unknown) => to }),
      createBiquadFilter: () => ({ frequency: {}, Q: {}, connect: (to: unknown) => to }),
      sampleRate: 44100,
      resume: () => Promise.resolve(),
    };
    const service = new AudioService({
      createContext: () => ctx as unknown as AudioContext,
      createEngine: () => null,
      speaker: new Speaker(null),
    });
    service.init(memoryStorage());
    service.update({ musicOn: false });
    service.unlock();
    service.registerSound('test.datei', { kind: 'file', url: 'audio/gibtsnicht.ogg' });
    service.play('test.datei');
    await vi.advanceTimersByTimeAsync(10);
    service.play('test.datei');
    await vi.advanceTimersByTimeAsync(10);
    // Der Fehlschlag bleibt zunächst gemerkt: kein zweiter Abruf.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(31_000);
    service.play('test.datei');
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
