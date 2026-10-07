import { useEffect, useRef } from 'preact/hooks';
import { GameMap } from '../../map/GameMap';
import { useRuntime } from '../hooks';

/**
 * Vollflächige Karte. Wird einmal angelegt und bei jedem Neuzeichnen aktualisiert (die Layer nur, wenn sich etwas
 * geändert hat, siehe GameMap.update).
 */
export function MapView() {
  const runtime = useRuntime();
  const container = useRef<HTMLDivElement>(null);
  const gameMap = useRef<GameMap | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new GameMap(container.current, runtime.api, () => runtime.state);
    gameMap.current = map;
    runtime.map = map;
    map.setSpeed(runtime.session.loop.speed);
    // Befehle und neue Spiele ändern den Zustand ohne neue Spielzeit: Die Karte soll das trotzdem merken.
    const unsubscribe = runtime.session.subscribe((change) => {
      if (change === 'dispatch' || change === 'sim') map.invalidate();
      if (change === 'speed' || change === 'sim') map.setSpeed(runtime.session.loop.speed);
    });
    return () => {
      unsubscribe();
      runtime.map = null;
      map.destroy();
    };
  }, [runtime]);

  const state = runtime.state;
  useEffect(() => {
    if (state && gameMap.current) gameMap.current.update(state, runtime.ui);
  });

  return <div ref={container} class="shell-map" data-tour="map" />;
}
