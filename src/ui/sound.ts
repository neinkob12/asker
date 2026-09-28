// Sounds an Spielereignisse binden. Nutzt onGameEvent, läuft also nach der Zustellung an die Module.

import { audio, type SoundId } from '../audio';
import type { EventType, GameEvents, GameState } from '../core';
import { onGameEvent } from './registry';

export interface SoundOnEventOptions<K extends EventType> {
  /** Nur abspielen, wenn das zutrifft (z.B. nur Einnahmen). */
  when?: (payload: GameEvents[K], state: GameState) => boolean;
  /** Höchstens einmal pro Zeitraum in ms (z.B. bei vielen Verkäufen hintereinander). */
  throttleMs?: number;
  volume?: number;
}

/**
 * Sound an ein Ereignis binden, z.B. soundOnEvent('sale.completed', 'cash', { throttleMs: 400 }).
 * Die Anmeldung heißt 'sound:<ereignis>:<sound>' und ersetzt eine gleiche frühere (Hot Reload).
 */
export function soundOnEvent<K extends EventType>(
  type: K,
  sound: SoundId | (string & {}),
  options: SoundOnEventOptions<K> = {},
): void {
  onGameEvent(type, `sound:${type}:${sound}`, (payload, _ui, state) => {
    if (options.when && !options.when(payload, state)) return;
    if (options.throttleMs) audio.playThrottled(sound, options.throttleMs, { volume: options.volume });
    else audio.play(sound, { volume: options.volume });
  });
}
