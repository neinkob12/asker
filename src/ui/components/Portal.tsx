// Überlagerungen (Blätter, Aktionsblatt, Kontextmenü) zeichnen sich nicht in ihre Seite, sondern über den ganzen
// Bildschirm des Handys: PortalHostContext nennt die Stelle (PhoneFrame setzt sie), Portal rendert dorthin. Der Kontext
// der Seite (Spiel, UI) bleibt erhalten. Ohne Ziel (außerhalb des Handys) bleibt der Inhalt an Ort und Stelle.

import { Component, type ComponentChildren, createContext, h, render } from 'preact';
import { useContext } from 'preact/hooks';

/** Element, in das Portale zeichnen (im Handy: über allen Seiten). */
export const PortalHostContext = createContext<HTMLElement | null>(null);

/**
 * Aktionen-Bereich der Navigationsleiste der Seite (PhoneScreen setzt ihn): Ein Abschnitt kann seine Hauptaktion
 * dorthin zeichnen (<Portal host={bar}>), wie bei iOS rechts oben.
 */
export const BarActionsContext = createContext<HTMLElement | null>(null);

/** Reicht den Kontext der Stelle, an der das Portal steht, an seinen Inhalt weiter. */
class ContextBridge extends Component<{ context: object; children?: ComponentChildren }> {
  getChildContext() {
    return this.props.context;
  }
  render() {
    return this.props.children;
  }
}

/**
 * Eigener Kasten im Ziel, in den der Inhalt als eigene Wurzel gezeichnet wird. Gezeichnet wird schon beim Rendern
 * (wie createPortal in preact/compat): So steht der Inhalt im DOM, bevor Layout-Effekte der Seite ihn messen.
 */
class PortalBox extends Component<{ host: HTMLElement; children?: ComponentChildren }> {
  private box: HTMLElement | null = null;

  componentWillUnmount() {
    if (!this.box) return;
    render(null, this.box);
    this.box.remove();
    this.box = null;
  }

  render() {
    const host = this.props.host;
    if (this.box?.parentNode !== host) {
      this.box?.remove();
      this.box = document.createElement('div');
      this.box.className = 'ui-portal';
      host.appendChild(this.box);
    }
    render(h(ContextBridge, { context: this.context as object }, this.props.children), this.box);
    return null;
  }
}

/**
 * Zeichnet den Inhalt über den Bildschirm des Handys (oder an Ort und Stelle, wenn es kein Ziel gibt). Mit `host`
 * in ein bestimmtes Element (z.B. die Navigationsleiste).
 */
export function Portal(props: { children?: ComponentChildren; host?: HTMLElement | null }) {
  const fromContext = useContext(PortalHostContext);
  const host = props.host === undefined ? fromContext : props.host;
  if (!host) return h('div', { class: 'ui-portal ui-portal--inline' }, props.children);
  return h(PortalBox, { host }, props.children);
}
