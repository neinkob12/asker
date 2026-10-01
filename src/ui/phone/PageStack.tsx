// Seiten des Handys als Stapel: Die sichtbare Seite und höchstens zwei darunter bleiben montiert (Scrollposition und
// Eingaben bleiben beim Zurückgehen erhalten). Nur die oberste Seite wird mit dem Spiel neu gezeichnet; Seiten darunter
// sind unsichtbar, für Screenreader verborgen und stehen still, bis sie wieder oben liegen (spart Arbeit bei
// 10 Bildern pro Sekunde). Welche Seite was zeigt, entscheidet `renderPage` (PhoneFrame.tsx).

import { Component, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { ErrorBoundary } from '../components';
import { mountedEntries, type NavEntry } from './navModel';
import { PageContext } from './page';

interface LayerProps {
  entry: NavEntry;
  below: NavEntry | null;
  /** Oberste Seite: wird mit jedem Bild neu gezeichnet. Darunter stehen Seiten still. */
  live: boolean;
  register: (key: string, element: HTMLElement | null) => void;
  render: (entry: NavEntry) => ComponentChildren;
}

/** Eine Seite im Stapel. Steht still (zeichnet nicht neu), solange sie nicht oben liegt. */
class PageLayer extends Component<LayerProps> {
  private ref = (element: HTMLElement | null) => this.props.register(this.props.entry.key, element);

  shouldComponentUpdate(next: LayerProps): boolean {
    return next.live || next.live !== this.props.live || next.entry.key !== this.props.entry.key;
  }

  render() {
    const { entry, below } = this.props;
    return (
      <div class="phone-page" data-kind={entry.kind} ref={this.ref}>
        <PageContext.Provider value={{ entry, below }}>
          <ErrorBoundary name={entry.title}>{this.props.render(entry)}</ErrorBoundary>
        </PageContext.Provider>
        <div class="phone-page__dim" aria-hidden="true" />
      </div>
    );
  }
}

/** Sichtbarkeit der montierten Seiten: nur die oberste ist zu sehen und bedienbar. */
function showOnly(layers: Map<string, HTMLElement>, topKey: string) {
  for (const [key, element] of layers) {
    const visible = key === topKey;
    element.classList.toggle('is-top', visible);
    element.classList.toggle('is-hidden', !visible);
    element.inert = !visible;
    if (visible) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', 'true');
  }
}

export function PageStack(props: { stack: NavEntry[]; render: (entry: NavEntry) => ComponentChildren }) {
  const layers = useRef(new Map<string, HTMLElement>()).current;
  const register = useRef((key: string, element: HTMLElement | null) => {
    if (element) layers.set(key, element);
    else layers.delete(key);
  }).current;
  const mounted = mountedEntries(props.stack);
  const topKey = mounted[mounted.length - 1].key;

  useLayoutEffect(() => showOnly(layers, topKey));

  return (
    <div class="phone-pages">
      {mounted.map((entry, i) => (
        <PageLayer
          key={entry.key}
          entry={entry}
          below={i > 0 ? mounted[i - 1] : (props.stack[props.stack.length - mounted.length - 1] ?? null)}
          live={entry.key === topKey}
          register={register}
          render={props.render}
        />
      ))}
    </div>
  );
}
