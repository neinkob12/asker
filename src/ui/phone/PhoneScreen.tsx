// Gerüst für eine App-Seite im Spiel-Handy im iOS-Stil: Navigationsleiste mit "‹ Zurück" links und Aktionen rechts,
// darunter ein großer Titel, der mit dem Inhalt scrollt (Large Title). Mit leading (z.B. Avatar im Chat) oder
// inlineTitle steht der Titel klein und mittig in der Leiste, wie in der Nachrichten-App.
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
  /** Beschriftung neben dem Zurück-Pfeil. Standard "Start" (ohne onBack) bzw. "Zurück". */
  backLabel?: string;
  /** Rechts in der Leiste. */
  actions?: ComponentChildren;
  /** Links neben dem Titel, z.B. ein Avatar (Titel dann klein in der Leiste). */
  leading?: ComponentChildren;
  /** Titel klein und mittig in der Leiste statt groß über dem Inhalt. */
  inlineTitle?: boolean;
  children?: ComponentChildren;
  /** Fußzeile, bleibt unten stehen (z.B. Antwortknöpfe). */
  footer?: ComponentChildren;
  class?: string;
}

export function PhoneScreen(props: PhoneScreenProps) {
  const ui = useUi();
  const back = props.onBack ?? (() => ui.openPhone(null));
  const inline = props.inlineTitle || !!props.leading;
  return (
    <div class={`phone-screen ${inline ? 'is-inline' : ''} ${props.class ?? ''}`}>
      <header class="phone-screen__bar">
        <button type="button" class="phone-screen__back" onClick={back} aria-label="Zurück">
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          <span>{props.backLabel ?? (props.onBack ? 'Zurück' : 'Start')}</span>
        </button>
        {inline && (
          <div class="phone-screen__center">
            {props.leading}
            <div class="phone-screen__titles">
              <h3 class="phone-screen__title">{props.title}</h3>
              {props.subtitle && <div class="phone-screen__subtitle">{props.subtitle}</div>}
            </div>
          </div>
        )}
        <div class="phone-screen__actions">{props.actions}</div>
      </header>
      <div class="phone-screen__body">
        {!inline && (
          <div class="phone-screen__head">
            <h3 class="phone-screen__large">{props.title}</h3>
            {props.subtitle && <div class="phone-screen__subtitle">{props.subtitle}</div>}
          </div>
        )}
        {props.children}
      </div>
      {props.footer && <footer class="phone-screen__footer">{props.footer}</footer>}
    </div>
  );
}
