// Das Spiel-Handy: zentrale Bedienung für Chats, Bestellungen und Kontakte. Am Desktop als Fenster unten rechts,
// am Handy bildschirmfüllend. Hat das Handy neue Benachrichtigungen, beginnt es mit dem Sperrbildschirm (Uhr und
// gestapelte Meldungen), sonst mit dem Startbildschirm (Uhr, Widgets und ein Raster großer App-Icons aus der Registry).
// Apps ohne eigene Kopfleiste bekommen eine mit Zurück-Knopf.

import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { clock } from '../../core';
import { dayPhase } from '../../map/daylight';
import { Badge, ErrorBoundary, Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { type PhoneApp, phoneApps } from '../registry';
import type { PhoneNotification } from '../runtime';
import { Slot } from '../shell/Slot';
import { CONTACT_KIND_ICONS, chatList } from './messagesModel';
import { PhoneScreen } from './PhoneScreen';

const APP_COLORS = ['#ff4b4b', '#1cb0f6', '#58cc02', '#ffc800', '#a560f0', '#ff8a3d'];

function StatusBar(props: { time: number; dark?: boolean }) {
  return (
    <header class={`phone__status ${props.dark ? 'is-dark' : ''}`}>
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

function AppIcon(props: { app: PhoneApp; index: number; onOpen: () => void; badge: number }) {
  const { app } = props;
  const color = app.color ?? APP_COLORS[props.index % APP_COLORS.length];
  return (
    <button type="button" class="phone__app" onClick={props.onOpen}>
      <span class="phone__icon" style={{ '--phone-app-color': color }} aria-hidden="true">
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
        {apps.map((a, i) => (
          <AppIcon
            key={a.id}
            app={a}
            index={i}
            badge={a.badge?.(state) ?? 0}
            onOpen={() => runtime.api.openPhone(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

const STACK_SHOWN = 3;

/** Karten für den Sperrbildschirm: die Meldungen des Handys, sonst die Chats mit ungelesenen Nachrichten. */
function lockCards(state: import('../../core').GameState, notifications: PhoneNotification[]): PhoneNotification[] {
  if (notifications.length > 0) return notifications;
  return chatList(state)
    .filter((c) => c.unread > 0 || c.awaitingAnswer)
    .map((c, i) => ({
      id: -1 - i,
      title: c.name,
      text: c.preview,
      icon: CONTACT_KIND_ICONS[c.kind],
      appId: 'core.messages',
      params: { contactId: c.contactId },
    }));
}

/** Sperrbildschirm: Uhr und die letzten Meldungen als Stapel (maximal drei, dann "+N weitere"). */
function LockScreen(props: { time: number; notifications: PhoneNotification[]; onUnlock: () => void }) {
  const { api } = useRuntime();
  const shown = props.notifications.slice(0, STACK_SHOWN);
  const rest = props.notifications.length - shown.length;
  return (
    <div class="phone__lock">
      <div class="phone__lock-clock">
        <div class="phone__lock-time">{clock.formatTime(props.time)}</div>
        <div class="phone__lock-date">
          {clock.weekdayName(props.time)} · Tag {clock.day(props.time)}
        </div>
      </div>
      <ul class="phone__stack">
        {shown.map((n, i) => (
          <li key={n.id} style={{ '--i': i }}>
            <button
              type="button"
              class="phone-card"
              onClick={() => {
                props.onUnlock();
                api.openPhone(n.appId ?? null, n.params);
              }}
            >
              <IconChip icon={n.icon ?? 'bell'} color="green" size="md" />
              <span class="phone-card__text">
                <span class="phone-card__title">{n.title}</span>
                <span class="phone-card__body">{n.text}</span>
              </span>
            </button>
          </li>
        ))}
        {rest > 0 && <li class="phone__stack-more">+{rest} weitere</li>}
      </ul>
      <button type="button" class="phone__unlock" onClick={props.onUnlock}>
        <Icon name="chevronUp" />
        Entsperren
      </button>
    </div>
  );
}

export function PhoneFrame() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const [unlocked, setUnlocked] = useState(false);
  const open = ui.phone.open;
  useEffect(() => {
    if (!open) setUnlocked(false);
  }, [open]);
  if (!open || !state) return null;
  const app = ui.phone.app ? phoneApps.get(ui.phone.app) : undefined;
  const Component = app?.component as ComponentType | undefined;
  const cards = lockCards(state, ui.notifications);
  const locked = !unlocked && !app && cards.length > 0;
  return (
    <section class="phone" aria-label="Handy">
      <div class={`phone__device ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}>
        <StatusBar time={state.time} dark={locked} />
        <div class={`phone__screen ${locked ? 'is-lock' : ''}`}>
          <ErrorBoundary key={locked ? 'lock' : (ui.phone.app ?? 'home')} name={app?.name ?? 'Startbildschirm'}>
            {locked ? (
              <LockScreen time={state.time} notifications={cards} onUnlock={() => setUnlocked(true)} />
            ) : app && Component ? (
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
          </ErrorBoundary>
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
