// Spiele mit three.js (3D) kommen erst beim Start aus einem eigenen Paket: So lädt das Spiel ohne three.js und braucht
// weniger Speicher, solange kein Minispiel läuft (Feedback 13.10.2026).

import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { MinigameViewProps } from '../registry';

/** Komponente, die das Spiel beim ersten Zeichnen nachlädt und bis dahin nichts zeigt. */
export function lazyView(load: () => Promise<ComponentType<MinigameViewProps>>): ComponentType<MinigameViewProps> {
  let loaded: ComponentType<MinigameViewProps> | null = null;
  return function LazyMinigameView(props: MinigameViewProps) {
    const [view, setView] = useState(() => loaded);
    useEffect(() => {
      if (view) return;
      let alive = true;
      load().then((component) => {
        loaded = component;
        if (alive) setView(() => component);
      });
      return () => {
        alive = false;
      };
    }, [view]);
    if (!view) return null;
    const View = view;
    return <View {...props} />;
  };
}
