import { readFileSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PiperEngine, type WorkerLike } from './engine';
import { SpeechPlayback } from './playback';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { synthesizeSentences } from './synthesize';
import {
  cleanText,
  estimateSeconds,
  isSilent,
  parseConfig,
  phonemesToIds,
  repairPhonemes,
  resample,
  splitSentences,
} from './text';
import { formatMegabytes, PIPER_VOICES, piperParams, piperVoiceFor, voiceFiles } from './voices';

const MAP = { _: [0], '^': [1], $: [2], ' ': [3], '.': [10], '?': [13], a: [14], b: [15], m: [25], ʊ: [102], ɐ: [90] };

describe('Text fürs Sprachmodell', () => {
  it('trennt Sätze, lässt Abkürzungen ganz und wirft Leeres weg', () => {
    expect(splitSentences('Moin. Fiete Lührs, Hamburger Hafen. Wir kennen uns nicht?')).toEqual([
      'Moin.',
      'Fiete Lührs, Hamburger Hafen.',
      'Wir kennen uns nicht?',
    ]);
    expect(splitSentences('Bring ca. 20 Stück. Nr. 7 am Kai, z.B. morgen. Klar?')).toEqual([
      'Bring ca. 20 Stück.',
      'Nr. 7 am Kai, z.B. morgen.',
      'Klar?',
    ]);
    expect(splitSentences('Erste Zeile\n– zweite Zeile\n…\n')).toEqual(['Erste Zeile', 'zweite Zeile']);
    expect(splitSentences('„Übergibst du jetzt?“ Er wartet … Nein!')).toEqual([
      '„Übergibst du jetzt?“',
      'Er wartet …',
      'Nein!',
    ]);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('nimmt Emoji und Aufzählungszeichen raus', () => {
    expect(cleanText('– Lager voll 📦\n•  Geld da 💶  ')).toBe('Lager voll\nGeld da');
  });

  it('repariert das doppelte Fragezeichen von espeak-ng in "Hamburg"', () => {
    expect(repairPhonemes(['h', 'ˈ', 'a', 'm', 'b', '?', '?', 'k']).join('')).toBe('hˈambʊɐk');
    // Ein Fragezeichen am Satzende bleibt ein Fragezeichen.
    expect(repairPhonemes(['b', '?', '?', 'k', '?']).join('')).toBe('bʊɐk?');
    expect(repairPhonemes(['j', 'a', '?'])).toEqual(['j', 'a', '?']);
  });

  it('übersetzt Phoneme wie Piper: Anfang, Pause nach jedem Laut, Ende; Unbekanntes fällt weg', () => {
    expect(phonemesToIds(['m', 'a', 'x', '.'], MAP)).toEqual([1, 0, 25, 0, 14, 0, 10, 0, 2]);
    expect(isSilent(phonemesToIds([], MAP))).toBe(true);
    expect(isSilent(phonemesToIds(['a'], MAP))).toBe(false);
  });

  it('liest die Konfiguration eines Modells und meckert bei Müll', () => {
    const config = parseConfig({
      audio: { sample_rate: 22050 },
      espeak: { voice: 'de' },
      inference: { noise_scale: 0.5, length_scale: 1.1, noise_w: 0.7 },
      num_speakers: 1,
      phoneme_id_map: MAP,
    });
    expect(config).toMatchObject({ sampleRate: 22050, language: 'de', noiseScale: 0.5, lengthScale: 1.1, speakers: 1 });
    expect(parseConfig({ audio: { sample_rate: 16000 }, phoneme_id_map: MAP })).toMatchObject({
      language: 'de',
      noiseScale: 0.667,
      noiseW: 0.8,
    });
    expect(() => parseConfig(null)).toThrow();
    expect(() => parseConfig({ audio: { sample_rate: 22050 }, phoneme_id_map: { a: [1] } })).toThrow(/"_"/);
    expect(() => parseConfig({ phoneme_id_map: MAP })).toThrow(/Abtastrate/);
  });

  it('rechnet die Abtastrate linear um', () => {
    const pcm = Float32Array.from([0, 1, 0, -1]);
    const up = resample(pcm, 2, 4);
    expect(up.length).toBe(8);
    expect(up[0]).toBe(0);
    expect(up[1]).toBeCloseTo(0.5);
    expect(up[2]).toBe(1);
    expect(resample(pcm, 4, 4)).toBe(pcm);
    expect(estimateSeconds('Moin Fiete hier', 1)).toBeGreaterThan(1);
  });
});

describe('Stimmen des Modells', () => {
  it('gibt Frauen und Männern je eine Stimme und leitet Tempo und Tonhöhe ab', () => {
    expect(piperVoiceFor({ feminine: false, pitch: 0.85, rate: 1 }).id).toBe('de_DE-thorsten-medium');
    expect(piperVoiceFor({ feminine: true, pitch: 1.15, rate: 1 }).id).toBe('de_DE-kerstin-low');
    const fiete = piperParams({ feminine: false, pitch: 0.7, rate: 0.88 });
    const normal = piperParams({ feminine: false, pitch: 0.85, rate: 1 });
    const young = piperParams({ feminine: false, pitch: 1, rate: 1.1 });
    expect(normal.playbackRate).toBe(1);
    expect(normal.lengthScale).toBe(1);
    expect(fiete.playbackRate).toBeLessThan(1);
    expect(fiete.lengthScale).toBeGreaterThan(1);
    expect(young.playbackRate).toBeGreaterThan(1);
    expect(young.lengthScale).toBeLessThan(1);
    // Ausreißer bleiben im Rahmen.
    expect(piperParams({ feminine: false, pitch: 0.1, rate: 0.2 }).playbackRate).toBe(0.86);
    expect(piperParams({ feminine: true, pitch: 2, rate: 3 }).lengthScale).toBeLessThan(0.9);
    for (const voice of PIPER_VOICES) {
      const files = voiceFiles(voice);
      expect(files.model).toMatch(
        /^https:\/\/huggingface\.co\/rhasspy\/piper-voices\/resolve\/v1\.0\.0\/de\/de_DE\/.*\.onnx$/,
      );
      expect(files.config).toBe(`${files.model}.json`);
    }
    expect(formatMegabytes(63_201_294)).toBe('63 MB');
  });
});

describe('Synthese Satz für Satz', () => {
  const config = parseConfig({ audio: { sample_rate: 16000 }, phoneme_id_map: MAP, num_speakers: 1 });

  it('spricht jeden Satz einzeln, überspringt Stummes und meldet die Reihenfolge', async () => {
    const runs: number[][] = [];
    const scalesSeen: number[][] = [];
    const sentences: number[] = [];
    const count = await synthesizeSentences(
      'Ab. Ba! …',
      config,
      { lengthScale: 1.2 },
      {
        phonemize: (text) => [...text.toLowerCase().replace(/[^ab.!?]/g, '')],
        run: async (ids, scales) => {
          runs.push(ids);
          scalesSeen.push(scales);
          return new Float32Array(ids.length);
        },
      },
      (_pcm, index) => sentences.push(index),
    );
    expect(count).toBe(2);
    expect(sentences).toEqual([0, 1]);
    expect(runs[0]).toEqual([1, 0, 14, 0, 15, 0, 10, 0, 2]);
    expect(scalesSeen[0]).toEqual([0.667, 1.2, 0.8]);
  });

  it('hört nach einem Abbruch auf', async () => {
    let calls = 0;
    const count = await synthesizeSentences(
      'Ab. Ab. Ab.',
      config,
      { lengthScale: 1 },
      { phonemize: () => ['a', 'b', '.'], run: async () => new Float32Array(4) },
      () => calls++,
      () => calls >= 1,
    );
    expect(count).toBe(1);
  });
});

/** Ein Worker zum Mitschreiben: Die Tests spielen seine Antworten selbst ein. */
function fakeWorker() {
  const sent: WorkerRequest[] = [];
  const worker: WorkerLike = {
    postMessage: (message) => {
      sent.push(message);
    },
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  };
  const reply = (message: WorkerResponse) => worker.onmessage?.({ data: message });
  return { worker, sent, reply };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Sprachmodell (Engine)', () => {
  it('lädt ein Modell mit Fortschritt und meldet den Stand', async () => {
    const { worker, sent, reply } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    expect(engine.supported).toBe(true);
    const changes: string[] = [];
    engine.subscribe(() => changes.push(engine.state('de_DE-thorsten-medium').kind));
    engine.refreshStatus();
    expect(sent[0]?.type).toBe('status');
    reply({ type: 'status', cached: { 'de_DE-thorsten-medium': true, 'de_DE-kerstin-low': false }, supported: true });
    expect(engine.state('de_DE-thorsten-medium')).toEqual({ kind: 'idle', cached: true });
    expect(engine.anyAvailable).toBe(true);
    const load = engine.load('de_DE-thorsten-medium');
    expect(engine.load('de_DE-thorsten-medium')).toBe(load);
    expect(sent.filter((m) => m.type === 'load')).toHaveLength(1);
    reply({ type: 'progress', voice: 'de_DE-thorsten-medium', phase: 'download', loaded: 10, total: 100 });
    expect(engine.state('de_DE-thorsten-medium')).toEqual({
      kind: 'loading',
      phase: 'download',
      loaded: 10,
      total: 100,
    });
    reply({ type: 'loaded', voice: 'de_DE-thorsten-medium', sampleRate: 22050 });
    expect(await load).toBe(true);
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('ready');
    expect(changes).toContain('loading');
    expect(changes[changes.length - 1]).toBe('ready');
    expect(await engine.ready('de_DE-thorsten-medium', 10)).toBe(true);
  });

  it('rechnet dieselbe Zeile nur einmal, liefert Sätze an alle Zuhörer und bricht beim Auflegen ab', async () => {
    const { worker, sent, reply } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    reply({ type: 'loaded', voice: 'de_DE-thorsten-medium', sampleRate: 22050 });
    const heard: number[] = [];
    const params = { lengthScale: 1, noiseScale: 0.667, noiseW: 0.8 };
    const a = engine.synthesize('de_DE-thorsten-medium', 'Moin.', params, (c) => heard.push(c.index));
    engine.prepare('de_DE-thorsten-medium', 'Moin.', params);
    const synths = sent.filter((m) => m.type === 'synth');
    expect(synths).toHaveLength(1);
    const id = synths[0].type === 'synth' ? synths[0].id : -1;
    reply({ type: 'sentence', id, index: 0, sampleRate: 22050, pcm: new Float32Array(3) });
    // Später dazu: bekommt den fertigen Satz nachgereicht.
    const late: number[] = [];
    engine.synthesize('de_DE-thorsten-medium', 'Moin.', params, (c) => late.push(c.index));
    reply({ type: 'sentence', id, index: 1, sampleRate: 22050, pcm: new Float32Array(2) });
    reply({ type: 'done', id, count: 2 });
    const audio = await a.promise;
    expect(audio.sentences.map((s) => s.length)).toEqual([3, 2]);
    expect(heard).toEqual([0, 1]);
    expect(late).toEqual([0, 1]);
    // Fertig: kein neuer Auftrag an den Worker.
    engine.synthesize('de_DE-thorsten-medium', 'Moin.', params);
    expect(sent.filter((m) => m.type === 'synth')).toHaveLength(1);

    const b = engine.synthesize('de_DE-thorsten-medium', 'Tschüss.', params);
    const expectation = expect(b.promise).rejects.toThrow('Abgebrochen');
    engine.cancelAll();
    await expectation;
    const cancel = sent[sent.length - 1];
    expect(cancel.type).toBe('cancel');
    // Nach dem Abbruch wird die Zeile neu gerechnet.
    engine.synthesize('de_DE-thorsten-medium', 'Tschüss.', params);
    expect(sent.filter((m) => m.type === 'synth')).toHaveLength(3);
  });

  it('meldet Fehler und einen abgestürzten Worker', async () => {
    const { worker, reply } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    const load = engine.load('de_DE-kerstin-low');
    reply({ type: 'loadError', voice: 'de_DE-kerstin-low', message: 'Download fehlgeschlagen (503).' });
    expect(await load).toBe(false);
    expect(engine.state('de_DE-kerstin-low')).toEqual({ kind: 'error', message: 'Download fehlgeschlagen (503).' });
    // Ohne retry bleibt der Fehler stehen, mit retry geht es neu los.
    expect(await engine.load('de_DE-kerstin-low')).toBe(false);
    void engine.load('de_DE-kerstin-low', { retry: true });
    expect(engine.state('de_DE-kerstin-low').kind).toBe('loading');
    const job = engine.synthesize('de_DE-kerstin-low', 'Hallo.', { lengthScale: 1, noiseScale: 0.667, noiseW: 0.8 });
    const failed = expect(job.promise).rejects.toThrow('abgestürzt');
    worker.onerror?.({});
    await failed;
    expect(engine.supported).toBe(false);
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('error');
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('ohne Worker (alter Browser) ist nichts geladen und alles ein Fehler', async () => {
    const engine = new PiperEngine({ createWorker: () => null });
    expect(await engine.load('de_DE-thorsten-medium')).toBe(false);
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('error');
    expect(engine.supported).toBe(false);
  });

  it('wartet höchstens die Frist auf ein Modell', async () => {
    vi.useFakeTimers();
    const { worker } = fakeWorker();
    const engine = new PiperEngine({ createWorker: () => worker });
    const ready = engine.ready('de_DE-thorsten-medium', 1000);
    await vi.advanceTimersByTimeAsync(1100);
    expect(await ready).toBe(false);
    expect(engine.state('de_DE-thorsten-medium').kind).toBe('loading');
  });
});

/** Web Audio zum Mitschreiben: Quellen, Startzeiten, Stopps. */
function fakeContext(sampleRate = 48000) {
  const started: { at: number; length: number; rate: number }[] = [];
  const sources: { onended: (() => void) | null; stopped: boolean }[] = [];
  const ctx = {
    currentTime: 1,
    sampleRate,
    createBuffer: (_channels: number, length: number, rate: number) =>
      ({
        length,
        sampleRate: rate,
        duration: length / rate,
        copyToChannel: () => {},
        getChannelData: () => new Float32Array(length),
      }) as unknown as AudioBuffer,
    createBufferSource: () => {
      const source = {
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        stopped: false,
        connect: () => {},
        disconnect: () => {},
        start: (at: number) => {
          started.push({ at, length: source.buffer?.length ?? 0, rate: source.playbackRate.value });
        },
        stop: () => {
          source.stopped = true;
        },
      };
      sources.push(source);
      return source as unknown as AudioBufferSourceNode;
    },
  };
  return { ctx, started, sources };
}

describe('Wiedergabe der Sätze', () => {
  it('hängt Sätze aneinander, rechnet kleine Abtastraten um und meldet das Ende genau einmal', () => {
    const { ctx, started, sources } = fakeContext();
    const onFinish = vi.fn();
    const playback = new SpeechPlayback(ctx, {} as AudioNode, 0.9, onFinish);
    playback.add(new Float32Array(22050), 22050);
    playback.add(new Float32Array(16000), 16000);
    expect(started[0].at).toBeCloseTo(1.03);
    expect(started[0].rate).toBe(0.9);
    // 16 kHz wird auf die Rate des Kontexts gebracht.
    expect(started[1].length).toBe(48000);
    expect(started[1].at).toBeCloseTo(1.03 + 1 / 0.9 + 0.12);
    sources[0].onended?.();
    expect(onFinish).not.toHaveBeenCalled();
    playback.end();
    expect(onFinish).not.toHaveBeenCalled();
    sources[1].onended?.();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(playback.endsAt).toBeGreaterThan(2);
  });

  it('ohne Sätze ist das Ende sofort da, nach stop kommt nichts mehr', () => {
    const { ctx, sources } = fakeContext();
    const empty = vi.fn();
    new SpeechPlayback(ctx, {} as AudioNode, 1, empty).end();
    expect(empty).toHaveBeenCalledTimes(1);
    const onFinish = vi.fn();
    const playback = new SpeechPlayback(ctx, {} as AudioNode, 1, onFinish);
    playback.add(new Float32Array(100), 22050);
    playback.stop();
    expect(sources[0].stopped).toBe(true);
    playback.end();
    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe('Phonemizer-Daten (vendor/)', () => {
  it('Lader und Datenpaket passen zusammen und enthalten Deutsch', () => {
    const dir = new URL('./vendor/', import.meta.url);
    const js = readFileSync(new URL('piper_phonemize.js', dir), 'utf8');
    const match = js.match(/loadPackage\((\{"files":\[.*?\],"remote_package_size":\d+\})\)/s);
    expect(match).not.toBeNull();
    const meta = JSON.parse(match?.[1] ?? '{}') as { files: { filename: string; start: number; end: number }[]; remote_package_size: number };
    expect(meta.remote_package_size).toBe(statSync(new URL('piper_phonemize.data', dir)).size);
    const names = meta.files.map((f) => f.filename);
    for (const needed of ['/espeak-ng-data/de_dict', '/espeak-ng-data/phontab', '/espeak-ng-data/lang/gmw/de'])
      expect(names).toContain(needed);
    // Lückenlos und in Reihenfolge.
    let offset = 0;
    for (const file of meta.files) {
      expect(file.start).toBe(offset);
      offset = file.end;
    }
    expect(offset).toBe(meta.remote_package_size);
  });
});
