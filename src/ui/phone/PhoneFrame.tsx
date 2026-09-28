// Das Spiel-Handy: zentrale Bedienung für Chats, Bestellungen und Kontakte. Am Desktop seitlich eingeblendet,
// am Handy bildschirmfüllend. Startbildschirm mit Uhr, Widgets (Slot 'phone.home') und den App-Icons aus der
// Registry (registerPhoneApp). Apps ohne eigene Kopfleiste bekommen eine mit Zurück-Knopf.

import type { ComponentType } from 'preact';
import { clock } from '../../core';
import { dayPhase } from '../../map/daylight';
import { Badge, Icon } from '../components';
import { useRuntime } from '../hooks';
import { type PhoneApp, phoneApps } from '../registry';
import { Slot } from '../shell/Slot';
import { PhoneScreen } from './PhoneScreen';

function StatusBar(props: { time: number }) {
  return (
    <header class="phone__status">
      <span class="phone__status-time">{clock.formatTime(props.time)}</span>
      <span class="phone__island" aria-hidden="true" />
      <span class="phone__status-icons" aria-hidden="true">
        <Icon name="signal" />
        <Icon name="wifi" />
        <Icon name="battery" />
      </span>
    </header>
  );
}

function AppIcon(props: { app: PhoneApp; onOpen: () => void; badge: number }) {
  const { app } = props;
  return (
    <button type="button" class="phone__app" onClick={props.onOpen}>
      <span class="phone__icon" style={app.color ? { '--phone-app-color': app.color } : undefined} aria-hidden="true">
        <Icon name={app.icon} />
      </span>
      <span class="phone__app-name">{app.name}</span>
      <Badge count={props.badge} />
    </button>
  );
}

function HomeScreen() {
  const runtime = useRuntime();
  const state = runtime.state;
  if (!state) return null;
  const apps = phoneApps.list();
  const night = dayPhase(clock.minuteOfDay(state.time)) === 'night';
  return (
    <div class="phone__home">
      <div class="phone__clock">
        <div class="phone__clock-time">{clock.formatTime(state.time)}</div>
        <div class="phone__clock-date">
          <Icon name={night ? 'moon' : 'sun'} />
          {clock.weekdayName(state.time)} · Tag {clock.day(state.time)}
        </div>
      </div>
      <div class="phone__widgets">
        <Slot name="phone.home" />
      </div>
      <div class="phone__apps">
        {apps.map((a) => (
          <AppIcon key={a.id} app={a} badge={a.badge?.(state) ?? 0} onOpen={() => runtime.api.openPhone(a.id)} />
        ))}
      </div>
    </div>
  );
}

export function PhoneFrame() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  if (!ui.phone.open || !state) return null;
  const app = ui.phone.app ? phoneApps.get(ui.phone.app) : undefined;
  const Component = app?.component as ComponentType | undefined;
  return (
    <section class="phone" aria-label="Handy">
      <div class={`phone__device ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}>
        <StatusBar time={state.time} />
        <div class="phone__screen">
          {app && Component ? (
            app.chrome === 'none' ? (
              <Component />
            ) : (
              <PhoneScreen title={app.name}>
                <Component />
              </PhoneScreen>
            )
          ) : (
            <HomeScreen />
          )}
        </div>
        <nav class="phone__nav">
          <button
            type="button"
            class="phone__nav-button"
            onClick={() => (app ? api.openPhone(null) : api.closePhone())}
            aria-label={app ? 'Startbildschirm' : 'Handy weglegen'}
          >
            <span class="phone__home-indicator" />
          </button>
          <button type="button" class="phone__close" onClick={api.closePhone} aria-label="Handy weglegen">
            <Icon name="close" />
          </button>
        </nav>
      </div>
    </section>
  );
}
