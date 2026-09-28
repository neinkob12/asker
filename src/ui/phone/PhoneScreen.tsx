// Gerüst für eine App-Seite im Spiel-Handy: Kopfleiste mit Zurück, Titel und Aktionen, darunter der Inhalt.
// Apps mit chrome: 'none' nutzen es selbst (z.B. für Unterseiten), sonst setzt das Handy es automatisch.

import type { ComponentChildren } from 'preact';
import { Icon } from '../components';
import { useUi } from '../hooks';

export interface PhoneScreenProps {
  title: ComponentChildren;
  /** Kleine Zeile unter dem Titel. */
  subtitle?: ComponentChildren;
  /** Zurück: Standard ist der Startbildschirm. */
  onBack?: () => void;
  /** Rechts in der Kopfleiste. */
  actions?: ComponentChildren;
  /** Links neben dem Titel, z.B. ein Avatar. */
  leading?: ComponentChildren;
  children?: ComponentChildren;
  /** Fußzeile, bleibt unten stehen (z.B. Antwortknöpfe). */
  footer?: ComponentChildren;
  class?: string;
}

export function PhoneScreen(props: PhoneScreenProps) {
  const ui = useUi();
  const back = props.onBack ?? (() => ui.openPhone(null));
  return (
    <div class={`phone-screen ${props.class ?? ''}`}>
      <header class="phone-screen__bar">
        <button type="button" class="phone-screen__back" onClick={back} aria-label="Zurück">
          <Icon name="back" size={22} />
        </button>
        {props.leading}
        <div class="phone-screen__titles">
          <h3 class="phone-screen__title">{props.title}</h3>
          {props.subtitle && <div class="phone-screen__subtitle">{props.subtitle}</div>}
        </div>
        {props.actions && <div class="phone-screen__actions">{props.actions}</div>}
      </header>
      <div class="phone-screen__body">{props.children}</div>
      {props.footer && <footer class="phone-screen__footer">{props.footer}</footer>}
    </div>
  );
}
