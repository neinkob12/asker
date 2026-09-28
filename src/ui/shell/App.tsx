import { useEffect, useState } from 'preact/hooks';
import { RuntimeContext } from '../hooks';
import { PhoneFrame } from '../phone/PhoneFrame';
import type { UiRuntime } from '../runtime';
import { DialogHost, PanelHost, PickBanner, Toasts } from './Hosts';
import { Hud } from './Hud';
import { MapView } from './MapView';
import { Sidebar } from './Sidebar';

/** Oberste Komponente: Karte, HUD, Seitenleiste, Panel, Handy, Dialoge und Toasts. */
export function App(props: { runtime: UiRuntime }) {
  const [, setVersion] = useState(0);
  useEffect(() => props.runtime.subscribe(() => setVersion((v) => v + 1)), [props.runtime]);
  const hasGame = props.runtime.state !== null;
  return (
    <RuntimeContext.Provider value={props.runtime}>
      <div class="shell">
        <MapView />
        {hasGame && (
          <>
            <Hud />
            <Sidebar />
            <PanelHost />
            <PhoneFrame />
          </>
        )}
        <PickBanner />
        <DialogHost />
        <Toasts />
      </div>
    </RuntimeContext.Provider>
  );
}
