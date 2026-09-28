import { useEffect, useState } from 'preact/hooks';
import { RuntimeContext } from '../hooks';
import { NotificationBanner } from '../phone/Notification';
import { PhoneFrame } from '../phone/PhoneFrame';
import type { UiRuntime } from '../runtime';
import { DialogHost, PanelHost, PickBanner, Toasts } from './Hosts';
import { Hud } from './Hud';
import { MapControls } from './MapControls';
import { MapView } from './MapView';
import { Sidebar } from './Sidebar';

/** Oberste Komponente: Karte, HUD, Kartensteuerung, Seitenleiste, Panel, Handy, Dialoge und Toasts. */
export function App(props: { runtime: UiRuntime }) {
  const [, setVersion] = useState(0);
  useEffect(() => props.runtime.subscribe(() => setVersion((v) => v + 1)), [props.runtime]);
  const runtime = props.runtime;
  const hasGame = runtime.state !== null;
  const ui = runtime.ui;
  const classes = ['shell'];
  if (ui.phone.open) classes.push('has-phone');
  if (ui.panel) classes.push('has-panel');
  if (ui.sheetExpanded) classes.push('has-sheet');
  return (
    <RuntimeContext.Provider value={runtime}>
      <div class={classes.join(' ')}>
        <MapView />
        {hasGame && (
          <>
            <Hud />
            <MapControls />
            <Sidebar />
            <PanelHost />
            <PhoneFrame />
            <NotificationBanner />
          </>
        )}
        <PickBanner />
        <DialogHost />
        <Toasts />
      </div>
    </RuntimeContext.Provider>
  );
}
