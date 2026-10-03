import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from './service';
import { Speaker, type SpeechLike, speechMs } from './voice';

/** Sprachausgabe zum Mitschreiben (in Node gibt es keine). */
function fakeSpeech() {
  const spoken: { text: string; pitch: number; rate: number; voice: string | null }[] = [];
  let current: { onend: (() => void) | null } | null = null;
  const speech: SpeechLike = {
    speak: (u) => {
      spoken.push({ text: u.text, pitch: u.pitch, rate: u.rate, voice: u.voice?.name ?? null });
      current = u as unknown as { onend: (() => void) | null };
    },
    cancel: () => {},
    getVoices: () =>
      [
        { name: 'Microsoft Katja', lang: 'de-DE', localService: true },
        { name: 'Microsoft Conrad', lang: 'de-DE', localService: true },
        { name: 'Samantha', lang: 'en-US', localService: true },
      ] as SpeechSynthesisVoice[],
  };
  return { speech, spoken, end: () => current?.onend?.() };
}

class FakeUtterance {
  text: string;
  pitch = 1;
  rate = 1;
  volume = 1;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Stimmen im Anruf', () => {
  it('wählt eine deutsche Stimme passend zum Geschlecht', () => {
    const { speech } = fakeSpeech();
    const speaker = new Speaker(speech);
    expect(speaker.pickVoice(true)?.name).toBe('Microsoft Katja');
    expect(speaker.pickVoice(false)?.name).toBe('Microsoft Conrad');
  });

  it('spricht mit Tonhöhe und Tempo der Figur und meldet das Ende genau einmal', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.useFakeTimers();
    const { speech, spoken, end } = fakeSpeech();
    const speaker = new Speaker(speech);
    const onEnd = vi.fn();
    speaker.speak('Moin.', { feminine: false, pitch: 0.7, rate: 0.88 }, 1, onEnd);
    expect(spoken).toEqual([{ text: 'Moin.', pitch: 0.7, rate: 0.88, voice: 'Microsoft Conrad' }]);
    end();
    vi.advanceTimersByTime(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('hat ein Sicherheitsnetz, wenn der Browser das Ende nicht meldet, und bricht still ab', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.useFakeTimers();
    const { speech } = fakeSpeech();
    const speaker = new Speaker(speech);
    const onEnd = vi.fn();
    speaker.speak('Ein etwas längerer Satz zum Testen.', { feminine: true, pitch: 1.1, rate: 1 }, 1, onEnd);
    vi.advanceTimersByTime(speechMs('Ein etwas längerer Satz zum Testen.') * 2 + 2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    const cancelled = vi.fn();
    const cancel = speaker.speak('Noch einer.', { feminine: true, pitch: 1.1, rate: 1 }, 1, cancelled);
    cancel();
    vi.advanceTimersByTime(60_000);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('spricht nicht, wenn Stimmen aus oder der Ton stumm ist', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const { speech, spoken } = fakeSpeech();
    const service = new AudioService({ createContext: () => null, speaker: new Speaker(speech) });
    const voice = { feminine: false, pitch: 1, rate: 1 };
    expect(service.speak('Eins.', voice, () => {})).not.toBeNull();
    service.update({ voices: false });
    expect(service.speak('Zwei.', voice, () => {})).toBeNull();
    service.update({ voices: true, muted: true });
    expect(service.speak('Drei.', voice, () => {})).toBeNull();
    expect(spoken.map((s) => s.text)).toEqual(['Eins.']);
    // Ohne Sprachausgabe im Browser (Node): nie.
    expect(new AudioService({ createContext: () => null, speaker: new Speaker(null) }).canSpeak).toBe(false);
  });
});
