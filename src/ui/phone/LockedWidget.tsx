// Gesperrtes Widget auf dem Startbildschirm (Tutorial): Es steht schon da, ausgegraut mit Schloss.

import { Icon } from '../components';

export interface LockedWidgetProps {
  /** Symbol und Name im Kopf, wie im freien Widget. */
  icon: string;
  label: string;
  /** Breites Widget (Lager) statt eines kleinen (Rang, Ruf, Reviere). */
  wide?: boolean;
  /** Anker der Tour, wie am freien Widget. */
  'data-tour'?: string;
}

export function LockedWidget(props: LockedWidgetProps) {
  return (
    <div
      class={`phone-widget phone-widget--locked ${props.wide ? '' : 'phone-stat'}`}
      data-tour={props['data-tour']}
      role="img"
      aria-label={`${props.label}, gesperrt`}
    >
      <span class="phone-widget__label">
        <Icon name={props.icon} size={12} /> {props.label}
      </span>
      <span class="phone-widget__lock" aria-hidden="true">
        <Icon name="lock" size={22} strokeWidth={2} />
      </span>
    </div>
  );
}
