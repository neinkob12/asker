// Vom Text zu den Eingaben des Modells, ohne DOM: Sätze trennen (ein Satz = ein Lauf des Modells, so hört man den
// ersten, während der zweite rechnet), die Phoneme von espeak-ng reparieren, in IDs des Modells übersetzen und den
// fertigen Ton umrechnen, falls der Browser die Abtastrate nicht mag.

/** Konfiguration eines Piper-Modells (die .onnx.json neben dem Modell), nur die Felder, die hier gebraucht werden. */
export interface PiperConfig {
  sampleRate: number;
  /** Sprache für espeak-ng, z.B. "de". */
  language: string;
  noiseScale: number;
  lengthScale: number;
  noiseW: number;
  speakers: number;
  phonemeIds: Record<string, number[]>;
}

const DEFAULTS = { noiseScale: 0.667, lengthScale: 1, noiseW: 0.8 };

/** Konfiguration prüfen und auf das Nötige eindampfen. Wirft bei unbrauchbaren Daten. */
export function parseConfig(raw: unknown): PiperConfig {
  if (!raw || typeof raw !== 'object') throw new Error('Konfiguration des Sprachmodells fehlt.');
  const data = raw as {
    audio?: { sample_rate?: unknown };
    espeak?: { voice?: unknown };
    inference?: { noise_scale?: unknown; length_scale?: unknown; noise_w?: unknown };
    num_speakers?: unknown;
    phoneme_id_map?: unknown;
  };
  const sampleRate = data.audio?.sample_rate;
  if (typeof sampleRate !== 'number' || !(sampleRate >= 8000)) throw new Error('Abtastrate des Sprachmodells fehlt.');
  const map = data.phoneme_id_map;
  if (!map || typeof map !== 'object') throw new Error('Phonem-Tabelle des Sprachmodells fehlt.');
  const phonemeIds: Record<string, number[]> = {};
  for (const [phoneme, ids] of Object.entries(map as Record<string, unknown>)) {
    if (Array.isArray(ids) && ids.every((id) => typeof id === 'number')) phonemeIds[phoneme] = ids as number[];
  }
  for (const needed of ['_', '^', '$']) {
    if (!phonemeIds[needed]) throw new Error(`Phonem-Tabelle des Sprachmodells ohne "${needed}".`);
  }
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    sampleRate,
    language: typeof data.espeak?.voice === 'string' ? data.espeak.voice : 'de',
    noiseScale: num(data.inference?.noise_scale, DEFAULTS.noiseScale),
    lengthScale: num(data.inference?.length_scale, DEFAULTS.lengthScale),
    noiseW: num(data.inference?.noise_w, DEFAULTS.noiseW),
    speakers: Math.max(1, Math.round(num(data.num_speakers, 1))),
    phonemeIds,
  };
}

/** Emoji, Aufzählungszeichen und Mehrfach-Leerzeichen raus: Das Modell soll nur Sprache bekommen. */
export function cleanText(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, ' ')
    .replace(/^[ \t]*[–\-•*]+[ \t]+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();
}

/** Abkürzungen, nach deren Punkt kein neuer Satz beginnt. */
const ABBREVIATION =
  /(?:^|[\s(„"])(?:z\.\s?B|ca|Nr|St|bzw|usw|evtl|vgl|Dr|Hr|Fr|Str|Tel|Min|Std|Mio|Mrd|inkl|zzgl|ggf|u\.\s?a|d\.\s?h|sog|Jh)\.$/i;

/** Satzende: Punkt, Ausrufe-, Fragezeichen oder Auslassungspunkte (ggf. mit Anführungszeichen), dann Leerraum und Großbuchstabe, Ziffer oder Anführungszeichen. */
const SENTENCE_END = /(?<=[.!?…]["“”»)]?)\s+(?=["„«(]?[A-ZÄÖÜ0-9])/;

const SPEAKABLE = /[\p{L}\p{N}]/u;

/** Text in Sätze teilen. Leere Stücke und reine Satzzeichen ("…") fallen weg. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of cleanText(text).split('\n')) {
    let current = '';
    for (const part of line.split(SENTENCE_END)) {
      current = current ? `${current} ${part}` : part;
      if (ABBREVIATION.test(current)) continue;
      out.push(current);
      current = '';
    }
    if (current) out.push(current);
  }
  return out.map((s) => s.trim()).filter((s) => SPEAKABLE.test(s));
}

/**
 * espeak-ng (im WebAssembly-Build) hat für deutsches "ur" vor Konsonant keine IPA-Zeichen und schreibt zwei
 * Fragezeichen ("Hamburg" → "hˈamb??k"). Für das Modell wären das zwei Satzzeichen, also eine Pause mitten im Wort.
 * Hier wird daraus ʊɐ, wie in [bʊɐ̯k].
 */
export function repairPhonemes(phonemes: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < phonemes.length; i++) {
    const p = phonemes[i];
    if (p === '?' && phonemes[i + 1] === '?') {
      out.push('ʊ', 'ɐ');
      i++;
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Phoneme in die IDs des Modells übersetzen, wie Piper es tut: Satzanfang "^", dann jedes Phonem mit einer Pause "_"
 * dahinter, am Ende "$". Zeichen, die das Modell nicht kennt (z.B. ein kombinierendes Zeichen), fallen weg.
 */
export function phonemesToIds(phonemes: readonly string[], map: Record<string, number[]>): number[] {
  const pad = map._ ?? [0];
  const ids: number[] = [...(map['^'] ?? [1]), ...pad];
  for (const phoneme of phonemes) {
    const mapped = map[phoneme];
    if (!mapped) continue;
    ids.push(...mapped, ...pad);
  }
  ids.push(...(map.$ ?? [2]));
  return ids;
}

/** Nur Satzanfang, Pause und Ende: nichts zu sagen. */
export function isSilent(ids: readonly number[]): boolean {
  return ids.length <= 3;
}

/** Linear umrechnen (reicht für Sprache; der Browser filtert beim Abspielen noch einmal). */
export function resample(pcm: Float32Array, from: number, to: number): Float32Array {
  if (from === to || pcm.length === 0) return pcm;
  const ratio = from / to;
  const length = Math.max(1, Math.round(pcm.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = pcm[Math.min(index, pcm.length - 1)];
    const b = pcm[Math.min(index + 1, pcm.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Geschätzte Sprechdauer in Sekunden (für Zeitpläne, bevor der Ton da ist). */
export function estimateSeconds(text: string, lengthScale = 1): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return ((words * 60) / 160 + 0.4) * lengthScale;
}
