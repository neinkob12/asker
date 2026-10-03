// Der Ablauf einer Synthese, unabhängig vom Worker (testbar): Text in Sätze, Satz zu Phonemen (espeak-ng), Phoneme zu
// IDs, IDs durchs Modell. Jeder fertige Satz wird sofort gemeldet, damit die Wiedergabe anfangen kann.

import { isSilent, type PiperConfig, phonemesToIds, repairPhonemes, splitSentences } from './text';

export interface SynthesisDeps {
  /** Text eines Satzes zu Phonemen (espeak-ng im WebAssembly). */
  phonemize(text: string, language: string): readonly string[];
  /** Ein Lauf des Modells: IDs und Skalen [noise, length, noiseW] zu Ton (Float32, Abtastrate des Modells). */
  run(ids: number[], scales: [number, number, number], speaker: number | null): Promise<Float32Array>;
}

export interface SynthesisParams {
  /** Dauer der Laute relativ zur Konfiguration des Modells (1 = wie trainiert). */
  lengthScale: number;
  noiseScale?: number;
  noiseW?: number;
  /** Sprecher bei Modellen mit mehreren Stimmen. */
  speaker?: number;
}

/**
 * Spricht einen Text Satz für Satz. onSentence bekommt jeden Satz, sobald er fertig ist. Gibt die Zahl der
 * gesprochenen Sätze zurück; bei Abbruch (isCancelled) endet der Lauf nach dem laufenden Satz.
 */
export async function synthesizeSentences(
  text: string,
  config: PiperConfig,
  params: SynthesisParams,
  deps: SynthesisDeps,
  onSentence: (pcm: Float32Array, index: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<number> {
  const scales: [number, number, number] = [
    params.noiseScale ?? config.noiseScale,
    params.lengthScale * config.lengthScale,
    params.noiseW ?? config.noiseW,
  ];
  const speaker = config.speakers > 1 ? (params.speaker ?? 0) : null;
  let count = 0;
  for (const sentence of splitSentences(text)) {
    if (isCancelled()) break;
    const phonemes = repairPhonemes(deps.phonemize(sentence, config.language));
    const ids = phonemesToIds(phonemes, config.phonemeIds);
    if (isSilent(ids)) continue;
    const pcm = await deps.run(ids, scales, speaker);
    if (isCancelled()) break;
    onSentence(pcm, count);
    count++;
  }
  return count;
}
