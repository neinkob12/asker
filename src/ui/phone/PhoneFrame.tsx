// Das Spiel-Handy ist die Schaltzentrale: Alle Bereiche der Module (Tabs) und die Handy-Apps laufen hier, dazu
// die Details von Spots, Veedeln und Personen (Panels). Am Desktop ist es rechts fest angedockt (weglegen klappt
// es an den Rand), am Handy füllt es den Bildschirm unter dem HUD. Look: iPhone (Pro) mit Dynamic Island.
// Statusleiste in drei Spalten (Uhrzeit links, Island Mitte, Empfang/WLAN/Akku rechts). Der Startbildschirm ist
// bewusst ruhig (Auftrag 26): schwarzer Hintergrund, sechs Apps im Raster, vier im Glas-Dock, kein Widget. Nur ein
// dringender Rat (Priorität ab 80, z.B. ein Chat mit Frist) erscheint als eine wegwischbare Zeile ganz oben.
// Liegt das Handy weg, schwebt die Island oben über der Karte.
//
// Navigation: Seiten liegen als Stapel übereinander (navModel.ts, PageStack.tsx): Startbildschirm, Wurzel einer App,
// darüber Abschnitte, Details und Unterseiten. Das Dock gibt es nur auf dem Startbildschirm (wie bei iOS). Apps sind
// Vollbild; zurück geht es über "‹ Titel der Vorseite" oben links, den Home-Balken unten oder Esc. Warum keine
// Tab-Leiste: docs/handy-design.md, Abschnitt 5.

import type { ComponentType } from 'preact';
import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clock, type GameState, messages } from '../../core';
import {
  Badge,
  ContextMenu,
  ErrorBoundary,
  Icon,
  IconChip,
  type MenuAction,
  NotificationCenter,
  type NotificationItem,
  PortalHostContext,
  SwipeRow,
} from '../components';
import { sectionTitle } from '../components/section';
import { shallowEqual, useRuntime, useRuntimeSelector } from '../hooks';
import { hasOverlay } from '../overlays';
import {
  type Advice,
  dialogLocksPhone,
  type PhoneApp,
  panels,
  phoneApps,
  type SidebarTab,
  sidebarTabs,
  slotContributions,
} from '../registry';
import { TAB_APP_PREFIX, type UiApi, type UiState } from '../runtime';
import { tabIcon, tabTint, useIsMobile, useIsPhoneDevice } from '../shell/layout';
import { collectAdvice } from '../shell/NextStep';
import { Slot } from '../shell/Slot';
import { SectionContent, TabContent } from '../shell/TabContent';
import { stateRevision } from '../stateMemo';
import { CallScreen } from './CallScreen';
import { DynamicIsland } from './DynamicIsland';
import { startDrag } from './drag';
import {
  EDGE_ZONE,
  edgeSwipeCommits,
  edgeSwipeProgress,
  FLING,
  homeSwipeCommits,
  homeSwipeOpenness,
  rubberBand,
} from './gestureModel';
import { chatList } from './messagesModel';
import { PhoneNotice } from './Notification';
import { type NavEntry, top as topEntry } from './navModel';
import { appIdOf, PageStack, type PageStackHandle } from './PageStack';
import { PhoneScreen } from './PhoneScreen';
import { bindPressFeedback } from './press';
import { tileColor } from './tile';

/** Apps im Dock unten auf dem Startbildschirm: Nachrichten, Lieferanten, Personal, Kasse (sofern vorhanden). */
const DOCK = ['core.messages', 'suppliers.app', `${TAB_APP_PREFIX}staff`, 'finance.app'];

/** Reihenfolge der Apps im Raster: Kasse, Reviere, Gangs, Personal, Geldwäsche, Einstellungen. Unbekannte hinten. */
const HOME_ORDER = [
  'finance.app',
  `${TAB_APP_PREFIX}territory`,
  `${TAB_APP_PREFIX}gangs`,
  `${TAB_APP_PREFIX}staff`,
  'laundering.app',
  'core.settings',
];

/** Ab dieser Priorität steht ein Rat als Zeile oben auf dem Startbildschirm (z.B. Chat mit Frist, Ware alle). */
export const URGENT_ADVICE = 80;

/** Eine Kachel auf dem Startbildschirm: Tab eines Moduls oder Handy-App. */
interface HomeApp {
  id: string;
  name: string;
  icon: string;
  color: string;
  badge: number;
  /** Steht gerade im Dock statt dieser App (PhoneApp.dock). */
  replaces?: string;
}

/** Zahl am Symbol: Wirft das Modul beim Zählen, bleibt es bei 0, statt den ganzen Startbildschirm abzuräumen. */
function badgeOf(read: () => number | undefined): number {
  try {
    return read() ?? 0;
  } catch (error) {
    console.error('Zähler einer App', error);
    return 0;
  }
}

function homeApps(state: GameState, ui: UiState): HomeApp[] {
  const tabs = sidebarTabs
    .list()
    .filter((t) => !t.hidden && !t.hiddenWhen?.(state))
    .map(
      (t): HomeApp => ({
        id: `${TAB_APP_PREFIX}${t.id}`,
        name: t.title,
        icon: tabIcon(t),
        color: tabTint(t),
        badge: badgeOf(() => t.badge?.(state)),
      }),
    );
  const apps = phoneApps
    .list()
    .filter((a) => !a.hidden && !a.hiddenWhen?.(state) && (!a.dock || a.dock.when(state)))
    .map(
      (a): HomeApp => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color ?? 'system',
        badge: badgeOf(() => a.badge?.(state, ui)),
        ...(a.dock ? { replaces: a.dock.replaces } : {}),
      }),
    );
  return [...tabs, ...apps];
}

/**
 * Oben auf einem echten Handy: keine zweite Statusleiste (die echte ist ja da), nur die Live-Aktivitäten als
 * schwebende Pille mit der Spielzeit.
 */
function PillBar(props: { time: number }) {
  return (
    <header class="phone__status phone__status--pill">
      <DynamicIsland clock={clock.formatTime(props.time)} />
    </header>
  );
}

/**
 * Unten im Handy-Bildschirm (schmale Fenster und echte Handys): statt eines gezeichneten Home-Balkens, der unter
 * dem echten liegen würde, eine Leiste mit "Start" und "Weglegen" (am Startbildschirm nur "Weglegen"). Die erste
 * Taste verhält sich wie der Home-Balken am Desktop: tippen = Startbildschirm bzw. weglegen, hochwischen ebenso.
 */
function PhoneToolbar(props: { atHome: boolean; onHomeDown: (e: PointerEvent) => void }) {
  const { api } = useRuntime();
  return (
    <nav class="phone__toolbar" aria-label="Handy">
      {!props.atHome && (
        <button
          type="button"
          class="phone__tool phone__nav-button"
          onPointerDown={(e) => props.onHomeDown(e as unknown as PointerEvent)}
          onClick={() => api.openPhone(null)}
        >
          <Icon name="home" />
          <span>Start</span>
        </button>
      )}
      <button
        type="button"
        class={`phone__tool ${props.atHome ? 'phone__nav-button' : ''}`}
        onPointerDown={props.atHome ? (e) => props.onHomeDown(e as unknown as PointerEvent) : undefined}
        onClick={api.closePhone}
        title="Handy weglegen (T)"
      >
        <Icon name="chevronDown" />
        <span>Weglegen</span>
      </button>
    </nav>
  );
}

function StatusBar(props: { time: number }) {
  return (
    <header class="phone__status">
      <span class="phone__ear phone__ear--left">
        <time class="phone__time">{clock.formatTime(props.time)}</time>
      </span>
      <span class="phone__ear-gap" aria-hidden="true" />
      <span class="phone__ear phone__ear--right" aria-hidden="true">
        <Icon name="signal" class="phone__signal" />
        <Icon name="wifi" class="phone__wifi" />
        <Icon name="battery" class="phone__battery" />
      </span>
      <DynamicIsland />
    </header>
  );
}

/** Schnellaktionen einer App-Kachel (langer Druck): Öffnen, Abschnitte eines Listen-Tabs, offene Chats. */
function tileActions(app: HomeApp, api: UiApi, state: GameState): MenuAction[] {
  const actions: MenuAction[] = [{ label: 'Öffnen', icon: app.icon, onSelect: () => api.openPhone(app.id) }];
  if (app.id.startsWith(TAB_APP_PREFIX)) {
    const tab = sidebarTabs.get(app.id.slice(TAB_APP_PREFIX.length));
    if (tab?.layout === 'rows') {
      for (const item of slotContributions(`tab:${tab.id}`).slice(0, 4)) {
        const label = sectionTitle(item.id) ?? item.title;
        if (!label) continue;
        actions.push({
          label,
          onSelect: () => {
            api.selectTab(tab.id);
            api.openSection(item.id);
          },
        });
      }
    }
  }
  if (app.id === 'core.messages') {
    for (const chat of chatList(state)
      .filter((c) => c.awaitingAnswer)
      .slice(0, 3)) {
      actions.push({
        label: chat.name,
        icon: 'reply',
        onSelect: () => api.openPhone('core.messages', { contactId: chat.contactId }),
      });
    }
  }
  return actions;
}

/**
 * Kasse und Personal stehen im Raster und im Dock: Die App wächst aus der Kachel, die angetippt wurde (stackAnimator
 * sucht erst data-tapped, dann irgendeine passende).
 */
function markTapped(button: HTMLElement): void {
  for (const other of button.closest('.phone__home')?.querySelectorAll('[data-tapped]') ?? []) {
    other.removeAttribute('data-tapped');
  }
  button.setAttribute('data-tapped', '');
}

const sameTile = (a: { app: HomeApp; dock?: boolean }, b: { app: HomeApp; dock?: boolean }) =>
  a.dock === b.dock && shallowEqual(a.app, b.app);

/** Kachel: nur neu zeichnen, wenn sich ihre Anzeige ändert (onOpen hängt allein an der ID und bleibt gleich wirksam). */
const AppTile = memo(function AppTile(props: { app: HomeApp; onOpen: () => void; dock?: boolean }) {
  const { app } = props;
  const runtime = useRuntime();
  const tile = tileColor(app.color);
  return (
    <ContextMenu
      label={`Schnellaktionen ${app.name}`}
      // Den Zustand erst beim Öffnen holen: Die Kachel wird nicht bei jedem Schritt neu gezeichnet und kennt sonst einen
      // alten Stand (z.B. nach dem Laden eines anderen Spiels).
      actions={() => (runtime.state ? tileActions(app, runtime.api, runtime.state) : [])}
      preview={
        <span class="phone__app-preview">
          <IconChip icon={app.icon} color={tile.color} style={tile.style} shape="tile" solid size="xl" />
          <span>{app.name}</span>
        </span>
      }
    >
      <button
        type="button"
        class={`phone__app ${props.dock ? 'is-dock' : ''}`}
        data-app-id={app.id}
        data-tour={`phone.app.${app.id}`}
        onClick={(e) => {
          markTapped(e.currentTarget);
          props.onOpen();
        }}
        aria-label={app.badge > 0 ? `${app.name}, ${app.badge} neu` : app.name}
        title={app.name}
      >
        <IconChip
          icon={app.icon}
          color={tile.color}
          style={tile.style}
          shape="tile"
          solid
          size="xl"
          class="phone__tile"
        />
        {!props.dock && <span class="phone__app-name">{app.name}</span>}
        <Badge count={app.badge} />
      </button>
    </ContextMenu>
  );
}, sameTile);

/**
 * Welchen dringenden Rat der Spieler weggewischt hat (kommt erst wieder, wenn ein anderer kommt). Der Schlüssel enthält
 * den Titel: "core.answer" ist immer dieselbe ID, aber jede Frage (anderer Chat) ein anderer Rat.
 */
let dismissedAdvice: string | null = null;
const adviceKey = (advice: Advice) => `${advice.id}|${advice.title}`;

/**
 * Dringender Rat als eine Zeile ganz oben: Kachel, Titel, Knopf. Nach links wischen (oder ×) blendet ihn aus, bis ein
 * anderer dringender Rat kommt. Alles andere, was die Module empfehlen, steht in der Suche (Strg/⌘+K).
 */
function UrgentAdvice(props: { advice: Advice }) {
  const runtime = useRuntime();
  const { api } = runtime;
  const [, redraw] = useState(0);
  const { advice } = props;
  const dismiss = () => {
    dismissedAdvice = adviceKey(advice);
    redraw((n) => n + 1);
    // Den Startbildschirm zeichnet sonst erst der nächste Spielschritt neu (bei Pause bliebe die Zeile stehen).
    runtime.requestRender();
  };
  return (
    <SwipeRow actions={[{ label: 'Weg', icon: 'close', color: 'system', onSelect: dismiss }]} fullSwipe>
      <div class="phone__urgent" role="status">
        <button
          type="button"
          class="phone__urgent-main"
          onClick={() => (advice.action ? advice.action(api) : api.togglePalette(true))}
        >
          <IconChip icon={advice.icon} color="brand" solid size="md" shape="tile" />
          <span class="phone__urgent-text">
            <span class="phone__urgent-kicker">Dringend</span>
            <span class="phone__urgent-title">{advice.title}</span>
          </span>
          {advice.action && <span class="phone__urgent-action">{advice.actionLabel ?? 'Los'}</span>}
        </button>
        <button type="button" class="phone__urgent-close" onClick={dismiss} aria-label="Ausblenden">
          <Icon name="close" />
        </button>
      </div>
    </SwipeRow>
  );
}

/** Der dringende Rat für den Startbildschirm, sofern es einen gibt und er nicht weggewischt wurde. */
export function urgentAdvice(state: GameState): Advice | null {
  const top = collectAdvice(state)[0];
  if (!top || top.priority < URGENT_ADVICE) {
    // Nichts Dringendes mehr: Kehrt derselbe Rat später zurück, soll er wieder erscheinen.
    dismissedAdvice = null;
    return null;
  }
  return dismissedAdvice === adviceKey(top) ? null : top;
}

const sameApps = (a: HomeApp[], b: HomeApp[]) => a.length === b.length && a.every((app, i) => shallowEqual(app, b[i]));

/** Beiträge zu 'phone.home' lesen beliebig im Zustand: Sie ziehen bei jedem neuen Stand nach, der Rest des Bildschirms nicht. */
function HomeSlot() {
  useRuntimeSelector(() => stateRevision());
  return <Slot name="phone.home" />;
}

/**
 * Startbildschirm. Ohne Props und mit eigenen Auszügen (Kacheln samt Zählern, dringender Rat) gelesen: Er zeichnet nur
 * neu, wenn sich eine Kachel, ein Zähler oder der dringende Rat ändert, nicht bei jedem Simulationsschritt.
 */
const HomeScreen = memo(function HomeScreen() {
  const runtime = useRuntime();
  const all = useRuntimeSelector((rt) => (rt.state ? homeApps(rt.state, rt.ui) : []), sameApps);
  // Der Rat selbst (mit Knopf) wird hier gelesen, ausgelöst wird das Neuzeichnen über seinen Schlüssel (ID und Titel).
  useRuntimeSelector((rt) => {
    const advice = rt.state ? urgentAdvice(rt.state) : null;
    return advice ? adviceKey(advice) : null;
  });
  const state = runtime.state;
  if (!state) return null;
  // Eine App kann zeitweise eine andere im Dock ersetzen (PhoneApp.dock); die ersetzte rückt ins Raster.
  const dockIds = DOCK.map((id) => all.find((a) => a.replaces === id)?.id ?? id);
  const dock = dockIds.map((id) => all.find((a) => a.id === id)).filter((a): a is HomeApp => !!a);
  const rank = (a: HomeApp) => {
    const i = HOME_ORDER.indexOf(a.id);
    return i < 0 ? HOME_ORDER.length : i;
  };
  // Im Raster stehen die sechs Apps der Tabelle (Kasse und Personal auch im Dock); Nachrichten und Lieferanten nur im Dock.
  const grid = all
    .filter((a) => HOME_ORDER.includes(a.id) || !dockIds.includes(a.id))
    .sort((a, b) => rank(a) - rank(b));
  const urgent = urgentAdvice(state);
  return (
    <div class="phone__home" data-tour="phone.home">
      <div class="phone__home-scroll">
        {urgent && <UrgentAdvice key={urgent.id} advice={urgent} />}
        <div class="phone__widgets">
          <HomeSlot />
        </div>
        <div class="phone__apps">
          {grid.map((a) => (
            <AppTile key={a.id} app={a} onOpen={() => runtime.api.openPhone(a.id)} />
          ))}
        </div>
      </div>
      {dock.length > 0 && (
        <nav class="phone__dock" aria-label="Dock">
          {dock.map((a) => (
            <AppTile key={a.id} app={a} dock onOpen={() => runtime.api.openPhone(a.id)} />
          ))}
        </nav>
      )}
    </div>
  );
});

function TabScreen(props: { tab: SidebarTab }) {
  return (
    <PhoneScreen title={props.tab.title} class="phone-screen--tab">
      <TabContent tab={props.tab} />
    </PhoneScreen>
  );
}

/** Abschnitt eines Listen-Tabs als eigene Seite über der Übersicht. */
function SectionScreen(props: { entry: NavEntry }) {
  const tab = props.entry.params?.tab;
  return (
    <PhoneScreen title={props.entry.title} class="phone-screen--tab phone-screen--section">
      <SectionContent sectionId={props.entry.id} tabId={typeof tab === 'string' ? tab : undefined} />
    </PhoneScreen>
  );
}

/** Details (Panel) als Seite über der aktuellen App. Zurück schließt die Details. */
function PanelScreen(props: { entry: NavEntry }) {
  const runtime = useRuntime();
  const state = runtime.state;
  const definition = panels.get(props.entry.id as never);
  if (!definition || !state) return null;
  const panelProps = (props.entry.params ?? {}) as never;
  let title = props.entry.title;
  try {
    title = definition.title(panelProps, state);
  } catch (error) {
    console.error('Panel-Titel', error);
  }
  const Component = definition.component as ComponentType<unknown>;
  return (
    <PhoneScreen title={title} class="phone-screen--panel">
      <ErrorBoundary name={title}>
        <Component {...(panelProps as object)} />
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

/** Inhalt einer Seite im Stapel. */
function renderPage(entry: NavEntry) {
  switch (entry.kind) {
    case 'home':
      return <HomeScreen />;
    case 'tab': {
      const tab = sidebarTabs.get(entry.id);
      return tab ? <TabScreen tab={tab} /> : <MissingPage entry={entry} />;
    }
    case 'section':
      return <SectionScreen entry={entry} />;
    case 'panel':
      return <PanelScreen entry={entry} />;
    case 'app': {
      const app = phoneApps.get(entry.id);
      return app ? <AppScreen app={app} /> : <MissingPage entry={entry} />;
    }
  }
}

/** App oder Tab gibt es (nicht mehr), z.B. nach Hot Reload. */
function MissingPage(props: { entry: NavEntry }) {
  return (
    <PhoneScreen title={props.entry.title}>
      <p class="ui-hint">Diese Seite gibt es nicht mehr.</p>
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
      onClick={api.showPhone}
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
          <IconChip icon={top.icon} color="brand" solid size="md" shape="tile" />
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

/** Statusleiste: Herunterziehen in diesem Streifen öffnet die Mitteilungszentrale. */
const STATUS_PULL_ZONE = 44;

/**
 * Gesten des Bildschirms (Pointer Events, Maus und Touch gleich): Rand-Wischen zurück (Start höchstens 24 px vom
 * linken Rand, die Seite folgt dem Finger) und Hochwischen am Home-Balken (App schrumpft auf ihre Kachel, auf dem
 * Startbildschirm: Handy weglegen). Beides sind Abkürzungen für Zurück-Knopf, Home-Balken und Esc.
 */
function usePhoneGestures(screen: { current: HTMLDivElement | null }, stack: { current: PageStackHandle | null }) {
  const runtime = useRuntime();
  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    const unbindPress = bindPressFeedback(el);
    const onDown = (e: PointerEvent) => {
      const animator = stack.current?.animator;
      if (!animator || !e.isPrimary || e.button !== 0 || hasOverlay()) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const target = e.target as Element;
      if (target.closest('.phone__nav, .phone__toolbar, .phone-notice, .island-wrap')) return;
      // Statusleiste herunterziehen: Mitteilungszentrale (wie bei iOS von oben)
      if (y < STATUS_PULL_ZONE && !target.closest('input, textarea')) {
        startDrag(e, el, {
          axis: 'y',
          accept: (_dx, dy) => dy > 0,
          onMove: () => {},
          onEnd: ({ dy, vy }, cancelled) => {
            if (!cancelled && (dy > 40 || vy > FLING)) runtime.api.toggleNotificationCenter(true);
          },
        });
        return;
      }
      const pages = runtime.ui.phone.stack;
      if (x > EDGE_ZONE || pages.length < 2) return;
      const front = pages[pages.length - 1].key;
      const back = pages[pages.length - 2].key;
      if (e.pointerType === 'mouse') e.preventDefault();
      startDrag(e, el, {
        axis: 'x',
        accept: (dx) => dx > 0,
        onStart: () => animator.beginGesture('pop', front, back, null),
        onMove: ({ dx }) => animator.drag(edgeSwipeProgress(dx, rect.width)),
        onEnd: ({ dx, vx }, cancelled) => {
          const commit = !cancelled && edgeSwipeCommits(edgeSwipeProgress(dx, rect.width), vx);
          if (animator.endGesture(commit, (vx * 1000) / rect.width) && commit) runtime.api.back();
        },
      });
    };
    el.addEventListener('pointerdown', onDown, true);
    return () => {
      unbindPress();
      el.removeEventListener('pointerdown', onDown, true);
    };
  }, []);

  /** Home-Balken: hochwischen geht zum Startbildschirm, dort legt es das Handy weg. */
  return (e: PointerEvent) => {
    const el = screen.current;
    const animator = stack.current?.animator;
    if (!el || !animator || !e.isPrimary || e.button !== 0) return;
    const rect = el.getBoundingClientRect();
    const pages = runtime.ui.phone.stack;
    const atHome = pages.length <= 1;
    const device = el.closest<HTMLElement>('.phone');
    startDrag(e, e.currentTarget as HTMLElement, {
      axis: 'y',
      accept: (_dx, dy) => dy < 0,
      onStart: () =>
        atHome ? true : animator.beginGesture('close', pages[pages.length - 1].key, pages[0].key, appIdOf(pages)),
      onMove: ({ dy }) => {
        if (!atHome) animator.drag(homeSwipeOpenness(dy, rect.height));
        else if (device) device.style.transform = `translateY(${rubberBand(dy, rect.height)}px)`;
      },
      onEnd: ({ dy, vy }, cancelled) => {
        const commit = !cancelled && homeSwipeCommits(dy, rect.height, vy);
        if (atHome) {
          if (device) device.style.transform = '';
          if (commit) runtime.api.closePhone();
          return;
        }
        if (animator.endGesture(commit, (vy * 1000) / (rect.height * 0.6)) && commit) runtime.api.openPhone(null);
      },
    });
  };
}

/** Bildschirm des offenen Handys: Seitenstapel, Statusleiste, Banner, Home-Balken. */
/** Mitteilungszentrale: alle Benachrichtigungen, neueste zuerst (Banner oder Statusleiste herunterziehen). */
function Center(props: { state: GameState }) {
  const { ui, api } = useRuntime();
  const items: NotificationItem[] = ui.notifications.map((n) => {
    const tile = tileColor((n.appId ? phoneApps.get(n.appId)?.color : undefined) ?? 'chat');
    const item: NotificationItem = { id: n.id, title: n.title, text: n.text, color: tile.color, style: tile.style };
    if (n.icon) item.icon = n.icon;
    if (n.time !== undefined) item.time = clock.formatTime(n.time);
    return item;
  });
  return (
    <NotificationCenter
      open={ui.notificationCenter}
      items={items}
      heading={`${clock.weekdayName(props.state.time)}, Tag ${clock.day(props.state.time)}`}
      onClose={() => api.toggleNotificationCenter(false)}
      onClear={api.clearNotifications}
      onOpen={(item) => {
        const n = ui.notifications.find((x) => x.id === item.id);
        api.toggleNotificationCenter(false);
        if (n) api.openPhone(n.appId ?? null, n.params);
      }}
    />
  );
}

function PhoneScreenArea(props: { state: GameState; mobile: boolean; device: boolean }) {
  const { ui, api } = useRuntime();
  const inCall = messages.ringingCalls(props.state).length > 0 || ui.call !== null;
  const screen = useRef<HTMLDivElement>(null);
  const stack = useRef<PageStackHandle | null>(null);
  // Ziel für Überlagerungen (Blätter, Menüs): über den Seiten, unter Statusleiste und Home-Balken.
  const [overlays, setOverlays] = useState<HTMLDivElement | null>(null);
  const homeSwipe = usePhoneGestures(screen, stack);
  const atHome = topEntry(ui.phone.stack).kind === 'home';
  return (
    <div class={`phone__screen ${atHome ? 'is-home' : ''}`} ref={screen}>
      <PortalHostContext.Provider value={overlays}>
        <PageStack
          stack={ui.phone.stack}
          render={renderPage}
          handle={(handle) => {
            stack.current = handle;
          }}
        />
      </PortalHostContext.Provider>
      <div class="phone__overlays" ref={setOverlays} />
      <ErrorBoundary name="Anruf" silent>
        <CallScreen state={props.state} />
      </ErrorBoundary>
      <Center state={props.state} />
      {props.device ? <PillBar time={props.state.time} /> : <StatusBar time={props.state.time} />}
      {/* Wie beim iPhone: Während eines Anrufs keine Banner über dem Anrufer (sie bleiben in der Mitteilungszentrale). */}
      {!inCall && <PhoneNotice />}
      {props.mobile ? (
        <PhoneToolbar atHome={atHome} onHomeDown={homeSwipe} />
      ) : (
        <nav class="phone__nav">
          <button
            type="button"
            class="phone__nav-button"
            onPointerDown={homeSwipe}
            onClick={() => (atHome ? api.closePhone() : api.openPhone(null))}
            aria-label={atHome ? 'Handy weglegen' : 'Startbildschirm'}
            title={atHome ? 'Handy weglegen (T)' : 'Startbildschirm'}
          >
            <span class="phone__home-indicator" />
          </button>
        </nav>
      )}
    </div>
  );
}

export function PhoneFrame() {
  const runtime = useRuntime();
  const { ui } = runtime;
  const state = runtime.state;
  const mobile = useIsMobile();
  const device = useIsPhoneDevice();
  if (!state) return null;
  const unread = messages.unreadCount(state);
  // Eine Konfrontation über der Kartenfläche pausiert das Spiel: Das Handy ist dann abgedunkelt und gesperrt.
  const locked = dialogLocksPhone(ui.dialog?.id);
  if (!ui.phone.open) {
    return (
      <>
        <DynamicIsland floating />
        {mobile ? <MobileDock state={state} unread={unread} /> : <PhoneTab time={state.time} unread={unread} />}
      </>
    );
  }
  return (
    <section
      class={`phone ${device ? 'phone--device' : ''} ${locked ? 'is-locked' : ''}`}
      data-tour="phone"
      aria-label="Handy"
      inert={locked}
    >
      <div class={`phone__device ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}>
        <PhoneScreenArea state={state} mobile={mobile} device={device} />
      </div>
      {/* Weglegen am Desktop: neben dem Gerät, damit der Knopf nie über dem Inhalt liegt */}
      {!mobile && (
        <button
          type="button"
          class="phone__close"
          onClick={ui.phone.open ? runtime.api.closePhone : undefined}
          aria-label="Handy weglegen"
          title="Handy weglegen (T)"
        >
          <Icon name="chevronRight" />
        </button>
      )}
    </section>
  );
}
