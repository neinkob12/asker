// Der Worker für Piper: lädt den Phonemizer (espeak-ng als WebAssembly, auf Deutsch eingedampft in vendor/, siehe
// tools/trim-espeak-data.mjs) und die Sprachmodelle (ONNX Runtime Web), hält sie und spricht Texte Satz für Satz,
// abseits des Hauptthreads. Die Modelle liegen nach dem ersten Download im Cache des Browsers (Cache API), die
// WebAssembly-Dateien kommen mit dem Build (Vite-Assets). Nachrichten: protocol.ts.

import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import * as ort from 'onnxruntime-web/wasm';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { synthesizeSentences } from './synthesize';
import { type PiperConfig, parseConfig } from './text';
import phonemizerDataUrl from './vendor/piper_phonemize.data?url';
import phonemizerSource from './vendor/piper_phonemize.js?raw';
import phonemizerWasmUrl from './vendor/piper_phonemize.wasm?url';
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

/** Ohne neue Daten so lange (ms), dann gilt ein Download als hängengeblieben. */
const DOWNLOAD_IDLE_MS = 30_000;

/** Ein Download hat sich nicht mehr gerührt. */
class DownloadStalled extends Error {
  constructor() {
    super('Der Download hängt: Seit 30 Sekunden kommen keine Daten mehr.');
  }
}

/** Fehlertext auf Deutsch; Netzwerkfehler der Browser kommen sonst englisch und je nach Browser anders. */
function describe(error: unknown): string {
  if (error instanceof DownloadStalled) return error.message;
  const raw = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === 'AbortError') return new DownloadStalled().message;
  if (/failed to fetch|networkerror|load failed|network request failed|network error/i.test(raw))
    return 'Keine Verbindung: Das Sprachmodell konnte nicht geladen werden. Es wird später noch einmal versucht.';
  return raw;
}

/**
 * fetch mit Inaktivitäts-Timeout: Kommt DOWNLOAD_IDLE_MS lang nichts (weder die Antwort noch ein Stück davon), bricht
 * der Download ab. `touch()` nach jedem Stück verlängert die Frist, `done()` räumt den Timer auf.
 */
async function guardedFetch(
  url: string,
): Promise<{ response: Response; touch: () => void; done: () => void; stalled: () => boolean }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wasStalled = false;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      wasStalled = true;
      controller.abort();
    }, DOWNLOAD_IDLE_MS);
  };
  const done = () => clearTimeout(timer);
  touch();
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { response, touch, done, stalled: () => wasStalled };
  } catch (error) {
    done();
    throw wasStalled ? new DownloadStalled() : error;
  }
}

// -------------------------------------------------------------------------------------------
// Phonemizer (espeak-ng, Emscripten)

interface PhonemizerModule {
  callMain(args: string[]): number;
}

let phonemizerPromise: Promise<PhonemizerModule> | null = null;
let phonemizerOutput: string[] = [];

function loadPhonemizer(): Promise<PhonemizerModule> {
  if (phonemizerPromise) return phonemizerPromise;
  const task = (async () => {
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
  phonemizerPromise = task;
  // Eine Ablehnung (z.B. Datei nicht geladen) bleibt nicht für immer im Speicher: Der nächste Versuch beginnt neu.
  task.catch(() => {
    if (phonemizerPromise === task) phonemizerPromise = null;
  });
  return task;
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

async function dropCached(voice: VoiceFiles): Promise<void> {
  const cache = await openCache();
  try {
    await cache?.delete(voice.model);
    await cache?.delete(voice.config);
  } catch {
    // Dann bleibt es eben liegen.
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const cache = await openCache();
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) {
    try {
      return await hit.json();
    } catch {
      // Kaputter Eintrag (abgebrochenes Schreiben, Speicher geräumt): löschen und neu laden.
      await cache?.delete(url).catch(() => false);
    }
  }
  const { response, done } = await guardedFetch(url);
  try {
    if (!response.ok) throw new Error(`Konfiguration nicht geladen (${response.status}).`);
    const text = await response.text();
    const json = JSON.parse(text) as unknown;
    try {
      await cache?.put(url, new Response(text, { headers: { 'content-type': 'application/json' } }));
    } catch {
      // Kein Platz: dann eben beim nächsten Mal wieder laden.
    }
    return json;
  } catch (error) {
    throw error instanceof Error && error.name === 'AbortError' ? new DownloadStalled() : error;
  } finally {
    done();
  }
}

async function fetchModel(
  voice: VoiceFiles,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const cache = await openCache();
  const hit = await cache?.match(voice.model).catch(() => undefined);
  if (hit) {
    try {
      const data = await hit.arrayBuffer();
      onProgress(voice.bytes, voice.bytes);
      return data;
    } catch {
      await cache?.delete(voice.model).catch(() => false);
    }
  }
  const { response, touch, done, stalled } = await guardedFetch(voice.model);
  let blob: Blob;
  try {
    if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}).`);
    const total = Number(response.headers.get('content-length')) || voice.bytes;
    const reader = response.body?.getReader();
    if (!reader) {
      blob = await response.blob();
      onProgress(blob.size, blob.size);
    } else {
      const chunks: BlobPart[] = [];
      let loaded = 0;
      for (;;) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        touch();
        chunks.push(value);
        loaded += value.byteLength;
        onProgress(loaded, Math.max(total, loaded));
      }
      blob = new Blob(chunks);
    }
  } catch (error) {
    throw stalled() || (error instanceof Error && error.name === 'AbortError') ? new DownloadStalled() : error;
  } finally {
    done();
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

/**
 * Die ONNX-Laufzeit ließ sich nicht starten (z.B. ihre WebAssembly-Datei kam nicht): ONNX Runtime Web meldet das als
 * "no available backend found", auch bei jedem weiteren Versuch in diesem Worker. Ein kaputtes Modell klingt anders.
 */
function runtimeFailed(error: unknown): boolean {
  return /no available backend/i.test(error instanceof Error ? error.message : String(error));
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
    let stage: 'download' | 'init' = 'download';
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
      // Der Phonemizer (espeak) kommt mit der App, nicht mit dem Modell: Scheitert er (Netz), bleibt das Modell liegen.
      await loadPhonemizer();
      stage = 'init';
      const config = parseConfig(configRaw);
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
      // Das Modell ließ sich nicht starten: Vielleicht liegt ein beschädigter Eintrag im Cache. Löschen, damit der
      // nächste Versuch neu lädt, statt für immer an derselben Datei zu scheitern. Kam dagegen die ONNX-Laufzeit
      // selbst nicht hoch (ihre WebAssembly-Datei), liegt es nicht am Modell: Dann bleibt es im Cache.
      if (stage === 'init' && !runtimeFailed(error)) await dropCached(voice);
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
      // Nicht in der Reihe der Aufträge: Ein langer Download darf Sätze eines schon geladenen Modells nicht aufhalten.
      ensureLoaded(message.voice).then(
        () => {},
        () => {},
      );
      break;
    case 'synth':
      // Erst auf das Modell warten (außerhalb der Reihe), dann einreihen: Die Reihe hält nur Rechenarbeit.
      ensureLoaded(message.voice).then(
        () => enqueue(() => synth(message)),
        (error) => {
          cancelled.delete(message.id);
          post({ type: 'error', id: message.id, message: describe(error) });
        },
      );
      break;
    case 'remove':
      enqueue(() => remove(message.voice));
      break;
  }
};
