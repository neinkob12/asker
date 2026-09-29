// HUD: eine schmale Leiste über der Karte. Links dauerhaft nur das Wichtigste (Geld, Heat: placement 'main') und
// Warnungen ('alert'), rechts das Spieltempo und das Menü. Alles andere (Lager, Ruf, Köln-Fortschritt, Uhrzeit,
// Wetter, Meldungen) steht im Spiel-Handy.

import type { ComponentChildren } from 'preact';
import { SPEEDS } from '../../core';
import { Badge, ErrorBoundary, Icon } from '../components';
import { useRuntime } from '../hooks';
import { type HudItem, hudItems } from '../registry';
import { useAudio } from '../useAudio';
import { hudPlacement, useIsMobile } from './layout';

const SPEED_ICONS: Record<number, string> = { 0: 'pause', 1: 'play', 2: 'speed', 4: 'speed3' };
const SPEED_LABELS: Record<number, string> = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' };

export function HudItems(props: { items: HudItem[] }) {
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

function SpeedControl() {
  const { session, api } = useRuntime();
  const mobile = useIsMobile();
  const speed = session.loop.speed;
  if (mobile) {
    // Am Handy nur Pause und ein Knopf, der durch 1×, 2×, 4× schaltet.
    const running = SPEEDS.filter((x) => x > 0);
    const next = running[(running.indexOf(speed as (typeof running)[number]) + 1) % running.length];
    return (
      <fieldset class="hud-speed" aria-label="Spielgeschwindigkeit">
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
          <span class="hud-speed__label">{SPEED_LABELS[speed === 0 ? 1 : speed]}</span>
        </button>
      </fieldset>
    );
  }
  return (
    <fieldset class="hud-speed" aria-label="Spielgeschwindigkeit">
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
          {s === 0 ? <Icon name={SPEED_ICONS[s]} /> : <span class="hud-speed__label">{SPEED_LABELS[s]}</span>}
        </button>
      ))}
    </fieldset>
  );
}

function MenuButton() {
  const { ui, api } = useRuntime();
  const audio = useAudio();
  const open = ui.popover === 'menu';
  const muted = audio.settings.muted;
  const unread = ui.alerts.filter((a) => !a.read).length;
  const run = (fn: () => void) => () => {
    api.setPopover(null);
    fn();
  };
  return (
    <div class="hud-anchor">
      <button
        type="button"
        class={`hud-icon-btn ${open ? 'is-open' : ''}`}
        aria-label="Menü"
        aria-expanded={open}
        onClick={() => api.setPopover(open ? null : 'menu')}
      >
        <Icon name="menu" />
      </button>
      <Popover id="menu" align="right" class="hud-menu">
        <button type="button" class="hud-menu__item" onClick={run(() => api.openPhone('core.alerts'))}>
          <Icon name="bell" /> Meldungen
          <Badge count={unread} tone="warn" />
        </button>
        <button type="button" class="hud-menu__item" onClick={run(() => api.togglePalette(true))}>
          <Icon name="search" /> Suchen <kbd>Strg K</kbd>
        </button>
        <button type="button" class="hud-menu__item" onClick={run(() => api.openDialog('core.saves', {}))}>
          <Icon name="save" /> Spielstände
        </button>
        <button type="button" class="hud-menu__item" onClick={run(() => api.openPhone('core.settings'))}>
          <Icon name="gear" /> Einstellungen
        </button>
        <button type="button" class="hud-menu__item" onClick={() => audio.toggleMute()}>
          <Icon name={muted ? 'volumeOff' : 'volume'} />
          {muted ? 'Ton an' : 'Ton aus'}
        </button>
      </Popover>
    </div>
  );
}

export function Hud() {
  const mobile = useIsMobile();
  const items = hudItems.list();
  const main = items.filter((i) => hudPlacement(i) === 'main');
  const alerts = items.filter((i) => hudPlacement(i) === 'alert');
  return (
    <header class={`hud ${mobile ? 'hud--mobile' : 'hud--desktop'}`}>
      <div class="hud__bar hud__bar--main">
        <HudItems items={main} />
      </div>
      {alerts.length > 0 && (
        <div class="hud__alerts">
          <HudItems items={alerts} />
        </div>
      )}
      <div class="hud__bar hud__bar--controls">
        <SpeedControl />
        <MenuButton />
      </div>
    </header>
  );
}
