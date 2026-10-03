// Der Worker für Piper: lädt den Phonemizer (espeak-ng als WebAssembly, auf Deutsch eingedampft in vendor/, siehe
// tools/trim-espeak-data.mjs) und die Sprachmodelle (ONNX Runtime Web), hält sie und spricht Texte Satz für Satz,
// abseits des Hauptthreads. Die Modelle liegen nach dem ersten Download im Cache des Browsers (Cache API), die
// WebAssembly-Dateien kommen mit dem Build (Vite-Assets). Nachrichten: protocol.ts.

import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import * as ort from 'onnxruntime-web/wasm';
import phonemizerDataUrl from './vendor/piper_phonemize.data?url';
import phonemizerSource from './vendor/piper_phonemize.js?raw';
import phonemizerWasmUrl from './vendor/piper_phonemize.wasm?url';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { synthesizeSentences } from './synthesize';
import { type PiperConfig, parseConfig } from './text';
import type { PiperVoiceId, VoiceFiles } from './voices';

const scope = self as unknown as {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
const post = (message: WorkerResponse, transfer?: Transferable[]) => scope.postMessage(message, transfer);

/** Name des Caches im Browser (Einstellungen › Ton zeigt und löscht die Modelle). */
const CACHE_NAME = 'koeln-tycoon-stimmen-v1';
/** So viele Modelle bleiben gleichzeitig im Speicher (je gut 60 MB). */
const MAX_LOADED = 2;
/** Fortschritt höchstens so oft melden (ms). */
const PROGRESS_EVERY_MS = 120;

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };
ort.env.logLevel = 'error';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// -------------------------------------------------------------------------------------------
// Phonemizer (espeak-ng, Emscripten)

interface PhonemizerModule {
  callMain(args: string[]): number;
}

let phonemizerPromise: Promise<PhonemizerModule> | null = null;
let phonemizerOutput: string[] = [];

function loadPhonemizer(): Promise<PhonemizerModule> {
  phonemizerPromise ??= (async () => {
    // Die Emscripten-Datei ist ein klassisches Skript (kein ES-Modul): als Text mitgebaut und hier ausgeführt.
    const factory = new Function(`${phonemizerSource}\nreturn createPiperPhonemize;`)() as (
      options: Record<string, unknown>,
    ) => Promise<PhonemizerModule>;
    return factory({
      noInitialRun: true,
      print: (line: string) => {
        phonemizerOutput.push(line);
      },
      printErr: () => {},
      locateFile: (file: string) =>
        file.endsWith('.wasm') ? phonemizerWasmUrl : file.endsWith('.data') ? phonemizerDataUrl : file,
    });
  })();
  return phonemizerPromise;
}

/** Ein Satz zu Phonemen (IPA-Zeichen, eines pro Eintrag). */
function phonemize(module: PhonemizerModule, text: string, language: string): string[] {
  phonemizerOutput = [];
  module.callMain(['-l', language, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  const line = phonemizerOutput.find((l) => l.startsWith('{'));
  if (!line) return [];
  const parsed = JSON.parse(line) as { phonemes?: unknown };
  return Array.isArray(parsed.phonemes) ? parsed.phonemes.filter((p): p is string => typeof p === 'string') : [];
}

// -------------------------------------------------------------------------------------------
// Dateien: Cache des Browsers, sonst Download mit Fortschritt

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    // Privates Fenster oder unsicherer Ursprung: dann ohne Cache.
    return null;
  }
}

async function isCached(url: string): Promise<boolean> {
  const cache = await openCache();
  if (!cache) return false;
  try {
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const cache = await openCache();
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) return hit.json();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Konfiguration nicht geladen (${response.status}).`);
  const text = await response.text();
  try {
    await cache?.put(url, new Response(text, { headers: { 'content-type': 'application/json' } }));
  } catch {
    // Kein Platz: dann eben beim nächsten Mal wieder laden.
  }
  return JSON.parse(text);
}

async function fetchModel(
  voice: VoiceFiles,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const cache = await openCache();
  const hit = await cache?.match(voice.model).catch(() => undefined);
  if (hit) {
    onProgress(voice.bytes, voice.bytes);
    return hit.arrayBuffer();
  }
  const response = await fetch(voice.model);
  if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || voice.bytes;
  const reader = response.body?.getReader();
  let blob: Blob;
  if (!reader) {
    blob = await response.blob();
    onProgress(blob.size, blob.size);
  } else {
    const chunks: BlobPart[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, Math.max(total, loaded));
    }
    blob = new Blob(chunks);
  }
  try {
    await cache?.put(
      voice.model,
      new Response(blob, {
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) },
      }),
    );
  } catch {
    // Kein Platz im Cache: Das Modell läuft trotzdem, nur der nächste Start lädt es wieder.
  }
  return blob.arrayBuffer();
}

// -------------------------------------------------------------------------------------------
// Modelle

interface Loaded {
  session: ort.InferenceSession;
  config: PiperConfig;
  used: number;
}

const loaded = new Map<PiperVoiceId, Loaded>();
const loading = new Map<PiperVoiceId, Promise<Loaded>>();
let clock = 0;

async function evictFor(voiceId: PiperVoiceId): Promise<void> {
  while (loaded.size >= MAX_LOADED) {
    let oldest: [PiperVoiceId, Loaded] | null = null;
    for (const entry of loaded) if (entry[0] !== voiceId && (!oldest || entry[1].used < oldest[1].used)) oldest = entry;
    if (!oldest) return;
    loaded.delete(oldest[0]);
    await oldest[1].session.release();
  }
}

function ensureLoaded(voice: VoiceFiles): Promise<Loaded> {
  const have = loaded.get(voice.id);
  if (have) {
    have.used = ++clock;
    return Promise.resolve(have);
  }
  const pending = loading.get(voice.id);
  if (pending) return pending;
  const task = (async () => {
    try {
      let last = 0;
      const progress = (done: number, total: number) => {
        const now = Date.now();
        if (done < total && now - last < PROGRESS_EVERY_MS) return;
        last = now;
        post({ type: 'progress', voice: voice.id, phase: 'download', loaded: done, total });
      };
      const [configRaw, data] = await Promise.all([fetchJson(voice.config), fetchModel(voice, progress)]);
      post({ type: 'progress', voice: voice.id, phase: 'init', loaded: voice.bytes, total: voice.bytes });
      const config = parseConfig(configRaw);
      await loadPhonemizer();
      await evictFor(voice.id);
      const session = await ort.InferenceSession.create(data, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      const entry: Loaded = { session, config, used: ++clock };
      loaded.set(voice.id, entry);
      post({ type: 'loaded', voice: voice.id, sampleRate: config.sampleRate });
      return entry;
    } catch (error) {
      post({ type: 'loadError', voice: voice.id, message: describe(error) });
      throw error;
    } finally {
      loading.delete(voice.id);
    }
  })();
  loading.set(voice.id, task);
  return task;
}

async function run(
  session: ort.InferenceSession,
  ids: number[],
  scales: [number, number, number],
  speaker: number | null,
): Promise<Float32Array> {
  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor(
      'int64',
      BigInt64Array.from(ids, (id) => BigInt(id)),
      [1, ids.length],
    ),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from(scales), [3]),
  };
  if (speaker !== null) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(speaker)]), [1]);
  const result = await session.run(feeds);
  const output = result.output ?? result[session.outputNames[0]];
  const data = output.data;
  if (!(data instanceof Float32Array)) throw new Error('Das Modell liefert keinen Ton.');
  // Eigener Puffer, damit er ohne Kopie an den Hauptthread gehen kann.
  return data.byteOffset === 0 && data.buffer.byteLength === data.byteLength ? data : data.slice();
}

// -------------------------------------------------------------------------------------------
// Aufträge, einer nach dem anderen

const cancelled = new Set<number>();
let queue: Promise<void> = Promise.resolve();
const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task, task);
};

async function synth(request: Extract<WorkerRequest, { type: 'synth' }>): Promise<void> {
  const { id } = request;
  try {
    if (cancelled.has(id)) {
      post({ type: 'done', id, count: 0 });
      return;
    }
    const entry = await ensureLoaded(request.voice);
    const phonemizer = await loadPhonemizer();
    const count = await synthesizeSentences(
      request.text,
      entry.config,
      request.params,
      {
        phonemize: (text, language) => phonemize(phonemizer, text, language),
        run: (ids, scales, speaker) => run(entry.session, ids, scales, speaker),
      },
      (pcm, index) =>
        post({ type: 'sentence', id, index, sampleRate: entry.config.sampleRate, pcm }, [pcm.buffer as ArrayBuffer]),
      () => cancelled.has(id),
    );
    post({ type: 'done', id, count });
  } catch (error) {
    post({ type: 'error', id, message: describe(error) });
  } finally {
    cancelled.delete(id);
  }
}

async function status(voices: VoiceFiles[]): Promise<void> {
  const cached: Partial<Record<PiperVoiceId, boolean>> = {};
  for (const voice of voices) cached[voice.id] = loaded.has(voice.id) || (await isCached(voice.model));
  post({ type: 'status', cached, supported: typeof WebAssembly !== 'undefined' });
}

async function remove(voice: VoiceFiles): Promise<void> {
  const cache = await openCache();
  try {
    await cache?.delete(voice.model);
    await cache?.delete(voice.config);
  } catch {
    // Dann bleibt es eben liegen.
  }
  const entry = loaded.get(voice.id);
  if (entry) {
    loaded.delete(voice.id);
    await entry.session.release();
  }
  post({ type: 'removed', voice: voice.id });
}

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case 'cancel':
      for (const id of message.ids) cancelled.add(id);
      break;
    case 'status':
      void status(message.voices);
      break;
    case 'load':
      enqueue(() =>
        ensureLoaded(message.voice).then(
          () => {},
          () => {},
        ),
      );
      break;
    case 'synth':
      enqueue(() => synth(message));
      break;
    case 'remove':
      enqueue(() => remove(message.voice));
      break;
  }
};
