// Feste Anzeige oben im Handy (Auftrag 46d, an der Stelle der Dynamic Island): die Zahlen der angemeldeten Zähler
// (registerStatusCounter), z.B. „3 Lieferungen unterwegs“ als Lkw-Symbol mit Zahl. Kein Aufklappen, kein Puls. Ein
// Tipp öffnet die App des ersten Zählers. Ohne Zähler über 0 bleibt im Handy nur die schwarze Pille der Hardware;
// liegt das Handy weg, schwebt die Anzeige nur über der Karte, wenn es etwas zu zeigen gibt.

import { useEffect } from 'preact/hooks';
import { Icon } from '../components';
import { useRuntime } from '../hooks';
import { collectStatusCounters } from '../registry';

/**
 * floating: schwebt über der Karte (Handy weggelegt). clock: echtes Handy, keine Kamera-Attrappe: Die Pille zeigt links
 * die Spielzeit.
 */
export function StatusPill(props: { floating?: boolean; clock?: string }) {
  const runtime = useRuntime();
  const state = runtime.state;
  const counters = state ? collectStatusCounters(state) : [];
  const shown = !!state && counters.length > 0;

  // Schwebt die Anzeige (Handy weggelegt), macht das HUD am Handy-Bildschirm ihr Platz unter Geld und Uhr.
  useEffect(() => {
    if (!props.floating) return;
    document.body.classList.toggle('has-floating-pill', shown);
    return () => document.body.classList.remove('has-floating-pill');
  }, [shown, props.floating]);

  if (!state) return null;
  if (props.floating && !shown) return null;
  const label = counters.map(({ counter, count }) => counter.label(count)).join(', ');
  const first = counters[0];
  const clockText = props.clock ? <span class="status-pill__clock">{props.clock}</span> : null;
  if (!shown) {
    return (
      <div class={`status-pill-wrap ${clockText ? 'is-pill' : ''}`}>
        <span class="status-pill is-idle" role="status" aria-label="Nichts unterwegs">
          {clockText}
        </span>
      </div>
    );
  }
  return (
    <div class={`status-pill-wrap ${props.floating ? 'is-floating' : ''} ${clockText ? 'is-pill' : ''}`}>
      <button
        type="button"
        class="status-pill"
        aria-label={label}
        title={label}
        onClick={() => first?.counter.open?.(runtime.api)}
      >
        {clockText}
        {counters.map(({ counter, count }) => (
          <span key={counter.id} class="status-pill__item">
            <Icon name={counter.icon} />
            <span class="status-pill__count">{count}</span>
          </span>
        ))}
      </button>
    </div>
  );
}
