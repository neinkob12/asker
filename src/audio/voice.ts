// Stimmen im Anruf: Die Figuren sprechen ihre Zeilen mit der Sprachausgabe des Browsers (Web Speech API, deutsche
// Stimme). Tonhöhe und Tempo kommen pro Figur aus dem Kern (contactVoice), damit Fiete tief und langsam klingt und
// Peter anders als ein Kunde. Gibt es keine Sprachausgabe (Tests, alte Browser) oder ist sie aus, läuft der Anruf mit
// Untertiteln im Tempo wie bisher.

import type { VoiceSpec } from '../core';

/**
 * Namen deutscher System-Stimmen, die weiblich bzw. männlich klingen (Windows, macOS, Android, Chrome). "male" nur
 * als eigenes Wort: Sonst steckt es in "Female" und schließt jede Frauenstimme mit diesem Namen aus.
 */
const FEMININE_VOICES =
  /(anna|katja|hedda|helena|petra|marlene|vicki|amala|seraphina|elke|female|frau|google deutsch$)/i;
const MASCULINE_VOICES = /(markus|stefan|conrad|yannick|hans|klaus|killian|florian|\bmale\b|mann|viktor|jonas|reed)/i;

export interface SpeechLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
}

/** Sprachausgabe des Browsers, falls vorhanden. */
function browserSpeech(): SpeechLike | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (typeof window.SpeechSynthesisUtterance !== 'function') return null;
  return window.speechSynthesis;
}

/** Geschätzte Sprechdauer in ms (Sicherheitsnetz, falls der Browser das Ende nicht meldet). */
export function speechMs(text: string, rate = 1): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round(((words * 60_000) / 165 + 600) / Math.max(0.5, rate));
}

export class Speaker {
  private voices: SpeechSynthesisVoice[] = [];
  private primed = false;
  private readonly speech: SpeechLike | null;

  constructor(speech: SpeechLike | null = browserSpeech()) {
    this.speech = speech;
    if (!speech) return;
    this.loadVoices();
    // Chrome lädt die Stimmen erst nach und meldet das.
    speech.addEventListener?.('voiceschanged', () => this.loadVoices());
  }

  /** Kann dieser Browser sprechen? */
  get available(): boolean {
    return this.speech !== null;
  }

  private loadVoices(): void {
    try {
      this.voices = (this.speech?.getVoices() ?? []).filter((v) => v.lang.toLowerCase().startsWith('de'));
    } catch {
      this.voices = [];
    }
  }

  /** Beste deutsche Stimme fürs Geschlecht; ohne passende die erste deutsche (Tonhöhe macht den Rest). */
  pickVoice(feminine: boolean): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) this.loadVoices();
    const wanted = feminine ? FEMININE_VOICES : MASCULINE_VOICES;
    const other = feminine ? MASCULINE_VOICES : FEMININE_VOICES;
    const local = (v: SpeechSynthesisVoice) => (v.localService ? 0 : 1);
    const sorted = [...this.voices].sort((a, b) => local(a) - local(b));
    return (
      sorted.find((v) => wanted.test(v.name) && !other.test(v.name)) ??
      sorted.find((v) => !other.test(v.name)) ??
      sorted[0] ??
      null
    );
  }

  /**
   * Text sprechen. onEnd kommt genau einmal: wenn der Satz zu Ende ist, abgebrochen wurde oder (Sicherheitsnetz) nach
   * der geschätzten Dauer. Gibt eine Funktion zum Abbrechen zurück (ruft onEnd dann nicht mehr).
   */
  speak(text: string, voice: VoiceSpec, volume: number, onEnd: () => void): () => void {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      onEnd();
    };
    const safety = setTimeout(finish, speechMs(text, voice.rate) * 2 + 1500);
    const speech = this.speech;
    if (!speech) {
      clearTimeout(safety);
      finished = true;
      return () => {};
    }
    try {
      speech.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      const chosen = this.pickVoice(voice.feminine);
      if (chosen) utterance.voice = chosen;
      utterance.pitch = Math.min(2, Math.max(0, voice.pitch));
      utterance.rate = Math.min(2, Math.max(0.5, voice.rate));
      utterance.volume = Math.min(1, Math.max(0, volume));
      utterance.onend = finish;
      utterance.onerror = finish;
      speech.speak(utterance);
    } catch {
      finish();
    }
    return () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      try {
        speech.cancel();
      } catch {
        // Nichts zu tun.
      }
    };
  }

  /** Aus einem Tippen heraus aufrufen: Safari gibt die Sprachausgabe erst danach frei (stummer, leerer Satz). */
  prime(): void {
    const speech = this.speech;
    if (!speech || this.primed) return;
    this.primed = true;
    try {
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      speech.speak(utterance);
    } catch {
      // Dann eben nicht.
    }
  }

  /** Alles verstummen lassen (Auflegen). */
  stop(): void {
    try {
      this.speech?.cancel();
    } catch {
      // Nichts zu tun.
    }
  }
}
