// Dynamic Island des Spiel-Handys: zeigt wie bei iOS laufende Live-Aktivitäten der Module (registerLiveActivity):
// Überfälle, Lieferungen mit Restzeit, Fristen, Razzien, Umsatz des Tages … Kompakt links neben der Kamera ein
// Symbol mit kurzem Wort, rechts der Wert. Gibt es eine zweite Aktivität, hängt sie als kleiner Kreis daneben
// (minimale Darstellung). Aufgeklappt (Maus drüber, Tipp am Touchscreen) stehen alle Aktivitäten untereinander.
// Neue dringende Aktivitäten (Priorität ab 80) klappen die Island kurz von selbst auf, kurze Auftritte
// (ui.pulseIsland, z.B. "+120 €") erscheinen für ein paar Sekunden. Maße nach Apples HIG (Live Activities):
// Radius 44, Innenabstand 14, kräftige Farben auf Schwarz, mindestens mittlere Schriftstärke. Kompakt höchstens 230 pt
// breit (Uhrzeit und Symbole der Statusleiste bleiben frei), Restzeiten nur in Stunden (islandModel.ts).

import { useEffect, useRef, useState } from 'preact/hooks';
import { formatEuro } from '../../core';
import { Icon } from '../components';
import { useRuntime } from '../hooks';
import { collectLiveActivities, type LiveActivity } from '../registry';
import type { IslandPulse } from '../runtime';

/** Ab dieser Priorität klappt eine neue Aktivität die Island kurz von selbst auf (wie ein Alert bei iOS). */
const ALERT_PRIORITY = 80;
const ALERT_MS = 3000;
/** Hover öffnet/schließt erst nach kurzer Absicht (streifende Maus), aufgeklappt klappt es sonst von selbst wieder zu. */
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 350;
const AUTO_COLLAPSE_MS = 7000;
/** Aufgeklappt höchstens so viele Aktivitäten. */
const EXPANDED_MAX = 4;

export { islandCountdown } from './islandModel';

function pulseText(pulse: IslandPulse): string {
  if (pulse.amount !== undefined) return `${pulse.amount >= 0 ? '+' : '−'}${formatEuro(Math.abs(pulse.amount))}`;
  return pulse.text;
}

function ActivityRow(props: { activity: LiveActivity; onOpen: () => void }) {
  const a = props.activity;
  return (
    <button type="button" class={`island-row tone-${a.tone ?? 'neutral'}`} onClick={props.onOpen}>
      <span class="island-row__icon">
        <Icon name={a.icon} />
      </span>
      <span class="island-row__text">
        <span class="island-row__title">{a.title}</span>
        {a.detail && <span class="island-row__detail">{a.detail}</span>}
        {a.progress !== undefined && (
          <span class="island-row__bar">
            <span style={{ width: `${Math.round(Math.min(1, Math.max(0, a.progress)) * 100)}%` }} />
          </span>
        )}
      </span>
      <span class="island-row__value">{a.trailing}</span>
    </button>
  );
}

export function DynamicIsland(props: { floating?: boolean }) {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const seen = useRef<Set<string> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const [alertId, setAlertId] = useState<string | null>(null);
  const activities = state ? collectLiveActivities(state) : [];
  const ids = activities.map((a) => a.id).join('|');

  // Neue dringende Aktivität: kurz aufklappen. Beim ersten Anzeigen nicht (sonst klappt sie nach dem Laden auf).
  useEffect(() => {
    // Jede Aktivität alarmiert nur einmal (auch wenn sie kurz verschwindet und wiederkommt).
    const current = new Set(ids ? ids.split('|') : []);
    const known = seen.current;
    if (known) {
      const fresh = activities.find((a) => a.priority >= ALERT_PRIORITY && !known.has(a.id));
      if (fresh && !ui.island.expanded) setAlertId(fresh.id);
      for (const id of current) known.add(id);
    } else {
      seen.current = current;
    }
  }, [ids]);
  useEffect(() => {
    if (!alertId) return;
    const timer = setTimeout(() => setAlertId(null), ALERT_MS);
    return () => clearTimeout(timer);
  }, [alertId]);

  // Aufgeklappt bleibt die Island nicht ewig stehen (Touch kennt kein "Maus weg").
  const expandedNow = ui.island.expanded;
  useEffect(() => {
    if (!expandedNow) return;
    const timer = setTimeout(() => api.toggleIsland(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [expandedNow, ids]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  if (!state) return null;
  const alert = alertId ? activities.find((a) => a.id === alertId) : undefined;
  const pulse = ui.island.pulse;
  const top = activities[0];
  const expanded = ui.island.expanded && activities.length > 0;
  const mode = expanded ? 'expanded' : alert ? 'alert' : pulse ? 'pulse' : top ? 'compact' : 'idle';
  // Weggelegtes Handy: Die Island schwebt nur, wenn es etwas zu zeigen gibt.
  if (props.floating && mode === 'idle') return null;

  const open = (a: LiveActivity) => {
    api.toggleIsland(false);
    setAlertId(null);
    a.open?.(api);
  };
  const extra = activities.length - 1;
  const second = activities[1];
  const hoverable = () => window.matchMedia?.('(hover: hover)').matches ?? false;

  return (
    <div class={`island-wrap ${props.floating ? 'is-floating' : ''}`}>
      <div
        class={`island is-${mode}`}
        role="status"
        aria-live="polite"
        aria-label={top ? `${top.title}: ${top.trailing}` : 'Keine laufenden Aktivitäten'}
        onMouseEnter={() => {
          if (!hoverable() || activities.length === 0) return;
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(() => api.toggleIsland(true), HOVER_OPEN_MS);
        }}
        onMouseLeave={() => {
          if (!hoverable()) return;
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(() => api.toggleIsland(false), HOVER_CLOSE_MS);
        }}
      >
        {(mode === 'compact' || mode === 'pulse') && (
          <button
            type="button"
            class="island__compact"
            onClick={() => {
              if (hoverable() && top) open(top);
              else api.toggleIsland();
            }}
          >
            {mode === 'pulse' && pulse ? (
              <>
                <span class={`island__lead tone-${pulse.tone ?? 'accent'}`}>
                  <Icon name={pulse.icon} />
                </span>
                <span class="island__cam" aria-hidden="true" />
                <span class={`island__trail tone-${pulse.tone ?? 'accent'}`} key={pulse.amount ?? pulse.text}>
                  {pulseText(pulse)}
                </span>
              </>
            ) : top ? (
              <>
                <span class={`island__lead tone-${top.tone ?? 'neutral'}`}>
                  <Icon name={top.icon} />
                  <span class="island__lead-text">{top.leading}</span>
                </span>
                <span class="island__cam" aria-hidden="true" />
                <span class={`island__trail tone-${top.tone ?? 'neutral'}`} key={top.trailing}>
                  {top.trailing}
                </span>
              </>
            ) : null}
          </button>
        )}
        {mode === 'alert' && alert && (
          <div class="island__expanded">
            <ActivityRow activity={alert} onOpen={() => open(alert)} />
          </div>
        )}
        {mode === 'expanded' && (
          <div class="island__expanded">
            {activities.slice(0, EXPANDED_MAX).map((a) => (
              <ActivityRow key={a.id} activity={a} onOpen={() => open(a)} />
            ))}
            {activities.length > EXPANDED_MAX && (
              <span class="island__more">+{activities.length - EXPANDED_MAX} weitere</span>
            )}
          </div>
        )}
      </div>
      {mode === 'compact' && second && (
        <button
          type="button"
          class={`island-minimal tone-${second.tone ?? 'neutral'}`}
          onClick={() => api.toggleIsland(true)}
          aria-label={`${extra} weitere Aktivitäten`}
          title={second.title}
        >
          <Icon name={second.icon} />
          {extra > 1 && <span class="island-minimal__count">{extra}</span>}
        </button>
      )}
    </div>
  );
}
