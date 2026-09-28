// Platzhalter-Rahmen für das Spiel-Handy: Startbildschirm mit App-Icons, darin die gewählte App.
// Module melden ihre Apps mit registerPhoneApp() an. Den echten Handy-Look baut Auftrag 14.

import { clock } from '../../core';
import { Badge } from '../components';
import { useRuntime } from '../hooks';
import { phoneApps } from '../registry';

export function PhoneFrame() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  if (!ui.phone.open || !state) return null;
  const apps = phoneApps.list();
  const app = ui.phone.app ? phoneApps.get(ui.phone.app) : undefined;
  return (
    <section class="phone" aria-label="Handy">
      <header class="phone__status">
        <span>{clock.formatTime(state.time)}</span>
        <span>{clock.weekdayName(state.time, true)}</span>
      </header>
      <div class="phone__screen">
        {app ? (
          <app.component />
        ) : (
          <div class="phone__home">
            {apps.map((a) => (
              <button key={a.id} type="button" class="phone__app" onClick={() => api.openPhone(a.id)}>
                <span class="phone__icon" aria-hidden="true">
                  {a.icon}
                </span>
                <span class="phone__app-name">{a.name}</span>
                <Badge count={a.badge?.(state) ?? 0} />
              </button>
            ))}
          </div>
        )}
      </div>
      <footer class="phone__nav">
        <button type="button" onClick={() => (app ? api.openPhone(null) : api.closePhone())}>
          {app ? 'Zurück' : 'Weglegen'}
        </button>
      </footer>
    </section>
  );
}
