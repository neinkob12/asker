// Öffentliche Schnittstelle des Audio-Dienstes. Module nutzen ihn aus ihrem ui/-Ordner über src/ui:
//
//   import { audio, soundOnEvent } from '../../../ui';
//   audio.play('cash')                              Soundeffekt (siehe SOUND_IDS)
//   audio.playThrottled('cash', 400)                höchstens alle 400 ms
//   audio.setAmbience('rain', 0.7)                  Geräusch-Schleife (rain, storm, wind), 0 = aus
//   audio.registerSound('gangs.shot', { kind: 'file', url: 'audio/sfx/shot.ogg' })
//   soundOnEvent('sale.completed', 'cash', { throttleMs: 400 })   Sound an ein Spielereignis binden
//
// Musik, Lautstärke und Stummschalten regelt der Spieler (HUD, Einstellungen, Musik-App im Handy).

import { AudioService } from './service';

export type { AudioStatus, CustomSound, NowPlaying, PlayOptions } from './service';
export { AudioService } from './service';
export { type AudioSettings, DEFAULT_AUDIO_SETTINGS } from './settings';
export { type AmbienceId, SOUND_IDS, type SoundId } from './synth';
export { type MusicMood, TRACKS, type Track, trackDuration } from './tracks';

/** Der Audio-Dienst der laufenden Seite. */
export const audio = new AudioService();

export const MUSIC_MOOD_NAMES = {
  night: 'Nacht',
  dawn: 'Morgengrauen',
  day: 'Tag',
  dusk: 'Abend',
} as const;
