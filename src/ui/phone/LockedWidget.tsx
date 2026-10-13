// Gesperrtes Widget auf dem Startbildschirm (Tutorial): Es steht schon da, ausgegraut mit Schloss und dem Text, wann es
// kommt. Ein Tipp zeigt denselben Text kurz als Einblendung.

import { Icon } from '../components';
import { useRuntime } from '../hooks';

export interface LockedWidgetProps {
  /** Symbol und Name im Kopf, wie im freien Widget. */
  icon: string;
  label: string;
  /** Warum gesperrt, z.B. „Kommt mit deinem ersten Aufstieg“. */
  text: string;
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
      aria-disabled="true"
      aria-label={`${props.label}, gesperrt. ${props.text}`}
      title={props.text}
      onClick={() => api.notice(`${props.label}: ${props.text}`)}
    >
      <span class="phone-widget__label">
        <Icon name={props.icon} size={12} /> {props.label}
      </span>
      <span class="phone-widget__lock" aria-hidden="true">
        <Icon name="lock" size={22} strokeWidth={2} />
      </span>
      <span class="phone-stat__foot">{props.text}</span>
    </button>
  );
}
