// Regressionstests zu Befunden aus dem Bugreview (Ton und Stimmen).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../core';
import { PiperEngine, type WorkerLike } from './piper/engine';
import type { WorkerRequest, WorkerResponse } from './piper/protocol';
import { PIPER_VOICES, voiceFiles } from './piper/voices';
import { AudioService, SYNTH_IDLE_MS } from './service';
import { Speaker, type SpeechLike } from './voice';

// Der Worker (piper/worker.ts) läuft hier ohne Browser: ONNX Runtime und der Phonemizer sind Attrappen, die der Test
// steuert. Nur der Worker importiert sie, die übrigen Tests merken davon nichts.
const ortCreate = vi.hoisted(() => vi.fn());
vi.mock('onnxruntime-web/wasm', () => ({
  env: { wasm: {} },
  InferenceSession: { create: ortCreate },
  Tensor: class {},
}));
vi.mock('./piper/vendor/piper_phonemize.js?raw', () => ({
  default: 'function createPiperPhonemize(options) { return globalThis.__phonemizerFactory(options); }',
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const THORSTEN = { feminine: false, pitch: 0.7, rate: 0.9 };
const KERSTIN = { feminine: true, pitch: 1.1, rate: 1 };
const THORSTEN_ID = 'de_DE-thorsten-medium';

/** Worker zum Mitschreiben; Antworten schickt der Test. */
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
  return { worker, sent, reply: (data: WorkerResponse) => worker.onmessage?.({ data }) };
}

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
    sampleRate: 44100,
    createDynamicsCompressor: () => ({ threshold: { value: 0 }, ratio: { value: 0 }, connect: (to: unknown) => to }),
    createGain: g,
    createBufferSource: () => ({ connect: (to: unknown) => to, start: () => {}, stop: () => {}, disconnect: () => {} }),
    createConvolver: () => ({ connect: (to: unknown) => to, buffer: null }),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createDelay: () => ({ delayTime: { value: 0, setValueAtTime: () => {} }, connect: (to: unknown) => to }),
    createBiquadFilter: () => ({ frequency: { value: 0 }, Q: { value: 0 }, connect: (to: unknown) => to }),
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    change(state: AudioContextState) {
      ctx.state = state;
      for (const fn of listeners) fn();
    },
  };
  return ctx;
}

describe('Entferntes Sprachmodell lädt nicht still beim nächsten Anruf', () => {
  function serviceWith(storage = memoryStorage()) {
    const { worker, sent, reply } = fakeWorker();
    const service = new AudioService({
      createContext: () => null,
      createEngine: () => new PiperEngine({ createWorker: () => worker }),
      speaker: new Speaker(null),
    });
    service.init(storage);
    // Legt das Modell an (Worker, Stand aus dem Cache).
    expect(service.voiceModels).toHaveLength(PIPER_VOICES.length);
    return { service, sent, reply, loads: () => sent.filter((m) => m.type === 'load').map((m) => m.voice.id) };
  }

  it('klingelt es nach dem Entfernen, lädt nichts; erst "Laden" holt das Modell wieder', () => {
    const storage = memoryStorage();
    const { service, sent, reply, loads } = serviceWith(storage);
    reply({ type: 'status', cached: { [THORSTEN_ID]: true }, supported: true });
    service.removeVoiceModel(THORSTEN_ID);
    expect(sent.some((m) => m.type === 'remove')).toBe(true);
    reply({ type: 'removed', voice: THORSTEN_ID });
    service.prepareVoice(THORSTEN);
    service.prepareSpeech(['Moin.'], THORSTEN);
    expect(loads()).toEqual([]);
    // Die andere Stimme lädt weiter von selbst.
    service.prepareVoice(KERSTIN);
    expect(loads()).toEqual(['de_DE-kerstin-low']);

    // Gilt auch nach dem Neuladen der Seite (pro Gerät gemerkt).
    const again = serviceWith(storage);
    again.service.prepareVoice(THORSTEN);
    expect(again.loads()).toEqual([]);

    service.loadVoiceModel(THORSTEN_ID);
    expect(loads()).toEqual(['de_DE-kerstin-low', THORSTEN_ID]);
    expect(service.settings.removedVoices).toEqual([]);
  });
});

describe('Sicherheitsnetz, wenn die Synthese nach dem Laden hängt', () => {
  function setup() {
    vi.useFakeTimers();
    const ctx = fakeContext('running');
    const { worker, sent, reply } = fakeWorker();
    const service = new AudioService({
      createContext: () => ctx as unknown as AudioContext,
      createEngine: () => new PiperEngine({ createWorker: () => worker }),
      speaker: new Speaker(null),
    });
    service.init(memoryStorage());
    service.update({ musicOn: false });
    service.unlock();
    const synthId = () => (sent.find((m) => m.type === 'synth') as { id: number } | undefined)?.id;
    return { service, reply, synthId };
  }

  it('beendet die Zeile, wenn das bereite Modell nie antwortet, und nur einmal', async () => {
    const { service, reply, synthId } = setup();
    const onEnd = vi.fn();
    expect(service.speak('Moin, alles klar bei dir?', THORSTEN, onEnd)).not.toBeNull();
    reply({ type: 'loaded', voice: THORSTEN_ID, sampleRate: 22050 });
    await vi.advanceTimersByTimeAsync(0);
    const id = synthId();
    expect(id).toBeDefined();
    await vi.advanceTimersByTimeAsync(SYNTH_IDLE_MS - 1000);
    expect(onEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    // Kommt das Ende doch noch, bleibt es bei einem onEnd.
    reply({ type: 'done', id: id ?? 0, count: 0 });
    await vi.advanceTimersByTimeAsync(10);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('greift nicht ein, wenn das Modell rechtzeitig fertig wird', async () => {
    const { service, reply, synthId } = setup();
    const onEnd = vi.fn();
    service.speak('Moin.', THORSTEN, onEnd);
    reply({ type: 'loaded', voice: THORSTEN_ID, sampleRate: 22050 });
    await vi.advanceTimersByTimeAsync(0);
    reply({ type: 'done', id: synthId() ?? 0, count: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SYNTH_IDLE_MS * 2);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Ton-Schleife, angelegt bevor der Ton läuft', () => {
  function setup() {
    vi.useFakeTimers();
    const ctx = fakeContext('suspended');
    const service = new AudioService({
      createContext: () => ctx as unknown as AudioContext,
      createEngine: () => null,
      speaker: new Speaker(null),
    });
    service.init(memoryStorage());
    service.update({ musicOn: false });
    const calls: string[] = [];
    service.registerSound('test.motor', {
      kind: 'loop',
      start: () => {
        calls.push('start');
        return { set: (p) => calls.push(`set:${p.rpm ?? '-'}`), stop: () => calls.push('stop') };
      },
    });
    return { service, ctx, calls };
  }

  it('startet, sobald der Ton läuft, mit den zuletzt gesetzten Werten', () => {
    const { service, ctx, calls } = setup();
    // Noch keine Geste: gesperrt.
    const loop = service.loop('test.motor', { rpm: 40 });
    loop.set({ rpm: 50 });
    service.unlock();
    // Der Kontext steht noch (resume läuft).
    expect(service.status).toBe('suspended');
    loop.set({ rpm: 60 });
    expect(calls).toEqual([]);
    ctx.change('running');
    expect(calls).toEqual(['start', 'set:60']);
    loop.set({ rpm: 70 });
    loop.stop();
    expect(calls).toEqual(['start', 'set:60', 'set:70', 'stop']);
  });

  it('startet nicht mehr, wenn sie vorher gestoppt wurde', () => {
    const { service, ctx, calls } = setup();
    const loop = service.loop('test.motor', { rpm: 40 });
    loop.stop();
    service.unlock();
    ctx.change('running');
    loop.set({ rpm: 80 });
    expect(calls).toEqual([]);
  });

  it('ohne Web Audio bleibt der Griff stumm', () => {
    const service = new AudioService({
      createContext: () => null,
      createEngine: () => null,
      speaker: new Speaker(null),
    });
    service.registerSound('test.motor', { kind: 'loop', start: () => ({ stop: () => {} }) });
    service.unlock();
    expect(service.status).toBe('unsupported');
    expect(() => service.loop('test.motor', { rpm: 1 }).set({ rpm: 2 })).not.toThrow();
  });
});

describe('Frauenstimmen mit "Female" im Namen', () => {
  function speakerWith(names: string[]): Speaker {
    const speech: SpeechLike = {
      speak: () => {},
      cancel: () => {},
      getVoices: () => names.map((name) => ({ name, lang: 'de-DE', localService: true })) as SpeechSynthesisVoice[],
    };
    return new Speaker(speech);
  }

  it('wählt für eine Frau die Stimme mit "Female", für einen Mann die mit "Male"', () => {
    const speaker = speakerWith(['Microsoft Male German', 'Microsoft Female German']);
    expect(speaker.pickVoice(true)?.name).toBe('Microsoft Female German');
    expect(speaker.pickVoice(false)?.name).toBe('Microsoft Male German');
  });

  it('nimmt für einen Mann keine "Female"-Stimme, wenn es eine andere gibt', () => {
    const speaker = speakerWith(['Microsoft Female German', 'Deutsch Standard']);
    expect(speaker.pickVoice(false)?.name).toBe('Deutsch Standard');
  });
});

describe('Ladefehler von Phonemizer oder ONNX-Laufzeit lässt das Modell im Cache', () => {
  const voice = voiceFiles(PIPER_VOICES[0]);

  /** Cache API im Speicher, Modell und Konfiguration liegen schon drin. */
  function fakeCaches() {
    const entries = new Map<string, { body: string | Uint8Array<ArrayBuffer>; type: string }>();
    entries.set(voice.model, { body: new Uint8Array([1, 2, 3, 4]), type: 'application/octet-stream' });
    entries.set(voice.config, {
      body: JSON.stringify({
        audio: { sample_rate: 22050 },
        phoneme_id_map: { _: [0], '^': [1], $: [2] },
        espeak: { voice: 'de' },
      }),
      type: 'application/json',
    });
    const cache = {
      match: async (url: string) => {
        const hit = entries.get(url);
        return hit ? new Response(hit.body, { headers: { 'content-type': hit.type } }) : undefined;
      },
      put: async () => {},
      delete: async (url: string) => entries.delete(url),
    };
    return { caches: { open: async () => cache }, has: (url: string) => entries.has(url) };
  }

  async function startWorker() {
    const posted: WorkerResponse[] = [];
    const scope: {
      postMessage: (m: WorkerResponse) => void;
      onmessage: ((e: { data: WorkerRequest }) => void) | null;
    } = { postMessage: (m) => posted.push(m), onmessage: null };
    vi.stubGlobal('self', scope);
    const cache = fakeCaches();
    vi.stubGlobal('caches', cache.caches);
    // Kein Download: Liegt das Modell im Cache, fragt der Worker das Netz nicht.
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    await import('./piper/worker');
    const load = async () => {
      const before = posted.length;
      scope.onmessage?.({ data: { type: 'load', voice } });
      await vi.waitFor(() =>
        expect(posted.slice(before).some((m) => m.type === 'loaded' || m.type === 'loadError')).toBe(true),
      );
      return posted.slice(before).find((m) => m.type === 'loaded' || m.type === 'loadError');
    };
    return { load, has: cache.has, fetchMock };
  }

  beforeEach(() => {
    ortCreate.mockReset();
  });

  it('Netzfehler beim Start der ONNX-Laufzeit: Modell bleibt, kein neuer Download', async () => {
    vi.stubGlobal('__phonemizerFactory', async () => ({ callMain: () => 0 }));
    ortCreate.mockRejectedValue(new Error('no available backend found. ERR: [wasm] TypeError: Failed to fetch'));
    const { load, has, fetchMock } = await startWorker();
    expect((await load())?.type).toBe('loadError');
    expect(has(voice.model)).toBe(true);
    expect(has(voice.config)).toBe(true);
    // Der nächste Versuch nimmt dieselben Bytes aus dem Cache.
    ortCreate.mockResolvedValue({ release: async () => {} });
    expect((await load())?.type).toBe('loaded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Phonemizer lädt nicht: Modell bleibt im Cache', async () => {
    vi.stubGlobal('__phonemizerFactory', async () => {
      throw new TypeError('Failed to fetch');
    });
    ortCreate.mockResolvedValue({ release: async () => {} });
    const { load, has } = await startWorker();
    expect((await load())?.type).toBe('loadError');
    expect(has(voice.model)).toBe(true);
    expect(ortCreate).not.toHaveBeenCalled();
  });

  it('kaputtes Modell: Eintrag wird weiter gelöscht, damit der nächste Versuch neu lädt', async () => {
    vi.stubGlobal('__phonemizerFactory', async () => ({ callMain: () => 0 }));
    ortCreate.mockRejectedValue(
      new Error(
        "Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed to load model because protobuf parsing failed.",
      ),
    );
    const { load, has } = await startWorker();
    expect((await load())?.type).toBe('loadError');
    expect(has(voice.model)).toBe(false);
  });
});
