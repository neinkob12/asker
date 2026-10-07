import { useEffect, useState } from 'preact/hooks';
import { ErrorBoundary } from '../components';
import { RuntimeContext } from '../hooks';
import { NotificationBanner } from '../phone/Notification';
import { PhoneFrame } from '../phone/PhoneFrame';
import type { UiRuntime } from '../runtime';
import { TourHost } from '../tour/TourHost';
import { DialogHost, PickBanner } from './Hosts';
import { Hud } from './Hud';
import { useIsMobile } from './layout';
import { MapControls } from './MapControls';
import { MapView } from './MapView';
import { CoachHighlight } from './NextStep';
import { Palette } from './Palette';
import { Slot } from './Slot';

/**
 * Oberste Komponente: Karte, HUD, Kartensteuerung, Handy (mit allen Bereichen und Details), Suche, Dialoge.
 * Meldungen (ui.toast) erscheinen als Banner des Handys (phone/Notification.tsx), nicht über der Karte.
 */
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
            <div class="shell-map-overlays">
              <Slot name="map.overlay" />
            </div>
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
            {/* Tour (Auftrag 46a): über Handy, HUD und Suche, unter den Dialogen des Kerns (die sperren sie mit inert). */}
            <ErrorBoundary name="Tour" silent>
              <TourHost />
            </ErrorBoundary>
          </>
        )}
        <PickBanner />
        <ErrorBoundary name="Dialog">
          <DialogHost />
        </ErrorBoundary>
      </div>
    </RuntimeContext.Provider>
  );
}
