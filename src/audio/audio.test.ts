import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../core';
import { AudioService } from './service';
import { AUDIO_SETTINGS_KEY, DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings } from './settings';
import { SOUND_IDS } from './synth';
import { type MusicMood, pickTrack, TRACKS, trackDuration } from './tracks';

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
