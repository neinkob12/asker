// Nachrichten zwischen Hauptthread (engine.ts) und Worker (worker.ts). Ton kommt als Float32Array mit der
// Abtastrate des Modells, Satz für Satz, und wird ohne Kopie übergeben (Transferable).

import type { PiperVoiceId, VoiceFiles } from './voices';

export type LoadPhase = 'download' | 'init';

export interface SynthRequestParams {
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
}

export type WorkerRequest =
  /** Welche Modelle liegen schon im Cache? */
  | { type: 'status'; voices: VoiceFiles[] }
  /** Modell laden (Cache oder Download) und bereitstellen. */
  | { type: 'load'; voice: VoiceFiles }
  /** Text sprechen; Antworten: 'sentence' je Satz, dann 'done' oder 'error'. */
  | { type: 'synth'; id: number; voice: VoiceFiles; text: string; params: SynthRequestParams }
  /** Laufende Synthese abbrechen (noch nicht gemeldete Sätze fallen weg). */
  | { type: 'cancel'; ids: number[] }
  /** Modell aus dem Cache löschen und freigeben. */
  | { type: 'remove'; voice: VoiceFiles };

export type WorkerResponse =
  | { type: 'status'; cached: Partial<Record<PiperVoiceId, boolean>>; supported: boolean; reason?: string }
  | { type: 'progress'; voice: PiperVoiceId; phase: LoadPhase; loaded: number; total: number }
  | { type: 'loaded'; voice: PiperVoiceId; sampleRate: number }
  | { type: 'loadError'; voice: PiperVoiceId; message: string }
  | { type: 'sentence'; id: number; index: number; sampleRate: number; pcm: Float32Array }
  | { type: 'done'; id: number; count: number }
  | { type: 'error'; id: number; message: string }
  | { type: 'removed'; voice: PiperVoiceId };
