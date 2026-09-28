import { useEffect, useRef } from 'preact/hooks';
import { GameMap } from '../../map/GameMap';
import { useRuntime } from '../hooks';

/** Vollflächige Karte. Wird einmal angelegt und bei jedem Neuzeichnen aktualisiert. */
export function MapView() {
  const runtime = useRuntime();
  const container = useRef<HTMLDivElement>(null);
  const gameMap = useRef<GameMap | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new GameMap(container.current, runtime.api, () => runtime.state);
    gameMap.current = map;
    runtime.map = map;
    return () => {
      runtime.map = null;
      map.map.remove();
    };
  }, [runtime]);

  const state = runtime.state;
  useEffect(() => {
    if (state && gameMap.current) gameMap.current.update(state, runtime.ui);
  });

  return <div ref={container} class="shell-map" />;
}
