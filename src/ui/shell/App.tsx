import { useEffect, useState } from 'preact/hooks';
import { ErrorBoundary } from '../components';
import { RuntimeContext } from '../hooks';
import { NotificationBanner } from '../phone/Notification';
import { PhoneFrame } from '../phone/PhoneFrame';
import type { UiRuntime } from '../runtime';
import { DialogHost, PickBanner, Toasts } from './Hosts';
import { Hud } from './Hud';
import { useIsMobile } from './layout';
import { MapControls } from './MapControls';
import { MapView } from './MapView';
import { CoachHighlight } from './NextStep';
import { Palette } from './Palette';

/** Oberste Komponente: Karte, HUD, Kartensteuerung, Handy (mit allen Bereichen und Details), Suche, Dialoge, Toasts. */
export function App(props: { runtime: UiRuntime }) {
  const [, setVersion] = useState(0);
  useEffect(() => props.runtime.subscribe(() => setVersion((v) => v + 1)), [props.runtime]);
  const mobile = useIsMobile();
  const runtime = props.runtime;
  const hasGame = runtime.state !== null;
  const ui = runtime.ui;
  const classes = ['shell', mobile ? 'is-mobile' : 'is-desktop'];
  if (ui.phone.open) classes.push('has-phone');
  if (ui.notification) classes.push('has-notice');
  return (
    <RuntimeContext.Provider value={runtime}>
      <div class={classes.join(' ')}>
        <MapView />
        <div class="shell-vignette" aria-hidden="true" />
        {hasGame && (
          <>
            <ErrorBoundary name="HUD">
              <Hud />
            </ErrorBoundary>
            <ErrorBoundary name="Kartensteuerung" silent>
              <MapControls />
            </ErrorBoundary>
            <ErrorBoundary name="Handy">
              <PhoneFrame />
            </ErrorBoundary>
            <ErrorBoundary name="Benachrichtigung" silent>
              <NotificationBanner />
            </ErrorBoundary>
            <ErrorBoundary name="Hinweis" silent>
              <CoachHighlight />
            </ErrorBoundary>
            <ErrorBoundary name="Suche" silent>
              <Palette />
            </ErrorBoundary>
          </>
        )}
        <PickBanner />
        <ErrorBoundary name="Dialog">
          <DialogHost />
        </ErrorBoundary>
        <Toasts />
      </div>
    </RuntimeContext.Provider>
  );
}
