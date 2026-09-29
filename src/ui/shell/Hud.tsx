// HUD: schwebende Pillen über der Karte. Dauerhaft nur Geld, Heat (placement 'main'), Uhr mit Wetter und Tempo;
// Lager, Ruf, Köln-Fortschritt (placement 'more') im Popover hinter dem Mehr-Knopf. Dazu Warnungen ('alert'),
// die Alarm-Zentrale (Glocke) und das Spiel-Handy. Am Handy in zwei Reihen, mit Menü für Spielstände & Co.

import type { ComponentChildren } from 'preact';
import { messages, SPEEDS } from '../../core';
import { Badge, ErrorBoundary, Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { type HudItem, hudItems } from '../registry';
import { useAudio } from '../useAudio';
import { AlertCenter } from './AlertCenter';
import { hudPlacement, useIsMobile } from './layout';

const SPEED_ICONS: Record<number, string> = { 0: 'pause', 1: 'play', 2: 'speed', 4: 'speed3' };
const SPEED_LABELS: Record<number, string> = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' };

function Items(props: { items: HudItem[] }) {
  return (
    <>
      {props.items.map((item) => (
        <ErrorBoundary key={item.id} name={item.id} silent>
          <item.component />
        </ErrorBoundary>
      ))}
    </>
  );
}

/** Popover unter einem HUD-Knopf. Klick daneben oder Escape schließt. */
export function Popover(props: { id: string; children: ComponentChildren; align?: 'left' | 'right'; class?: string }) {
  const { ui, api } = useRuntime();
  if (ui.popover !== props.id) return null;
  return (
    <>
      <button type="button" class="hud-popover-scrim" aria-label="Schließen" onClick={() => api.setPopover(null)} />
      <div class={`hud-popover hud-popover--${props.align ?? 'left'} ${props.class ?? ''}`} role="dialog">
        {props.children}
      </div>
    </>
  );
}

function MoreButton(props: { items: HudItem[] }) {
  const { ui, api } = useRuntime();
  if (props.items.length === 0) return null;
  const open = ui.popover === 'more';
  return (
    <div class="hud-anchor">
      <button
        type="button"
        class={`hud-pill hud-more ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-label="Mehr Anzeigen: Lager, Ruf, Köln"
        title="Lager, Ruf, Köln-Fortschritt"
        onClick={() => api.setPopover(open ? null : 'more')}
      >
        {props.items
          .filter((i) => i.icon)
          .slice(0, 3)
          .map((i, n) => (
            <IconChip
              key={i.id}
              icon={i.icon ?? 'more'}
              size="xs"
              color={(['green', 'yellow', 'blue'] as const)[n % 3]}
            />
          ))}
        <Icon name="chevronDown" class="hud-more__chevron" />
      </button>
      <Popover id="more" class="hud-more__pop">
        <div class="hud-more__list">
          <Items items={props.items} />
        </div>
      </Popover>
    </div>
  );
}

function SpeedControl() {
  const { session, api } = useRuntime();
  const mobile = useIsMobile();
  const speed = session.loop.speed;
  if (mobile) {
    // Am Handy nur Pause und ein Knopf, der durch 1×, 2×, 4× schaltet.
    const running = SPEEDS.filter((x) => x > 0);
    const next = running[(running.indexOf(speed as (typeof running)[number]) + 1) % running.length];
    return (
      <fieldset class="hud-pill hud-speed" aria-label="Spielgeschwindigkeit">
        <button
          type="button"
          class={`hud-speed__btn is-pause ${speed === 0 ? 'is-active' : ''}`}
          aria-pressed={speed === 0}
          aria-label={speed === 0 ? 'Weiterspielen' : 'Pause'}
          onClick={() => api.togglePause()}
        >
          <Icon name={speed === 0 ? 'play' : 'pause'} />
        </button>
        <button
          type="button"
          class={`hud-speed__btn ${speed > 0 ? 'is-active' : ''}`}
          aria-label={`Tempo ${SPEED_LABELS[speed] ?? speed}, tippen für schneller`}
          onClick={() => api.setSpeed(speed === 0 ? 1 : next)}
        >
          <Icon name={SPEED_ICONS[speed === 0 ? 1 : speed] ?? 'speed'} />
          <span class="hud-speed__label is-visible">{SPEED_LABELS[speed === 0 ? 1 : speed]}</span>
        </button>
      </fieldset>
    );
  }
  return (
    <fieldset class="hud-pill hud-speed" aria-label="Spielgeschwindigkeit">
      {SPEEDS.map((s, i) => (
        <button
          key={s}
          type="button"
          class={`hud-speed__btn ${s === speed ? 'is-active' : ''} ${s === 0 ? 'is-pause' : ''}`}
          aria-pressed={s === speed}
          aria-label={s === 0 ? 'Pause' : `Tempo ${SPEED_LABELS[s] ?? s}`}
          title={`${s === 0 ? 'Pause (Leertaste)' : `Tempo ${SPEED_LABELS[s] ?? s}`}${s > 0 ? ` (Taste ${i})` : ''}`}
          onClick={() => api.setSpeed(s)}
        >
          <Icon name={SPEED_ICONS[s] ?? 'speed'} />
          {s > 0 && <span class="hud-speed__label">{SPEED_LABELS[s] ?? `${s}×`}</span>}
        </button>
      ))}
    </fieldset>
  );
}

function PhoneButton() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const unread = state ? messages.unreadCount(state) : 0;
  return (
    <button
      type="button"
      class={`hud-phone ${ui.phone.open ? 'is-active' : ''} ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}
      aria-label={unread > 0 ? `Handy, ${unread} ungelesen` : 'Handy'}
      aria-pressed={ui.phone.open}
      title="Handy (T)"
      onClick={() => (ui.phone.open ? api.closePhone() : api.openPhone())}
    >
      <Icon name="phone" />
      <span class="hud-phone__label">Handy</span>
      <Badge count={unread} />
    </button>
  );
}

function MenuButton() {
  const { ui, api } = useRuntime();
  const audio = useAudio();
  const open = ui.popover === 'menu';
  const muted = audio.settings.muted;
  const run = (fn: () => void) => () => {
    api.setPopover(null);
    fn();
  };
  return (
    <div class="hud-anchor">
      <button
        type="button"
        class={`hud-pill hud-icon-btn ${open ? 'is-open' : ''}`}
        aria-label="Menü"
        aria-expanded={open}
        onClick={() => api.setPopover(open ? null : 'menu')}
      >
        <Icon name="menu" />
      </button>
      <Popover id="menu" align="right" class="hud-menu">
        <button type="button" class="hud-menu__item" onClick={run(() => api.togglePalette(true))}>
          <IconChip icon="search" size="sm" color="blue" /> Suchen
        </button>
        <button type="button" class="hud-menu__item" onClick={run(() => api.openDialog('core.saves', {}))}>
          <IconChip icon="save" size="sm" color="yellow" /> Spielstände
        </button>
        <button type="button" class="hud-menu__item" onClick={run(() => api.openDialog('core.settings', {}))}>
          <IconChip icon="sliders" size="sm" color="paper" /> Einstellungen
        </button>
        <button type="button" class="hud-menu__item" onClick={() => audio.toggleMute()}>
          <IconChip icon={muted ? 'volumeOff' : 'volume'} size="sm" color={muted ? 'red' : 'green'} />
          {muted ? 'Ton an' : 'Ton aus'}
        </button>
      </Popover>
    </div>
  );
}

export function Hud() {
  const mobile = useIsMobile();
  const items = hudItems.list();
  const by = (p: string) => items.filter((i) => hudPlacement(i) === p);
  const main = by('main');
  const more = by('more');
  const time = by('time');
  const alerts = by('alert');
  const clock = (
    <div class="hud-pill hud-time">
      <Items items={time} />
    </div>
  );
  if (mobile) {
    return (
      <header class="hud hud--mobile">
        <div class="hud__row">
          <div class="hud__group hud__group--main">
            <Items items={main} />
            <MoreButton items={more} />
          </div>
          <div class="hud__group">
            <PhoneButton />
          </div>
        </div>
        <div class="hud__row">
          {clock}
          <SpeedControl />
          <AlertCenter />
          <MenuButton />
        </div>
        {alerts.length > 0 && (
          <div class="hud__alerts">
            <Items items={alerts} />
          </div>
        )}
      </header>
    );
  }
  return (
    <header class="hud hud--desktop">
      <div class="hud__group hud__group--main">
        <Items items={main} />
        <MoreButton items={more} />
        <Items items={alerts} />
      </div>
      <div class="hud__group hud__group--right">
        {clock}
        <SpeedControl />
        <AlertCenter />
        <PhoneButton />
        <MenuButton />
      </div>
    </header>
  );
}
