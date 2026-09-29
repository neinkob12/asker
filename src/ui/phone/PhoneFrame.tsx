// Das Spiel-Handy ist die Schaltzentrale: Alle Bereiche der Module (Tabs) und die Handy-Apps laufen hier, dazu
// die Details von Spots, Veedeln und Personen (Panels). Am Desktop ist es rechts fest angedockt (weglegen klappt
// es an den Rand), am Handy füllt es den Bildschirm unter dem HUD. Look: iPhone (Pro) im Dunkelmodus mit
// Dynamic Island (Live-Aktivitäten der Module), Statusleiste nur mit Uhrzeit, Startbildschirm mit Widgets,
// App-Raster und Dock. Liegt das Handy weg, schwebt die Island oben über der Karte.

import type { ComponentType } from 'preact';
import { clock, type GameState, messages } from '../../core';
import { Badge, ErrorBoundary, Icon } from '../components';
import { useRuntime } from '../hooks';
import { hudItems, type PhoneApp, panels, phoneApps, type SidebarTab, sidebarTabs } from '../registry';
import { TAB_APP_PREFIX } from '../runtime';
import { HudItems } from '../shell/Hud';
import { hudPlacement, tabIcon, tabTint, useIsMobile } from '../shell/layout';
import { collectAdvice, NextStepWidget } from '../shell/NextStep';
import { Slot } from '../shell/Slot';
import { TabContent } from '../shell/TabContent';
import { DynamicIsland } from './DynamicIsland';
import { PhoneNotice } from './Notification';
import { PhoneScreen } from './PhoneScreen';

/** Apps im Dock unten auf dem Startbildschirm (sofern vorhanden). */
const DOCK = ['core.messages', `${TAB_APP_PREFIX}business`, 'suppliers.app', `${TAB_APP_PREFIX}staff`];

/** Eine Kachel auf dem Startbildschirm: Tab eines Moduls oder Handy-App. */
interface HomeApp {
  id: string;
  name: string;
  icon: string;
  color: string;
  badge: number;
}

function homeApps(state: GameState): HomeApp[] {
  const tabs = sidebarTabs.list().map(
    (t): HomeApp => ({
      id: `${TAB_APP_PREFIX}${t.id}`,
      name: t.title,
      icon: tabIcon(t),
      color: tabTint(t),
      badge: t.badge?.(state) ?? 0,
    }),
  );
  const apps = phoneApps.list().map(
    (a): HomeApp => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      color: a.color ?? 'var(--color-muted)',
      badge: a.badge?.(state) ?? 0,
    }),
  );
  return [...tabs, ...apps];
}

function StatusBar(props: { time: number }) {
  return (
    <header class="phone__status">
      <span class="phone__status-time">{clock.formatTime(props.time)}</span>
      <DynamicIsland />
      <span class="phone__status-icons" aria-hidden="true">
        <Icon name="signal" />
        <Icon name="wifi" />
        <Icon name="battery" />
      </span>
    </header>
  );
}

function AppIcon(props: { app: HomeApp; onOpen: () => void; label?: boolean }) {
  const { app } = props;
  return (
    <button type="button" class="phone__app" onClick={props.onOpen} aria-label={app.name} title={app.name}>
      <span class="phone__icon" style={{ '--phone-app-color': app.color }} aria-hidden="true">
        <Icon name={app.icon} />
      </span>
      {props.label !== false && <span class="phone__app-name">{app.name}</span>}
      <Badge count={app.badge} />
    </button>
  );
}

function HomeScreen() {
  const runtime = useRuntime();
  const state = runtime.state;
  if (!state) return null;
  const all = homeApps(state);
  const dock = DOCK.map((id) => all.find((a) => a.id === id)).filter((a): a is HomeApp => !!a);
  const grid = all.filter((a) => !dock.includes(a));
  const items = hudItems.list();
  const status = items.filter((i) => hudPlacement(i) === 'more');
  const time = items.filter((i) => hudPlacement(i) === 'time');
  const hasAdvice = collectAdvice(state).length > 0;
  return (
    <div class="phone__home">
      <div class="phone__today">
        <span class="phone__today-date">
          {clock.weekdayName(state.time)}, Tag {clock.day(state.time)}
        </span>
        <span class="phone__today-extra">
          <HudItems items={time} />
        </span>
      </div>
      {hasAdvice && <NextStepWidget />}
      {status.length > 0 && (
        <div class="phone__stats">
          <HudItems items={status} />
        </div>
      )}
      <div class="phone__widgets">
        <Slot name="phone.home" />
      </div>
      <div class="phone__apps">
        {grid.map((a) => (
          <AppIcon key={a.id} app={a} onOpen={() => runtime.api.openPhone(a.id)} />
        ))}
      </div>
      {dock.length > 0 && (
        <div class="phone__dock">
          {dock.map((a) => (
            <AppIcon key={a.id} app={a} label={false} onOpen={() => runtime.api.openPhone(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Bereich eines Moduls (Tab) als App-Seite. Zurück führt aus einem Abschnitt zur Übersicht, sonst nach Hause. */
function TabScreen(props: { tab: SidebarTab }) {
  const { ui, api } = useRuntime();
  return (
    <PhoneScreen
      title={props.tab.title}
      onBack={() => (ui.section ? api.openSection(null) : api.openPhone(null))}
      backLabel={ui.section ? props.tab.title : 'Start'}
      class="phone-screen--tab"
    >
      <TabContent tab={props.tab} />
    </PhoneScreen>
  );
}

/** Details (Panel) als Seite über der aktuellen App. Zurück schließt die Details. */
function PanelScreen() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  if (!ui.panel || !state) return null;
  const definition = panels.get(ui.panel.id);
  if (!definition) return null;
  const props = ui.panel.props as never;
  let title = 'Details';
  try {
    title = definition.title(props, state);
  } catch (error) {
    console.error('Panel-Titel', error);
  }
  const Component = definition.component as ComponentType<unknown>;
  return (
    <PhoneScreen title={title} onBack={api.closePanel} class="phone-screen--panel">
      <ErrorBoundary key={`${ui.panel.id}:${JSON.stringify(ui.panel.props)}`} name={title}>
        <Component {...(props as object)} />
      </ErrorBoundary>
    </PhoneScreen>
  );
}

function AppScreen(props: { app: PhoneApp }) {
  const Component = props.app.component as ComponentType;
  return props.app.chrome === 'none' ? (
    <Component />
  ) : (
    <PhoneScreen title={props.app.name}>
      <Component />
    </PhoneScreen>
  );
}

/** Weggelegtes Handy am Desktop: schmale Lasche am rechten Rand mit Uhrzeit und ungelesenen Nachrichten. */
function PhoneTab(props: { time: number; unread: number }) {
  const { api, ui } = useRuntime();
  return (
    <button
      type="button"
      class={`phone-tab ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}
      onClick={() => api.openPhone(ui.phone.app, ui.phone.params)}
      aria-label={props.unread > 0 ? `Handy, ${props.unread} ungelesen` : 'Handy'}
      title="Handy (T)"
    >
      <Icon name="phone" />
      <span class="phone-tab__time">{clock.formatTime(props.time)}</span>
      <Badge count={props.unread} />
    </button>
  );
}

/** Handy in der Tasche (Handy-Bildschirm): Leiste unten mit dem nächsten Schritt und dem Handy-Knopf. */
function MobileDock(props: { state: GameState; unread: number }) {
  const { api, ui } = useRuntime();
  const top = collectAdvice(props.state)[0];
  return (
    <nav class="mobile-dock" aria-label="Handy">
      {top ? (
        <button
          type="button"
          class="mobile-dock__hint"
          onClick={() => (top.action ? top.action(api) : api.openPhone())}
        >
          <Icon name={top.icon} />
          <span class="mobile-dock__text">
            <span class="mobile-dock__kicker">Nächster Schritt</span>
            <span class="mobile-dock__title">{top.title}</span>
          </span>
        </button>
      ) : (
        <span class="mobile-dock__hint mobile-dock__hint--idle">
          {clock.weekdayName(props.state.time)}, Tag {clock.day(props.state.time)}
        </span>
      )}
      <button
        type="button"
        class={`mobile-dock__phone ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}
        onClick={() => api.openPhone()}
        aria-label={props.unread > 0 ? `Handy, ${props.unread} ungelesen` : 'Handy'}
      >
        <Icon name="phone" />
        <span>{clock.formatTime(props.state.time)}</span>
        <Badge count={props.unread} />
      </button>
    </nav>
  );
}

export function PhoneFrame() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const mobile = useIsMobile();
  if (!state) return null;
  const unread = messages.unreadCount(state);
  if (!ui.phone.open) {
    return (
      <>
        <DynamicIsland floating />
        {mobile ? <MobileDock state={state} unread={unread} /> : <PhoneTab time={state.time} unread={unread} />}
      </>
    );
  }
  const appId = ui.phone.app;
  const tab = appId?.startsWith(TAB_APP_PREFIX) ? sidebarTabs.get(appId.slice(TAB_APP_PREFIX.length)) : undefined;
  const app = appId && !tab ? phoneApps.get(appId) : undefined;
  const screenKey = ui.panel ? `panel:${ui.panel.id}` : (appId ?? 'home');
  const atHome = !ui.panel && !tab && !app;
  return (
    <section class="phone" aria-label="Handy">
      <div class={`phone__device ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}>
        <StatusBar time={state.time} />
        <div class="phone__screen">
          <ErrorBoundary key={screenKey} name={app?.name ?? tab?.title ?? 'Startbildschirm'}>
            {ui.panel ? (
              <PanelScreen />
            ) : tab ? (
              <TabScreen tab={tab} />
            ) : app ? (
              <AppScreen app={app} />
            ) : (
              <HomeScreen />
            )}
          </ErrorBoundary>
          <PhoneNotice />
        </div>
        <nav class="phone__nav">
          <button
            type="button"
            class="phone__nav-button"
            onClick={() => (atHome ? api.closePhone() : api.openPhone(null))}
            aria-label={atHome ? 'Handy weglegen' : 'Startbildschirm'}
            title={atHome ? 'Handy weglegen (T)' : 'Startbildschirm'}
          >
            <span class="phone__home-indicator" />
          </button>
          <button
            type="button"
            class="phone__close"
            onClick={api.closePhone}
            aria-label="Handy weglegen"
            title="Handy weglegen (T)"
          >
            <Icon name={mobile ? 'close' : 'chevronRight'} />
          </button>
        </nav>
      </div>
    </section>
  );
}
