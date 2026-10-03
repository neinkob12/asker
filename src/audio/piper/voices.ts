// Sprachmodelle für den Anruf: Die Figuren sprechen mit Piper, einem neuronalen Modell, das im Browser läuft
// (ONNX Runtime Web und espeak-ng als Phonemizer, beides WebAssembly). Die Modelle kommen einmalig von Hugging Face
// (rhasspy/piper-voices) und bleiben im Cache des Browsers. Hier steht, welche Stimme eine Figur bekommt und wie
// Tonhöhe und Tempo aus dem Kern (VoiceSpec) auf das Modell übertragen werden. Reine Daten, kein DOM.

import type { VoiceSpec } from '../../core';

export type PiperVoiceId = 'de_DE-thorsten-medium' | 'de_DE-kerstin-low';

export interface PiperVoice {
  id: PiperVoiceId;
  /** Name der Stimme für die Einstellungen. */
  name: string;
  feminine: boolean;
  /** Pfad unter HF_BASE, ohne Dateiendung (.onnx und .onnx.json). */
  path: string;
  /** Größe des Modells in Byte (Anzeige, bevor der Download läuft). */
  bytes: number;
  /** Abtastrate laut Modell. */
  sampleRate: number;
}

/** Sprachmodelle von Piper, Stand v1.0.0. */
export const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/';

export const PIPER_VOICES: readonly PiperVoice[] = [
  {
    id: 'de_DE-thorsten-medium',
    name: 'Thorsten',
    feminine: false,
    path: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium',
    bytes: 63_201_294,
    sampleRate: 22050,
  },
  {
    id: 'de_DE-kerstin-low',
    name: 'Kerstin',
    feminine: true,
    path: 'de/de_DE/kerstin/low/de_DE-kerstin-low',
    bytes: 63_104_526,
    sampleRate: 16000,
  },
];

export function piperVoice(id: PiperVoiceId): PiperVoice {
  return PIPER_VOICES.find((v) => v.id === id) ?? PIPER_VOICES[0];
}

/** Dateien eines Modells (Modell und Konfiguration), so wie der Worker sie lädt. */
export interface VoiceFiles {
  id: PiperVoiceId;
  model: string;
  config: string;
  bytes: number;
}

export function voiceFiles(voice: PiperVoice): VoiceFiles {
  return {
    id: voice.id,
    model: `${HF_BASE}${voice.path}.onnx`,
    config: `${HF_BASE}${voice.path}.onnx.json`,
    bytes: voice.bytes,
  };
}

/** Welche Stimme eine Figur bekommt: eine Männer- und eine Frauenstimme, der Rest kommt aus Tonhöhe und Tempo. */
export function piperVoiceFor(spec: VoiceSpec): PiperVoice {
  return PIPER_VOICES.find((v) => v.feminine === spec.feminine) ?? PIPER_VOICES[0];
}

/** Was das Modell und die Wiedergabe aus der Stimme einer Figur machen. */
export interface PiperParams {
  /** Dauer der Laute (1 = wie trainiert, größer = langsamer). */
  lengthScale: number;
  /** Wiedergabe-Tempo des fertigen Tons: verschiebt die Tonhöhe (tiefer < 1 < höher). */
  playbackRate: number;
  noiseScale: number;
  noiseW: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Tonhöhe (0,5 tief bis 1,6 hoch, Mitte 0,85 für Männer und 1,15 für Frauen) wird eine leichte Verschiebung der
 * Wiedergabe: Fiete (0,7) klingt tiefer als Thorsten, ein junger Läufer etwas höher. Das Tempo der Figur (rate)
 * geht in die Dauer der Laute, so verrechnet, dass die Verschiebung der Wiedergabe das Tempo nicht mitzieht.
 */
export function piperParams(spec: VoiceSpec): PiperParams {
  const base = spec.feminine ? 1.15 : 0.85;
  const playbackRate = round(clamp(1 + (spec.pitch - base) * 0.45, 0.86, 1.14));
  const rate = clamp(spec.rate, 0.7, 1.3);
  const lengthScale = round(clamp(playbackRate / rate, 0.8, 1.35));
  return { lengthScale, playbackRate, noiseScale: 0.667, noiseW: 0.8 };
}

/** Größe für die Anzeige, z.B. "63 MB". */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}
