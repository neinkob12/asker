// HUD im Look "Glas": drei Gruppen in der freien Kartenfläche links vom Handy (--map-right ist die Grenze).
//   oben links   Geld-Kapsel: Geld (Klick öffnet die Geldwäsche) und Heat (placement 'main'), darunter die Mission
//                ('below') und Warnungen
//   oben Mitte   Uhr-Kapsel: Wochentag, Tag, Uhrzeit, Spieltempo, Menü ('time' ist seit Auftrag 26 leer)
//   oben rechts  Kennzahl-Kacheln Lager und Ruf · Reviere ('more'), jede klappt beim Drüberfahren eine Karte auf
// Ist die Kartenfläche schmal, rücken die Kacheln unter die Uhr (Container-Query in shell.css). Am Handy-Bildschirm
// stehen Geld und Uhr kompakt nebeneinander, die Kacheln flach darunter. Meldungen gibt es über der Karte nicht mehr:
// Sie laufen über den Verlauf (Auftrag 46d: keine Banner, keine Island).

import type { ComponentChildren } from 'preact';
import { SPEEDS } from '../../core';
import { ClockHud } from '../builtin/CoreHud';
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
  const runtime = useRuntime();
  const { session, api, tours } = runtime;
  const mobile = useIsMobile();
  const speed = session.loop.speed;
  // Tour (Auftrag 46a): Hält sie die Uhr an, zeigt der Regler „Pause“ und lässt sich nicht bedienen, außer er ist
  // selbst der Anker; dann merkt ein Tipp das Tempo für nach der Tour (is-queued), die Uhr steht weiter.
  const tourPause = tours.pausing();
  const locked = tourPause && tours.current()?.step.anchor !== 'hud.speed';
  const queued = tourPause ? tours.resumeSpeed() : null;
  if (mobile) {
    // Am Handy nur Pause und ein Knopf, der durch 1×, 2×, 4× schaltet.
    const running = SPEEDS.filter((x) => x > 0);
    const next = running[(running.indexOf(speed as (typeof running)[number]) + 1) % running.length];
    return (
      <fieldset class="hud-speed" aria-label="Spielgeschwindigkeit" data-tour="hud.speed" disabled={locked}>
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
          class={`hud-speed__btn ${speed > 0 ? 'is-active' : ''} ${queued !== null && queued > 0 ? 'is-queued' : ''}`}
          aria-label={
            speed === 0
              ? `Weiter mit ${SPEED_LABELS[runtime.resumeSpeed] ?? runtime.resumeSpeed}`
              : `Tempo ${SPEED_LABELS[speed] ?? speed}, tippen für schneller`
          }
          onClick={() => api.setSpeed(speed === 0 ? runtime.resumeSpeed : next)}
        >
          {/* Pausiert das Tempo, mit dem es weitergeht (vorher stand „1×“, Play lief aber mit 4× weiter). */}
          <span class="hud-speed__label">{SPEED_LABELS[speed === 0 ? runtime.resumeSpeed : speed]}</span>
        </button>
      </fieldset>
    );
  }
  return (
    <fieldset class="hud-speed" aria-label="Spielgeschwindigkeit" data-tour="hud.speed" disabled={locked}>
      {SPEEDS.map((s, i) => (
        <button
          key={s}
          type="button"
          class={`hud-speed__btn ${s === speed ? 'is-active' : ''} ${s === 0 ? 'is-pause' : ''} ${
            queued !== null && s === queued && s > 0 ? 'is-queued' : ''
          }`}
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

/** Mac (⌘) oder PC (Strg) für die Tastenkürzel im Menü (Auftrag 43, N10). */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Menü (Verlauf, Suche, Spielstände, Einstellungen, Ton). Am Handy-Bildschirm steht es in der Kartensteuerung. */
export function MenuButton(props: { up?: boolean }) {
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
      <Popover id="menu" align="right" class={`hud-menu ${props.up ? 'hud-popover--up' : ''}`}>
        <button type="button" class="hud-menu__item" onClick={run(() => api.openPhone('core.history'))}>
          <Icon name="journal" /> Verlauf
          <Badge count={unread} tone="warn" />
        </button>
        <button type="button" class="hud-menu__item" onClick={run(() => api.togglePalette(true))}>
          <Icon name="search" /> Suchen <kbd>{IS_MAC ? '⌘ K' : 'Strg K'}</kbd>
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
        {/* Tastenkürzel standen nirgends (N10); nur mit Tastatur, nicht in der Kartensteuerung am Handy. */}
        {!props.up && (
          <p class="hud-menu__keys">
            <span>
              <kbd>Leertaste</kbd> Pause
            </span>
            <span>
              <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> Tempo
            </span>
            <span>
              <kbd>T</kbd> Handy
            </span>
            <span>
              <kbd>Esc</kbd> zurück
            </span>
          </p>
        )}
      </Popover>
    </div>
  );
}

export function Hud() {
  const mobile = useIsMobile();
  const items = hudItems.list();
  const main = items.filter((i) => hudPlacement(i) === 'main');
  const alerts = items.filter((i) => hudPlacement(i) === 'alert');
  const time = items.filter((i) => hudPlacement(i) === 'time');
  const more = items.filter((i) => hudPlacement(i) === 'more');
  const below = items.filter((i) => hudPlacement(i) === 'below');
  return (
    <header class={`hud hud--glass ${mobile ? 'hud--mobile' : 'hud--desktop'}`}>
      <div class="hud__grid">
        <div class="hud__left">
          <div class="hud-capsule hud-capsule--money">
            <HudItems items={main} />
          </div>
          {below.length > 0 && (
            <div class="hud__below">
              <HudItems items={below} />
            </div>
          )}
        </div>
        <div class="hud-capsule hud-capsule--clock">
          <ClockHud />
          {!mobile && time.length > 0 && (
            <div class="hud-capsule__time">
              <HudItems items={time} />
            </div>
          )}
          <SpeedControl />
          {!mobile && <MenuButton />}
        </div>
        {more.length > 0 && (
          <div class="hud-tiles">
            <HudItems items={more} />
          </div>
        )}
        {alerts.length > 0 && (
          <div class="hud__alerts">
            <HudItems items={alerts} />
          </div>
        )}
      </div>
    </header>
  );
}
