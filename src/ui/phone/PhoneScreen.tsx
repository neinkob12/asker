// Gerüst für eine App-Seite im Spiel-Handy im iOS-Stil: Navigationsleiste mit "‹ Zurück" links und Aktionen rechts,
// darunter ein großer Titel, der mit dem Inhalt scrollt (Large Title). Scrollt der Titel aus dem Bild, wandert er als
// kleiner Titel in die Mitte der Leiste, und die Leiste bekommt Glas und eine Haarlinie (Inhalt läuft darunter durch).
// Mit leading (z.B. Avatar im Chat) oder inlineTitle steht der Titel von Anfang an klein und mittig, wie in der
// Nachrichten-App. Apps mit chrome: 'none' nutzen es selbst (z.B. für Unterseiten), sonst setzt das Handy es
// automatisch.

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
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
  /** Fußzeile aus Glas, bleibt unten stehen (z.B. Antwortknöpfe). */
  footer?: ComponentChildren;
  class?: string;
}

/** Ab dieser Scrollhöhe (px) ist der große Titel aus dem Bild und der kleine erscheint in der Leiste. */
const COLLAPSE_AT = 30;

export function PhoneScreen(props: PhoneScreenProps) {
  const ui = useUi();
  const [scrolled, setScrolled] = useState(false);
  const back = props.onBack ?? (() => ui.openPhone(null));
  const inline = props.inlineTitle || !!props.leading;
  const collapsed = inline || scrolled;
  const backLabel = props.backLabel ?? (props.onBack ? 'Zurück' : 'Start');
  const classes = ['phone-screen'];
  if (inline) classes.push('is-inline');
  if (collapsed) classes.push('is-collapsed');
  if (props.footer) classes.push('has-footer');
  if (props.class) classes.push(props.class);
  return (
    <div class={classes.join(' ')}>
      <header class="phone-screen__bar">
        <button type="button" class="phone-screen__back" onClick={back} aria-label={`Zurück zu ${backLabel}`}>
          <Icon name="chevronLeft" size={22} strokeWidth={2.4} />
          <span>{backLabel}</span>
        </button>
        <div class="phone-screen__center" aria-hidden={inline ? undefined : 'true'}>
          {props.leading}
          <div class="phone-screen__titles">
            {inline ? (
              <h2 class="phone-screen__title">{props.title}</h2>
            ) : (
              <p class="phone-screen__title">{props.title}</p>
            )}
            {inline && props.subtitle && <div class="phone-screen__subtitle">{props.subtitle}</div>}
          </div>
        </div>
        <div class="phone-screen__actions">{props.actions}</div>
      </header>
      <div
        class="phone-screen__body"
        onScroll={(e) => {
          const next = e.currentTarget.scrollTop > COLLAPSE_AT;
          if (next !== scrolled) setScrolled(next);
        }}
      >
        {!inline && (
          <div class="phone-screen__head">
            <h2 class="phone-screen__large">{props.title}</h2>
            {props.subtitle && <div class="phone-screen__subtitle">{props.subtitle}</div>}
          </div>
        )}
        {props.children}
      </div>
      {props.footer && <footer class="phone-screen__footer">{props.footer}</footer>}
    </div>
  );
}
