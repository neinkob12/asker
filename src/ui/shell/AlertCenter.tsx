// Meldungen: App im Spiel-Handy mit allen Meldungen (Toasts), sortiert nach Dringend (rot), Achtung (gelb) und
// Routine (grau). Ist der Ort bekannt, springt "Hin" auf der Karte dorthin.

import { useEffect } from 'preact/hooks';
import { clock } from '../../core';
import { Button, Empty, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { PhoneScreen } from '../phone/PhoneScreen';
import type { Alert, ToastKind } from '../runtime';

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

export function AlertsApp() {
  const { ui, api } = useRuntime();
  const unread = ui.alerts.some((a) => !a.read);
  // Beim Schließen der App gilt alles als gelesen (während sie offen ist, bleiben neue markiert).
  useEffect(() => () => api.markAlertsRead(), [api]);
  return (
    <PhoneScreen
      title="Meldungen"
      subtitle={unread ? 'Neue Meldungen' : 'Alles gelesen'}
      actions={
        ui.alerts.length > 0 && (
          <Button small variant="subtle" icon="trash" onClick={api.clearAlerts}>
            Leeren
          </Button>
        )
      }
    >
      <div class="alert-center">
        {ui.alerts.length === 0 && <Empty icon="bell">Alles ruhig in Köln.</Empty>}
        {GROUPS.map((g) => {
          const list = ui.alerts.filter((a) => g.kinds.includes(a.kind));
          if (list.length === 0) return null;
          return (
            <section key={g.id} class={`alert-group alert-group--${g.id}`}>
              <h3 class="alert-group__title">
                {g.title} <span>{list.length}</span>
              </h3>
              <ul class="alert-group__list">
                {list.slice(0, 30).map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    onZoom={() => {
                      if (a.target) api.flyTo(a.target, 15.5);
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </PhoneScreen>
  );
}
