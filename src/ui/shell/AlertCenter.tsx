// Alarm-Zentrale: Glocke mit Zähler im HUD. Liste aller Meldungen, sortiert nach Dringend (rot), Achtung (gelb)
// und Routine (grau). Ist der Ort bekannt, springt "Hinzoomen" auf der Karte hin.

import { clock } from '../../core';
import { Badge, Button, Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';
import type { Alert, ToastKind } from '../runtime';
import { Popover } from './Hud';

export const TOAST_ICONS: Record<ToastKind, string> = { info: 'info', good: 'check', warn: 'alert', bad: 'siren' };
export const TOAST_CHIPS: Record<ToastKind, 'blue' | 'green' | 'yellow' | 'red'> = {
  info: 'blue',
  good: 'green',
  warn: 'yellow',
  bad: 'red',
};

const GROUPS: { id: string; title: string; kinds: ToastKind[] }[] = [
  { id: 'bad', title: 'Dringend', kinds: ['bad'] },
  { id: 'warn', title: 'Achtung', kinds: ['warn'] },
  { id: 'routine', title: 'Routine', kinds: ['good', 'info'] },
];

function AlertRow(props: { alert: Alert; onZoom: () => void }) {
  const a = props.alert;
  return (
    <li class={`alert-row alert-row--${a.kind} ${a.read ? '' : 'is-new'}`}>
      <IconChip icon={a.icon ?? TOAST_ICONS[a.kind]} size="sm" color={TOAST_CHIPS[a.kind]} />
      <span class="alert-row__text">
        {a.text}
        <time>{clock.formatTime(a.time)}</time>
      </span>
      {a.target && (
        <Button small icon="zoomIn" onClick={props.onZoom} title="Auf der Karte zeigen">
          Hin
        </Button>
      )}
    </li>
  );
}

export function AlertCenter() {
  const { ui, api } = useRuntime();
  const open = ui.popover === 'alerts';
  const unread = ui.alerts.filter((a) => !a.read);
  const urgent = unread.some((a) => a.kind === 'bad');
  const toggle = () => {
    if (open) {
      api.markAlertsRead();
      api.setPopover(null);
    } else api.setPopover('alerts');
  };
  return (
    <div class="hud-anchor">
      <button
        type="button"
        class={`hud-pill hud-icon-btn hud-bell ${urgent ? 'is-urgent' : ''} ${open ? 'is-open' : ''}`}
        aria-label={unread.length > 0 ? `Meldungen, ${unread.length} neu` : 'Meldungen'}
        aria-expanded={open}
        title="Meldungen"
        onClick={toggle}
      >
        <Icon name={unread.length > 0 ? 'bellRing' : 'bell'} />
        <Badge count={unread.length} tone={urgent ? 'bad' : 'warn'} />
      </button>
      <Popover id="alerts" align="right" class="alert-center">
        <header class="alert-center__head">
          <strong>Meldungen</strong>
          {ui.alerts.length > 0 && (
            <Button small variant="subtle" icon="trash" onClick={api.clearAlerts}>
              Leeren
            </Button>
          )}
        </header>
        {ui.alerts.length === 0 && <p class="ui-hint alert-center__empty">Alles ruhig in Köln.</p>}
        {GROUPS.map((g) => {
          const list = ui.alerts.filter((a) => g.kinds.includes(a.kind));
          if (list.length === 0) return null;
          return (
            <section key={g.id} class={`alert-group alert-group--${g.id}`}>
              <h3 class="alert-group__title">
                {g.title} <span>{list.length}</span>
              </h3>
              <ul class="alert-group__list">
                {list.slice(0, 20).map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    onZoom={() => {
                      if (a.target) api.flyTo(a.target, 15.5);
                      api.markAlertsRead();
                      api.setPopover(null);
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </Popover>
    </div>
  );
}
