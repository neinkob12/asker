// Seiten des Handys als Stapel: Die sichtbare Seite und höchstens zwei darunter bleiben montiert (Scrollposition und
// Eingaben bleiben beim Zurückgehen erhalten), dazu der Startbildschirm als Hintergrund. Nur die oberste Seite wird mit
// dem Spiel neu gezeichnet; Seiten darunter sind unsichtbar, für Screenreader verborgen und stehen still, bis sie
// wieder oben liegen (spart Arbeit bei 10 Bildern pro Sekunde). Welche Seite was zeigt, entscheidet `render`
// (PhoneFrame.tsx), wie sie wechseln, der StackAnimator (Federn). Seiten, die den Stapel verlassen, bleiben montiert,
// bis ihr Übergang fertig ist.

import { Component, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ErrorBoundary } from '../components';
import { TAB_APP_PREFIX } from '../runtime';
import { mountedEntries, type NavEntry, top, transitionOf } from './navModel';
import { PageContext } from './page';
import { StackAnimator, type StackPlan } from './stackAnimator';

interface LayerProps {
  entry: NavEntry;
  below: NavEntry | null;
  /** Oberste Seite: wird mit jedem Bild neu gezeichnet. Darunter stehen Seiten still. */
  live: boolean;
  /** Zählt hoch, wenn eine stillstehende Seite aufgedeckt wird (dann einmal frisch zeichnen). */
  revealed: number;
  register: (key: string, element: HTMLElement | null) => void;
  render: (entry: NavEntry) => ComponentChildren;
}

/** Eine Seite im Stapel. Steht still (zeichnet nicht neu), solange sie nicht oben liegt. */
class PageLayer extends Component<LayerProps> {
  private ref = (element: HTMLElement | null) => this.props.register(this.props.entry.key, element);

  // Oben: mit jedem Bild neu. Sonst bleibt die letzte Darstellung stehen (auch auf dem Weg hinaus).
  shouldComponentUpdate(next: LayerProps): boolean {
    return next.live || next.entry.key !== this.props.entry.key || next.revealed !== this.props.revealed;
  }

  render() {
    const { entry, below } = this.props;
    return (
      <div
        class="phone-page"
        data-kind={entry.kind}
        data-key={entry.key}
        // Anker der Tour (Auftrag 46a): der Inhalt der offenen App ist die oberste Seite, der Startbildschirm nicht.
        data-tour={this.props.live && entry.kind !== 'home' ? 'phone.screen' : undefined}
        ref={this.ref}
      >
        <PageContext.Provider value={{ entry, below }}>
          <ErrorBoundary name={entry.title}>{this.props.render(entry)}</ErrorBoundary>
        </PageContext.Provider>
        <div class="phone-page__dim" aria-hidden="true" />
      </div>
    );
  }
}

/** App einer Seite (für die Kachel beim Öffnen und Schließen): 'tab:<id>' oder App-ID, null auf dem Startbildschirm. */
export function appIdOf(stack: readonly NavEntry[]): string | null {
  const root = stack[1];
  if (!root) return null;
  return root.kind === 'tab' ? `${TAB_APP_PREFIX}${root.id}` : root.kind === 'app' ? root.id : null;
}

/** Welche Schichten sich bei einem Wechsel bewegen und welche nur noch dafür montiert bleiben. */
function planOf(before: readonly NavEntry[], after: readonly NavEntry[]): StackPlan | null {
  let kind = transitionOf(before, after);
  if (kind === 'none') return null;
  const from = top(before);
  const to = top(after);
  const gone = !after.some((e) => e.key === from.key);
  // Die alte Seite verschwindet ganz, liegt aber nicht unter der neuen: überblenden statt schieben.
  if (kind === 'push' && gone) kind = 'replace';
  const exiting = gone ? [from.key] : [];
  switch (kind) {
    case 'push':
      return { kind, front: to.key, back: from.key, appId: null, exiting };
    case 'open':
      return { kind, front: to.key, back: after[0].key, appId: appIdOf(after), exiting };
    case 'close':
      return { kind, front: from.key, back: to.key, appId: appIdOf(before), exiting };
    default:
      // pop, replace, switch: Die alte Seite liegt oben und gibt die neue frei.
      return { kind, front: from.key, back: to.key, appId: null, exiting };
  }
}

export interface PageStackHandle {
  animator: StackAnimator;
}

export function PageStack(props: {
  stack: NavEntry[];
  render: (entry: NavEntry) => ComponentChildren;
  /** Zugriff auf den Animator für Gesten (Rand-Wischen, Home-Balken). */
  handle?: (handle: PageStackHandle | null) => void;
}) {
  const [, setTick] = useState(0);
  const animator = useRef<StackAnimator | null>(null);
  if (!animator.current) animator.current = new StackAnimator();
  const a = animator.current;
  const register = useRef((key: string, element: HTMLElement | null) => {
    if (element) a.layers.set(key, element);
    else a.layers.delete(key);
  }).current;
  const previous = useRef(props.stack);
  const exiting = useRef<NavEntry[]>([]);
  const pending = useRef<StackPlan | null>(null);

  // Wechsel im Stapel erkennen, während gezeichnet wird: Seiten, die gehen, bleiben für ihren Übergang montiert.
  const stack = props.stack;
  if (previous.current !== stack) {
    const plan = planOf(previous.current, stack);
    if (plan) {
      const keep = previous.current.filter((e) => plan.exiting.includes(e.key));
      exiting.current = keep;
      pending.current = plan;
    }
    previous.current = stack;
  }

  const revealed = useRef(new Map<string, number>()).current;
  a.onReveal = (key) => {
    revealed.set(key, (revealed.get(key) ?? 0) + 1);
    setTick((t) => t + 1);
  };
  a.onSettled = (keys) => {
    const rest = exiting.current.filter((e) => !keys.includes(e.key));
    if (rest.length !== exiting.current.length) {
      exiting.current = rest;
      setTick((t) => t + 1);
    }
  };

  const mounted = mountedEntries(stack);
  const topKey = mounted[mounted.length - 1].key;
  const layers = [...mounted, ...exiting.current.filter((e) => !mounted.some((m) => m.key === e.key))];
  const belowOf = (entry: NavEntry): NavEntry | null => {
    const list = stack.some((e) => e.key === entry.key) ? stack : previous.current;
    const i = list.findIndex((e) => e.key === entry.key);
    return i > 0 ? list[i - 1] : null;
  };

  useLayoutEffect(() => {
    props.handle?.({ animator: a });
    return () => {
      props.handle?.(null);
      a.stop();
    };
  }, []);

  useLayoutEffect(() => {
    a.layout(topKey);
    const plan = pending.current;
    pending.current = null;
    if (plan) a.start(plan);
  });

  return (
    <div
      class="phone-pages"
      ref={(element) => {
        a.container = element;
      }}
    >
      {layers.map((entry) => (
        <PageLayer
          key={entry.key}
          entry={entry}
          below={belowOf(entry)}
          live={entry.key === topKey}
          revealed={revealed.get(entry.key) ?? 0}
          register={register}
          render={props.render}
        />
      ))}
    </div>
  );
}
