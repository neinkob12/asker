// Öffentliche Schnittstelle des Audio-Dienstes. Module nutzen ihn aus ihrem ui/-Ordner über src/ui:
//
//   import { audio, soundOnEvent } from '../../../ui';
//   audio.play('cash')                              Soundeffekt (siehe SOUND_IDS)
//   audio.playThrottled('cash', 400)                höchstens alle 400 ms
//   audio.setAmbience('rain', 0.7)                  Geräusch-Schleife (rain, storm, wind), 0 = aus
//   audio.registerSound('gangs.shot', { kind: 'file', url: 'audio/sfx/shot.ogg' })
//   soundOnEvent('sale.completed', 'cash', { throttleMs: 400 })   Sound an ein Spielereignis binden
//   audio.speak(text, contactVoice(contact), onEnd)  Satz mit der Stimme einer Figur (Anruf), null = geht gerade nicht
//   audio.prepareVoice(voice) / prepareSpeech(lines, voice)   Modell und Zeilen eines Anrufs vorab laden bzw. rechnen
//   audio.setCall(true)                              Gespräch läuft: alles außer der Stimme ist aus
//
// Stimmen: Sprachmodell Piper im Browser (piper/), die Sprachausgabe des Browsers nur als Notlösung.
// Musik, Lautstärke und Stummschalten regelt der Spieler (HUD, Einstellungen, Musik-App im Handy).

import { AudioService } from './service';

export type { PiperEngine, VoiceModelState } from './piper/engine';
export { formatMegabytes, PIPER_VOICES, type PiperVoice, type PiperVoiceId, piperVoiceFor } from './piper/voices';
export type {
  AudioStatus,
  CustomSound,
  LoopHandle,
  LoopParams,
  LoopVoice,
  NowPlaying,
  PlayOptions,
} from './service';
export { AudioService, busLevels } from './service';
export { type AudioSettings, DEFAULT_AUDIO_SETTINGS } from './settings';
export { type AmbienceId, SOUND_IDS, type SoundId } from './synth';
export { type MusicMood, TRACKS, type Track, trackDuration } from './tracks';
export { Speaker, type SpeechLike, speechMs } from './voice';

/** Der Audio-Dienst der laufenden Seite. */
export const audio = new AudioService();

export const MUSIC_MOOD_NAMES = {
  night: 'Nacht',
  dawn: 'Morgengrauen',
  day: 'Tag',
  dusk: 'Abend',
} as const;
