import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../core';
import { PiperEngine, type WorkerLike } from './piper/engine';
import { AudioService, busLevels } from './service';
import { AUDIO_SETTINGS_KEY, DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings } from './settings';
import { SOUND_IDS } from './synth';
import { type MusicMood, pickTrack, TRACKS, trackDuration } from './tracks';
import { Speaker } from './voice';

describe('Audio-Einstellungen', () => {
  it('werden pro Gerät gemerkt', () => {
    const storage = memoryStorage();
    expect(loadAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    saveAudioSettings(storage, { ...DEFAULT_AUDIO_SETTINGS, music: 0.2, muted: true });
    expect(loadAudioSettings(storage)).toMatchObject({ music: 0.2, muted: true });
  });

  it('verkraften kaputte oder fremde Werte', () => {
    expect(loadAudioSettings(memoryStorage({ [AUDIO_SETTINGS_KEY]: '{kaputt' }))).toEqual(DEFAULT_AUDIO_SETTINGS);
    const odd = loadAudioSettings(memoryStorage({ [AUDIO_SETTINGS_KEY]: '{"master":7,"sfx":-1,"muted":"ja"}' }));
    expect(odd.master).toBe(1);
    expect(odd.sfx).toBe(0);
    expect(odd.muted).toBe(false);
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });
});

describe('Musik-Playlist', () => {
  it('hat für jede Tageszeit Stücke, alle sinnvoll lang', () => {
    for (const mood of ['night', 'dawn', 'day', 'dusk'] as MusicMood[]) {
      expect(
        TRACKS.some((t) => t.moods.includes(mood)),
        mood,
      ).toBe(true);
    }
    for (const track of TRACKS) {
      expect(trackDuration(track), track.id).toBeGreaterThan(90);
      expect(trackDuration(track), track.id).toBeLessThan(300);
      expect(track.progression.length).toBeGreaterThan(0);
    }
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
  });

  it('wählt passend zur Stimmung und wiederholt nicht gleich', () => {
    let seed = 0.37;
    const random = () => {
      seed = (seed * 9301 + 0.49297) % 1;
      return seed;
    };
    const recent: string[] = [];
    for (let i = 0; i < 30; i++) {
      const track = pickTrack(TRACKS, 'night', recent, random);
      expect(track.moods).toContain('night');
      expect(track.id).not.toBe(recent[recent.length - 1]);
      recent.push(track.id);
      if (recent.length > 3) recent.shift();
    }
    expect(pickTrack(TRACKS, 'day', [], () => 0).moods).toContain('day');
  });
});

describe('Audio-Dienst', () => {
  it('bleibt vor der ersten Interaktion stumm und merkt sich Einstellungen', () => {
    const storage = memoryStorage();
    const service = new AudioService({ createContext: () => null });
    service.init(storage);
    expect(service.status).toBe('locked');
    // Vorher darf alles aufgerufen werden, es passiert nur nichts.
    for (const id of SOUND_IDS) service.play(id);
    service.setAmbience('rain', 0.5);
    service.setMood('day');
    expect(service.nowPlaying()).toBeNull();
    let changes = 0;
    service.subscribe(() => changes++);
    service.toggleMute();
    service.update({ music: 0.3 });
    expect(changes).toBe(2);
    expect(loadAudioSettings(storage)).toMatchObject({ muted: true, music: 0.3 });
    // Ohne Web Audio (z.B. alter Browser) meldet sich der Dienst als nicht unterstützt.
    service.unlock();
    expect(service.status).toBe('unsupported');
    expect(service.mood).toBe('day');
  });
});

describe('Stimmen und Gespräch', () => {
  it('im Gespräch sind Musik, Effekte und Geräusche aus, die Stimme bleibt', () => {
    const s = DEFAULT_AUDIO_SETTINGS;
    expect(busLevels(s, { speaking: false, inCall: false })).toMatchObject({
      master: s.master,
      music: s.music * 2.2,
      sfx: s.sfx,
      ambience: s.sfx,
    });
    expect(busLevels(s, { speaking: true, inCall: false }).music).toBeCloseTo(s.music * 2.2 * 0.3);
    const call = busLevels(s, { speaking: true, inCall: true });
    expect(call.music).toBe(0);
    expect(call.sfx).toBe(0);
    expect(call.ambience).toBe(0);
    expect(call.voice).toBeGreaterThan(0);
    expect(busLevels({ ...s, muted: true }, { speaking: false, inCall: false }).master).toBe(0);
    expect(busLevels({ ...s, sfx: 0.2 }, { speaking: false, inCall: false }).voice).toBe(0.6);
  });

  it('merkt sich das Gespräch und meldet es der Oberfläche', () => {
    const service = new AudioService({
      createContext: () => null,
      createEngine: () => null,
      speaker: new Speaker(null),
    });
    let changes = 0;
    service.subscribe(() => changes++);
    expect(service.inCall).toBe(false);
    service.setCall(true);
    service.setCall(true);
    expect(service.inCall).toBe(true);
    expect(changes).toBe(1);
    service.setCall(false);
    expect(changes).toBe(2);
    // Ohne Sprachmodell und ohne Sprachausgabe des Browsers spricht niemand.
    expect(service.canSpeakAtAll).toBe(false);
    expect(service.voiceEngine).toBe('none');
    expect(service.speak('Moin.', { feminine: false, pitch: 0.85, rate: 1 }, () => {})).toBeNull();
    expect(service.voiceModels).toEqual([]);
  });

  it('kennt den Stand der Sprachmodelle und lädt sie fürs Klingeln vor', () => {
    const sent: string[] = [];
    const worker: WorkerLike = {
      postMessage: (m) => {
        sent.push(m.type);
      },
      onmessage: null,
      onerror: null,
      terminate: () => {},
    };
    const service = new AudioService({
      createContext: () => null,
      createEngine: () => new PiperEngine({ createWorker: () => worker }),
      speaker: new Speaker(null),
    });
    service.init(memoryStorage());
    expect(service.canSpeakAtAll).toBe(true);
    expect(service.voiceEngine).toBe('model');
    expect(service.voiceModels.map((m) => m.voice.id)).toEqual(['de_DE-thorsten-medium', 'de_DE-kerstin-low']);
    expect(sent).toEqual(['status']);
    service.prepareVoice({ feminine: false, pitch: 0.7, rate: 0.9 });
    expect(sent).toEqual(['status', 'load']);
    expect(service.voiceState({ feminine: false, pitch: 0.7, rate: 0.9 })?.kind).toBe('loading');
    // Stimmen aus: nichts laden.
    service.update({ voices: false });
    service.prepareVoice({ feminine: true, pitch: 1.2, rate: 1 });
    expect(sent).toEqual(['status', 'load']);
    // Ohne laufenden Ton (kein AudioContext) kann das Modell nicht abspielen: Es bleibt still, aber ohne Fehler.
    service.update({ voices: true });
    expect(service.speak('Moin.', { feminine: false, pitch: 0.85, rate: 1 }, () => {})).toBeNull();
    service.stopSpeaking();
    worker.onmessage?.({ data: { type: 'loadError', voice: 'de_DE-thorsten-medium', message: 'kaputt' } });
    expect(service.voiceState({ feminine: false, pitch: 0.85, rate: 1 })).toEqual({ kind: 'error', message: 'kaputt' });
  });
});
