// Zustand des Audio-Dienstes für Komponenten (neu zeichnen, wenn sich Einstellungen oder das Stück ändern).

import { useEffect, useState } from 'preact/hooks';
import { audio } from '../audio';

export function useAudio(): typeof audio {
  const [, setVersion] = useState(0);
  useEffect(() => audio.subscribe(() => setVersion((v) => v + 1)), []);
  return audio;
}
