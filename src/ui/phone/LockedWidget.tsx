// Gesperrtes Widget auf dem Startbildschirm (Tutorial): Es steht schon da, ausgegraut mit Schloss. Ein Tipp zeigt kurz,
// womit es frei wird.

import { Icon } from '../components';
import { useRuntime } from '../hooks';

export interface LockedWidgetProps {
  /** Symbol und Name im Kopf, wie im freien Widget. */
  icon: string;
  label: string;
  /** Hinweis beim Tipp, z.B. „Schaltest du frei mit ‚Reviere‘“. */
  hint: string;
  /** Breites Widget (Lager) statt eines kleinen (Rang, Ruf, Reviere). */
  wide?: boolean;
  /** Anker der Tour, wie am freien Widget. */
  'data-tour'?: string;
}

export function LockedWidget(props: LockedWidgetProps) {
  const { api } = useRuntime();
  return (
    <button
      type="button"
      class={`phone-widget phone-widget--locked ${props.wide ? '' : 'phone-stat'}`}
      data-tour={props['data-tour']}
      aria-label={`${props.label}, gesperrt`}
      onClick={() => api.notice(`${props.label}: ${props.hint}`)}
    >
      <span class="phone-widget__label">
        <Icon name={props.icon} size={12} /> {props.label}
      </span>
      <span class="phone-widget__lock" aria-hidden="true">
        <Icon name="lock" size={22} strokeWidth={2} />
      </span>
    </button>
  );
}
